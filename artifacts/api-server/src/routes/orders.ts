import { Router } from "express";
import { db, ordersTable, orderTestsTable, testsTable, patientsTable, doctorsTable } from "@workspace/db";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import {
  ListOrdersQueryParams,
  CreateOrderBody,
  GetOrderParams,
  UpdateOrderParams,
  UpdateOrderBody,
} from "@workspace/api-zod";
import { sanitizePatient } from "./patients";

export const ordersRouter = Router();

async function generateOrderNumber(): Promise<string> {
  const count = await db.select({ count: sql<number>`count(*)` }).from(ordersTable);
  const num = Number(count[0]?.count ?? 0) + 1;
  const date = new Date();
  const prefix = `ORD-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  return `${prefix}-${String(num).padStart(4, "0")}`;
}

async function buildOrder(order: typeof ordersTable.$inferSelect) {
  const orderTestRows = await db
    .select({ orderTest: orderTestsTable, test: testsTable })
    .from(orderTestsTable)
    .leftJoin(testsTable, eq(orderTestsTable.testId, testsTable.id))
    .where(eq(orderTestsTable.orderId, order.id));

  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, order.patientId));
  let doctor = null;
  if (order.doctorId) {
    const [d] = await db.select().from(doctorsTable).where(eq(doctorsTable.id, order.doctorId));
    doctor = d ?? null;
  }

  return {
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

ordersRouter.get("/", async (req, res) => {
  const parsed = ListOrdersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }
  const { status, patientId, page = 1, limit = 20, dateFrom, dateTo } = parsed.data;
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [];
  if (status) conditions.push(eq(ordersTable.status, status));
  if (patientId) conditions.push(eq(ordersTable.patientId, patientId));
  if (dateFrom) conditions.push(gte(ordersTable.createdAt, new Date(dateFrom)) as ReturnType<typeof eq>);
  if (dateTo) conditions.push(lte(ordersTable.createdAt, new Date(dateTo)) as ReturnType<typeof eq>);

  const [orders, countResult] = await Promise.all([
    db.select().from(ordersTable).where(conditions.length > 0 ? and(...conditions) : undefined).orderBy(desc(ordersTable.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(ordersTable).where(conditions.length > 0 ? and(...conditions) : undefined),
  ]);

  const ordersWithDetails = await Promise.all(orders.map(buildOrder));
  res.json({ orders: ordersWithDetails, total: Number(countResult[0]?.count ?? 0), page, limit });
});

ordersRouter.post("/", async (req, res) => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }
  const { patientId, doctorId, testIds, tests: customTests, notes } = parsed.data;

  const [patientRow] = await db.select({ id: patientsTable.id }).from(patientsTable).where(eq(patientsTable.id, patientId));
  if (!patientRow) {
    res.status(400).json({
      error: "Invalid request",
      details: [
        {
          path: ["patientId"],
          message: `Patient with id ${patientId} does not exist.`,
        },
      ],
    });
    return;
  }

  let resolvedDoctor: typeof doctorsTable.$inferSelect | null = null;
  if (doctorId !== undefined && doctorId !== null) {
    const [d] = await db.select().from(doctorsTable).where(eq(doctorsTable.id, doctorId));
    if (!d) {
      res.status(400).json({
        error: "Invalid request",
        details: [
          {
            path: ["doctorId"],
            message: `Doctor with id ${doctorId} does not exist.`,
          },
        ],
      });
      return;
    }
    resolvedDoctor = d;
  }

  const hasCustom = !!customTests && customTests.length > 0;
  const hasLegacy = !!testIds && testIds.length > 0;
  if (!hasCustom && !hasLegacy) {
    res.status(400).json({
      error: "Invalid request",
      details: [
        {
          path: ["tests"],
          message: "At least one of `tests` or `testIds` must be provided with one or more items.",
        },
      ],
    });
    return;
  }

  // Support two formats: custom [{testId, price}] or legacy testIds[]
  let lineItems: { testId: number; price: string }[] = [];
  if (hasCustom) {
    lineItems = customTests.map((ct) => ({ testId: ct.testId, price: String(ct.price) }));
  } else {
    const tests = await db.select().from(testsTable).where(
      sql`${testsTable.id} = ANY(${testIds!})`
    );
    lineItems = tests.map((t) => ({ testId: t.id, price: t.price }));
    if (lineItems.length !== testIds!.length) {
      res.status(400).json({
        error: "Invalid request",
        details: [
          {
            path: ["testIds"],
            message: "One or more testIds do not refer to an existing test.",
          },
        ],
      });
      return;
    }
  }

  const totalAmount = lineItems.reduce((sum, t) => sum + Number(t.price), 0);
  const orderNumber = await generateOrderNumber();

  // Resolve ledger from doctor (fallback: default ledger 1)
  const ledgerId = resolvedDoctor?.ledgerId ?? 1;

  const [order] = await db.insert(ordersTable).values({
    orderNumber,
    patientId,
    doctorId: doctorId ?? null,
    totalAmount: String(totalAmount),
    notes: notes ?? null,
    status: "pending",
    ledgerId,
  }).returning();

  if (lineItems.length > 0) {
    await db.insert(orderTestsTable).values(
      lineItems.map((t) => ({
        orderId: order.id,
        testId: t.testId,
        price: t.price,
      }))
    );
  }

  const fullOrder = await buildOrder(order);
  res.status(201).json(fullOrder);
});

ordersRouter.get("/:id", async (req, res) => {
  const parsed = GetOrderParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, parsed.data.id));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  res.json(await buildOrder(order));
});

ordersRouter.put("/:id", async (req, res) => {
  const paramsParsed = UpdateOrderParams.safeParse({ id: Number(req.params.id) });
  const bodyParsed = UpdateOrderBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    const details = [
      ...(paramsParsed.success ? [] : paramsParsed.error.issues),
      ...(bodyParsed.success ? [] : bodyParsed.error.issues),
    ];
    res.status(400).json({ error: "Invalid request", details });
    return;
  }
  const { status, notes } = bodyParsed.data;
  const updateData: Record<string, unknown> = { status };
  if (notes !== undefined) updateData.notes = notes;
  if (status === "collected") updateData.collectedAt = new Date();
  if (status === "completed") updateData.completedAt = new Date();

  const [updated] = await db
    .update(ordersTable)
    .set(updateData)
    .where(eq(ordersTable.id, paramsParsed.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  res.json(await buildOrder(updated));
});
