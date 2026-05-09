import { Router } from "express";
import { db } from "@workspace/db";
import { outsourcedLabsTable } from "@workspace/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { z } from "zod/v4";

export const outsourcedLabsRouter = Router();

const createLabSchema = z.object({
  name: z.string().min(1),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  gstin: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});

const updateLabSchema = createLabSchema.partial();

outsourcedLabsRouter.get("/", async (_req, res) => {
  const labs = await db
    .select()
    .from(outsourcedLabsTable)
    .orderBy(desc(outsourcedLabsTable.createdAt));
  res.json(labs);
});

outsourcedLabsRouter.post("/", async (req, res) => {
  const parsed = createLabSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }
  const [lab] = await db
    .insert(outsourcedLabsTable)
    .values({ ...parsed.data, isActive: parsed.data.isActive ?? true })
    .returning();
  res.status(201).json(lab);
});

outsourcedLabsRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [lab] = await db.select().from(outsourcedLabsTable).where(eq(outsourcedLabsTable.id, id));
  if (!lab) {
    res.status(404).json({ error: "Lab not found" });
    return;
  }
  res.json(lab);
});

outsourcedLabsRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = updateLabSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }
  const [updated] = await db
    .update(outsourcedLabsTable)
    .set(parsed.data)
    .where(eq(outsourcedLabsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Lab not found" });
    return;
  }
  res.json(updated);
});

outsourcedLabsRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  // Check if any tests reference this lab
  const testCount = await db.execute(
    sql`SELECT count(*) FROM diagnostic_tests WHERE outsourced_lab_id = ${id}`
  );
  const count = Number((testCount.rows[0] as { count: string })?.count ?? 0);
  if (count > 0) {
    res.status(409).json({ error: `Cannot delete: ${count} test(s) are linked to this lab. Reassign them first.` });
    return;
  }
  const [deleted] = await db
    .delete(outsourcedLabsTable)
    .where(eq(outsourcedLabsTable.id, id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Lab not found" });
    return;
  }
  res.json({ success: true });
});
