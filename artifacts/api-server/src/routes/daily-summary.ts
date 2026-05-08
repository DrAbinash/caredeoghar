import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { billsTable, paymentsTable } from "@workspace/db/schema";
import { sql, and, eq, gte, lt, ne } from "drizzle-orm";

export const dailySummaryRouter: IRouter = Router();

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function startOfDayUTC(dateStr: string): Date {
  // dateStr is YYYY-MM-DD in IST — convert to UTC range
  const d = new Date(`${dateStr}T00:00:00+05:30`);
  return d;
}

function endOfDayUTC(dateStr: string): Date {
  const d = new Date(`${dateStr}T23:59:59.999+05:30`);
  return d;
}

dailySummaryRouter.get("/", async (req, res) => {
  const date = typeof req.query.date === "string" ? req.query.date : todayIST();
  const staffName = typeof req.query.staffName === "string" ? req.query.staffName.trim() : "";

  const dayStart = startOfDayUTC(date);
  const dayEnd = endOfDayUTC(date);

  // ── Income: payments recorded in this date range ──────────────────────────
  const paymentFilters = [
    gte(paymentsTable.createdAt, dayStart),
    lt(paymentsTable.createdAt, dayEnd),
  ];
  if (staffName) paymentFilters.push(eq(paymentsTable.recordedByName, staffName));

  const paymentRows = await db
    .select({
      method: paymentsTable.method,
      total: sql<string>`COALESCE(SUM(${paymentsTable.amount}::numeric), 0)`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(paymentsTable)
    .where(and(...paymentFilters))
    .groupBy(paymentsTable.method);

  const incomeByMethod: Record<string, number> = {};
  let totalIncome = 0;
  for (const row of paymentRows) {
    const m = (row.method ?? "other").toLowerCase();
    const v = Number(row.total);
    incomeByMethod[m] = (incomeByMethod[m] ?? 0) + v;
    totalIncome += v;
  }

  // Itemized payment list (last 200)
  const paymentFilters2 = [
    gte(paymentsTable.createdAt, dayStart),
    lt(paymentsTable.createdAt, dayEnd),
  ];
  if (staffName) paymentFilters2.push(eq(paymentsTable.recordedByName, staffName));

  const paymentItems = await db
    .select({
      id: paymentsTable.id,
      billId: paymentsTable.billId,
      amount: paymentsTable.amount,
      method: paymentsTable.method,
      referenceNumber: paymentsTable.referenceNumber,
      recordedByName: paymentsTable.recordedByName,
      createdAt: paymentsTable.createdAt,
    })
    .from(paymentsTable)
    .where(and(...paymentFilters2))
    .orderBy(sql`${paymentsTable.createdAt} DESC`)
    .limit(200);

  // ── Bills created today ───────────────────────────────────────────────────
  const billFilters = [
    gte(billsTable.createdAt, dayStart),
    lt(billsTable.createdAt, dayEnd),
    ne(billsTable.status, "cancelled"),
  ];
  if (staffName) billFilters.push(eq(billsTable.createdByName, staffName));

  const [billsSummary] = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
      totalAmount: sql<string>`COALESCE(SUM(${billsTable.totalAmount}::numeric), 0)`,
      paidAmount: sql<string>`COALESCE(SUM(${billsTable.paidAmount}::numeric), 0)`,
    })
    .from(billsTable)
    .where(and(...billFilters));

  // ── Expenses for this date ────────────────────────────────────────────────
  // expenses use expense_date text field (YYYY-MM-DD) so simple equality works
  const expenseRows = await db.execute<{ payment_mode: string; total: string; count: number }>(
    sql`SELECT payment_mode, COALESCE(SUM(amount::numeric), 0)::text AS total, COUNT(*)::int AS count
        FROM expenses
        WHERE expense_date = ${date}`
  );

  const expenseByMode: Record<string, number> = {};
  let totalExpenses = 0;
  for (const row of expenseRows.rows) {
    const m = (row.payment_mode ?? "cash").toLowerCase();
    const v = Number(row.total);
    expenseByMode[m] = (expenseByMode[m] ?? 0) + v;
    totalExpenses += v;
  }

  res.json({
    date,
    staffName: staffName || null,
    income: {
      byMethod: incomeByMethod,
      total: totalIncome,
    },
    bills: {
      count: billsSummary?.count ?? 0,
      totalAmount: Number(billsSummary?.totalAmount ?? 0),
      paidAmount: Number(billsSummary?.paidAmount ?? 0),
    },
    expenses: {
      byMode: expenseByMode,
      total: totalExpenses,
    },
    netCash:
      (incomeByMethod["cash"] ?? 0) - (expenseByMode["cash"] ?? 0),
    payments: paymentItems.map((p) => ({
      id: p.id,
      billId: p.billId,
      amount: Number(p.amount),
      method: p.method,
      referenceNumber: p.referenceNumber,
      recordedByName: p.recordedByName,
      createdAt: p.createdAt,
    })),
  });
});
