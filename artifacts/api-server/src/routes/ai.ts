import { Router } from "express";
import { db } from "@workspace/db";
import { patientsTable, ordersTable } from "@workspace/db";
import { orderTestsTable, testsTable, billsTable, paymentsTable } from "@workspace/db";
import { eq, desc, gte, lte, and } from "drizzle-orm";

const router = Router();

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

export default router;
