import { Router } from "express";
import { db, billsTable, paymentsTable, ordersTable, patientsTable } from "@workspace/db";
import { billAuditsTable, superAdminSessionsTable } from "@workspace/db/schema";
import { sendBillEditEmail } from "../email";
import { generateTokenForBill } from "./tokens";
import { sendBillWhatsapp } from "./whatsapp";
import { eq, and, sql, desc, like, or, gt } from "drizzle-orm";
import {
  ListBillsQueryParams,
  CreateBillBody,
  GetBillParams,
  UpdateBillParams,
  UpdateBillBody,
  CreatePaymentBody,
  ListPaymentsQueryParams,
} from "@workspace/api-zod";
import { orderTestsTable, testsTable, doctorsTable } from "@workspace/db";

export const billsRouter = Router();
export const paymentsRouter = Router();

// Per-ledger counter — id=1 (default) also includes legacy NULL rows
async function countBillsForLedger(ledgerId: number): Promise<number> {
  const where = ledgerId === 1
    ? sql`${billsTable.ledgerId} = 1 OR ${billsTable.ledgerId} IS NULL`
    : sql`${billsTable.ledgerId} = ${ledgerId}`;
  const r = await db.select({ count: sql<number>`count(*)` }).from(billsTable).where(where);
  return Number(r[0]?.count ?? 0);
}

async function resolveLedgerForOrder(orderId: number): Promise<number> {
  const [o] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (o?.ledgerId) return o.ledgerId;
  if (o?.doctorId) {
    const [d] = await db.select().from(doctorsTable).where(eq(doctorsTable.id, o.doctorId));
    if (d?.ledgerId) return d.ledgerId;
  }
  return 1;
}

async function generateBillNumber(ledgerId: number): Promise<string> {
  const num = (await countBillsForLedger(ledgerId)) + 1;
  const date = new Date();
  return `BILL-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}-${String(num).padStart(4, "0")}`;
}

async function buildBill(bill: typeof billsTable.$inferSelect) {
  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, bill.patientId));
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, bill.orderId));

  const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.billId, bill.id)).orderBy(desc(paymentsTable.createdAt));

  let orderDetails = null;
  if (order) {
    const orderTestRows = await db
      .select({ orderTest: orderTestsTable, test: testsTable })
      .from(orderTestsTable)
      .leftJoin(testsTable, eq(orderTestsTable.testId, testsTable.id))
      .where(eq(orderTestsTable.orderId, order.id));

    let doctor = null;
    if (order.doctorId) {
      const [d] = await db.select().from(doctorsTable).where(eq(doctorsTable.id, order.doctorId));
      doctor = d ?? null;
    }

    orderDetails = {
      ...order,
      totalAmount: Number(order.totalAmount),
      patient: patient ?? null,
      doctor,
      tests: orderTestRows.map((ot) => ({
        ...ot.orderTest,
        price: Number(ot.orderTest.price),
        test: ot.test ? { ...ot.test, price: Number(ot.test.price) } : null,
      })),
    };
  }

  return {
    ...bill,
    subtotal: Number(bill.subtotal),
    discount: Number(bill.discount),
    taxAmount: Number(bill.taxAmount),
    totalAmount: Number(bill.totalAmount),
    paidAmount: Number(bill.paidAmount),
    balanceAmount: Number(bill.balanceAmount),
    patient: patient ?? null,
    order: orderDetails,
    payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
  };
}

billsRouter.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const dueOnly = req.query.dueOnly === "1" || req.query.dueOnly === "true";
  if (q.length < 2) {
    res.json([]);
    return;
  }
  const pattern = `%${q.toLowerCase()}%`;
  const rows = await db
    .select({
      id: billsTable.id,
      billNumber: billsTable.billNumber,
      totalAmount: billsTable.totalAmount,
      paidAmount: billsTable.paidAmount,
      balanceAmount: billsTable.balanceAmount,
      status: billsTable.status,
      createdAt: billsTable.createdAt,
      patientName: sql<string>`${patientsTable.firstName} || ' ' || ${patientsTable.lastName}`,
      patientId: patientsTable.patientId,
      phone: patientsTable.phone,
    })
    .from(billsTable)
    .leftJoin(patientsTable, eq(billsTable.patientId, patientsTable.id))
    .where(
      and(
        or(
          sql`LOWER(${billsTable.billNumber}) LIKE ${pattern}`,
          sql`LOWER(${patientsTable.firstName} || ' ' || ${patientsTable.lastName}) LIKE ${pattern}`,
          sql`LOWER(${patientsTable.patientId}) LIKE ${pattern}`,
          sql`${patientsTable.phone} LIKE ${pattern}`,
        ),
        dueOnly ? gt(sql`${billsTable.balanceAmount}::numeric`, sql`0`) : undefined,
      ),
    )
    .orderBy(desc(billsTable.createdAt))
    .limit(15);

  res.json(
    rows.map((r) => ({
      ...r,
      totalAmount: Number(r.totalAmount),
      paidAmount: Number(r.paidAmount),
      balanceAmount: Number(r.balanceAmount),
    })),
  );
});

billsRouter.get("/preview-number", async (req, res) => {
  let ledgerId = 1;
  const doctorIdRaw = req.query.doctorId;
  const ledgerIdRaw = req.query.ledgerId;
  if (ledgerIdRaw) {
    ledgerId = Number(ledgerIdRaw) || 1;
  } else if (doctorIdRaw) {
    const [d] = await db.select().from(doctorsTable).where(eq(doctorsTable.id, Number(doctorIdRaw)));
    ledgerId = d?.ledgerId ?? 1;
  }
  const num = (await countBillsForLedger(ledgerId)) + 1;
  const date = new Date();
  const next = `BILL-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}-${String(num).padStart(4, "0")}`;
  return res.json({ next, ledgerId });
});

billsRouter.get("/", async (req, res) => {
  const parsed = ListBillsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const { status, patientId, page = 1, limit = 20 } = parsed.data;
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [];
  if (status) conditions.push(eq(billsTable.status, status));
  if (patientId) conditions.push(eq(billsTable.patientId, patientId));

  const [bills, countResult] = await Promise.all([
    db.select().from(billsTable).where(conditions.length > 0 ? and(...conditions) : undefined).orderBy(desc(billsTable.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(billsTable).where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  const billsWithDetails = await Promise.all(bills.map(buildBill));
  res.json({ bills: billsWithDetails, total: Number(countResult[0]?.count ?? 0), page, limit });
});

billsRouter.post("/", async (req, res) => {
  const payload = req.body?.data ?? req.body ?? {};
  const parsed = CreateBillBody.safeParse(payload);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const { orderId, discount = 0, dueDate } = parsed.data;
  const discountReason = typeof payload?.discountReason === "string" ? payload.discountReason.trim() || null : null;
  const discountReasonNote = typeof payload?.discountReasonNote === "string" ? payload.discountReasonNote.trim() || null : null;

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const subtotal = Number(order.totalAmount);
  const discountAmt = Number(discount);
  const taxAmount = 0;
  const totalAmount = subtotal - discountAmt + taxAmount;

  const ledgerId = await resolveLedgerForOrder(orderId);
  const billNumber = await generateBillNumber(ledgerId);

  // Backfill order with its ledger
  if (!order.ledgerId) {
    await db.update(ordersTable).set({ ledgerId }).where(eq(ordersTable.id, orderId));
  }
  // Bind patient to this ledger if they don't already belong to one
  const [pat] = await db.select().from(patientsTable).where(eq(patientsTable.id, order.patientId));
  if (pat && !pat.ledgerId) {
    await db.update(patientsTable).set({ ledgerId }).where(eq(patientsTable.id, pat.id));
  }

  const [bill] = await db.insert(billsTable).values({
    billNumber,
    orderId,
    patientId: order.patientId,
    subtotal: subtotal.toFixed(2),
    discount: discountAmt.toFixed(2),
    discountReason,
    discountReasonNote,
    taxAmount: taxAmount.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
    paidAmount: "0.00",
    balanceAmount: totalAmount.toFixed(2),
    status: "pending",
    ledgerId,
    dueDate: dueDate ?? null,
  }).returning();

  // Auto-generate queue token (per book, resets daily) — never blocks bill creation
  let tokenInfo: { tokenNo: number; tokenDate: string } | null = null;
  try {
    tokenInfo = await generateTokenForBill({ ledgerId, billId: bill.id, patientId: order.patientId });
  } catch (err) {
    console.warn("Token generation failed:", err);
  }

  // Fire WhatsApp send asynchronously — don't block the response
  if (pat?.phone && tokenInfo) {
    sendBillWhatsapp({
      phone: pat.phone,
      patientName: `${pat.firstName} ${pat.lastName}`.trim(),
      billNumber: bill.billNumber,
      totalAmount,
      tokenNo: tokenInfo.tokenNo,
    }).catch((err) => console.warn("WhatsApp send failed:", err));
  }

  const built = await buildBill(bill);
  res.status(201).json({ ...built, token: tokenInfo });
});

billsRouter.get("/:id", async (req, res) => {
  const parsed = GetBillParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, parsed.data.id));
  if (!bill) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }
  res.json(await buildBill(bill));
});

billsRouter.put("/:id", async (req, res) => {
  const paramsParsed = UpdateBillParams.safeParse({ id: Number(req.params.id) });
  const bodyParsed = UpdateBillBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { discount, status, dueDate } = bodyParsed.data;

  const [existingBill] = await db.select().from(billsTable).where(eq(billsTable.id, paramsParsed.data.id));
  if (!existingBill) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (status !== undefined) updateData.status = status;
  if (dueDate !== undefined) updateData.dueDate = dueDate;
  if (discount !== undefined) {
    const newDiscount = Number(discount);
    const subtotal = Number(existingBill.subtotal);
    const taxAmount = Number(existingBill.taxAmount);
    const newTotal = subtotal - newDiscount + taxAmount;
    const paidAmount = Number(existingBill.paidAmount);
    updateData.discount = String(newDiscount);
    updateData.totalAmount = String(newTotal);
    updateData.balanceAmount = String(newTotal - paidAmount);
  }

  const [updated] = await db.update(billsTable).set(updateData).where(eq(billsTable.id, paramsParsed.data.id)).returning();

  // Audit trail + email notification
  const { editedBy, reason } = req.body;
  if (editedBy && reason) {
    const auditEntries: { billId: number; editedBy: string; reason: string; changeType: string; oldValue: string | null; newValue: string | null }[] = [];
    const emailChanges: { field: string; from: string | null; to: string | null }[] = [];

    if (status !== undefined && status !== existingBill.status) {
      auditEntries.push({ billId: paramsParsed.data.id, editedBy, reason, changeType: "status", oldValue: existingBill.status, newValue: status });
      emailChanges.push({ field: "Status", from: existingBill.status, to: status });
    }
    if (discount !== undefined && String(discount) !== existingBill.discount) {
      auditEntries.push({ billId: paramsParsed.data.id, editedBy, reason, changeType: "discount", oldValue: existingBill.discount, newValue: String(discount) });
      emailChanges.push({ field: "Discount (₹)", from: existingBill.discount, to: String(discount) });
    }
    if (auditEntries.length > 0) {
      await db.insert(billAuditsTable).values(auditEntries);

      // Fire email asynchronously — don't block the response
      const billForEmail = await buildBill(updated);
      const patientName = billForEmail.patient
        ? `${billForEmail.patient.firstName} ${billForEmail.patient.lastName}`
        : "Unknown Patient";

      sendBillEditEmail({
        billNumber: updated.billNumber,
        patientName,
        editedBy,
        reason,
        changes: emailChanges,
      }).catch(err => console.error("[email] bill edit notification failed:", err));
    }
  }

  res.json(await buildBill(updated));
});

billsRouter.get("/:id/audits", async (req, res) => {
  const id = Number(req.params.id);
  const audits = await db.select().from(billAuditsTable).where(eq(billAuditsTable.billId, id)).orderBy(desc(billAuditsTable.createdAt));
  res.json(audits);
});

// Helper: verify super admin session token
async function verifySuperAdminToken(token: string): Promise<{ valid: boolean; userName: string }> {
  if (!token) return { valid: false, userName: "" };
  const [session] = await db.select().from(superAdminSessionsTable).where(eq(superAdminSessionsTable.token, token));
  if (!session || !session.isActive || new Date(session.expiresAt) < new Date()) {
    return { valid: false, userName: "" };
  }
  return { valid: true, userName: session.userName };
}

// ── Super-admin: full amount edit ─────────────────────────────────────────────
billsRouter.patch("/:id/super-edit", async (req, res) => {
  const id = Number(req.params.id);
  const { token, reason, subtotal, discount, taxAmount } = req.body;

  if (!token || !reason) {
    return res.status(400).json({ error: "token and reason are required" });
  }

  const { valid, userName } = await verifySuperAdminToken(token);
  if (!valid) {
    return res.status(403).json({ error: "Super admin session expired or invalid. Please re-authenticate via the Super Admin Portal." });
  }
  const superAdminName = userName;

  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, id));
  if (!bill) return res.status(404).json({ error: "Bill not found" });

  const newSubtotal  = subtotal  !== undefined ? Number(subtotal)  : Number(bill.subtotal);
  const newDiscount  = discount  !== undefined ? Number(discount)  : Number(bill.discount);
  const newTaxAmount = taxAmount !== undefined ? Number(taxAmount) : Number(bill.taxAmount);
  const newTotal     = newSubtotal - newDiscount + newTaxAmount;
  const paidAmount   = Number(bill.paidAmount);
  const newBalance   = newTotal - paidAmount;
  const newStatus    = newBalance <= 0 && paidAmount > 0 ? "paid"
                     : paidAmount > 0 ? "partial"
                     : "pending";

  const [updated] = await db.update(billsTable).set({
    subtotal:      String(newSubtotal),
    discount:      String(newDiscount),
    taxAmount:     String(newTaxAmount),
    totalAmount:   String(newTotal),
    balanceAmount: String(Math.max(0, newBalance)),
    status:        newStatus,
  }).where(eq(billsTable.id, id)).returning();

  // Audit each changed field
  const auditRows: { billId: number; editedBy: string; reason: string; changeType: string; oldValue: string | null; newValue: string | null }[] = [];
  if (newSubtotal !== Number(bill.subtotal))   auditRows.push({ billId: id, editedBy: superAdminName, reason, changeType: "subtotal",   oldValue: bill.subtotal,   newValue: String(newSubtotal) });
  if (newDiscount !== Number(bill.discount))   auditRows.push({ billId: id, editedBy: superAdminName, reason, changeType: "discount",   oldValue: bill.discount,   newValue: String(newDiscount) });
  if (newTaxAmount !== Number(bill.taxAmount)) auditRows.push({ billId: id, editedBy: superAdminName, reason, changeType: "taxAmount",  oldValue: bill.taxAmount,  newValue: String(newTaxAmount) });
  if (newTotal !== Number(bill.totalAmount))   auditRows.push({ billId: id, editedBy: superAdminName, reason, changeType: "totalAmount", oldValue: bill.totalAmount, newValue: String(newTotal) });
  if (auditRows.length > 0) await db.insert(billAuditsTable).values(auditRows);

  res.json(await buildBill(updated));
});

// ── Super-admin: delete bill + renumber subsequent ────────────────────────────
billsRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { token, reason } = req.body;

  if (!token || !reason) {
    return res.status(400).json({ error: "token and reason are required" });
  }

  const { valid, userName } = await verifySuperAdminToken(token);
  if (!valid) {
    return res.status(403).json({ error: "Super admin session expired or invalid. Please re-authenticate via the Super Admin Portal." });
  }

  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, id));
  if (!bill) return res.status(404).json({ error: "Bill not found" });

  // Parse bill number to get YYYYMM prefix and sequence number
  const billNumMatch = bill.billNumber.match(/^BILL-(\d{6})-(\d+)$/);

  // Pre-audit (bill_audits has no FK constraint so insert before or after is fine)
  await db.insert(billAuditsTable).values({
    billId: id,
    editedBy: userName,
    reason: `[DELETED] ${reason}`,
    changeType: "deleted",
    oldValue: bill.billNumber,
    newValue: null,
  });

  // Delete payments and audits for this bill first, then the bill
  await db.delete(paymentsTable).where(eq(paymentsTable.billId, id));
  await db.delete(billsTable).where(eq(billsTable.id, id));

  // Reset order back to pending so a new bill can be generated
  await db.update(ordersTable).set({ status: "pending" }).where(eq(ordersTable.id, bill.orderId));

  // Renumber bills in the same YYYYMM that come after the deleted one
  if (billNumMatch) {
    const monthPrefix = billNumMatch[1]; // e.g. "202604"
    const deletedSeq  = Number(billNumMatch[2]);

    // Fetch all bills in this month with a higher sequence
    const laterBills = await db
      .select()
      .from(billsTable)
      .where(like(billsTable.billNumber, `BILL-${monthPrefix}-%`))
      .orderBy(billsTable.billNumber);

    for (const lb of laterBills) {
      const m = lb.billNumber.match(/^BILL-(\d{6})-(\d+)$/);
      if (!m) continue;
      const seq = Number(m[2]);
      if (seq <= deletedSeq) continue;  // only renumber those after the deleted one
      const newBillNumber = `BILL-${m[1]}-${String(seq - 1).padStart(4, "0")}`;
      await db.update(billsTable).set({ billNumber: newBillNumber }).where(eq(billsTable.id, lb.id));
    }
  }

  res.json({ ok: true, deletedBillNumber: bill.billNumber });
});

// Payments
paymentsRouter.get("/", async (req, res) => {
  const parsed = ListPaymentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const { billId, page = 1, limit = 20 } = parsed.data;
  const offset = (page - 1) * limit;

  const [payments, countResult] = await Promise.all([
    db.select().from(paymentsTable).where(billId ? eq(paymentsTable.billId, billId) : undefined).orderBy(desc(paymentsTable.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(paymentsTable).where(billId ? eq(paymentsTable.billId, billId) : undefined),
  ]);

  res.json({ payments: payments.map(p => ({ ...p, amount: Number(p.amount) })), total: Number(countResult[0]?.count ?? 0), page, limit });
});

paymentsRouter.post("/", async (req, res) => {
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const { billId, amount, method, referenceNumber, notes } = parsed.data;

  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, billId));
  if (!bill) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }

  const [payment] = await db.insert(paymentsTable).values({
    billId,
    amount: String(amount),
    method,
    referenceNumber: referenceNumber ?? null,
    notes: notes ?? null,
  }).returning();

  const newPaidAmount = Number(bill.paidAmount) + amount;
  const balanceAmount = Number(bill.totalAmount) - newPaidAmount;
  const newStatus = balanceAmount <= 0 ? "paid" : newPaidAmount > 0 ? "partial" : bill.status;

  await db.update(billsTable).set({
    paidAmount: String(newPaidAmount),
    balanceAmount: String(Math.max(0, balanceAmount)),
    status: newStatus,
  }).where(eq(billsTable.id, billId));

  res.status(201).json({ ...payment, amount: Number(payment.amount) });
});
