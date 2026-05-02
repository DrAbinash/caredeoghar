import { Router } from "express";
import { db } from "@workspace/db";
import { branchesTable } from "@workspace/db/schema";
import { eq, ne } from "drizzle-orm";

export const branchesRouter = Router();

branchesRouter.get("/", async (_req, res) => {
  const rows = await db.select().from(branchesTable).orderBy(branchesTable.name);
  res.json(rows);
});

branchesRouter.get("/:id", async (req, res) => {
  const [row] = await db.select().from(branchesTable).where(eq(branchesTable.id, Number(req.params.id)));
  if (!row) return res.status(404).json({ error: "Branch not found" });
  res.json(row);
});

branchesRouter.post("/", async (req, res) => {
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!code || !name) return res.status(400).json({ error: "code and name are required" });

  const wantsMain = req.body?.isMain === true;

  try {
    const row = await db.transaction(async (tx) => {
      if (wantsMain) {
        await tx.update(branchesTable).set({ isMain: false }).where(eq(branchesTable.isMain, true));
      }
      const [inserted] = await tx.insert(branchesTable).values({
        code,
        name,
        address: req.body?.address || null,
        city: req.body?.city || null,
        state: req.body?.state || null,
        pincode: req.body?.pincode || null,
        phone: req.body?.phone || null,
        email: req.body?.email || null,
        gstin: req.body?.gstin || null,
        manager: req.body?.manager || null,
        isMain: wantsMain,
        isActive: req.body?.isActive !== false,
        notes: req.body?.notes || null,
      }).returning();
      return inserted;
    });
    res.status(201).json(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    if (msg.includes("branches_one_main_uq")) return res.status(409).json({ error: "Another branch is already marked as main" });
    if (msg.includes("unique") || msg.includes("duplicate")) return res.status(409).json({ error: "A branch with that code already exists" });
    res.status(500).json({ error: msg });
  }
});

branchesRouter.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(branchesTable).where(eq(branchesTable.id, id));
  if (!existing) return res.status(404).json({ error: "Branch not found" });

  const updates: Record<string, unknown> = {};
  for (const k of ["code", "name", "address", "city", "state", "pincode", "phone", "email", "gstin", "manager", "notes"]) {
    if (k in req.body) {
      const v = req.body[k];
      updates[k] = typeof v === "string" ? (v.trim() || null) : v;
    }
  }
  if ("isActive" in req.body) updates.isActive = !!req.body.isActive;
  const wantsMainChange = "isMain" in req.body;
  const wantsMain = wantsMainChange ? !!req.body.isMain : existing.isMain;
  if (wantsMainChange) updates.isMain = wantsMain;

  try {
    const row = await db.transaction(async (tx) => {
      // If we're setting this branch as main, atomically unset every other main branch first.
      if (wantsMainChange && wantsMain) {
        await tx.update(branchesTable).set({ isMain: false }).where(ne(branchesTable.id, id));
      }
      const [updated] = await tx.update(branchesTable).set(updates).where(eq(branchesTable.id, id)).returning();
      return updated;
    });
    res.json(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    if (msg.includes("branches_one_main_uq")) return res.status(409).json({ error: "Another branch is already marked as main" });
    if (msg.includes("unique") || msg.includes("duplicate")) return res.status(409).json({ error: "A branch with that code already exists" });
    res.status(500).json({ error: msg });
  }
});

branchesRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(branchesTable).where(eq(branchesTable.id, id));
  if (!existing) return res.status(404).json({ error: "Branch not found" });
  await db.delete(branchesTable).where(eq(branchesTable.id, id));
  res.json({ ok: true });
});
