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
  const fields = ["name", "tagline", "address", "email", "phone", "website", "gstin", "footerNote", "logoDataUrl", "formFTestIds", "quickTestIds"] as const;
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const f of fields) {
    if (body[f] !== undefined) update[f] = body[f];
  }
  const boolFields = ["patientPhotoEnabled", "showTatOnBill", "qrOnBillEnabled", "portalEnabled", "portalAllowAppointmentBooking", "portalAllowProfileEdit"] as const;
  for (const f of boolFields) {
    if (body[f] !== undefined) {
      if (typeof body[f] !== "boolean") {
        res.status(400).json({ error: `${f} must be a boolean` });
        return;
      }
      update[f] = body[f];
    }
  }
  const portalTextFields = ["portalHeading", "portalWelcomeMessage"] as const;
  for (const f of portalTextFields) {
    if (body[f] !== undefined) {
      if (typeof body[f] !== "string") {
        res.status(400).json({ error: `${f} must be a string` });
        return;
      }
      if (body[f].length > 500) {
        res.status(400).json({ error: `${f} too long (max 500 chars)` });
        return;
      }
      update[f] = body[f];
    }
  }
  if (body.billPrintCopies !== undefined) {
    const n = Number(body.billPrintCopies);
    if (!Number.isInteger(n) || (n !== 1 && n !== 2)) {
      res.status(400).json({ error: "billPrintCopies must be 1 or 2" });
      return;
    }
    update.billPrintCopies = n;
  }
  if (typeof update.logoDataUrl === "string" && update.logoDataUrl.length > 2_000_000) {
    res.status(413).json({ error: "Logo too large (max ~1.5MB)" });
    return;
  }
  if (typeof update.quickTestIds === "string") {
    if (update.quickTestIds.length > 200) {
      res.status(400).json({ error: "quickTestIds payload too large" });
      return;
    }
    try {
      const parsed = JSON.parse(update.quickTestIds);
      if (
        !Array.isArray(parsed) ||
        parsed.length !== 6 ||
        !parsed.every((v) => v === null || (typeof v === "number" && Number.isInteger(v) && v > 0))
      ) {
        res.status(400).json({ error: "quickTestIds must be an array of exactly 6 entries (positive integer test id or null)" });
        return;
      }
    } catch {
      res.status(400).json({ error: "quickTestIds must be valid JSON" });
      return;
    }
  }
  const [updated] = await db
    .update(clinicSettingsTable)
    .set(update)
    .where(eq(clinicSettingsTable.id, current.id))
    .returning();
  res.json(updated);
});

export default clinicSettingsRouter;
