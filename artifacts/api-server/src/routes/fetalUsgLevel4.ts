import { Router } from "express";
import { db } from "@workspace/db";
import {
  fetalUsgStudiesTable, fetalUsgMeasurementsTable, fetalUsgChecklistsTable,
  fetalUsgReportsTable, fetalUsgAuditLogsTable, fetalUsgCriticalAlertsTable,
  fetalUsgTemplatePreferencesTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { StaffAuthRequest } from "../middleware/requireStaffAuth";

const router = Router();

function staffOf(req: StaffAuthRequest): { subjectId?: number; subjectName?: string; role?: string } {
  return req.staffSession ?? {};
}

function audit(
  req: StaffAuthRequest,
  params: {
    entityId: number;
    table: "fetalUsgStudies";
    action: string;
    details?: string;
  }
) {
  const s = staffOf(req);
  const table = fetalUsgAuditLogsTable;
  void db
    .insert(table)
    .values({
      studyId: params.entityId,
      action: params.action,
      performedBy: s.subjectName ?? s.subjectId?.toString() ?? "unknown",
      details: params.details ?? null,
    })
    .catch(() => {});
}

function calcGaFromLmp(lmp: string): { weeks: number; days: number } | null {
  const d = new Date(lmp);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const totalDays = Math.floor(diff / (1000 * 60 * 60 * 24));
  return { weeks: Math.floor(totalDays / 7), days: totalDays % 7 };
}

function calcGaFromCrl(crl: number): { weeks: number; days: number } | null {
  if (crl <= 0) return null;
  const weeks = 40.9 + 3.2 * Math.log(crl);
  const w = Math.floor(weeks);
  const d = Math.round((weeks - w) * 7);
  return { weeks: w, days: d };
}

function calcGaFromBpd(bpd: number): { weeks: number } | null {
  if (bpd <= 0) return null;
  const weeks = 9.54 + 1.482 * bpd + 0.0167 * bpd * bpd;
  return { weeks: Math.round(weeks) };
}

function calcGaFromFl(fl: number): { weeks: number } | null {
  if (fl <= 0) return null;
  const weeks = 8.1 + 2.53 * fl + 0.019 * fl * fl;
  return { weeks: Math.round(weeks) };
}

function calcGaFromAc(ac: number): { weeks: number } | null {
  if (ac <= 0) return null;
  const weeks = -7.31 + 0.49 * ac + 0.038 * ac * ac;
  return { weeks: Math.round(weeks) };
}

function calcCompositeGa(measurements: any): { weeks: number; days: number } | null {
  const vals: number[] = [];
  if (measurements.crl) { const g = calcGaFromCrl(Number(measurements.crl)); if (g) vals.push(g.weeks + g.days / 7); }
  if (measurements.bpd) { const g = calcGaFromBpd(Number(measurements.bpd)); if (g) vals.push(g.weeks); }
  if (measurements.fl) { const g = calcGaFromFl(Number(measurements.fl)); if (g) vals.push(g.weeks); }
  if (measurements.ac) { const g = calcGaFromAc(Number(measurements.ac)); if (g) vals.push(g.weeks); }
  if (vals.length === 0) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const w = Math.floor(avg);
  const d = Math.round((avg - w) * 7);
  return { weeks: w, days: d };
}

function calcEddFromLmp(lmp: string): string | null {
  const d = new Date(lmp);
  if (isNaN(d.getTime())) return null;
  const edd = new Date(d);
  edd.setDate(edd.getDate() + 280);
  return edd.toISOString().split("T")[0];
}

function calcEfw(bpd: number, hc: number, ac: number, fl: number): number | null {
  if (bpd <= 0 || hc <= 0 || ac <= 0 || fl <= 0) return null;
  const efw = Math.pow(10, 1.326 - 0.00326 * ac * fl + 0.0107 * hc + 0.0438 * ac + 0.158 * fl);
  return Math.round(efw * 100) / 100;
}

function calcAfiInterpretation(afi: number): string {
  if (afi < 5) return "oligohydramnios";
  if (afi > 24) return "polyhydramnios";
  return "normal";
}

function calcCervicalLengthInterpretation(cl: number): string {
  if (cl < 25) return "short_cervix";
  if (cl < 30) return "borderline";
  return "normal";
}

function detectCriticalAlerts(study: any, measurements: any): string[] {
  const alerts: string[] = [];
  if (measurements.fetalHeartRate && (measurements.fetalHeartRate < 110 || measurements.fetalHeartRate > 160)) {
    alerts.push(`Fetal heart rate ${measurements.fetalHeartRate} bpm outside normal range (110-160)`);
  }
  if (measurements.nt && Number(measurements.nt) > 3.0) {
    alerts.push(`NT ${measurements.nt} mm > 3.0 mm - increased aneuploidy risk`);
  }
  if (measurements.efw) {
    const efw = Number(measurements.efw);
    const ga = study.gaWeeks ?? study.compositeGa ?? 0;
    if (ga > 0) {
      if (efw < 500 && ga >= 24) alerts.push(`EFW ${efw} g very low for GA ${ga}w - possible IUGR/FGR`);
      if (efw > 4000 && ga >= 36) alerts.push(`EFW ${efw} g high for GA ${ga}w - possible macrosomia`);
    }
  }
  if (measurements.afi) {
    const afi = Number(measurements.afi);
    if (afi < 5) alerts.push(`AFI ${afi} cm - oligohydramnios`);
    if (afi > 24) alerts.push(`AFI ${afi} cm - polyhydramnios`);
  }
  if (measurements.cervicalLength) {
    const cl = Number(measurements.cervicalLength);
    if (cl < 25) alerts.push(`Cervical length ${cl} mm - short cervix (< 25 mm)`);
  }
  if (measurements.umbilicalArteryPi) {
    const pi = Number(measurements.umbilicalArteryPi);
    if (pi > 1.5) alerts.push(`UA PI ${pi} elevated`);
  }
  if (measurements.ductusVenoususAWave === "reversed" || measurements.ductusVenoususAWave === "absent") {
    alerts.push(`DV a-wave ${measurements.ductusVenoususAWave} - abnormal`);
  }
  if (measurements.discordancePercent && Number(measurements.discordancePercent) > 20) {
    alerts.push(`Twin discordance ${measurements.discordancePercent}% > 20%`);
  }
  if (measurements.bppTotal !== null && measurements.bppTotal !== undefined) {
    const bpp = Number(measurements.bppTotal);
    if (bpp < 6) alerts.push(`BPP ${bpp}/10 - abnormal`);
  }
  if (study.lmpGa && study.biometricGa) {
    const diff = Math.abs(study.lmpGa - study.biometricGa);
    if (diff > 2) alerts.push(`LMP GA (${study.lmpGa}w) and biometric GA (${study.biometricGa}w) differ by ${diff}w`);
  }
  return alerts;
}

function generateAiDraft(study: any, measurements: any, checklist: any, report: any): string {
  const parts: string[] = [];
  parts.push(`FETAL USG REPORT`);
  parts.push(`Type: ${study.studyType?.toUpperCase() ?? "UNKNOWN"} | Trimester: ${study.trimester ?? "?"}`);
  parts.push(`GA: ${study.gaWeeks ?? "?"}w ${study.gaDays ?? "?"}d | EDD: ${study.edd ?? "?"}`);
  parts.push(`---`);
  if (measurements.fetalHeartRate) parts.push(`FHR: ${measurements.fetalHeartRate} bpm`);
  if (measurements.crl) parts.push(`CRL: ${measurements.crl} mm`);
  if (measurements.nt) parts.push(`NT: ${measurements.nt} mm`);
  if (measurements.nasalBone) parts.push(`Nasal bone: ${measurements.nasalBone}`);
  if (measurements.bpd) parts.push(`BPD: ${measurements.bpd} mm`);
  if (measurements.hc) parts.push(`HC: ${measurements.hc} mm`);
  if (measurements.ac) parts.push(`AC: ${measurements.ac} mm`);
  if (measurements.fl) parts.push(`FL: ${measurements.fl} mm`);
  if (measurements.hl) parts.push(`HL: ${measurements.hl} mm`);
  if (measurements.efw) parts.push(`EFW: ${measurements.efw} g`);
  if (measurements.afi) parts.push(`AFI: ${measurements.afi} cm (${measurements.afiInterpretation})`);
  if (measurements.cervicalLength) parts.push(`Cervical length: ${measurements.cervicalLength} mm`);
  if (measurements.umbilicalArteryPi) parts.push(`UA PI: ${measurements.umbilicalArteryPi}`);
  if (measurements.mcaPi) parts.push(`MCA PI: ${measurements.mcaPi}`);
  if (measurements.cpr) parts.push(`CPR: ${measurements.cpr}`);
  if (measurements.placentaLocation) parts.push(`Placenta: ${measurements.placentaLocation}${measurements.placentaGrade ? ", grade " + measurements.placentaGrade : ""}`);
  if (measurements.presentation) parts.push(`Presentation: ${measurements.presentation}`);
  if (study.isTwin) {
    parts.push(`---`);
    parts.push(`Twin A: ${measurements.twinA_presentation ?? "?"}, FHR ${measurements.twinA_fhr ?? "?"}, EFW ${measurements.twinA_efw ?? "?"} g`);
    parts.push(`Twin B: ${measurements.twinB_presentation ?? "?"}, FHR ${measurements.twinB_fhr ?? "?"}, EFW ${measurements.twinB_efw ?? "?"} g`);
    if (measurements.discordancePercent) parts.push(`Discordance: ${measurements.discordancePercent}%`);
  }
  if (measurements.bppTotal !== null && measurements.bppTotal !== undefined) {
    parts.push(`BPP: ${measurements.bppTotal}/10`);
  }
  parts.push(`---`);
  if (checklist) {
    const assessed: string[] = [];
    const fields = ["skullBrain", "face", "spine", "thorax", "heartFourChamber", "outflowTracts", "abdomen", "stomachBubble", "kidneys", "urinaryBladder", "cordInsertion", "limbs", "placenta", "liquor", "cervix"];
    for (const f of fields) {
      if (checklist[f] === "normal") assessed.push(f.replace(/([A-Z])/g, " $1").toLowerCase());
      else if (checklist[f] === "abnormal") assessed.push(f.replace(/([A-Z])/g, " $1").toLowerCase() + " (abnormal)");
    }
    if (assessed.length > 0) parts.push(`Anomaly scan: ${assessed.join(", ")}`);
  }
  parts.push(`---`);
  parts.push(`IMPRESSION:`);
  parts.push(report?.impression ?? "No impression entered.");
  parts.push(`RECOMMENDATION:`);
  parts.push(report?.recommendation ?? "Routine follow-up.");
  return parts.join("\n");
}

// --- Worklist ---
router.get("/worklist", async (req: StaffAuthRequest, res) => {
  const rows = await db.select().from(fetalUsgStudiesTable).orderBy(desc(fetalUsgStudiesTable.createdAt));
  res.json({ worklist: rows });
});

// --- Create study ---
router.post("/study", async (req: StaffAuthRequest, res) => {
  const body = req.body as any;
  const [study] = await db.insert(fetalUsgStudiesTable).values({
    studyId: body.studyId,
    patientId: body.patientId,
    studyType: body.studyType ?? "unknown",
    trimester: body.trimester ?? "unknown",
    lmp: body.lmp,
    lmpGa: body.lmp ? calcGaFromLmp(body.lmp)?.weeks : undefined,
    edd: body.lmp ? calcEddFromLmp(body.lmp) : undefined,
    isTwin: body.isTwin ?? false,
    chorionicity: body.chorionicity,
    amnionicity: body.amnionicity,
    status: "received",
  }).returning();
  audit(req, { entityId: study.id, table: "fetalUsgStudies", action: "study_created" });
  res.json({ study });
});

// --- Get study ---
router.get("/:studyId", async (req: StaffAuthRequest, res) => {
  const studyId = Number(req.params.studyId);
  const [study] = await db.select().from(fetalUsgStudiesTable).where(eq(fetalUsgStudiesTable.id, studyId)).limit(1);
  if (!study) { res.status(404).json({ error: "Study not found" }); return; }
  const [measurements] = await db.select().from(fetalUsgMeasurementsTable).where(eq(fetalUsgMeasurementsTable.studyId, studyId)).limit(1);
  const [checklist] = await db.select().from(fetalUsgChecklistsTable).where(eq(fetalUsgChecklistsTable.studyId, studyId)).limit(1);
  const [report] = await db.select().from(fetalUsgReportsTable).where(eq(fetalUsgReportsTable.studyId, studyId)).limit(1);
  const alerts = await db.select().from(fetalUsgCriticalAlertsTable).where(eq(fetalUsgCriticalAlertsTable.studyId, studyId)).orderBy(desc(fetalUsgCriticalAlertsTable.createdAt));
  const auditLogs = await db.select().from(fetalUsgAuditLogsTable).where(eq(fetalUsgAuditLogsTable.studyId, studyId)).orderBy(desc(fetalUsgAuditLogsTable.createdAt)).limit(50);
  res.json({ study, measurements, checklist, report, alerts, auditLogs });
});

// --- Save measurements ---
router.post("/:studyId/measurements", async (req: StaffAuthRequest, res) => {
  const studyId = Number(req.params.studyId);
  const [study] = await db.select().from(fetalUsgStudiesTable).where(eq(fetalUsgStudiesTable.id, studyId)).limit(1);
  if (!study) { res.status(404).json({ error: "Study not found" }); return; }
  const body = req.body as any;
  const upsert = {
    studyId,
    crl: body.crl,
    msd: body.msd,
    yolkSac: body.yolkSac,
    fetalHeartRate: body.fetalHeartRate,
    nt: body.nt,
    nasalBone: body.nasalBone,
    ductusVenousus: body.ductusVenousus,
    tricuspidFlow: body.tricuspidFlow,
    bpd: body.bpd,
    hc: body.hc,
    ac: body.ac,
    fl: body.fl,
    hl: body.hl,
    efw: body.efw ?? (body.bpd && body.hc && body.ac && body.fl ? calcEfw(body.bpd, body.hc, body.ac, body.fl) : undefined),
    efwPercentile: body.efwPercentile,
    afi: body.afi,
    afiInterpretation: body.afi ? calcAfiInterpretation(Number(body.afi)) : undefined,
    sdp: body.sdp,
    placentaLocation: body.placentaLocation,
    placentaGrade: body.placentaGrade,
    presentation: body.presentation,
    cervicalLength: body.cervicalLength,
    cervicalLengthInterpretation: body.cervicalLength ? calcCervicalLengthInterpretation(Number(body.cervicalLength)) : undefined,
    umbilicalArteryPi: body.umbilicalArteryPi,
    umbilicalArteryRi: body.umbilicalArteryRi,
    umbilicalArterySd: body.umbilicalArterySd,
    mcaPi: body.mcaPi,
    mcaRi: body.mcaRi,
    cpr: body.cpr,
    ductusVenoususPi: body.ductusVenoususPi,
    ductusVenoususAWave: body.ductusVenoususAWave,
    uterineArteryPi: body.uterineArteryPi,
    uterineArteryRi: body.uterineArteryRi,
    extractedFrom: body.extractedFrom ?? "manual",
    confidenceScore: body.confidenceScore,
    twinA_fhr: body.twinA_fhr,
    twinA_bpd: body.twinA_bpd,
    twinA_hc: body.twinA_hc,
    twinA_ac: body.twinA_ac,
    twinA_fl: body.twinA_fl,
    twinA_efw: body.twinA_efw,
    twinA_presentation: body.twinA_presentation,
    twinB_fhr: body.twinB_fhr,
    twinB_bpd: body.twinB_bpd,
    twinB_hc: body.twinB_hc,
    twinB_ac: body.twinB_ac,
    twinB_fl: body.twinB_fl,
    twinB_efw: body.twinB_efw,
    twinB_presentation: body.twinB_presentation,
    discordancePercent: body.discordancePercent,
    bppFetalBreathing: body.bppFetalBreathing,
    bppFetalMovement: body.bppFetalMovement,
    bppFetalTone: body.bppFetalTone,
    bppAfi: body.bppAfi,
    bppTotal: body.bppTotal,
    nstDone: body.nstDone,
    nstResult: body.nstResult,
  };
  const [existing] = await db.select().from(fetalUsgMeasurementsTable).where(eq(fetalUsgMeasurementsTable.studyId, studyId)).limit(1);
  if (existing) {
    await db.update(fetalUsgMeasurementsTable).set(upsert).where(eq(fetalUsgMeasurementsTable.id, existing.id));
  } else {
    await db.insert(fetalUsgMeasurementsTable).values(upsert);
  }
  const composite = calcCompositeGa(upsert);
  const lmpGa = study.lmp ? calcGaFromLmp(study.lmp)?.weeks : undefined;
  await db.update(fetalUsgStudiesTable).set({
    gaWeeks: composite?.weeks ?? study.gaWeeks,
    gaDays: composite?.days ?? study.gaDays,
    compositeGa: composite ? composite.weeks : undefined,
    biometricGa: composite ? composite.weeks : undefined,
    lmpGa: lmpGa ?? study.lmpGa,
    edd: study.lmp ? calcEddFromLmp(study.lmp) : study.edd,
    updatedAt: new Date(),
  }).where(eq(fetalUsgStudiesTable.id, studyId));
  audit(req, { entityId: studyId, table: "fetalUsgStudies", action: "measurements_entered", details: JSON.stringify(Object.keys(upsert).filter((k) => (upsert as any)[k] !== undefined)) });
  const [updatedMeas] = await db.select().from(fetalUsgMeasurementsTable).where(eq(fetalUsgMeasurementsTable.studyId, studyId)).limit(1);
  const [updatedStudy] = await db.select().from(fetalUsgStudiesTable).where(eq(fetalUsgStudiesTable.id, studyId)).limit(1);
  const alerts = detectCriticalAlerts(updatedStudy, updatedMeas);
  await db.delete(fetalUsgCriticalAlertsTable).where(eq(fetalUsgCriticalAlertsTable.studyId, studyId));
  for (const a of alerts) {
    await db.insert(fetalUsgCriticalAlertsTable).values({ studyId, alertType: "auto", alertMessage: a });
  }
  res.json({ ok: true, alerts });
});

// --- Extract measurements (stub) ---
router.post("/:studyId/extract-measurements", async (req: StaffAuthRequest, res) => {
  res.json({ ok: true, message: "DICOM SR extraction not yet available." });
});

// --- Save checklist ---
router.post("/:studyId/checklist", async (req: StaffAuthRequest, res) => {
  const studyId = Number(req.params.studyId);
  const body = req.body as any;
  const [existing] = await db.select().from(fetalUsgChecklistsTable).where(eq(fetalUsgChecklistsTable.studyId, studyId)).limit(1);
  const upsert = {
    studyId,
    skullBrain: body.skullBrain,
    face: body.face,
    spine: body.spine,
    thorax: body.thorax,
    heartFourChamber: body.heartFourChamber,
    outflowTracts: body.outflowTracts,
    abdomen: body.abdomen,
    stomachBubble: body.stomachBubble,
    kidneys: body.kidneys,
    urinaryBladder: body.urinaryBladder,
    cordInsertion: body.cordInsertion,
    limbs: body.limbs,
    placenta: body.placenta,
    liquor: body.liquor,
    cervix: body.cervix,
    notes: body.notes,
  };
  if (existing) {
    await db.update(fetalUsgChecklistsTable).set(upsert).where(eq(fetalUsgChecklistsTable.id, existing.id));
  } else {
    await db.insert(fetalUsgChecklistsTable).values(upsert);
  }
  audit(req, { entityId: studyId, table: "fetalUsgStudies", action: "checklist_updated" });
  res.json({ ok: true });
});

// --- Save draft report ---
router.post("/:studyId/save-draft", async (req: StaffAuthRequest, res) => {
  const studyId = Number(req.params.studyId);
  const body = req.body as any;
  const [existing] = await db.select().from(fetalUsgReportsTable).where(eq(fetalUsgReportsTable.studyId, studyId)).limit(1);
  const upsert = {
    studyId,
    findings: body.findings,
    impression: body.impression,
    recommendation: body.recommendation,
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(fetalUsgReportsTable).set(upsert).where(eq(fetalUsgReportsTable.id, existing.id));
  } else {
    await db.insert(fetalUsgReportsTable).values(upsert);
  }
  audit(req, { entityId: studyId, table: "fetalUsgStudies", action: "draft_saved" });
  res.json({ ok: true });
});

// --- Generate AI draft ---
router.post("/:studyId/generate-draft", async (req: StaffAuthRequest, res) => {
  const studyId = Number(req.params.studyId);
  const [study] = await db.select().from(fetalUsgStudiesTable).where(eq(fetalUsgStudiesTable.id, studyId)).limit(1);
  const [measurements] = await db.select().from(fetalUsgMeasurementsTable).where(eq(fetalUsgMeasurementsTable.studyId, studyId)).limit(1);
  const [checklist] = await db.select().from(fetalUsgChecklistsTable).where(eq(fetalUsgChecklistsTable.studyId, studyId)).limit(1);
  const [report] = await db.select().from(fetalUsgReportsTable).where(eq(fetalUsgReportsTable.studyId, studyId)).limit(1);
  const draft = generateAiDraft(study, measurements, checklist, report);
  const [existing] = await db.select().from(fetalUsgReportsTable).where(eq(fetalUsgReportsTable.studyId, studyId)).limit(1);
  if (existing) {
    await db.update(fetalUsgReportsTable).set({ aiDraft: draft, updatedAt: new Date() }).where(eq(fetalUsgReportsTable.id, existing.id));
  } else {
    await db.insert(fetalUsgReportsTable).values({ studyId, aiDraft: draft, status: "draft" });
  }
  audit(req, { entityId: studyId, table: "fetalUsgStudies", action: "ai_draft_generated", details: `Type: ${study.studyType}` });
  res.json({ aiDraft: draft });
});

// --- Review report ---
router.post("/:studyId/review", async (req: StaffAuthRequest, res) => {
  const studyId = Number(req.params.studyId);
  const s = staffOf(req);
  await db.update(fetalUsgReportsTable).set({ status: "reviewed", reviewedBy: s.subjectId, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(fetalUsgReportsTable.studyId, studyId));
  await db.update(fetalUsgStudiesTable).set({ status: "reviewed", updatedAt: new Date() }).where(eq(fetalUsgStudiesTable.id, studyId));
  audit(req, { entityId: studyId, table: "fetalUsgStudies", action: "reviewed", details: `Reviewer: ${s.subjectName ?? ""}` });
  res.json({ ok: true });
});

// --- Finalize report ---
router.post("/:studyId/final-sign", async (req: StaffAuthRequest, res) => {
  const studyId = Number(req.params.studyId);
  const [report] = await db.select().from(fetalUsgReportsTable).where(eq(fetalUsgReportsTable.studyId, studyId)).limit(1);
  if (!report) { res.status(400).json({ error: "No report found" }); return; }
  if (report.status !== "reviewed") { res.status(400).json({ error: "Report must be reviewed before finalization" }); return; }
  const criticalAlerts = await db.select().from(fetalUsgCriticalAlertsTable).where(and(eq(fetalUsgCriticalAlertsTable.studyId, studyId), eq(fetalUsgCriticalAlertsTable.acknowledged, false)));
  if (criticalAlerts.length > 0 && !report.criticalAlertsAcknowledged) {
    res.status(400).json({ error: `Critical alerts not acknowledged: ${criticalAlerts.map((a) => a.alertMessage).join(", ")}` });
    return;
  }
  const s = staffOf(req);
  await db.update(fetalUsgReportsTable).set({ status: "final", finalizedBy: s.subjectId, finalizedAt: new Date(), updatedAt: new Date() }).where(eq(fetalUsgReportsTable.studyId, studyId));
  await db.update(fetalUsgStudiesTable).set({ status: "final", updatedAt: new Date() }).where(eq(fetalUsgStudiesTable.id, studyId));
  audit(req, { entityId: studyId, table: "fetalUsgStudies", action: "finalized", details: `Finalized by: ${s.subjectName ?? ""}` });
  res.json({ ok: true });
});

// --- Acknowledge critical alerts ---
router.post("/:studyId/acknowledge-critical", async (req: StaffAuthRequest, res) => {
  const studyId = Number(req.params.studyId);
  const s = staffOf(req);
  await db.update(fetalUsgCriticalAlertsTable)
    .set({ acknowledged: true, acknowledgedBy: s.subjectName ?? s.subjectId?.toString(), acknowledgedAt: new Date() })
    .where(eq(fetalUsgCriticalAlertsTable.studyId, studyId));
  await db.update(fetalUsgReportsTable).set({ criticalAlertsAcknowledged: true, updatedAt: new Date() }).where(eq(fetalUsgReportsTable.studyId, studyId));
  audit(req, { entityId: studyId, table: "fetalUsgStudies", action: "critical_alerts_acknowledged" });
  res.json({ ok: true });
});

// --- Critical alerts ---
router.get("/:studyId/critical-alerts", async (req: StaffAuthRequest, res) => {
  const studyId = Number(req.params.studyId);
  const alerts = await db.select().from(fetalUsgCriticalAlertsTable).where(eq(fetalUsgCriticalAlertsTable.studyId, studyId)).orderBy(desc(fetalUsgCriticalAlertsTable.createdAt));
  res.json({ alerts: alerts.map((a) => a.alertMessage), hasCritical: alerts.length > 0 });
});

// --- PDF stub ---
router.get("/:studyId/pdf", async (req: StaffAuthRequest, res) => {
  const studyId = Number(req.params.studyId);
  const [study] = await db.select().from(fetalUsgStudiesTable).where(eq(fetalUsgStudiesTable.id, studyId)).limit(1);
  const [measurements] = await db.select().from(fetalUsgMeasurementsTable).where(eq(fetalUsgMeasurementsTable.studyId, studyId)).limit(1);
  const [report] = await db.select().from(fetalUsgReportsTable).where(eq(fetalUsgReportsTable.studyId, studyId)).limit(1);
  const [checklist] = await db.select().from(fetalUsgChecklistsTable).where(eq(fetalUsgChecklistsTable.studyId, studyId)).limit(1);
  res.json({
    patientId: study.patientId,
    studyType: study.studyType,
    ga: `${study.gaWeeks ?? "?"}w ${study.gaDays ?? "?"}d`,
    edd: study.edd,
    measurements: measurements ?? null,
    findings: report?.findings ?? "",
    impression: report?.impression ?? "",
    recommendation: report?.recommendation ?? "",
    status: report?.status ?? "draft",
    disclaimer: "This report is based on sonographic findings at the time of examination and should be correlated clinically.",
  });
});

// --- Send stub ---
router.post("/:studyId/send", async (req: StaffAuthRequest, res) => {
  const studyId = Number(req.params.studyId);
  const [report] = await db.select().from(fetalUsgReportsTable).where(eq(fetalUsgReportsTable.studyId, studyId)).limit(1);
  if (!report || report.status !== "final") { res.status(400).json({ error: "Report must be finalized before sending" }); return; }
  audit(req, { entityId: studyId, table: "fetalUsgStudies", action: "report_sent", details: `Method: ${req.body?.method ?? "unknown"}` });
  res.json({ ok: true, message: "Report sent (integration pending)" });
});

// --- Templates ---
router.get("/templates", async (req: StaffAuthRequest, res) => {
  const studyType = req.query.studyType as string;
  const rows = studyType
    ? await db.select().from(fetalUsgTemplatePreferencesTable).where(eq(fetalUsgTemplatePreferencesTable.studyType, studyType))
    : await db.select().from(fetalUsgTemplatePreferencesTable);
  res.json({ templates: rows });
});

router.post("/templates/preference", async (req: StaffAuthRequest, res) => {
  const body = req.body as any;
  const [tpl] = await db.insert(fetalUsgTemplatePreferencesTable).values({
    doctorId: body.doctorId,
    studyType: body.studyType,
    templateJson: body.templateJson,
    isDefault: body.isDefault ?? false,
  }).returning();
  res.json({ template: tpl });
});

// --- Dashboard ---
router.get("/dashboard", async (req: StaffAuthRequest, res) => {
  const pending = await db.select({ count: sql<number>`count(*)` }).from(fetalUsgStudiesTable).where(eq(fetalUsgStudiesTable.status, "received"));
  const draft = await db.select({ count: sql<number>`count(*)` }).from(fetalUsgStudiesTable).where(eq(fetalUsgStudiesTable.status, "draft"));
  const reviewed = await db.select({ count: sql<number>`count(*)` }).from(fetalUsgStudiesTable).where(eq(fetalUsgStudiesTable.status, "reviewed"));
  const final = await db.select({ count: sql<number>`count(*)` }).from(fetalUsgStudiesTable).where(eq(fetalUsgStudiesTable.status, "final"));
  const critical = await db.select({ count: sql<number>`count(*)` }).from(fetalUsgCriticalAlertsTable).where(eq(fetalUsgCriticalAlertsTable.acknowledged, false));
  res.json({
    pending: pending[0]?.count ?? 0,
    draft: draft[0]?.count ?? 0,
    reviewed: reviewed[0]?.count ?? 0,
    final: final[0]?.count ?? 0,
    criticalUnacknowledged: critical[0]?.count ?? 0,
  });
});

// --- Duplicate detection ---
router.get("/duplicate/:patientId", async (req: StaffAuthRequest, res) => {
  const patientId = Number(req.params.patientId);
  const today = new Date().toISOString().split("T")[0];
  const rows = await db.select().from(fetalUsgStudiesTable)
    .where(and(eq(fetalUsgStudiesTable.patientId, patientId), sql`DATE(${fetalUsgStudiesTable.createdAt}) = ${today}`));
  res.json({ hasDuplicate: rows.length > 1, studies: rows });
});

export default router;
