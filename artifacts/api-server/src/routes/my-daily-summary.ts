import { Router } from "express";
import { db } from "@workspace/db";
import { billsTable, paymentsTable, billAuditsTable, patientsTable } from "@workspace/db/schema";
import { sql, and, eq, gte, lt } from "drizzle-orm";
import { FULL_ACCESS_ROLES } from "../middleware/requireStaffAuth";
import type { StaffAuthRequest } from "../middleware/requireStaffAuth";
import { getTransporter, getEmailSettings } from "../email";

export const myDailySummaryRouter = Router();

function dayBoundsRange(from: string, to: string) {
  return {
    start: new Date(`${from}T00:00:00+05:30`),
    end: new Date(`${to}T23:59:59.999+05:30`),
  };
}

// POST /send-email — sends the pre-built HTML summary to a given email address.
// requireStaffAuth applied at routes/index.ts (covers all router methods).
myDailySummaryRouter.post("/send-email", async (req: StaffAuthRequest, res) => {
  const { to, subject, htmlBody } = req.body as {
    to?: string;
    subject?: string;
    htmlBody?: string;
  };

  if (!to || !subject || !htmlBody) {
    return res.status(400).json({ ok: false, error: "Missing required fields: to, subject, htmlBody" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ ok: false, error: "Invalid email address" });
  }

  const settings = await getEmailSettings();
  const transport = await getTransporter();

  if (!settings || !transport) {
    return res
      .status(503)
      .json({ ok: false, error: "Email not configured. Please set up SMTP in Settings → Email." });
  }

  try {
    await transport.sendMail({
      from: `"${settings.fromName}" <${settings.fromAddress}>`,
      to,
      subject,
      html: htmlBody,
    });
    return res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Send failed";
    req.log.error({ err }, "send-summary-email failed");
    return res.status(500).json({ ok: false, error: msg });
  }
});

// GET / — staff daily summary (session-scoped)
// requireStaffAuth applied at routes/index.ts
myDailySummaryRouter.get("/", async (req: StaffAuthRequest, res) => {
  const session = req.staffSession!;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const from = typeof req.query.from === "string" ? req.query.from : today;
  const to = typeof req.query.to === "string" ? req.query.to : from;

  // Admin/superadmin may pass staffName to view another user's data.
  // Normal users always see only their own data — staffName param is ignored.
  const isOwner = FULL_ACCESS_ROLES.has(session.role);
  const staffName =
    isOwner && typeof req.query.staffName === "string" && req.query.staffName.trim()
      ? req.query.staffName.trim()
      : session.subjectName;

  const { start, end } = dayBoundsRange(from, to);

  // ── Bills created by this staff ────────────────────────────────────────
  const allBillRows = await db
    .select({
      id: billsTable.id,
      billNumber: billsTable.billNumber,
      totalAmount: billsTable.totalAmount,
      paidAmount: billsTable.paidAmount,
      balanceAmount: billsTable.balanceAmount,
      discount: billsTable.discount,
      status: billsTable.status,
      createdAt: billsTable.createdAt,
      createdByName: billsTable.createdByName,
      patientFirstName: patientsTable.firstName,
      patientLastName: patientsTable.lastName,
    })
    .from(billsTable)
    .leftJoin(patientsTable, eq(billsTable.patientId, patientsTable.id))
    .where(
      and(
        gte(billsTable.createdAt, start),
        lt(billsTable.createdAt, end),
        eq(billsTable.createdByName, staffName),
      ),
    )
    .orderBy(sql`${billsTable.createdAt} DESC`);

  // ── Payments recorded by this staff ────────────────────────────────────
  const allPaymentRows = await db
    .select({
      id: paymentsTable.id,
      billId: paymentsTable.billId,
      amount: paymentsTable.amount,
      method: paymentsTable.method,
      recordedByName: paymentsTable.recordedByName,
      createdAt: paymentsTable.createdAt,
    })
    .from(paymentsTable)
    .where(
      and(
        gte(paymentsTable.createdAt, start),
        lt(paymentsTable.createdAt, end),
        eq(paymentsTable.recordedByName, staffName),
      ),
    )
    .orderBy(sql`${paymentsTable.createdAt} DESC`);

  // ── Bill audits by this staff ──────────────────────────────────────────
  const billEditsRaw = await db
    .select({
      id: billAuditsTable.id,
      billId: billAuditsTable.billId,
      editedBy: billAuditsTable.editedBy,
      reason: billAuditsTable.reason,
      changeType: billAuditsTable.changeType,
      oldValue: billAuditsTable.oldValue,
      newValue: billAuditsTable.newValue,
      createdAt: billAuditsTable.createdAt,
      billNumber: billsTable.billNumber,
    })
    .from(billAuditsTable)
    .leftJoin(billsTable, eq(billAuditsTable.billId, billsTable.id))
    .where(
      and(
        gte(billAuditsTable.createdAt, start),
        lt(billAuditsTable.createdAt, end),
        eq(billAuditsTable.editedBy, staffName),
      ),
    )
    .orderBy(sql`${billAuditsTable.createdAt} DESC`)
    .limit(50);

  // ── Cash expenses approved_by this staff ───────────────────────────────
  const cashExpRaw = await db.execute<{ cash_expenses: string }>(sql`
    SELECT COALESCE(SUM(amount::numeric) FILTER (WHERE LOWER(payment_mode) = 'cash'), 0)::text AS cash_expenses
    FROM expenses
    WHERE expense_date >= ${from} AND expense_date <= ${to}
      AND approved_by = ${staffName}
  `);

  // ── Compute summary ─────────────────────────────────────────────────────
  const activeBills = allBillRows.filter((r) => r.status !== "cancelled");
  const cancelledBills = allBillRows.filter((r) => r.status === "cancelled");
  const paymentItems = allPaymentRows.filter((p) => Number(p.amount) > 0);
  const refundItems = allPaymentRows.filter((p) => Number(p.amount) < 0);

  const grossBilling = activeBills.reduce((s, r) => s + Number(r.totalAmount), 0);
  const outstanding = activeBills.reduce(
    (s, r) => s + Math.max(0, Number(r.balanceAmount ?? 0)),
    0,
  );
  const refundAmount = refundItems.reduce((s, p) => s + Math.abs(Number(p.amount)), 0);
  const cancelledAmount = cancelledBills.reduce((s, r) => s + Number(r.totalAmount), 0);
  const refundsAndCancellations = refundAmount + cancelledAmount;
  const cashExpenses = Number(cashExpRaw.rows[0]?.cash_expenses ?? 0);
  const totalReceived = paymentItems.reduce((s, p) => s + Number(p.amount), 0);
  const digitalCollection = paymentItems.reduce((s, p) => {
    const m = (p.method ?? "other").toLowerCase();
    return (
      s +
      (["upi", "card", "online", "bank", "cheque", "neft", "rtgs"].includes(m)
        ? Number(p.amount)
        : 0)
    );
  }, 0);
  const cashCollection = totalReceived - digitalCollection;
  const physicalCashInHand = cashCollection - cashExpenses;
  const discountsGiven = activeBills.reduce((s, r) => s + Number(r.discount ?? 0), 0);

  const byMethod: Record<string, number> = {};
  for (const p of paymentItems) {
    const m = (p.method ?? "cash").toLowerCase();
    byMethod[m] = (byMethod[m] ?? 0) + Number(p.amount);
  }

  res.json({
    staffName,
    isFiltered: isOwner && staffName !== session.subjectName,
    from,
    to,
    summary: {
      grossBilling,
      outstanding,
      refundsAndCancellations,
      refundAmount,
      cancelledAmount,
      cashExpenses,
      totalReceived,
      digitalCollection,
      cashCollection,
      physicalCashInHand,
      discountsGiven,
      cancellationCount: cancelledBills.length,
      billCount: activeBills.length,
      closingCashBalance: physicalCashInHand,
    },
    byMethod,
    bills: allBillRows.slice(0, 30).map((r) => ({
      id: r.id,
      billNumber: r.billNumber,
      patientName: r.patientFirstName
        ? `${r.patientFirstName} ${r.patientLastName ?? ""}`.trim()
        : "Unknown",
      totalAmount: Number(r.totalAmount),
      paidAmount: Number(r.paidAmount),
      balanceAmount: Number(r.balanceAmount ?? 0),
      discount: Number(r.discount ?? 0),
      status: r.status,
      createdAt:
        r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    })),
    payments: paymentItems.slice(0, 30).map((p) => ({
      id: p.id,
      billId: p.billId,
      amount: Number(p.amount),
      method: p.method ?? "cash",
      createdAt:
        p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
    })),
    billEdits: billEditsRaw.map((r) => ({
      id: r.id,
      billId: r.billId,
      billNumber: r.billNumber ?? `#${r.billId}`,
      editedBy: r.editedBy,
      reason: r.reason,
      changeType: r.changeType,
      oldValue: r.oldValue,
      newValue: r.newValue,
      createdAt:
        r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    })),
  });
});
