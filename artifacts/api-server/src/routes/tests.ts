import { Router } from "express";
import { db, testsTable } from "@workspace/db";
import { eq, ilike, and, sql, desc } from "drizzle-orm";
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

  let conditions: ReturnType<typeof eq>[] = [];
  if (search) {
    conditions.push(
      ilike(testsTable.name, `%${search}%`) as ReturnType<typeof eq>
    );
  }
  if (category) {
    conditions.push(eq(testsTable.category, category));
  }

  const tests = await db
    .select()
    .from(testsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(testsTable.createdAt));

  res.json({ tests: tests.map(t => ({ ...t, price: Number(t.price) })), total: tests.length });
});

testsRouter.post("/", async (req, res) => {
  const parsed = CreateTestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const [test] = await db.insert(testsTable).values({
    ...parsed.data,
    price: String(parsed.data.price),
    isActive: parsed.data.isActive ?? true,
  }).returning();
  res.status(201).json({ ...test, price: Number(test.price) });
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
