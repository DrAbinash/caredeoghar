import { Router } from "express";
import { db } from "@workspace/db";
import { departmentsTable, testsTable, staffTable, machinesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

export const departmentsRouter = Router();

departmentsRouter.get("/", async (_req, res) => {
  const rows = await db.select().from(departmentsTable).orderBy(departmentsTable.name);
  // Count usage in tests, staff, machines
  const [testCounts, staffCounts, machineCounts] = await Promise.all([
    db.select({ name: testsTable.department, c: sql<number>`count(*)::int` }).from(testsTable).groupBy(testsTable.department),
    db.select({ name: staffTable.department, c: sql<number>`count(*)::int` }).from(staffTable).groupBy(staffTable.department),
    db.select({ name: machinesTable.department, c: sql<number>`count(*)::int` }).from(machinesTable).groupBy(machinesTable.department),
  ]);
  const tCount = new Map(testCounts.map(r => [r.name, r.c]));
  const sCount = new Map(staffCounts.map(r => [r.name, r.c]));
  const mCount = new Map(machineCounts.map(r => [r.name, r.c]));
  res.json(rows.map(r => ({ ...r, testCount: tCount.get(r.name) || 0, staffCount: sCount.get(r.name) || 0, machineCount: mCount.get(r.name) || 0 })));
});

departmentsRouter.post("/", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) return res.status(400).json({ error: "name is required" });
  try {
    const [row] = await db.insert(departmentsTable).values({
      name,
      code: typeof req.body?.code === "string" ? req.body.code.trim() || null : null,
      description: typeof req.body?.description === "string" ? req.body.description : null,
      headOfDepartment: typeof req.body?.headOfDepartment === "string" ? req.body.headOfDepartment : null,
      contactPhone: typeof req.body?.contactPhone === "string" ? req.body.contactPhone : null,
      contactEmail: typeof req.body?.contactEmail === "string" ? req.body.contactEmail : null,
      isActive: req.body?.isActive !== false,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    if (msg.includes("unique") || msg.includes("duplicate")) return res.status(409).json({ error: "A department with that name already exists" });
    res.status(500).json({ error: msg });
  }
});

departmentsRouter.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Department not found" });

  const updates: Record<string, unknown> = {};
  for (const k of ["name", "code", "description", "headOfDepartment", "contactPhone", "contactEmail"]) {
    if (k in req.body) {
      const v = req.body[k];
      updates[k] = typeof v === "string" ? (v.trim() || null) : v;
    }
  }
  if ("isActive" in req.body) updates.isActive = !!req.body.isActive;

  try {
    const [row] = await db.update(departmentsTable).set(updates).where(eq(departmentsTable.id, id)).returning();
    res.json(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    if (msg.includes("unique") || msg.includes("duplicate")) return res.status(409).json({ error: "A department with that name already exists" });
    res.status(500).json({ error: msg });
  }
});

departmentsRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Department not found" });
  await db.delete(departmentsTable).where(eq(departmentsTable.id, id));
  res.json({ ok: true });
});
