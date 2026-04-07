import { Router } from "express";
import { db, billsTable, paymentsTable, ordersTable, patientsTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
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

async function generateBillNumber(): Promise<string> {
  const count = await db.select({ count: sql<number>`count(*)` }).from(billsTable);
  const num = Number(count[0]?.count ?? 0) + 1;
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
  const parsed = CreateBillBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const { orderId, discount = 0, dueDate } = parsed.data;

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const subtotal = Number(order.totalAmount);
  const discountAmt = Number(discount);
  const taxAmount = 0;
  const totalAmount = subtotal - discountAmt + taxAmount;
  const billNumber = await generateBillNumber();

  const [bill] = await db.insert(billsTable).values({
    billNumber,
    orderId,
    patientId: order.patientId,
    subtotal: String(subtotal),
    discount: String(discountAmt),
    taxAmount: String(taxAmount),
    totalAmount: String(totalAmount),
    paidAmount: "0",
    balanceAmount: String(totalAmount),
    status: "pending",
    dueDate: dueDate ?? null,
  }).returning();

  res.status(201).json(await buildBill(bill));
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
  res.json(await buildBill(updated));
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
