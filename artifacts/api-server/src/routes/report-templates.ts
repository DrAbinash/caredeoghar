// Report Templates — per-test template library used by Report Generator.
import { Router } from "express";
import { db } from "@workspace/db";
import { reportTemplatesTable, testsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";

export const reportTemplatesRouter = Router();

// GET /api/report-templates?testId=42  — list templates (optionally filtered)
reportTemplatesRouter.get("/", async (req, res) => {
  const testId = req.query.testId ? Number(req.query.testId) : null;
  const rows = testId
    ? await db.select().from(reportTemplatesTable).where(eq(reportTemplatesTable.testId, testId)).orderBy(desc(reportTemplatesTable.isDefault), reportTemplatesTable.name)
    : await db.select().from(reportTemplatesTable).orderBy(desc(reportTemplatesTable.isDefault), reportTemplatesTable.name);
  res.json(rows);
});

reportTemplatesRouter.get("/:id", async (req, res) => {
  const [row] = await db.select().from(reportTemplatesTable).where(eq(reportTemplatesTable.id, Number(req.params.id)));
  if (!row) return res.status(404).json({ error: "Template not found" });
  res.json(row);
});

// POST /api/report-templates  — upload a new template tagged to a test
reportTemplatesRouter.post("/", async (req, res) => {
  const body = req.body as { testId?: number; name?: string; format?: string; content?: string; isDefault?: boolean };
  const testId = Number(body.testId);
  const name = (body.name ?? "").trim();
  const content = (body.content ?? "").trim();
  if (!testId || !name || !content) return res.status(400).json({ error: "testId, name and content are required" });

  const [test] = await db.select().from(testsTable).where(eq(testsTable.id, testId));
  if (!test) return res.status(404).json({ error: "Test not found" });

  const format = body.format === "html" ? "html" : "text";
  const wantsDefault = !!body.isDefault;
  const tags = typeof (body as { tags?: string }).tags === "string" ? (body as { tags?: string }).tags!.trim() : null;
  const modality = typeof (body as { modality?: string }).modality === "string" ? (body as { modality?: string }).modality!.trim() : null;

  const inserted = await db.transaction(async (tx) => {
    if (wantsDefault) {
      await tx.update(reportTemplatesTable)
        .set({ isDefault: false })
        .where(and(eq(reportTemplatesTable.testId, testId), eq(reportTemplatesTable.isDefault, true)));
    }
    const [row] = await tx.insert(reportTemplatesTable).values({
      testId, name, content, format, isDefault: wantsDefault,
      tags: tags || null, modality: modality || null,
    }).returning();
    return row;
  });
  res.status(201).json(inserted);
});

// PATCH /api/report-templates/:id  — rename / set default / replace content
reportTemplatesRouter.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(reportTemplatesTable).where(eq(reportTemplatesTable.id, id));
  if (!existing) return res.status(404).json({ error: "Template not found" });

  const body = req.body as { name?: string; content?: string; format?: string; isDefault?: boolean };
  const updates: Partial<typeof reportTemplatesTable.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.name === "string") updates.name = body.name.trim();
  if (typeof body.content === "string") updates.content = body.content;
  if (body.format === "html" || body.format === "text") updates.format = body.format;
  const ext = body as { tags?: string | null; modality?: string | null };
  if (ext.tags !== undefined) updates.tags = ext.tags === null ? null : String(ext.tags).trim() || null;
  if (ext.modality !== undefined) updates.modality = ext.modality === null ? null : String(ext.modality).trim() || null;

  const updated = await db.transaction(async (tx) => {
    if (body.isDefault === true) {
      await tx.update(reportTemplatesTable)
        .set({ isDefault: false })
        .where(and(eq(reportTemplatesTable.testId, existing.testId), eq(reportTemplatesTable.isDefault, true)));
      updates.isDefault = true;
    } else if (body.isDefault === false) {
      updates.isDefault = false;
    }
    const [row] = await tx.update(reportTemplatesTable).set(updates).where(eq(reportTemplatesTable.id, id)).returning();
    return row;
  });
  res.json(updated);
});

reportTemplatesRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const result = await db.delete(reportTemplatesTable).where(eq(reportTemplatesTable.id, id)).returning();
  if (result.length === 0) return res.status(404).json({ error: "Template not found" });
  res.json({ ok: true });
});

export default reportTemplatesRouter;
