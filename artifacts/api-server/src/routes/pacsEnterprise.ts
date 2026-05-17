/**
 * pacsEnterprise.ts
 * Enterprise PACS/RIS routes — Parts 1–7 of the enterprise upgrade.
 *
 * Mounted at /api/radiology by routes/index.ts, behind
 * requireStaffAuth + requireStaffPermission("/orders").
 */
import { Router } from "express";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { db } from "@workspace/db";
import { tcpProbe } from "../lib/pacs/providers.js";
import {
  dicomRoutingRulesTable,
  dicomPulledStudiesTable,
  dicomFailedRetrievalQueueTable,
  radiologyScheduledProceduresTable,
  pacsSettingsTable,
  dicomModalitiesTable,
  pacsLogsTable,
  radiologyWorklistTable,
} from "@workspace/db/schema";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";

const execAsync = promisify(exec);
const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getViewerSettings(): Promise<Record<string, string>> {
  const rows = await db
    .select()
    .from(pacsSettingsTable)
    .where(eq(pacsSettingsTable.category, "viewer"));
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value ?? "";
  return map;
}

async function getSetting(key: string, category: string): Promise<string | null> {
  const [row] = await db
    .select({ value: pacsSettingsTable.value })
    .from(pacsSettingsTable)
    .where(and(eq(pacsSettingsTable.key, key), eq(pacsSettingsTable.category, category)))
    .limit(1);
  return row?.value ?? null;
}

async function logPacsEvent(
  source: string,
  eventType: string,
  message: string,
  extra: { studyInstanceUID?: string; accessionNumber?: string | null; severity?: string } = {},
) {
  await db
    .insert(pacsLogsTable)
    .values({
      source,
      eventType,
      severity: extra.severity ?? "info",
      message,
      studyInstanceUid: extra.studyInstanceUID ?? null,
      accessionNumber: extra.accessionNumber ?? null,
    })
    .catch(() => {});
}

// ─── C-ECHO (Upgraded) ────────────────────────────────────────────────────────
//
// POST /api/radiology/modalities/:id/echo-test
// Tries real DICOM C-ECHO via echoscu (DCMTK) if available on the server.
// Falls back to TCP reachability probe when DCMTK is not installed.

router.post("/modalities/:id/echo-test", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [modality] = await db
    .select()
    .from(dicomModalitiesTable)
    .where(eq(dicomModalitiesTable.id, id));
  if (!modality) {
    res.status(404).json({ error: "Modality not found" });
    return;
  }

  const host = modality.ipAddress;
  const port = modality.port;
  if (!host || !port) {
    res.status(400).json({ error: "No IP/port configured for this modality" });
    return;
  }

  const aeTitle = modality.aeTitle ?? "DIAGNOCENTER";
  const start = Date.now();

  // Detect whether echoscu (DCMTK) is installed on this server
  let hasDcmtk = false;
  try {
    await execAsync("which echoscu", { timeout: 3000 });
    hasDcmtk = true;
  } catch {
    hasDcmtk = false;
  }

  let ok = false;
  let testType: "DICOM_C_ECHO" | "TCP_FALLBACK" = "TCP_FALLBACK";
  let message = "";
  let latencyMs = 0;
  let associationStatus: "ACCEPTED" | "REJECTED" | "UNREACHABLE" = "UNREACHABLE";

  if (hasDcmtk) {
    testType = "DICOM_C_ECHO";
    try {
      // -aec: called AE title (the target modality)
      // -aet: calling AE title (us)
      // Timeout flag: --timeout 5
      const { stdout, stderr } = await execAsync(
        `echoscu -aec "${aeTitle}" -aet "DIAGNOCENTER" --timeout 5 "${host}" ${port}`,
        { timeout: 8000 },
      );
      latencyMs = Date.now() - start;
      const output = (stdout + stderr).toLowerCase();
      if (output.includes("association accepted") || output.includes("successful")) {
        ok = true;
        associationStatus = "ACCEPTED";
        message = "DICOM C-ECHO successful — association accepted";
      } else if (output.includes("association rejected") || output.includes("refused")) {
        ok = false;
        associationStatus = "REJECTED";
        message = `DICOM C-ECHO rejected: ${stdout.trim() || stderr.trim()}`;
      } else {
        // echoscu exits 0 on success even with no output
        ok = true;
        associationStatus = "ACCEPTED";
        message = "DICOM C-ECHO completed (echoscu exit 0)";
      }
    } catch (err: unknown) {
      latencyMs = Date.now() - start;
      const e = err as { code?: number; stderr?: string; message?: string };
      ok = false;
      associationStatus = "UNREACHABLE";
      message = `DICOM C-ECHO failed: ${e.stderr ?? e.message ?? "unknown error"}`;
    }
  } else {
    // TCP fallback
    const tcpResult = await tcpProbe(host, port, 5000);
    latencyMs = tcpResult.latencyMs ?? (Date.now() - start);
    ok = tcpResult.ok;
    message = tcpResult.ok
      ? "TCP reachable — DICOM association not verified (install DCMTK on server for full C-ECHO)"
      : tcpResult.message;
    associationStatus = tcpResult.ok ? "ACCEPTED" : "UNREACHABLE";
  }

  await db
    .update(dicomModalitiesTable)
    .set({
      lastConnectionStatus: ok ? "ok" : "error",
      lastSeenAt: ok ? new Date() : undefined,
      lastError: ok ? null : message,
      updatedAt: new Date(),
    })
    .where(eq(dicomModalitiesTable.id, id));

  await logPacsEvent(
    "DICOM_PULL_AGENT",
    ok ? "C_ECHO_SUCCESS" : "C_ECHO_FAILED",
    message,
    { severity: ok ? "info" : "warn" },
  );

  res.json({
    ok,
    testType,
    latencyMs,
    message,
    aeTitle,
    associationStatus,
    host,
    port,
  });
});

// ─── ROUTING RULES ────────────────────────────────────────────────────────────

router.get("/routing-rules", async (_req, res) => {
  const rows = await db
    .select()
    .from(dicomRoutingRulesTable)
    .orderBy(asc(dicomRoutingRulesTable.priority), asc(dicomRoutingRulesTable.id));
  res.json(rows);
});

router.post("/routing-rules", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  if (!body.name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const payload = {
    name: String(body.name),
    modalityType: body.modalityType ? String(body.modalityType) : null,
    sourceAeTitle: body.sourceAeTitle ? String(body.sourceAeTitle) : null,
    destinationPacs: body.destinationPacs ? String(body.destinationPacs) : "CONQUEST",
    destinationAeTitle: body.destinationAeTitle ? String(body.destinationAeTitle) : null,
    destinationIp: body.destinationIp ? String(body.destinationIp) : null,
    destinationPort: body.destinationPort ? Number(body.destinationPort) : null,
    storagePath: body.storagePath ? String(body.storagePath) : null,
    autoPush: body.autoPush !== false,
    priority: body.priority ? Number(body.priority) : 10,
    isEnabled: body.isEnabled !== false,
    notes: body.notes ? String(body.notes) : null,
    updatedAt: new Date(),
  };

  if (body.id) {
    const [row] = await db
      .update(dicomRoutingRulesTable)
      .set(payload)
      .where(eq(dicomRoutingRulesTable.id, Number(body.id)))
      .returning();
    res.json(row);
  } else {
    const [row] = await db.insert(dicomRoutingRulesTable).values(payload).returning();
    res.json(row);
  }
});

router.patch("/routing-rules/:id/toggle", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [current] = await db
    .select({ isEnabled: dicomRoutingRulesTable.isEnabled })
    .from(dicomRoutingRulesTable)
    .where(eq(dicomRoutingRulesTable.id, id));
  if (!current) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [row] = await db
    .update(dicomRoutingRulesTable)
    .set({ isEnabled: !current.isEnabled, updatedAt: new Date() })
    .where(eq(dicomRoutingRulesTable.id, id))
    .returning();
  res.json(row);
});

router.delete("/routing-rules/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(dicomRoutingRulesTable).where(eq(dicomRoutingRulesTable.id, id));
  res.json({ ok: true });
});

// ─── PULLED STUDIES ───────────────────────────────────────────────────────────

router.get("/pulled-studies", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const status = req.query.status as string | undefined;
  const modality = req.query.modality as string | undefined;

  const conds = [];
  if (status) conds.push(eq(dicomPulledStudiesTable.status, status));
  if (modality) conds.push(eq(dicomPulledStudiesTable.modality, modality));

  const rows = await db
    .select()
    .from(dicomPulledStudiesTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(dicomPulledStudiesTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(rows);
});

// GET /api/radiology/pulled-studies/stats — must come BEFORE /:uid routes
router.get("/pulled-studies/stats", async (_req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [todayRows, allRows] = await Promise.all([
    db
      .select({ status: dicomPulledStudiesTable.status, count: sql<number>`count(*)::int` })
      .from(dicomPulledStudiesTable)
      .where(gte(dicomPulledStudiesTable.createdAt, todayStart))
      .groupBy(dicomPulledStudiesTable.status),
    db
      .select({ status: dicomPulledStudiesTable.status, count: sql<number>`count(*)::int` })
      .from(dicomPulledStudiesTable)
      .groupBy(dicomPulledStudiesTable.status),
  ]);

  const today: Record<string, number> = {};
  for (const r of todayRows) today[r.status] = r.count;
  const totals: Record<string, number> = {};
  for (const r of allRows) totals[r.status] = r.count;

  res.json({ today, totals });
});

// ─── FAILED RETRIEVAL QUEUE ───────────────────────────────────────────────────

router.get("/failed-queue", async (req, res) => {
  const status = (req.query.status as string) || "PENDING";
  const rows = await db
    .select()
    .from(dicomFailedRetrievalQueueTable)
    .where(eq(dicomFailedRetrievalQueueTable.status, status))
    .orderBy(desc(dicomFailedRetrievalQueueTable.createdAt))
    .limit(100);
  res.json(rows);
});

router.post("/failed-queue/:id/retry", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [item] = await db
    .select()
    .from(dicomFailedRetrievalQueueTable)
    .where(eq(dicomFailedRetrievalQueueTable.id, id));
  if (!item) {
    res.status(404).json({ error: "Queue item not found" });
    return;
  }

  const [updated] = await db
    .update(dicomFailedRetrievalQueueTable)
    .set({
      status: "PENDING",
      nextRetryAt: new Date(),
      retryCount: item.retryCount + 1,
      updatedAt: new Date(),
    })
    .where(eq(dicomFailedRetrievalQueueTable.id, id))
    .returning();

  res.json({ ok: true, item: updated });
});

router.delete("/failed-queue/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .update(dicomFailedRetrievalQueueTable)
    .set({ status: "ABANDONED", updatedAt: new Date() })
    .where(eq(dicomFailedRetrievalQueueTable.id, id));
  res.json({ ok: true });
});

// ─── WEASIS VIEWER LAUNCH ─────────────────────────────────────────────────────

router.get("/studies/:studyInstanceUID/weasis-launch", async (req, res) => {
  const { studyInstanceUID } = req.params;

  const [viewerSettings, conquestWado, orthancBase] = await Promise.all([
    getViewerSettings(),
    getSetting("wado_base_url", "conquest"),
    getSetting("orthanc_base_url", "orthanc"),
  ]);

  const wadoUrl =
    viewerSettings["wado_base_url"] ||
    conquestWado ||
    (orthancBase ? `${orthancBase}/wado` : "");

  const pacsType = orthancBase ? "ORTHANC" : conquestWado ? "CONQUEST" : "UNKNOWN";

  if (!wadoUrl) {
    res.json({
      studyInstanceUID,
      viewerType: "WEASIS",
      error: "No WADO URL configured. Please configure PACS → Viewer Settings.",
      weasisUrl: null,
      fallbackDicomWebUrl: null,
      pacsType: "UNKNOWN",
    });
    return;
  }

  const weasisUrl = `weasis://$dicom:get -w "${wadoUrl}" -r "studyUID=${studyInstanceUID}"`;

  const [[worklist], [pulled]] = await Promise.all([
    db
      .select({ patientName: radiologyWorklistTable.patientName, accessionNumber: radiologyWorklistTable.accessionNumber })
      .from(radiologyWorklistTable)
      .where(eq(radiologyWorklistTable.studyInstanceUID, studyInstanceUID))
      .limit(1),
    db
      .select({ patientName: dicomPulledStudiesTable.patientName, accessionNumber: dicomPulledStudiesTable.accessionNumber })
      .from(dicomPulledStudiesTable)
      .where(eq(dicomPulledStudiesTable.studyInstanceUID, studyInstanceUID))
      .limit(1),
  ]);

  const patientName = worklist?.patientName ?? pulled?.patientName ?? null;
  const accessionNumber = worklist?.accessionNumber ?? pulled?.accessionNumber ?? null;

  void logPacsEvent("WEASIS_VIEWER_LAUNCH", "VIEWER_LAUNCHED", `Weasis viewer launched for study ${studyInstanceUID}`, {
    studyInstanceUID,
    accessionNumber,
  });

  res.json({
    studyInstanceUID,
    patientName,
    accessionNumber,
    viewerType: "WEASIS",
    weasisUrl,
    fallbackDicomWebUrl: viewerSettings["dicom_web_base_url"] || null,
    wadoBaseUrl: wadoUrl,
    pacsType,
  });
});

// ─── OHIF VIEWER LAUNCH ───────────────────────────────────────────────────────

router.get("/studies/:studyInstanceUID/ohif-launch", async (req, res) => {
  const { studyInstanceUID } = req.params;

  const [viewerSettings, orthancBase] = await Promise.all([
    getViewerSettings(),
    getSetting("orthanc_base_url", "orthanc"),
  ]);

  const ohifBase = viewerSettings["ohif_base_url"] ?? "";
  const dicomWebUrl = viewerSettings["dicom_web_base_url"] ?? "";
  const pacsType = orthancBase ? "ORTHANC" : "CONQUEST";

  if (!ohifBase) {
    res.json({
      studyInstanceUID,
      viewerType: "OHIF",
      error: "OHIF viewer URL not configured. Go to PACS Settings → Viewer Settings → OHIF Base URL.",
      ohifUrl: null,
      dicomWebBaseUrl: dicomWebUrl || null,
      pacsType,
    });
    return;
  }

  const ohifUrl = `${ohifBase.replace(/\/$/, "")}/viewer?StudyInstanceUIDs=${encodeURIComponent(studyInstanceUID)}`;

  const [[worklist], [pulled]] = await Promise.all([
    db
      .select({ patientName: radiologyWorklistTable.patientName, accessionNumber: radiologyWorklistTable.accessionNumber })
      .from(radiologyWorklistTable)
      .where(eq(radiologyWorklistTable.studyInstanceUID, studyInstanceUID))
      .limit(1),
    db
      .select({ patientName: dicomPulledStudiesTable.patientName, accessionNumber: dicomPulledStudiesTable.accessionNumber })
      .from(dicomPulledStudiesTable)
      .where(eq(dicomPulledStudiesTable.studyInstanceUID, studyInstanceUID))
      .limit(1),
  ]);

  const patientName = worklist?.patientName ?? pulled?.patientName ?? null;
  const accessionNumber = worklist?.accessionNumber ?? pulled?.accessionNumber ?? null;

  void logPacsEvent("OHIF_VIEWER_LAUNCH", "VIEWER_LAUNCHED", `OHIF viewer launched for study ${studyInstanceUID}`, {
    studyInstanceUID,
    accessionNumber,
  });

  res.json({
    studyInstanceUID,
    patientName,
    accessionNumber,
    viewerType: "OHIF",
    ohifUrl,
    dicomWebBaseUrl: dicomWebUrl || (orthancBase ? `${orthancBase}/dicom-web` : null),
    pacsType,
  });
});

// ─── MWL PROCEDURES (STAFF DASHBOARD) ────────────────────────────────────────

router.get("/mwl-procedures", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const status = req.query.status as string | undefined;
  const modality = req.query.modality as string | undefined;
  const date = req.query.date as string | undefined;
  const search = req.query.search as string | undefined;

  const conds = [];
  if (status) conds.push(eq(radiologyScheduledProceduresTable.status, status));
  if (modality) conds.push(eq(radiologyScheduledProceduresTable.modality, modality));
  if (date) {
    const compact = date.replace(/-/g, "");
    conds.push(eq(radiologyScheduledProceduresTable.scheduledDate, compact));
  }
  if (search) {
    conds.push(
      sql`(${radiologyScheduledProceduresTable.patientName} ILIKE ${`%${search}%`} OR ${radiologyScheduledProceduresTable.accessionNumber} ILIKE ${`%${search}%`})`,
    );
  }

  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(radiologyScheduledProceduresTable)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(radiologyScheduledProceduresTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ status: radiologyScheduledProceduresTable.status, count: sql<number>`count(*)::int` })
      .from(radiologyScheduledProceduresTable)
      .groupBy(radiologyScheduledProceduresTable.status),
  ]);

  const byStatus: Record<string, number> = {};
  for (const c of counts) byStatus[c.status] = c.count;

  res.json({ procedures: rows, byStatus });
});

router.patch("/mwl-procedures/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const allowed = ["status", "stationAeTitle", "scheduledDate", "scheduledTime", "studyDescription"];
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if ((req.body as Record<string, unknown>)[key] !== undefined)
      updates[key] = (req.body as Record<string, unknown>)[key];
  }

  const [row] = await db
    .update(radiologyScheduledProceduresTable)
    .set(updates)
    .where(eq(radiologyScheduledProceduresTable.id, id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (updates["status"] === "SENT_TO_MWL") {
    void logPacsEvent("MWL_SCHEDULED_PROCEDURE", "MWL_SENT", `Procedure ${row.accessionNumber} sent to MWL`, {
      accessionNumber: row.accessionNumber,
    });
  }

  res.json(row);
});

router.post("/mwl-procedures", async (req, res) => {
  const body = req.body as Record<string, string | undefined>;
  if (!body.accessionNumber) {
    res.status(400).json({ error: "accessionNumber required" });
    return;
  }

  const [row] = await db
    .insert(radiologyScheduledProceduresTable)
    .values({
      accessionNumber: body.accessionNumber,
      patientId: body.patientId ?? null,
      patientName: body.patientName ?? null,
      patientSex: body.patientSex ?? null,
      patientAge: body.patientAge ?? null,
      patientDob: body.patientDob ?? null,
      modality: body.modality ?? null,
      procedureName: body.procedureName ?? null,
      procedureCode: body.procedureCode ?? null,
      studyDescription: body.studyDescription ?? null,
      referringDoctor: body.referringDoctor ?? null,
      referringDoctorId: body.referringDoctorId ?? null,
      scheduledDate: body.scheduledDate ? body.scheduledDate.replace(/-/g, "") : null,
      scheduledTime: body.scheduledTime ?? null,
      stationAeTitle: body.stationAeTitle ?? null,
      bodyPartExamined: body.bodyPartExamined ?? null,
      sourceBillId: body.sourceBillId ?? null,
      sourceOrderId: body.sourceOrderId ?? null,
      sourceAppointmentId: body.sourceAppointmentId ?? null,
      status: "SCHEDULED",
    })
    .onConflictDoNothing()
    .returning();

  if (!row) {
    res.status(409).json({ error: "Duplicate accession number" });
    return;
  }

  void logPacsEvent("MWL_SCHEDULED_PROCEDURE", "MWL_CREATED", `New procedure scheduled: ${row.accessionNumber}`, {
    accessionNumber: row.accessionNumber,
  });

  res.json(row);
});

// ─── EXTENDED PACS DASHBOARD DATA ────────────────────────────────────────────
//
// GET /api/radiology/pacs-dashboard-ext
// Supplements the existing /pacs-dashboard with enterprise data:
// pulled-studies stats, failed-queue counts, routing-rules count,
// modality health summary, recent pulled studies.

router.get("/pacs-dashboard-ext", async (_req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    pulledToday,
    failedQueue,
    routingRulesCount,
    modalityHealth,
    recentPulled,
    mwlCounts,
  ] = await Promise.all([
    db
      .select({ status: dicomPulledStudiesTable.status, count: sql<number>`count(*)::int` })
      .from(dicomPulledStudiesTable)
      .where(gte(dicomPulledStudiesTable.createdAt, todayStart))
      .groupBy(dicomPulledStudiesTable.status),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(dicomFailedRetrievalQueueTable)
      .where(eq(dicomFailedRetrievalQueueTable.status, "PENDING")),
    db.select({ count: sql<number>`count(*)::int` }).from(dicomRoutingRulesTable).where(eq(dicomRoutingRulesTable.isEnabled, true)),
    db
      .select({
        id: dicomModalitiesTable.id,
        name: dicomModalitiesTable.machineName,
        aeTitle: dicomModalitiesTable.aeTitle,
        modalityType: dicomModalitiesTable.modality,
        lastConnectionStatus: dicomModalitiesTable.lastConnectionStatus,
        lastSeenAt: dicomModalitiesTable.lastSeenAt,
        ipAddress: dicomModalitiesTable.ipAddress,
        port: dicomModalitiesTable.port,
        isActive: dicomModalitiesTable.isActive,
      })
      .from(dicomModalitiesTable)
      .where(eq(dicomModalitiesTable.isActive, true))
      .orderBy(asc(dicomModalitiesTable.machineName)),
    db
      .select()
      .from(dicomPulledStudiesTable)
      .orderBy(desc(dicomPulledStudiesTable.createdAt))
      .limit(10),
    db
      .select({ status: radiologyScheduledProceduresTable.status, count: sql<number>`count(*)::int` })
      .from(radiologyScheduledProceduresTable)
      .groupBy(radiologyScheduledProceduresTable.status),
  ]);

  const pulledStats: Record<string, number> = {};
  for (const r of pulledToday) pulledStats[r.status] = r.count;

  const mwlStats: Record<string, number> = {};
  for (const r of mwlCounts) mwlStats[r.status] = r.count;

  const healthy = modalityHealth.filter((m) => m.lastConnectionStatus === "ok").length;

  res.json({
    pulledToday: pulledStats,
    pendingRetries: failedQueue[0]?.count ?? 0,
    activeRoutingRules: routingRulesCount[0]?.count ?? 0,
    modalityHealth,
    healthyModalities: healthy,
    totalActiveModalities: modalityHealth.length,
    recentPulled,
    mwlStats,
  });
});

export const pacsEnterpriseRouter = router;
