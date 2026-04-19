// Abnormal Findings library — pre-canned descriptions that the Report
// Generator auto-suggests (typed) or matches against speech-to-text input.
import { Router } from "express";
import { db } from "@workspace/db";
import { abnormalFindingsTable } from "@workspace/db/schema";
import { eq, and, or, ilike, sql, desc } from "drizzle-orm";

export const abnormalFindingsRouter = Router();

// GET /api/abnormal-findings?testId=&modality=&q=&limit=
abnormalFindingsRouter.get("/", async (req, res) => {
  const testId = req.query.testId ? Number(req.query.testId) : null;
  const modality = typeof req.query.modality === "string" ? req.query.modality : null;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limit = Math.min(Number(req.query.limit ?? 100), 500);

  const conds = [eq(abnormalFindingsTable.isActive, true)];
  if (testId) conds.push(or(eq(abnormalFindingsTable.testId, testId), sql`${abnormalFindingsTable.testId} IS NULL`)!);
  if (modality) conds.push(eq(abnormalFindingsTable.modality, modality));
  if (q) {
    conds.push(or(
      ilike(abnormalFindingsTable.keyword, `%${q}%`),
      ilike(abnormalFindingsTable.aliases, `%${q}%`),
      ilike(abnormalFindingsTable.category, `%${q}%`),
    )!);
  }

  const rows = await db.select().from(abnormalFindingsTable)
    .where(and(...conds))
    .orderBy(desc(abnormalFindingsTable.usageCount), abnormalFindingsTable.keyword)
    .limit(limit);
  res.json(rows);
});

abnormalFindingsRouter.get("/:id", async (req, res) => {
  const [row] = await db.select().from(abnormalFindingsTable).where(eq(abnormalFindingsTable.id, Number(req.params.id)));
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

abnormalFindingsRouter.post("/", async (req, res) => {
  const body = req.body as Partial<typeof abnormalFindingsTable.$inferInsert>;
  if (!body.keyword || !body.description) return res.status(400).json({ error: "keyword and description are required" });
  const [row] = await db.insert(abnormalFindingsTable).values({
    testId: body.testId ?? null,
    modality: body.modality ?? null,
    category: body.category ?? null,
    keyword: body.keyword.trim(),
    aliases: body.aliases ?? null,
    description: body.description,
    severity: (body.severity as string) || "moderate",
    isActive: body.isActive ?? true,
  }).returning();
  res.status(201).json(row);
});

abnormalFindingsRouter.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as Partial<typeof abnormalFindingsTable.$inferInsert>;
  const updates: Partial<typeof abnormalFindingsTable.$inferInsert> = { updatedAt: new Date() };
  for (const k of ["testId", "modality", "category", "keyword", "aliases", "description", "severity", "isActive"] as const) {
    if (body[k] !== undefined) (updates as Record<string, unknown>)[k] = body[k];
  }
  const [row] = await db.update(abnormalFindingsTable).set(updates).where(eq(abnormalFindingsTable.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

abnormalFindingsRouter.delete("/:id", async (req, res) => {
  const r = await db.delete(abnormalFindingsTable).where(eq(abnormalFindingsTable.id, Number(req.params.id))).returning();
  if (r.length === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// POST /api/abnormal-findings/:id/use — increments usage counter (for ranking)
abnormalFindingsRouter.post("/:id/use", async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(abnormalFindingsTable)
    .set({ usageCount: sql`${abnormalFindingsTable.usageCount} + 1` })
    .where(eq(abnormalFindingsTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

export default abnormalFindingsRouter;
