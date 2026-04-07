import { Router } from "express";
import { db, ordersTable, patientsTable, billsTable, paymentsTable, orderTestsTable, testsTable } from "@workspace/db";
import { eq, sql, gte, lte, and, desc } from "drizzle-orm";
import { GetRevenueReportQueryParams } from "@workspace/api-zod";

export const reportsRouter = Router();

reportsRouter.get("/dashboard", async (_req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [
    totalPatients,
    todayOrders,
    pendingOrders,
    todayRevenue,
    monthRevenue,
    pendingPayments,
    completedTests,
    ordersByStatus,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(patientsTable),
    db.select({ count: sql<number>`count(*)` }).from(ordersTable).where(and(gte(ordersTable.createdAt, today), lte(ordersTable.createdAt, endOfDay))),
    db.select({ count: sql<number>`count(*)` }).from(ordersTable).where(eq(ordersTable.status, "pending")),
    db.select({ sum: sql<number>`coalesce(sum(amount), 0)` }).from(paymentsTable).where(and(gte(paymentsTable.createdAt, today), lte(paymentsTable.createdAt, endOfDay))),
    db.select({ sum: sql<number>`coalesce(sum(amount), 0)` }).from(paymentsTable).where(gte(paymentsTable.createdAt, startOfMonth)),
    db.select({ sum: sql<number>`coalesce(sum(balance_amount), 0)` }).from(billsTable).where(sql`status IN ('pending','partial')`),
    db.select({ count: sql<number>`count(*)` }).from(ordersTable).where(eq(ordersTable.status, "completed")),
    db.select({ status: ordersTable.status, count: sql<number>`count(*)` }).from(ordersTable).groupBy(ordersTable.status),
  ]);

  res.json({
    totalPatients: Number(totalPatients[0]?.count ?? 0),
    todayOrders: Number(todayOrders[0]?.count ?? 0),
    pendingOrders: Number(pendingOrders[0]?.count ?? 0),
    todayRevenue: Number(todayRevenue[0]?.sum ?? 0),
    monthRevenue: Number(monthRevenue[0]?.sum ?? 0),
    pendingPayments: Number(pendingPayments[0]?.sum ?? 0),
    completedTests: Number(completedTests[0]?.count ?? 0),
    ordersByStatus: ordersByStatus.map((row) => ({
      status: row.status,
      count: Number(row.count),
    })),
  });
});

reportsRouter.get("/revenue", async (req, res) => {
  const parsed = GetRevenueReportQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const period = parsed.data.period ?? "monthly";

  let groupBy: string;
  let labelFormat: string;
  let limit: number;

  if (period === "daily") {
    groupBy = "DATE(created_at AT TIME ZONE 'UTC')";
    labelFormat = "YYYY-MM-DD";
    limit = 30;
  } else if (period === "weekly") {
    groupBy = "DATE_TRUNC('week', created_at AT TIME ZONE 'UTC')";
    labelFormat = "YYYY-\"W\"IW";
    limit = 12;
  } else {
    groupBy = "DATE_TRUNC('month', created_at AT TIME ZONE 'UTC')";
    labelFormat = "Mon YYYY";
    limit = 12;
  }

  const rows = await db.execute(sql`
    SELECT
      TO_CHAR(${sql.raw(groupBy)}, ${labelFormat}) as label,
      COALESCE(SUM(amount), 0) as revenue,
      COUNT(*) as orders
    FROM payments
    GROUP BY ${sql.raw(groupBy)}
    ORDER BY ${sql.raw(groupBy)} DESC
    LIMIT ${limit}
  `);

  const data = (rows.rows as { label: string; revenue: string; orders: string }[]).reverse().map((row) => ({
    label: row.label,
    revenue: Number(row.revenue),
    orders: Number(row.orders),
  }));

  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);
  const totalOrders = data.reduce((sum, d) => sum + d.orders, 0);

  res.json({ period, data, totalRevenue, totalOrders });
});

reportsRouter.get("/popular-tests", async (_req, res) => {
  const rows = await db
    .select({
      testId: testsTable.id,
      testName: testsTable.name,
      testCode: testsTable.code,
      category: testsTable.category,
      orderCount: sql<number>`count(${orderTestsTable.id})`,
      revenue: sql<number>`coalesce(sum(${orderTestsTable.price}), 0)`,
    })
    .from(orderTestsTable)
    .leftJoin(testsTable, eq(orderTestsTable.testId, testsTable.id))
    .groupBy(testsTable.id, testsTable.name, testsTable.code, testsTable.category)
    .orderBy(sql`count(${orderTestsTable.id}) DESC`)
    .limit(10);

  res.json({
    tests: rows.map((r) => ({
      testId: r.testId ?? 0,
      testName: r.testName ?? "",
      testCode: r.testCode ?? "",
      category: r.category ?? "",
      orderCount: Number(r.orderCount),
      revenue: Number(r.revenue),
    })),
  });
});

reportsRouter.get("/recent-activity", async (_req, res) => {
  const recentOrders = await db
    .select({ order: ordersTable, patient: patientsTable })
    .from(ordersTable)
    .leftJoin(patientsTable, eq(ordersTable.patientId, patientsTable.id))
    .orderBy(desc(ordersTable.createdAt))
    .limit(5);

  const recentPayments = await db
    .select({ payment: paymentsTable, bill: billsTable, patient: patientsTable })
    .from(paymentsTable)
    .leftJoin(billsTable, eq(paymentsTable.billId, billsTable.id))
    .leftJoin(patientsTable, eq(billsTable.patientId, patientsTable.id))
    .orderBy(desc(paymentsTable.createdAt))
    .limit(5);

  const recentPatients = await db
    .select()
    .from(patientsTable)
    .orderBy(desc(patientsTable.createdAt))
    .limit(3);

  const activities = [
    ...recentOrders.map((r) => ({
      id: `order-${r.order.id}`,
      type: r.order.status === "completed" ? "order_completed" : "order_created",
      description: r.order.status === "completed" ? `Order ${r.order.orderNumber} completed` : `New order ${r.order.orderNumber} created`,
      patientName: r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : "Unknown",
      amount: Number(r.order.totalAmount),
      createdAt: r.order.createdAt.toISOString(),
    })),
    ...recentPayments.map((r) => ({
      id: `payment-${r.payment.id}`,
      type: "payment_received",
      description: `Payment of ₹${Number(r.payment.amount).toFixed(2)} received`,
      patientName: r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : "Unknown",
      amount: Number(r.payment.amount),
      createdAt: r.payment.createdAt.toISOString(),
    })),
    ...recentPatients.map((p) => ({
      id: `patient-${p.id}`,
      type: "patient_registered",
      description: `New patient ${p.firstName} ${p.lastName} registered`,
      patientName: `${p.firstName} ${p.lastName}`,
      amount: null,
      createdAt: p.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  res.json({ activities });
});
