/**
 * USG Report Drafts Routes
 * Mounted at: /api/usg-reports  (staff-auth required)
 *
 * GET   /               — list all report drafts (latest first)
 * GET   /:id            — get a single draft
 * POST  /               — create a new report draft
 * PATCH /:id            — update draft content / template / status
 * POST  /:id/finalize   — mark report as finalized
 * POST  /:id/archive    — archive a report
 * DELETE /:id           — delete a draft report
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  usgReportDraftsTable,
  usgMeasurementsTable,
} from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ── GET / ─────────────────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  const status = req.query.status as string | undefined;
  let q = db.select().from(usgReportDraftsTable).$dynamic();
  if (status) q = q.where(eq(usgReportDraftsTable.status, status));
  const rows = await q.orderBy(desc(usgReportDraftsTable.updatedAt)).limit(200);
  res.json(rows);
});

// ── GET /:id ──────────────────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db
    .select()
    .from(usgReportDraftsTable)
    .where(eq(usgReportDraftsTable.id, id))
    .limit(1);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// ── POST / ────────────────────────────────────────────────────────────────────

router.post("/", async (req, res) => {
  const b = (req.body ?? {}) as {
    worklistId?: number;
    studyInstanceUID?: string;
    patientId?: number;
    accessionNumber?: string;
    templateType?: string;
    draftContent?: string;
    autoFilledFromMeasurementId?: number;
    createdBy?: string;
  };

  try {
    let draftContent = b.draftContent ?? "";

    // Auto-fill from approved measurements if studyUID provided and content is blank
    if (!draftContent && (b.studyInstanceUID || b.worklistId)) {
      const filter = b.studyInstanceUID
        ? eq(usgMeasurementsTable.studyInstanceUID, b.studyInstanceUID)
        : eq(usgMeasurementsTable.worklistId, b.worklistId!);

      const [measurement] = await db
        .select()
        .from(usgMeasurementsTable)
        .where(and(filter, eq(usgMeasurementsTable.status, "approved")))
        .orderBy(desc(usgMeasurementsTable.createdAt))
        .limit(1);

      if (measurement) {
        // Build a minimal auto-fill template
        const lines: string[] = [
          `ULTRASOUND REPORT — ${b.templateType ?? "WHOLE_ABDOMEN"}`,
          `Study: ${b.studyInstanceUID ?? ""}`,
          `Accession: ${b.accessionNumber ?? ""}`,
          ``,
          `AUTO-FILLED FROM APPROVED MEASUREMENTS`,
          `----------------------------------------`,
        ];
        if (measurement.bpd) lines.push(`BPD: ${measurement.bpd}`);
        if (measurement.hc)  lines.push(`HC: ${measurement.hc}`);
        if (measurement.ac)  lines.push(`AC: ${measurement.ac}`);
        if (measurement.fl)  lines.push(`FL: ${measurement.fl}`);
        if (measurement.ga)  lines.push(`GA: ${measurement.ga}`);
        if (measurement.edd) lines.push(`EDD: ${measurement.edd}`);
        if (measurement.fhr) lines.push(`FHR: ${measurement.fhr}`);
        if (measurement.liquorAfi) lines.push(`AFI: ${measurement.liquorAfi}`);
        if (measurement.uterusSize) lines.push(`Uterus: ${measurement.uterusSize}`);
        if (measurement.rightOvary) lines.push(`Right Ovary: ${measurement.rightOvary}`);
        if (measurement.leftOvary)  lines.push(`Left Ovary: ${measurement.leftOvary}`);
        if (measurement.liverSize)  lines.push(`Liver: ${measurement.liverSize}`);
        if (measurement.spleenSize) lines.push(`Spleen: ${measurement.spleenSize}`);
        if (measurement.rightKidney) lines.push(`Right Kidney: ${measurement.rightKidney}`);
        if (measurement.leftKidney)  lines.push(`Left Kidney: ${measurement.leftKidney}`);
        if (measurement.prostateVolume) lines.push(`Prostate: ${measurement.prostateVolume}`);
        lines.push(``, `IMPRESSION:`, ``);
        draftContent = lines.join("\n");
      }
    }

    const [row] = await db.insert(usgReportDraftsTable).values({
      worklistId:                  b.worklistId ?? null,
      studyInstanceUID:            b.studyInstanceUID ?? null,
      patientId:                   b.patientId ?? null,
      accessionNumber:             b.accessionNumber ?? null,
      templateType:                b.templateType ?? "WHOLE_ABDOMEN",
      draftContent,
      status:                      "draft",
      autoFilledFromMeasurementId: b.autoFilledFromMeasurementId ?? null,
      createdBy:                   b.createdBy ?? null,
    }).returning();

    res.status(201).json(row);
  } catch (err) {
    logger.error({ err }, "POST /usg-reports failed");
    res.status(500).json({ error: "Failed to create report draft" });
  }
});

// ── PATCH /:id ────────────────────────────────────────────────────────────────

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const b = (req.body ?? {}) as {
    draftContent?: string;
    templateType?: string;
    status?: string;
  };

  const [row] = await db
    .update(usgReportDraftsTable)
    .set({ ...b, updatedAt: new Date() })
    .where(eq(usgReportDraftsTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// ── POST /:id/finalize ────────────────────────────────────────────────────────

router.post("/:id/finalize", async (req, res) => {
  const id = Number(req.params.id);
  const b = (req.body ?? {}) as { finalizedBy?: string };

  const [row] = await db
    .update(usgReportDraftsTable)
    .set({
      status:      "finalized",
      finalizedBy: b.finalizedBy ?? null,
      finalizedAt: new Date(),
      updatedAt:   new Date(),
    })
    .where(eq(usgReportDraftsTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// ── POST /:id/archive ─────────────────────────────────────────────────────────

router.post("/:id/archive", async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db
    .update(usgReportDraftsTable)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(usgReportDraftsTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// ── DELETE /:id ───────────────────────────────────────────────────────────────

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db
    .delete(usgReportDraftsTable)
    .where(eq(usgReportDraftsTable.id, id))
    .returning({ id: usgReportDraftsTable.id });
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ success: true });
});

export const usgReportsRouter = router;
