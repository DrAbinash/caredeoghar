import { Router } from "express";
import { db, patientsTable, patientCounterTable } from "@workspace/db";
import { eq, ilike, or, sql, desc } from "drizzle-orm";
import {
  ListPatientsQueryParams,
  CreatePatientBody,
  UpdatePatientParams,
  UpdatePatientBody,
  GetPatientParams,
  GetPatientHistoryParams,
} from "@workspace/api-zod";

export const patientsRouter = Router();

async function generatePatientId(): Promise<string> {
  // Derive next ID from the maximum existing patient_id value
  const [row] = await db
    .select({ max: sql<string>`max(patient_id)` })
    .from(patientsTable);
  const last = row?.max; // e.g. "P-00003" or null
  const next = last ? parseInt(last.slice(2), 10) + 1 : 1;
  return `P-${String(next).padStart(5, "0")}`;
}

patientsRouter.get("/", async (req, res) => {
  const parsed = ListPatientsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const { search, page = 1, limit = 20 } = parsed.data;
  const offset = (page - 1) * limit;

  let query = db.select().from(patientsTable);
  if (search) {
    query = query.where(
      or(
        ilike(patientsTable.firstName, `%${search}%`),
        ilike(patientsTable.lastName, `%${search}%`),
        ilike(patientsTable.phone, `%${search}%`),
        ilike(patientsTable.patientId, `%${search}%`)
      )
    ) as typeof query;
  }

  const [patients, countResult] = await Promise.all([
    query.orderBy(desc(patientsTable.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(patientsTable),
  ]);

  res.json({
    patients,
    total: Number(countResult[0]?.count ?? 0),
    page,
    limit,
  });
});

patientsRouter.post("/", async (req, res) => {
  const parsed = CreatePatientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const patientId = await generatePatientId();
  const [patient] = await db
    .insert(patientsTable)
    .values({ ...parsed.data, patientId })
    .returning();
  res.status(201).json(patient);
});

patientsRouter.get("/:id", async (req, res) => {
  const parsed = GetPatientParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [patient] = await db
    .select()
    .from(patientsTable)
    .where(eq(patientsTable.id, parsed.data.id));
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }
  res.json(patient);
});

patientsRouter.put("/:id", async (req, res) => {
  const paramsParsed = UpdatePatientParams.safeParse({ id: Number(req.params.id) });
  const bodyParsed = UpdatePatientBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const [updated] = await db
    .update(patientsTable)
    .set(bodyParsed.data)
    .where(eq(patientsTable.id, paramsParsed.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }
  res.json(updated);
});

patientsRouter.get("/:id/history", async (req, res) => {
  const parsed = GetPatientHistoryParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const { ordersTable, orderTestsTable, testsTable, doctorsTable } = await import("@workspace/db");

  const orders = await db.select().from(ordersTable).where(eq(ordersTable.patientId, parsed.data.id)).orderBy(desc(ordersTable.createdAt));

  const ordersWithTests = await Promise.all(
    orders.map(async (order) => {
      const orderTests = await db
        .select({ orderTest: orderTestsTable, test: testsTable })
        .from(orderTestsTable)
        .leftJoin(testsTable, eq(orderTestsTable.testId, testsTable.id))
        .where(eq(orderTestsTable.orderId, order.id));

      let doctor = null;
      if (order.doctorId) {
        const [d] = await db.select().from(doctorsTable).where(eq(doctorsTable.id, order.doctorId));
        doctor = d ?? null;
      }

      const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, order.patientId));

      return {
        ...order,
        totalAmount: Number(order.totalAmount),
        patient: patient ?? null,
        doctor,
        tests: orderTests.map((ot) => ({
          ...ot.orderTest,
          price: Number(ot.orderTest.price),
          test: ot.test
            ? {
                ...ot.test,
                price: Number(ot.test.price),
              }
            : null,
        })),
      };
    })
  );

  res.json({ orders: ordersWithTests, total: ordersWithTests.length, page: 1, limit: 100 });
});
