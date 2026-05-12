import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { billsTable, paymentsTable, ordersTable } from "@workspace/db/schema";
import { sql, and, eq, gte, lt, ne } from "drizzle-orm";
import { patientsTable } from "@workspace/db/schema";

export const dailySummaryRouter: IRouter = Router();

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function dayBoundsIST(dateStr: string): { start: Date; end: Date } {
  return {
    start: new Date(`${dateStr}T00:00:00+05:30`),
    end: new Date(`${dateStr}T23:59:59.999+05:30`),
  };
}

dailySummaryRouter.get("/", async (req, res) => {
  const date = typeof req.query.date === "string" ? req.query.date : todayIST();
  const staffName = typeof req.query.staffName === "string" ? req.query.staffName.trim() : "";

  const { start: dayStart, end: dayEnd } = dayBoundsIST(date);

  // ── Payments in this date range (includes negatives = refunds) ──────────────
  const paymentFilters = [
    gte(paymentsTable.createdAt, dayStart),
    lt(paymentsTable.createdAt, dayEnd),
  ];
  if (staffName) paymentFilters.push(eq(paymentsTable.recordedByName, staffName));

  const allPaymentItems = await db
    .select({
      id: paymentsTable.id,
      billId: paymentsTable.billId,
      amount: paymentsTable.amount,
      method: paymentsTable.method,
      referenceNumber: paymentsTable.referenceNumber,
      recordedByName: paymentsTable.recordedByName,
      notes: paymentsTable.notes,
      createdAt: paymentsTable.createdAt,
    })
    .from(paymentsTable)
    .where(and(...paymentFilters))
    .orderBy(sql`${paymentsTable.createdAt} DESC`)
    .limit(500);

  // Separate positive (receipts) and negative (refunds) payments
  const paymentItems = allPaymentItems.filter((p) => Number(p.amount) > 0);
  const refundItems  = allPaymentItems.filter((p) => Number(p.amount) < 0);

  // ── Bills created in this date range ─────────────────────────────────────
  const billFilters = [
    gte(billsTable.createdAt, dayStart),
    lt(billsTable.createdAt, dayEnd),
  ];
  if (staffName) billFilters.push(eq(billsTable.createdByName, staffName));

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
      patientId: billsTable.patientId,
      patientFirstName: patientsTable.firstName,
      patientLastName: patientsTable.lastName,
    })
    .from(billsTable)
    .leftJoin(patientsTable, eq(billsTable.patientId, patientsTable.id))
    .where(and(...billFilters))
    .orderBy(sql`${billsTable.createdAt} DESC`);

  // ── Orders in this date range ──────────────────────────────────────────────
  const orderCount = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(ordersTable)
    .where(and(gte(ordersTable.createdAt, dayStart), lt(ordersTable.createdAt, dayEnd)));

  // ── Expenses for this date ────────────────────────────────────────────────
  const expenseRows = await db.execute<{ payment_mode: string; total: string }>(
    sql`SELECT payment_mode, COALESCE(SUM(amount::numeric), 0)::text AS total
        FROM expenses
        WHERE expense_date = ${date}
        GROUP BY payment_mode`
  );

  // ── All outstanding dues across ALL time (not just today) ─────────────────
  const allDuesResult = await db.execute<{ total: string }>(
    sql`SELECT COALESCE(SUM(balance_amount::numeric), 0)::text AS total
        FROM bills
        WHERE status IN ('pending','partial') AND balance_amount::numeric > 0`
  );
  const totalOutstandingDues = Number(allDuesResult.rows[0]?.total ?? 0);

  // ── Aggregate ─────────────────────────────────────────────────────────────
  const activeBills    = allBillRows.filter((r) => r.status !== "cancelled");
  const cancelledBills = allBillRows.filter((r) => r.status === "cancelled");

  const totalBilled   = activeBills.reduce((s, r) => s + Number(r.totalAmount), 0);

  // Outstanding from TODAY's bills: use actual balance_amount (not totalBilled - totalReceived).
  // This correctly reflects partial payments regardless of when they were made.
  const todayOutstanding = activeBills.reduce((s, r) => s + Math.max(0, Number(r.balanceAmount ?? 0)), 0);

  // Net received today = sum of positive payments minus sum of |refunds|
  const totalReceived  = paymentItems.reduce((s, p) => s + Number(p.amount), 0);
  const totalRefunded  = refundItems.reduce((s, p) => s + Math.abs(Number(p.amount)), 0);
  const netReceived    = totalReceived - totalRefunded;

  // byMethod shows positive receipts only (refunds shown separately)
  const byMethod: Record<string, number> = {};
  for (const p of paymentItems) {
    const m = (p.method ?? "other").toLowerCase();
    byMethod[m] = (byMethod[m] ?? 0) + Number(p.amount);
  }

  const byRefundMethod: Record<string, number> = {};
  for (const p of refundItems) {
    const m = (p.method ?? "other").toLowerCase();
    byRefundMethod[m] = (byRefundMethod[m] ?? 0) + Math.abs(Number(p.amount));
  }

  const billsByStatus = {
    paid:      activeBills.filter((r) => r.status === "paid").length,
    partial:   activeBills.filter((r) => r.status === "partial").length,
    pending:   activeBills.filter((r) => r.status === "pending").length,
    cancelled: cancelledBills.length,
  };

  // ── Per-user breakdown ────────────────────────────────────────────────────
  type UserAgg = {
    userName: string;
    billCount: number;
    billed: number;
    received: number;
    methods: Record<string, number>;
  };
  const byUserMap = new Map<string, UserAgg>();
  const ensureUser = (name: string | null | undefined): UserAgg => {
    const key = (name && name.trim()) || "Unknown User";
    let row = byUserMap.get(key);
    if (!row) {
      row = { userName: key, billCount: 0, billed: 0, received: 0, methods: {} };
      byUserMap.set(key, row);
    }
    return row;
  };
  for (const r of activeBills) {
    const fallbackName = paymentItems.find((p) => p.billId === r.id)?.recordedByName ?? null;
    const u = ensureUser(r.createdByName ?? fallbackName);
    u.billCount += 1;
    u.billed += Number(r.totalAmount);
  }
  for (const p of paymentItems) {
    const recorder =
      (p.recordedByName && p.recordedByName.trim())
        ? p.recordedByName
        : (allBillRows.find((b) => b.id === p.billId)?.createdByName ?? null);
    const u = ensureUser(recorder);
    const amt = Number(p.amount);
    u.received += amt;
    const m = (p.method ?? "cash").toLowerCase();
    u.methods[m] = (u.methods[m] ?? 0) + amt;
  }
  const byUser = Array.from(byUserMap.values()).sort((a, b) => b.received - a.received);

  // ── Expenses ──────────────────────────────────────────────────────────────
  let totalExpense = 0;
  for (const row of expenseRows.rows) {
    totalExpense += Number(row.total);
  }
  // Net Cash in Hand = net received (receipts minus refunds) minus expenses
  const grandTotal = netReceived - totalExpense;

  res.json({
    date,
    staffName: staffName || null,
    summary: {
      totalBilled,
      totalReceived,    // gross receipts today
      totalRefunded,    // refunds today
      netReceived,      // totalReceived - totalRefunded
      outstanding: todayOutstanding,  // actual balance_amount of today's active bills
      totalOutstandingDues,           // ALL outstanding dues across all time
      billCount: activeBills.length,
      orderCount: orderCount[0]?.count ?? 0,
    },
    byMethod,
    byRefundMethod,
    billsByStatus,
    byUser,
    totalExpense,
    grandTotal,
    bills: allBillRows.map((r) => ({
      id: r.id,
      billNumber: r.billNumber,
      patientName: r.patientFirstName ? `${r.patientFirstName} ${r.patientLastName ?? ""}`.trim() : "Unknown",
      totalAmount: Number(r.totalAmount),
      paidAmount: Number(r.paidAmount),
      balanceAmount: Number(r.balanceAmount ?? 0),
      discount: Number(r.discount ?? 0),
      status: r.status,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      createdByName: r.createdByName ?? "",
    })),
    payments: paymentItems.map((p) => ({
      id: p.id,
      billId: p.billId,
      amount: Number(p.amount),
      method: p.method ?? "cash",
      referenceNumber: p.referenceNumber,
      recordedByName: p.recordedByName,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
    })),
    refunds: refundItems.map((p) => ({
      id: p.id,
      billId: p.billId,
      amount: Math.abs(Number(p.amount)),
      method: p.method ?? "cash",
      notes: p.notes,
      recordedByName: p.recordedByName,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
    })),
    cancelledBillsDetail: cancelledBills.map((r) => ({
      id: r.id,
      billNumber: r.billNumber,
      patientName: r.patientFirstName ? `${r.patientFirstName} ${r.patientLastName ?? ""}`.trim() : "Unknown",
      totalAmount: Number(r.totalAmount),
      paidAmount: Number(r.paidAmount),
      createdByName: r.createdByName ?? "",
    })),
  });
});
