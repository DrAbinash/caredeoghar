import { Router } from "express";
import { db } from "@workspace/db";
import { patientsTable, ordersTable } from "@workspace/db";
import { orderTestsTable, testsTable, billsTable, paymentsTable } from "@workspace/db";
import { eq, desc, gte, lte, and } from "drizzle-orm";
import { requireStaffAuth } from "../middleware/requireStaffAuth";

const router = Router();

// Defense-in-depth: enforce staff authentication at the router level.
// These endpoints load patient PHI and billing data and send it to an external
// AI provider — they must never be reachable without a valid staff session.
router.use(requireStaffAuth);

const BASE_URL = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com";
const API_KEY = process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? "";
const MODEL = "gemini-2.5-flash";

async function geminiGenerate(prompt: string, maxTokens = 512): Promise<string> {
  const url = `${BASE_URL}/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${err}`);
  }
  const data = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

// Multimodal generate: sends an inline audio part for transcription. The Gemini
// AI-integrations proxy supports inline data up to ~8 MB — callers must chunk
// long recordings before invoking this. Returns transcribed plain text.
async function geminiTranscribe(audioBase64: string, mimeType: string): Promise<string> {
  const url = `${BASE_URL}/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const prompt = "Transcribe the radiologist's dictation verbatim. Return only the spoken text — no headings, no commentary, no timestamps. Preserve medical terminology exactly as spoken.";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: audioBase64 } },
        ],
      }],
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini transcription error: ${res.status} ${err}`);
  }
  const data = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

// Modality → human-readable expansion used in radiology prompts.
const MODALITY_NAMES: Record<string, string> = {
  MR: "MRI",
  CT: "CT",
  CR: "X-Ray",
  US: "Ultrasound",
  MG: "Mammography",
  BMD: "DEXA bone density",
  OT: "Imaging study",
};

// Generate AI clinical notes for a patient
router.post("/clinical-note", async (req, res) => {
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

  const prompt = `You are a clinical documentation assistant for a diagnostic center.

Patient: ${patient.firstName} ${patient.lastName}
ID: ${patient.patientId}
Gender: ${patient.gender}
Date of Birth: ${patient.dateOfBirth}
Blood Group: ${(patient as Record<string, unknown>).bloodGroup ?? "Not specified"}

Recent Diagnostic Tests:
${testHistory || "No tests recorded yet"}

Please generate a concise professional clinical summary note (3-4 sentences) suitable for a referring physician. Include patient demographics, recent test profile, and any notable patterns. Use formal medical language.`;

  try {
    const note = await geminiGenerate(prompt);
    res.json({ note });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// Generate billing insights
router.post("/billing-insights", async (req, res) => {
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

  const prompt = `You are a healthcare financial analyst. Analyze this diagnostic center billing data and provide 3-5 actionable business insights.

Period: ${fromDate.toLocaleDateString("en-IN")} to ${toDate.toLocaleDateString("en-IN")}

Key Metrics:
- Total Bills: ${bills.length}
- Total Revenue Collected: ₹${totalRevenue.toLocaleString("en-IN")}
- Paid Bills: ${paidCount} (${collectionRate}% collection rate)
- Pending Bills: ${pendingCount}
- Partial Payments: ${partialCount}
- Total Discounts Given: ₹${totalDiscount.toLocaleString("en-IN")}
- Average Bill Amount: ₹${avgBill}

Provide insights as a numbered list. Be specific, practical, and mention specific numbers where relevant. Focus on collection efficiency, revenue optimization, and discount management. Keep each insight to 1-2 sentences.`;

  try {
    const insights = await geminiGenerate(prompt);
    res.json({ insights });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// Draft patient follow-up message
router.post("/patient-message", async (req, res) => {
  const { patientId, type } = req.body as { patientId: number; type: "followup" | "results" | "payment" };
  if (!patientId) { res.status(400).json({ error: "patientId required" }); return; }

  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, patientId));
  if (!patient) { res.status(404).json({ error: "Patient not found" }); return; }

  const typeMessages: Record<string, string> = {
    followup: "a follow-up reminder to come in for their scheduled tests",
    results: "a notification that their test results are ready for collection",
    payment: "a gentle payment reminder for outstanding dues",
  };
  const msgType = typeMessages[type] ?? typeMessages.followup;

  const prompt = `Draft a short, professional and warm SMS/WhatsApp message (max 60 words) for a diagnostic center to send a patient.

Patient Name: ${patient.firstName} ${patient.lastName}
Center Name: DiagnoCenter

Message purpose: ${msgType}

Keep it brief, friendly, and professional. Include the center name. Do not include any placeholder brackets.`;

  try {
    const message = await geminiGenerate(prompt, 200);
    res.json({ message });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ── Radiology AI assistants ─────────────────────────────────────────────────
// Generate structured findings for a radiology study.
// Body: { modality: string, testName?: string, clinicalHistory?: string, dictation?: string }
// Returns: { findings: string }
router.post("/radiology-findings", async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const modality = String(b.modality ?? "").trim();
  const testName = String(b.testName ?? "").trim();
  const clinicalHistory = String(b.clinicalHistory ?? "").trim();
  const dictation = String(b.dictation ?? "").trim();
  if (!modality && !testName) {
    res.status(400).json({ error: "modality or testName required" }); return;
  }
  const modalityName = MODALITY_NAMES[modality] ?? modality ?? "Imaging";
  const prompt = `You are a senior radiologist drafting the FINDINGS section of a ${modalityName} report.

Study: ${testName || modalityName}
Clinical history: ${clinicalHistory || "(none provided)"}
Radiologist dictation / observations: ${dictation || "(none provided — produce a clean structured template the radiologist can fill in)"}

Write a professional FINDINGS section organised by anatomical region in short clear paragraphs.
- Use formal medical language and standard radiology phrasing.
- Quantify measurements where the dictation gives numbers (mm, cm).
- Use "No abnormality" or "Within normal limits" where the dictation is silent or explicitly normal — do NOT invent pathology.
- Do NOT include the IMPRESSION section. Do NOT include patient demographics. Do NOT include any disclaimer.
- Output only the findings narrative, ready to paste into the report.`;

  try {
    const findings = await geminiGenerate(prompt, 8192);
    res.json({ findings });
  } catch (err: unknown) {
    req.log?.error({ err }, "ai radiology-findings failed");
    res.status(502).json({ error: "AI service unavailable. Please try again or write the findings manually." });
  }
});

// Generate a 1–4 line impression bullet list from a findings narrative.
// Body: { findings: string, modality?: string, testName?: string }
router.post("/radiology-impression", async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const findings = String(b.findings ?? "").trim();
  const modality = String(b.modality ?? "").trim();
  const testName = String(b.testName ?? "").trim();
  if (!findings) { res.status(400).json({ error: "findings required" }); return; }
  const modalityName = MODALITY_NAMES[modality] ?? modality ?? "imaging study";
  const prompt = `You are a senior radiologist. Read the FINDINGS below from a ${modalityName} ${testName ? `(${testName}) ` : ""}and write a concise IMPRESSION.

FINDINGS:
${findings}

Rules:
- 1 to 4 numbered bullet points.
- Each bullet ≤ 25 words, plain medical language.
- Order by clinical significance (most important first).
- Suggest follow-up imaging or clinical correlation only if findings warrant it.
- Output only the numbered impression list. No heading, no preamble, no disclaimer.`;
  try {
    const impression = await geminiGenerate(prompt, 1024);
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
router.post("/transcribe", async (req, res) => {
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
