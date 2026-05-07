import { Router } from "express";
import { db, testsTable } from "@workspace/db";
import { orderTestsTable } from "@workspace/db";
import { eq, ilike, and, sql, desc, asc } from "drizzle-orm";
import {
  ListTestsQueryParams,
  CreateTestBody,
  GetTestParams,
  UpdateTestParams,
  UpdateTestBody,
} from "@workspace/api-zod";

export const testsRouter = Router();

testsRouter.get("/", async (req, res) => {
  const parsed = ListTestsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const { search, category } = parsed.data;
  const sort = (req.query.sort as string) ?? "";

  let conditions: ReturnType<typeof eq>[] = [];
  if (search) {
    conditions.push(
      ilike(testsTable.name, `%${search}%`) as ReturnType<typeof eq>
    );
  }
  if (category) {
    conditions.push(eq(testsTable.category, category));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  if (sort === "popular") {
    const tests = await db
      .select({
        id: testsTable.id,
        code: testsTable.code,
        name: testsTable.name,
        category: testsTable.category,
        price: testsTable.price,
        duration: testsTable.duration,
        description: testsTable.description,
        isActive: testsTable.isActive,
        createdAt: testsTable.createdAt,
        billCount: sql<number>`count(${orderTestsTable.id})`,
      })
      .from(testsTable)
      .leftJoin(orderTestsTable, eq(orderTestsTable.testId, testsTable.id))
      .where(where)
      .groupBy(testsTable.id)
      .orderBy(desc(sql`count(${orderTestsTable.id})`), asc(testsTable.name));

    return res.json({ tests: tests.map(t => ({ ...t, price: Number(t.price) })), total: tests.length });
  }

  const tests = await db
    .select()
    .from(testsTable)
    .where(where)
    .orderBy(desc(testsTable.createdAt));

  return res.json({ tests: tests.map(t => ({ ...t, price: Number(t.price) })), total: tests.length });
});

// Sourced from req.body separately because the codegen'd CreateTestBody zod
// strips unknown keys. Falls back to safe defaults so old callers keep working.
function extractDeptRoom(body: unknown): { department?: string; roomNumber?: string } {
  if (!body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  const out: { department?: string; roomNumber?: string } = {};
  if (typeof b.department === "string" && b.department.trim()) out.department = b.department.trim();
  if (typeof b.roomNumber === "string") out.roomNumber = b.roomNumber.trim();
  return out;
}

testsRouter.post("/", async (req, res) => {
  const parsed = CreateTestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const extra = extractDeptRoom(req.body);
  try {
    const [test] = await db.insert(testsTable).values({
      ...parsed.data,
      price: String(parsed.data.price),
      isActive: parsed.data.isActive ?? true,
      ...(extra.department !== undefined ? { department: extra.department } : {}),
      ...(extra.roomNumber !== undefined ? { roomNumber: extra.roomNumber } : {}),
    }).returning();
    res.status(201).json({ ...test, price: Number(test.price) });
  } catch (e) {
    const msg = (e as { message?: string })?.message ?? "";
    if (msg.includes("diagnostic_tests_code_unique") || msg.includes("duplicate key")) {
      res.status(409).json({ error: `Test code "${parsed.data.code}" is already in use. Please pick a different code.` });
      return;
    }
    throw e;
  }
});

testsRouter.get("/:id", async (req, res) => {
  const parsed = GetTestParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [test] = await db.select().from(testsTable).where(eq(testsTable.id, parsed.data.id));
  if (!test) {
    res.status(404).json({ error: "Test not found" });
    return;
  }
  res.json({ ...test, price: Number(test.price) });
});

testsRouter.put("/:id", async (req, res) => {
  const paramsParsed = UpdateTestParams.safeParse({ id: Number(req.params.id) });
  const bodyParsed = UpdateTestBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const updateData: Record<string, unknown> = { ...bodyParsed.data };
  if (updateData.price !== undefined) {
    updateData.price = String(updateData.price);
  }
  const extra = extractDeptRoom(req.body);
  if (extra.department !== undefined) updateData.department = extra.department;
  if (extra.roomNumber !== undefined) updateData.roomNumber = extra.roomNumber;
  const [updated] = await db
    .update(testsTable)
    .set(updateData)
    .where(eq(testsTable.id, paramsParsed.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Test not found" });
    return;
  }
  res.json({ ...updated, price: Number(updated.price) });
});
