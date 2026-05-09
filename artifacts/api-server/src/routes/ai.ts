import { Router } from "express";
import { db } from "@workspace/db";
import { patientsTable, ordersTable } from "@workspace/db";
import { orderTestsTable, testsTable, billsTable, paymentsTable } from "@workspace/db";
import { eq, desc, gte, lte, and } from "drizzle-orm";
import { requireStaffAuth, requireStaffPermission } from "../middleware/requireStaffAuth";
import {
  geminiGenerate,
  geminiTranscribe,
  buildClinicalNotePrompt,
  buildBillingInsightsPrompt,
  buildPatientMessagePrompt,
  buildRadiologyFindingsPrompt,
  buildRadiologyImpressionPrompt,
  type PatientMessageType,
} from "@workspace/integrations-gemini-ai";

const router = Router();

// Defense-in-depth: enforce staff authentication at the router level.
// These endpoints load patient PHI and billing data and send it to an external
// AI provider — they must never be reachable without a valid staff session.
// Individual routes below add requireStaffPermission matching the data domain
// each endpoint accesses, so that low-privilege staff cannot use AI to
// exfiltrate data from modules they have not been granted.
router.use(requireStaffAuth);

// Generate AI clinical notes for a patient — requires /patients permission
// (loads patient demographics, orders, and test history from the patients module)
router.post("/clinical-note", requireStaffPermission("/patients"), async (req, res) => {
  const { patientId } = req.body;
  if (!patientId) { res.status(400).json({ error: "patientId required" }); return; }

  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, patientId));
  if (!patient) { res.status(404).json({ error: "Patient not found" }); return; }

  const orders = await db
    .select({ order: ordersTable, testName: testsTable.name, testCode: testsTable.code, category: testsTable.category })
    .from(ordersTable)
    .leftJoin(orderTestsTable, eq(orderTestsTable.orderId, ordersTable.id))
    .leftJoin(testsTable, eq(testsTable.id, orderTestsTable.testId))
    .where(eq(ordersTable.patientId, patientId))
    .orderBy(desc(ordersTable.createdAt))
    .limit(20);

  const testHistory = orders
    .filter(o => o.testName)
    .map(o => `${o.testCode} (${o.testName}) — ${o.category} — Status: ${o.order.status}`)
    .join("\n");

  const prompt = buildClinicalNotePrompt(
    {
      firstName: patient.firstName,
      lastName: patient.lastName,
      patientId: patient.patientId,
      gender: patient.gender ?? "",
      dateOfBirth: patient.dateOfBirth ?? "",
      bloodGroup: (patient as Record<string, unknown>).bloodGroup as string | null | undefined,
    },
    testHistory,
  );

  try {
    const note = await geminiGenerate(prompt);
    res.json({ note });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// Generate billing insights — requires /reports permission
// (reads bills and payments tables and sends financial data to Gemini)
router.post("/billing-insights", requireStaffPermission("/reports"), async (req, res) => {
  const { from, to } = req.body as { from?: string; to?: string };

  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
  const toDate = to ? new Date(to) : new Date();

  const [bills, payments] = await Promise.all([
    db.select().from(billsTable).where(and(gte(billsTable.createdAt, fromDate), lte(billsTable.createdAt, toDate))),
    db.select().from(paymentsTable).where(and(gte(paymentsTable.createdAt, fromDate), lte(paymentsTable.createdAt, toDate))),
  ]);

  const totalRevenue = payments.reduce((s, p) => s + Number(p.amount), 0);
  const paidCount = bills.filter(b => b.status === "paid").length;
  const pendingCount = bills.filter(b => b.status === "pending").length;
  const partialCount = bills.filter(b => b.status === "partial").length;
  const totalDiscount = bills.reduce((s, b) => s + Number(b.discount), 0);
  const collectionRate = bills.length > 0 ? ((paidCount / bills.length) * 100).toFixed(1) : "0";
  const avgBill = bills.length > 0 ? (bills.reduce((s, b) => s + Number(b.totalAmount), 0) / bills.length).toFixed(0) : "0";

  const prompt = buildBillingInsightsPrompt({
    fromLabel: fromDate.toLocaleDateString("en-IN"),
    toLabel: toDate.toLocaleDateString("en-IN"),
    totalBills: bills.length,
    totalRevenue,
    paidCount,
    pendingCount,
    partialCount,
    totalDiscount,
    collectionRate,
    avgBill,
  });

  try {
    const insights = await geminiGenerate(prompt);
    res.json({ insights });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// Draft patient follow-up message — requires /patients permission
// (loads patient identity information from the patients module)
router.post("/patient-message", requireStaffPermission("/patients"), async (req, res) => {
  const { patientId, type } = req.body as { patientId: number; type: "followup" | "results" | "payment" };
  if (!patientId) { res.status(400).json({ error: "patientId required" }); return; }

  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, patientId));
  if (!patient) { res.status(404).json({ error: "Patient not found" }); return; }

  const prompt = buildPatientMessagePrompt(
    { firstName: patient.firstName, lastName: patient.lastName },
    (type as PatientMessageType) ?? "followup"
  );

  try {
    const message = await geminiGenerate(prompt, { maxTokens: 200 });
    res.json({ message });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ── Radiology AI assistants ─────────────────────────────────────────────────
// All radiology AI endpoints require /orders permission — they are part of the
// radiology reporting workflow which is gated behind /orders on the server.

// Generate structured findings for a radiology study.
// Body: { modality: string, testName?: string, clinicalHistory?: string, dictation?: string }
// Returns: { findings: string }
router.post("/radiology-findings", requireStaffPermission("/orders"), async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const modality = String(b.modality ?? "").trim();
  const testName = String(b.testName ?? "").trim();
  const clinicalHistory = String(b.clinicalHistory ?? "").trim();
  const dictation = String(b.dictation ?? "").trim();
  if (!modality && !testName) {
    res.status(400).json({ error: "modality or testName required" }); return;
  }
  const prompt = buildRadiologyFindingsPrompt({ modality, testName, clinicalHistory, dictation });

  try {
    const findings = await geminiGenerate(prompt, { maxTokens: 8192 });
    res.json({ findings });
  } catch (err: unknown) {
    req.log?.error({ err }, "ai radiology-findings failed");
    res.status(502).json({ error: "AI service unavailable. Please try again or write the findings manually." });
  }
});

// Generate a 1–4 line impression bullet list from a findings narrative.
// Body: { findings: string, modality?: string, testName?: string }
router.post("/radiology-impression", requireStaffPermission("/orders"), async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const findings = String(b.findings ?? "").trim();
  const modality = String(b.modality ?? "").trim();
  const testName = String(b.testName ?? "").trim();
  if (!findings) { res.status(400).json({ error: "findings required" }); return; }
  const prompt = buildRadiologyImpressionPrompt({ findings, modality, testName });
  try {
    const impression = await geminiGenerate(prompt, { maxTokens: 1024 });
    res.json({ impression });
  } catch (err: unknown) {
    req.log?.error({ err }, "ai radiology-impression failed");
    res.status(502).json({ error: "AI service unavailable. Please try again or write the impression manually." });
  }
});

// Transcribe a short voice dictation. Body: { audioBase64, mimeType }
// Browsers' built-in Web Speech API does the live transcription on the client;
// this endpoint is the server-side fallback for browsers that lack it (Firefox,
// Safari on some devices) or when the radiologist uploads a recorded clip.
router.post("/transcribe", requireStaffPermission("/orders"), async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const audioBase64 = typeof b.audioBase64 === "string" ? b.audioBase64 : "";
  const mimeType = typeof b.mimeType === "string" && b.mimeType ? b.mimeType : "audio/webm";
  if (!audioBase64) { res.status(400).json({ error: "audioBase64 required" }); return; }
  // Reject anything > ~7.5 MB after base64 expansion to stay under Gemini's 8 MB inline cap.
  const approxBytes = Math.floor((audioBase64.length * 3) / 4);
  if (approxBytes > 7_500_000) {
    res.status(413).json({ error: "Audio chunk too large (max ~7.5 MB). Split into shorter clips." });
    return;
  }
  try {
    const text = await geminiTranscribe(audioBase64, mimeType);
    res.json({ text });
  } catch (err: unknown) {
    req.log?.error({ err }, "ai transcribe failed");
    res.status(502).json({ error: "Voice transcription is temporarily unavailable. Please try again." });
  }
});

export default router;
