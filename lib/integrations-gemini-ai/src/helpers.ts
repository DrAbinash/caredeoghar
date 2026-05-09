const GEMINI_MODEL = "gemini-2.5-flash";

export interface GeminiGenerateOptions {
  baseUrl?: string;
  apiKey?: string;
  maxTokens?: number;
}

/**
 * Send a single text prompt to the Gemini generateContent endpoint and return
 * the trimmed text of the first candidate's first part.  Returns an empty
 * string when the model produces no output.
 *
 * Throws if the HTTP response is not ok.
 */
export async function geminiGenerate(
  prompt: string,
  options: GeminiGenerateOptions = {}
): Promise<string> {
  const baseUrl =
    options.baseUrl ??
    process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ??
    "https://generativelanguage.googleapis.com";
  const apiKey = options.apiKey ?? process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? "";
  const maxTokens = options.maxTokens ?? 512;

  const url = `${baseUrl}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
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

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

export interface ClinicalNotePatient {
  firstName: string;
  lastName: string;
  patientId: string;
  gender: string;
  dateOfBirth: string;
  bloodGroup?: string | null;
}

/**
 * Build the prompt sent to Gemini for clinical note generation.
 * Separated from the route handler so it can be unit-tested independently.
 */
export function buildClinicalNotePrompt(
  patient: ClinicalNotePatient,
  testHistory: string
): string {
  return `You are a clinical documentation assistant for a diagnostic center.

Patient: ${patient.firstName} ${patient.lastName}
ID: ${patient.patientId}
Gender: ${patient.gender}
Date of Birth: ${patient.dateOfBirth}
Blood Group: ${patient.bloodGroup ?? "Not specified"}

Recent Diagnostic Tests:
${testHistory || "No tests recorded yet"}

Please generate a concise professional clinical summary note (3-4 sentences) suitable for a referring physician. Include patient demographics, recent test profile, and any notable patterns. Use formal medical language.`;
}

export interface BillingInsightsMetrics {
  fromLabel: string;
  toLabel: string;
  totalBills: number;
  totalRevenue: number;
  paidCount: number;
  pendingCount: number;
  partialCount: number;
  totalDiscount: number;
  collectionRate: string;
  avgBill: string;
}

/**
 * Build the prompt sent to Gemini for billing insights analysis.
 * Separated from the route handler so it can be unit-tested independently.
 */
export function buildBillingInsightsPrompt(
  metrics: BillingInsightsMetrics
): string {
  return `You are a healthcare financial analyst. Analyze this diagnostic center billing data and provide 3-5 actionable business insights.

Period: ${metrics.fromLabel} to ${metrics.toLabel}

Key Metrics:
- Total Bills: ${metrics.totalBills}
- Total Revenue Collected: ₹${metrics.totalRevenue.toLocaleString("en-IN")}
- Paid Bills: ${metrics.paidCount} (${metrics.collectionRate}% collection rate)
- Pending Bills: ${metrics.pendingCount}
- Partial Payments: ${metrics.partialCount}
- Total Discounts Given: ₹${metrics.totalDiscount.toLocaleString("en-IN")}
- Average Bill Amount: ₹${metrics.avgBill}

Provide insights as a numbered list. Be specific, practical, and mention specific numbers where relevant. Focus on collection efficiency, revenue optimization, and discount management. Keep each insight to 1-2 sentences.`;
}

// ---------------------------------------------------------------------------
// Patient message prompt builder
// ---------------------------------------------------------------------------

export type PatientMessageType = "followup" | "results" | "payment";

export interface PatientMessagePatient {
  firstName: string;
  lastName: string;
}

const PATIENT_MESSAGE_PURPOSES: Record<PatientMessageType, string> = {
  followup: "a follow-up reminder to come in for their scheduled tests",
  results: "a notification that their test results are ready for collection",
  payment: "a gentle payment reminder for outstanding dues",
};

/**
 * Build the prompt sent to Gemini for drafting a patient SMS/WhatsApp message.
 * Separated from the route handler so it can be unit-tested independently.
 */
export function buildPatientMessagePrompt(
  patient: PatientMessagePatient,
  messageType: PatientMessageType
): string {
  const purpose = PATIENT_MESSAGE_PURPOSES[messageType] ?? PATIENT_MESSAGE_PURPOSES.followup;
  return `Draft a short, professional and warm SMS/WhatsApp message (max 60 words) for a diagnostic center to send a patient.

Patient Name: ${patient.firstName} ${patient.lastName}
Center Name: DiagnoCenter

Message purpose: ${purpose}

Keep it brief, friendly, and professional. Include the center name. Do not include any placeholder brackets.`;
}

// ---------------------------------------------------------------------------
// High-level generators — combine prompt building + Gemini call
// ---------------------------------------------------------------------------

/**
 * Generate a professional clinical summary note for a patient.
 * Builds the prompt from patient demographics + test history, then calls
 * Gemini and returns the model's response text.
 */
export async function generateClinicalNote(
  patient: ClinicalNotePatient,
  testHistory: string,
  options?: GeminiGenerateOptions
): Promise<string> {
  const prompt = buildClinicalNotePrompt(patient, testHistory);
  return geminiGenerate(prompt, options);
}

/**
 * Generate billing insights for a given period.
 * Builds the prompt from pre-computed metrics, then calls Gemini and returns
 * the model's numbered insights list.
 */
export async function generateBillingInsights(
  metrics: BillingInsightsMetrics,
  options?: GeminiGenerateOptions
): Promise<string> {
  const prompt = buildBillingInsightsPrompt(metrics);
  return geminiGenerate(prompt, options);
}

/**
 * Draft a short patient SMS/WhatsApp message via Gemini.
 * Caps output at 200 tokens to match the route's usage and keep messages brief.
 */
export async function generatePatientMessage(
  patient: PatientMessagePatient,
  messageType: PatientMessageType,
  options?: GeminiGenerateOptions
): Promise<string> {
  const prompt = buildPatientMessagePrompt(patient, messageType);
  return geminiGenerate(prompt, { maxTokens: 200, ...options });
}
