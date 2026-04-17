import { Router } from "express";
import { db, clinicSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const clinicSettingsRouter = Router();

async function getOrCreate() {
  const rows = await db.select().from(clinicSettingsTable).limit(1);
  if (rows[0]) return rows[0];
  const [created] = await db.insert(clinicSettingsTable).values({}).returning();
  return created;
}

clinicSettingsRouter.get("/", async (_req, res) => {
  const row = await getOrCreate();
  res.json(row);
});

clinicSettingsRouter.put("/", async (req, res) => {
  const current = await getOrCreate();
  const body = req.body ?? {};
  const fields = ["name", "tagline", "address", "email", "phone", "website", "gstin", "footerNote", "logoDataUrl"] as const;
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const f of fields) {
    if (body[f] !== undefined) update[f] = body[f];
  }
  if (typeof update.logoDataUrl === "string" && update.logoDataUrl.length > 2_000_000) {
    res.status(413).json({ error: "Logo too large (max ~1.5MB)" });
    return;
  }
  const [updated] = await db
    .update(clinicSettingsTable)
    .set(update)
    .where(eq(clinicSettingsTable.id, current.id))
    .returning();
  res.json(updated);
});

export default clinicSettingsRouter;
