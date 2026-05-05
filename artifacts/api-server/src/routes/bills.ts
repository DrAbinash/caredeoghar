import { Router } from "express";
import { db, billsTable, paymentsTable, ordersTable, patientsTable } from "@workspace/db";
import { billAuditsTable, superAdminSessionsTable, ledgersTable } from "@workspace/db/schema";
import { sendBillEditEmail, sendBillReprintEmail } from "../email";
import { generateTokenForBill } from "./tokens";
import { generateTestTokensForOrder } from "./test-tokens";
import { generateStudiesForOrder } from "./radiology";
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
  SuperEditBillParams,
  SuperEditBillBody,
  DeleteBillParams,
  DeleteBillBody,
  LogBillReprintParams,
  LogBillReprintBody,
  ListBillAuditsParams,
  CancelBillParams,
  CancelBillBody,
  RefundBillParams,
  RefundBillBody,
} from "@workspace/api-zod";
import { orderTestsTable, testsTable, doctorsTable } from "@workspace/db";
import { sanitizePatient } from "./patients";
import type { StaffAuthRequest } from "../middleware/requireStaffAuth";
import { FULL_ACCESS_ROLES } from "../middleware/requireStaffAuth";

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
      patient: patient ? sanitizePatient(patient) : null,
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
    patient: patient ? sanitizePatient(patient) : null,
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
  // Either ledgerId or doctorId must resolve to a valid ledger. We refuse to
  // silently default to ledger #1 because that misnumbers and mis-attributes
  // bills for any branch other than the first.
  const doctorIdRaw = req.query.doctorId;
  const ledgerIdRaw = req.query.ledgerId;
  let ledgerId: number | null = null;
  if (ledgerIdRaw !== undefined && ledgerIdRaw !== "") {
    const n = Number(ledgerIdRaw);
    if (!Number.isInteger(n) || n < 1) {
      return res.status(400).json({ error: "Invalid request", details: [{ path: ["ledgerId"], message: "ledgerId must be a positive integer" }] });
    }
    const [lg] = await db.select({ id: ledgersTable.id }).from(ledgersTable).where(eq(ledgersTable.id, n));
    if (!lg) {
      return res.status(400).json({ error: "Invalid request", details: [{ path: ["ledgerId"], message: `Ledger with id ${n} does not exist.` }] });
    }
    ledgerId = n;
  } else if (doctorIdRaw !== undefined && doctorIdRaw !== "") {
    const docId = Number(doctorIdRaw);
    if (!Number.isInteger(docId) || docId < 1) {
      return res.status(400).json({ error: "Invalid request", details: [{ path: ["doctorId"], message: "doctorId must be a positive integer" }] });
    }
    const [d] = await db.select().from(doctorsTable).where(eq(doctorsTable.id, docId));
    if (!d) {
      return res.status(400).json({ error: "Invalid request", details: [{ path: ["doctorId"], message: `Doctor with id ${docId} does not exist.` }] });
    }
    if (d.ledgerId == null) {
      return res.status(400).json({ error: "Invalid request", details: [{ path: ["doctorId"], message: `Doctor ${docId} has no ledger assigned; specify ledgerId explicitly.` }] });
    }
    ledgerId = d.ledgerId;
  } else {
    return res.status(400).json({ error: "Invalid request", details: [{ path: [], message: "Either ledgerId or doctorId is required." }] });
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

  // Extra filters not in the strict zod schema: dues-only + date range. These
  // are read directly from req.query so we don't have to round-trip OpenAPI
  // codegen. Powers the Dues report page.
  const dueOnly = req.query.dueOnly === "1" || req.query.dueOnly === "true";
  const dateFrom = typeof req.query.dateFrom === "string" && req.query.dateFrom ? req.query.dateFrom : null;
  const dateTo = typeof req.query.dateTo === "string" && req.query.dateTo ? req.query.dateTo : null;
  const dateField = req.query.dateField === "due" ? "due" : "created";

  // ISO date strings only — basic guard against SQL injection via the raw fragments.
  const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (dateFrom && !isoDateRe.test(dateFrom)) {
    res.status(400).json({ error: "dateFrom must be YYYY-MM-DD" });
    return;
  }
  if (dateTo && !isoDateRe.test(dateTo)) {
    res.status(400).json({ error: "dateTo must be YYYY-MM-DD" });
    return;
  }

  const conditions: (ReturnType<typeof eq> | ReturnType<typeof gt>)[] = [];
  if (status) conditions.push(eq(billsTable.status, status));
  if (patientId) conditions.push(eq(billsTable.patientId, patientId));
  if (dueOnly) conditions.push(gt(sql`${billsTable.balanceAmount}::numeric`, sql`0`));
  if (dateFrom || dateTo) {
    if (dateField === "due") {
      // Bills only have a due date when one was set; bills with NULL dueDate are excluded by this filter.
      if (dateFrom) conditions.push(sql`${billsTable.dueDate} >= ${dateFrom}` as unknown as ReturnType<typeof eq>);
      if (dateTo) conditions.push(sql`${billsTable.dueDate} <= ${dateTo}` as unknown as ReturnType<typeof eq>);
    } else {
      // Compare on the date portion of created_at, in the server's local timezone.
      if (dateFrom) conditions.push(sql`(${billsTable.createdAt})::date >= ${dateFrom}::date` as unknown as ReturnType<typeof eq>);
      if (dateTo) conditions.push(sql`(${billsTable.createdAt})::date <= ${dateTo}::date` as unknown as ReturnType<typeof eq>);
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [bills, countResult, totalsResult] = await Promise.all([
    db.select().from(billsTable).where(where).orderBy(desc(billsTable.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(billsTable).where(where),
    // Aggregate totals across the FULL filtered set (not just the current page) — used by the Dues card.
    db.select({
      totalAmount: sql<string>`COALESCE(SUM(${billsTable.totalAmount}::numeric), 0)`,
      paidAmount: sql<string>`COALESCE(SUM(${billsTable.paidAmount}::numeric), 0)`,
      balanceAmount: sql<string>`COALESCE(SUM(${billsTable.balanceAmount}::numeric), 0)`,
    }).from(billsTable).where(where),
  ]);

  const billsWithDetails = await Promise.all(bills.map(buildBill));
  res.json({
    bills: billsWithDetails,
    total: Number(countResult[0]?.count ?? 0),
    page,
    limit,
    totals: {
      totalAmount: Number(totalsResult[0]?.totalAmount ?? 0),
      paidAmount: Number(totalsResult[0]?.paidAmount ?? 0),
      balanceAmount: Number(totalsResult[0]?.balanceAmount ?? 0),
    },
  });
});

billsRouter.post("/", async (req: StaffAuthRequest, res) => {
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

  // Refuse to bill against an order that contains discontinued / removed tests
  // (matches the same guard applied at order creation in orders.ts). Catches
  // the case where a test is deactivated *between* order creation and billing.
  const orderLineTests = await db
    .select({ testId: orderTestsTable.testId, isActive: testsTable.isActive, name: testsTable.name })
    .from(orderTestsTable)
    .innerJoin(testsTable, eq(testsTable.id, orderTestsTable.testId))
    .where(eq(orderTestsTable.orderId, orderId));
  const inactiveLineTests = orderLineTests.filter((t) => !t.isActive);
  if (inactiveLineTests.length > 0) {
    res.status(400).json({
      error: "Invalid request",
      details: [{
        path: ["orderId"],
        message: `Order contains discontinued tests and cannot be billed: ${inactiveLineTests.map((t) => `#${t.testId} ${t.name}`).join(", ")}. Edit the order to remove them.`,
      }],
    });
    return;
  }

  const subtotal = Number(order.totalAmount);
  const discountAmt = Number(discount);

  if (!Number.isFinite(discountAmt) || discountAmt < 0) {
    res.status(400).json({ error: "Discount must be zero or a positive number" });
    return;
  }
  if (discountAmt > subtotal) {
    res.status(400).json({ error: `Discount (${discountAmt.toFixed(2)}) cannot exceed subtotal (${subtotal.toFixed(2)})` });
    return;
  }

  const session = req.staffSession;
  if (session && !FULL_ACCESS_ROLES.has(session.role) && discountAmt > 0) {
    const maxPct = session.maxDiscount ?? 0;
    const maxAllowed = Math.round((subtotal * maxPct / 100) * 100) / 100;
    if (discountAmt > maxAllowed + 0.01) {
      res.status(403).json({ error: `Your maximum allowed discount is ${maxPct}% (₹${maxAllowed.toFixed(2)} on this bill). Please ask an admin to apply a higher discount.` });
      return;
    }
  }

  const taxAmount = 0;
  const totalAmount = subtotal - discountAmt + taxAmount;

  const ledgerId = await resolveLedgerForOrder(orderId);

  // Atomically: generate bill number, backfill order's ledgerId, bind patient
  // to ledger, and insert the bill row. Previously these were 3-4 sequential
  // writes outside any transaction — a mid-flight failure (e.g. unique-key
  // collision on billNumber) would leave the order/patient mutated with no
  // matching bill row.
  const { bill, pat } = await db.transaction(async (tx) => {
    const billNumber = await generateBillNumber(ledgerId);

    if (!order.ledgerId) {
      await tx.update(ordersTable).set({ ledgerId }).where(eq(ordersTable.id, orderId));
    }
    const [patRow] = await tx.select().from(patientsTable).where(eq(patientsTable.id, order.patientId));
    if (patRow && !patRow.ledgerId) {
      await tx.update(patientsTable).set({ ledgerId }).where(eq(patientsTable.id, patRow.id));
    }

    const [billRow] = await tx.insert(billsTable).values({
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

    return { bill: billRow, pat: patRow };
  });

  // Auto-generate queue token (per book, resets daily) — never blocks bill creation
  let tokenInfo: { tokenNo: number; tokenDate: string } | null = null;
  try {
    tokenInfo = await generateTokenForBill({ ledgerId, billId: bill.id, patientId: order.patientId });
  } catch (err) {
    console.warn("Token generation failed:", err);
  }

  // Auto-generate per-test queue tokens — one per ordered test, sequenced by
  // department. A bill with USG + X-Ray + MRI ends up with three department
  // tokens. Failure is logged but never blocks bill creation.
  let testTokens: Array<{ orderTestId: number; testName: string; department: string; roomNumber: string; tokenNo: number }> = [];
  try {
    testTokens = await generateTestTokensForOrder({
      ledgerId, billId: bill.id, orderId: order.id, patientId: order.patientId,
    });
  } catch (err) {
    console.warn("Per-test token generation failed:", err);
  }

  // Auto-create radiology studies for radiology-department tests on the order
  // (X-Ray / USG / MRI / CT / Mammography / DEXA). Idempotent per orderTest.
  // Failure is logged but never blocks bill creation.
  let studies: Array<{ orderTestId: number; testName: string; modality: string; accessionNumber: string }> = [];
  try {
    studies = await generateStudiesForOrder({
      billId: bill.id, orderId: order.id, patientId: order.patientId,
    });
  } catch (err) {
    console.warn("Radiology study fan-out failed:", err);
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
  res.status(201).json({ ...built, token: tokenInfo, testTokens, studies });
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

billsRouter.put("/:id", async (req: StaffAuthRequest, res) => {
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

    if (!Number.isFinite(newDiscount) || newDiscount < 0) {
      res.status(400).json({ error: "Discount must be zero or a positive number" });
      return;
    }
    if (newDiscount > subtotal) {
      res.status(400).json({ error: `Discount (${newDiscount.toFixed(2)}) cannot exceed subtotal (${subtotal.toFixed(2)})` });
      return;
    }

    const session = req.staffSession;
    if (session && !FULL_ACCESS_ROLES.has(session.role) && newDiscount > 0) {
      const maxPct = session.maxDiscount ?? 0;
      const maxAllowed = Math.round((subtotal * maxPct / 100) * 100) / 100;
      if (newDiscount > maxAllowed + 0.01) {
        res.status(403).json({ error: `Your maximum allowed discount is ${maxPct}% (₹${maxAllowed.toFixed(2)} on this bill). Please ask an admin to apply a higher discount.` });
        return;
      }
    }

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

// ── Re-print log: insert audit + email admin/super-admin ─────────────────────
billsRouter.post("/:id/reprint-log", async (req, res) => {
  const paramsParsed = LogBillReprintParams.safeParse(req.params);
  const bodyParsed = LogBillReprintBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({
      error: "Invalid request",
      details: [
        ...(paramsParsed.success ? [] : paramsParsed.error.issues),
        ...(bodyParsed.success ? [] : bodyParsed.error.issues),
      ],
    });
    return;
  }
  const id = paramsParsed.data.id;
  const reprintedBy = bodyParsed.data.reprintedBy.trim();
  const reason = bodyParsed.data.reason.trim();

  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, id));
  if (!bill) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }

  // Insert the audit row first so concurrent reprints can never collide on the
  // sequence number. The count is then read back, including this just-inserted
  // row, which gives a monotonic per-bill reprint number even under contention.
  const [inserted] = await db.insert(billAuditsTable).values({
    billId: id,
    editedBy: reprintedBy,
    reason,
    changeType: "reprint",
    oldValue: null,
    newValue: "reprint",
  }).returning();

  const counted = await db
    .select({ count: sql<number>`count(*)` })
    .from(billAuditsTable)
    .where(and(
      eq(billAuditsTable.billId, id),
      eq(billAuditsTable.changeType, "reprint"),
      sql`${billAuditsTable.id} <= ${inserted.id}`,
    ));
  const reprintCount = Number(counted[0]?.count ?? 1);

  // Patch the row with its assigned sequence number for cleaner audit display.
  await db.update(billAuditsTable)
    .set({ newValue: `reprint #${reprintCount}` })
    .where(eq(billAuditsTable.id, inserted.id));

  // Patient name for the email
  const [pat] = await db.select().from(patientsTable).where(eq(patientsTable.id, bill.patientId));
  const patientName = pat ? `${pat.firstName} ${pat.lastName}`.trim() : "Unknown Patient";

  // Fire email asynchronously — don't block the response
  sendBillReprintEmail({
    billNumber: bill.billNumber,
    patientName,
    reprintedBy,
    reason,
    reprintCount,
    totalAmount: Number(bill.totalAmount),
  }).catch((err) => console.error("[email] bill reprint notification failed:", err));

  res.json({ success: true, reprintCount });
});

billsRouter.get("/:id/audits", async (req, res) => {
  const paramsParsed = ListBillAuditsParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid request", details: paramsParsed.error.issues });
    return;
  }
  const id = paramsParsed.data.id;
  const audits = await db.select().from(billAuditsTable).where(eq(billAuditsTable.billId, id)).orderBy(desc(billAuditsTable.createdAt));
  res.json(audits);
});

// ── Cancel a bill ─────────────────────────────────────────────────────────────
// Marks a bill as cancelled with mandatory reason + actor. Audit-logged.
// Available to any staff (no super-admin token); same trust model as Edit Bill.
billsRouter.post("/:id/cancel", async (req, res) => {
  const paramsParsed = CancelBillParams.safeParse(req.params);
  const bodyParsed = CancelBillBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({
      error: "Invalid request",
      details: [
        ...(paramsParsed.success ? [] : paramsParsed.error.issues),
        ...(bodyParsed.success ? [] : bodyParsed.error.issues),
      ],
    });
    return;
  }
  const id = paramsParsed.data.id;
  const performedBy = bodyParsed.data.performedBy.trim();
  const reason = bodyParsed.data.reason.trim();

  // Serialize concurrent cancel/refund attempts on this bill via row-level lock.
  const txResult = await db.transaction(async (tx) => {
    const [bill] = await tx.select().from(billsTable).where(eq(billsTable.id, id)).for("update");
    if (!bill) throw Object.assign(new Error("Bill not found"), { httpStatus: 404 });
    if (bill.status === "cancelled") {
      throw Object.assign(new Error("Bill is already cancelled"), { httpStatus: 409 });
    }

    const [updated] = await tx.update(billsTable).set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledByName: performedBy,
      cancellationReason: reason,
    }).where(eq(billsTable.id, id)).returning();

    await tx.insert(billAuditsTable).values({
      billId: id,
      editedBy: performedBy,
      reason,
      changeType: "cancelled",
      oldValue: bill.status,
      newValue: "cancelled",
    });

    return { updated, oldStatus: bill.status };
  }).catch((err: Error & { httpStatus?: number }) => {
    if (err.httpStatus) {
      res.status(err.httpStatus).json({ error: err.message });
      return null;
    }
    throw err;
  });
  if (!txResult) return;
  const { updated, oldStatus } = txResult;

  // Best-effort email notification (re-use the bill-edit template)
  try {
    const billForEmail = await buildBill(updated);
    const patientName = billForEmail.patient
      ? `${billForEmail.patient.firstName} ${billForEmail.patient.lastName}`
      : "Unknown Patient";
    sendBillEditEmail({
      billNumber: updated.billNumber,
      patientName,
      editedBy: performedBy,
      reason: `[CANCELLED] ${reason}`,
      changes: [{ field: "Status", from: oldStatus, to: "cancelled" }],
    }).catch((err) => console.error("[email] bill cancel notification failed:", err));
  } catch (err) {
    req.log?.warn?.({ err }, "Cancel email send failed");
  }

  res.json(await buildBill(updated));
});

// ── Refund a payment against a bill ───────────────────────────────────────────
// Records a refund of `amount`. Inserts a negative-amount payment row so the
// payment history shows it, decrements paidAmount, increments refundAmount,
// recomputes balanceAmount + status, audits, and emails.
billsRouter.post("/:id/refund", async (req, res) => {
  const paramsParsed = RefundBillParams.safeParse(req.params);
  const bodyParsed = RefundBillBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({
      error: "Invalid request",
      details: [
        ...(paramsParsed.success ? [] : paramsParsed.error.issues),
        ...(bodyParsed.success ? [] : bodyParsed.error.issues),
      ],
    });
    return;
  }
  const id = paramsParsed.data.id;
  const performedBy = bodyParsed.data.performedBy.trim();
  const reason = bodyParsed.data.reason.trim();
  const rawAmount = bodyParsed.data.amount;
  const method = (bodyParsed.data.method ?? "cash").trim().toLowerCase();

  // Round to 2 decimals to avoid float comparison surprises (₹).
  const amount = Math.round(rawAmount * 100) / 100;

  // Serialize concurrent refunds against this bill: lock the row, re-read latest
  // values inside the transaction, then validate + write atomically. This
  // prevents two simultaneous refund requests from each reading the same
  // paidAmount and over-refunding the bill.
  const result = await db.transaction(async (tx) => {
    const [bill] = await tx.select().from(billsTable).where(eq(billsTable.id, id)).for("update");
    if (!bill) throw Object.assign(new Error("Bill not found"), { httpStatus: 404 });

    const currentPaid = Number(bill.paidAmount);
    const currentTotal = Number(bill.totalAmount);
    const currentRefund = Number(bill.refundAmount);

    if (amount > currentPaid + 0.0001) {
      throw Object.assign(
        new Error(`Refund (₹${amount.toFixed(2)}) cannot exceed amount currently paid (₹${currentPaid.toFixed(2)})`),
        { httpStatus: 400 },
      );
    }

    const newPaid = Math.max(0, Math.round((currentPaid - amount) * 100) / 100);
    const newRefund = Math.round((currentRefund + amount) * 100) / 100;
    const newBalance = Math.max(0, Math.round((currentTotal - newPaid) * 100) / 100);
    // Don't auto-flip away from "cancelled" — once cancelled, stays cancelled.
    const newStatus = bill.status === "cancelled"
      ? "cancelled"
      : newPaid <= 0
        ? "pending"
        : newPaid < currentTotal
          ? "partial"
          : "paid";

    // Insert the refund as a negative-amount payment row so it shows up inline
    // in the payment history alongside regular payments.
    await tx.insert(paymentsTable).values({
      billId: id,
      amount: String(-amount),
      method,
      referenceNumber: null,
      notes: `REFUND: ${reason}`,
      recordedByName: performedBy,
    });

    const [updated] = await tx.update(billsTable).set({
      paidAmount: String(newPaid),
      refundAmount: String(newRefund),
      balanceAmount: String(newBalance),
      status: newStatus,
    }).where(eq(billsTable.id, id)).returning();

    await tx.insert(billAuditsTable).values({
      billId: id,
      editedBy: performedBy,
      reason,
      changeType: "refund",
      oldValue: `paid=₹${currentPaid.toFixed(2)}, refunded=₹${currentRefund.toFixed(2)}`,
      newValue: `refund=₹${amount.toFixed(2)} via ${method}; paid=₹${newPaid.toFixed(2)}, refunded=₹${newRefund.toFixed(2)}`,
    });

    return { updated, currentPaid, currentRefund, newPaid, newRefund };
  }).catch((err: Error & { httpStatus?: number }) => {
    if (err.httpStatus) {
      res.status(err.httpStatus).json({ error: err.message });
      return null;
    }
    throw err;
  });
  if (!result) return;
  const { updated, currentPaid, currentRefund, newPaid, newRefund } = result;

  try {
    const billForEmail = await buildBill(updated);
    const patientName = billForEmail.patient
      ? `${billForEmail.patient.firstName} ${billForEmail.patient.lastName}`
      : "Unknown Patient";
    sendBillEditEmail({
      billNumber: updated.billNumber,
      patientName,
      editedBy: performedBy,
      reason: `[REFUND] ${reason}`,
      changes: [
        { field: "Refund (₹)", from: currentRefund.toFixed(2), to: newRefund.toFixed(2) },
        { field: "Paid (₹)", from: currentPaid.toFixed(2), to: newPaid.toFixed(2) },
      ],
    }).catch((err) => console.error("[email] refund notification failed:", err));
  } catch (err) {
    req.log?.warn?.({ err }, "Refund email send failed");
  }

  res.json(await buildBill(updated));
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
  const paramsParsed = SuperEditBillParams.safeParse(req.params);
  const bodyParsed = SuperEditBillBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({
      error: "Invalid request",
      details: [
        ...(paramsParsed.success ? [] : paramsParsed.error.issues),
        ...(bodyParsed.success ? [] : bodyParsed.error.issues),
      ],
    });
    return;
  }
  const id = paramsParsed.data.id;
  const { token, reason, subtotal, discount, taxAmount } = bodyParsed.data;

  const { valid, userName } = await verifySuperAdminToken(token);
  if (!valid) {
    res.status(403).json({ error: "Super admin session expired or invalid. Please re-authenticate via the Super Admin Portal." });
    return;
  }
  const superAdminName = userName;

  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, id));
  if (!bill) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }

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
  const paramsParsed = DeleteBillParams.safeParse(req.params);
  const bodyParsed = DeleteBillBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({
      error: "Invalid request",
      details: [
        ...(paramsParsed.success ? [] : paramsParsed.error.issues),
        ...(bodyParsed.success ? [] : bodyParsed.error.issues),
      ],
    });
    return;
  }
  const id = paramsParsed.data.id;
  const { token, reason } = bodyParsed.data;

  const { valid, userName } = await verifySuperAdminToken(token);
  if (!valid) {
    res.status(403).json({ error: "Super admin session expired or invalid. Please re-authenticate via the Super Admin Portal." });
    return;
  }

  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, id));
  if (!bill) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }

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

  // Delete payments + bill, reset order, renumber later bills — all in one
  // transaction. Otherwise a partial failure (e.g. mid-renumber) leaves the
  // sequence with gaps or duplicate numbers and an inconsistent order status.
  await db.transaction(async (tx) => {
    await tx.delete(paymentsTable).where(eq(paymentsTable.billId, id));
    await tx.delete(billsTable).where(eq(billsTable.id, id));
    await tx.update(ordersTable).set({ status: "pending" }).where(eq(ordersTable.id, bill.orderId));

    if (billNumMatch) {
      const monthPrefix = billNumMatch[1];
      const deletedSeq  = Number(billNumMatch[2]);

      const laterBills = await tx
        .select()
        .from(billsTable)
        .where(like(billsTable.billNumber, `BILL-${monthPrefix}-%`))
        .orderBy(billsTable.billNumber);

      for (const lb of laterBills) {
        const m = lb.billNumber.match(/^BILL-(\d{6})-(\d+)$/);
        if (!m) continue;
        const seq = Number(m[2]);
        if (seq <= deletedSeq) continue;
        const newBillNumber = `BILL-${m[1]}-${String(seq - 1).padStart(4, "0")}`;
        await tx.update(billsTable).set({ billNumber: newBillNumber }).where(eq(billsTable.id, lb.id));
      }
    }
  });

  res.json({ success: true, deletedBillNumber: bill.billNumber });
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

  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "Payment amount must be greater than zero. Use the refund endpoint to process refunds." });
    return;
  }

  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, billId));
  if (!bill) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }

  const currentBalance = Number(bill.balanceAmount);
  if (amount > currentBalance + 0.01) {
    res.status(400).json({ error: `Payment amount (₹${amount.toFixed(2)}) exceeds outstanding balance (₹${currentBalance.toFixed(2)})` });
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
