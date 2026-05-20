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
// Radiology helpers
// ---------------------------------------------------------------------------

/** Modality code → human-readable name used in radiology prompts. */
export const MODALITY_NAMES: Record<string, string> = {
  MR: "MRI",
  CT: "CT",
  CR: "X-Ray",
  US: "Ultrasound",
  MG: "Mammography",
  BMD: "DEXA bone density",
  OT: "Imaging study",
};

export interface GeminiTranscribeOptions {
  baseUrl?: string;
  apiKey?: string;
}

/**
 * Send a multimodal (text instruction + inline audio) request to Gemini for
 * verbatim transcription of a radiologist's dictation.
 * Returns trimmed transcript text, or an empty string when the model produces
 * no output.  Throws if the HTTP response is not ok.
 */
export async function geminiTranscribe(
  audioBase64: string,
  mimeType: string,
  options: GeminiTranscribeOptions = {}
): Promise<string> {
  const baseUrl =
    options.baseUrl ??
    process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ??
    "https://generativelanguage.googleapis.com";
  const apiKey = options.apiKey ?? process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? "";

  const url = `${baseUrl}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const transcribePrompt =
    "Transcribe the radiologist's dictation verbatim. Return only the spoken text — no headings, no commentary, no timestamps. Preserve medical terminology exactly as spoken.";

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { text: transcribePrompt },
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

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

export interface RadiologyFindingsInput {
  modality: string;
  testName: string;
  clinicalHistory: string;
  dictation: string;
}

/**
 * Build the prompt sent to Gemini for generating the FINDINGS section of a
 * radiology report.  Separated from the route handler so it can be tested.
 */
export function buildRadiologyFindingsPrompt(input: RadiologyFindingsInput): string {
  const modalityName = MODALITY_NAMES[input.modality] ?? input.modality ?? "Imaging";
  return `You are a senior radiologist drafting the FINDINGS section of a ${modalityName} report.

Study: ${input.testName || modalityName}
Clinical history: ${input.clinicalHistory || "(none provided)"}
Radiologist dictation / observations: ${input.dictation || "(none provided — produce a clean structured template the radiologist can fill in)"}

Write a professional FINDINGS section organised by anatomical region in short clear paragraphs.
- Use formal medical language and standard radiology phrasing.
- Quantify measurements where the dictation gives numbers (mm, cm).
- Use "No abnormality" or "Within normal limits" where the dictation is silent or explicitly normal — do NOT invent pathology.
- Do NOT include the IMPRESSION section. Do NOT include patient demographics. Do NOT include any disclaimer.
- Output only the findings narrative, ready to paste into the report.`;
}

export interface RadiologyImpressionInput {
  findings: string;
  modality: string;
  testName: string;
}

/**
 * Build the prompt sent to Gemini for generating the IMPRESSION bullet list
 * from an existing FINDINGS narrative.  Separated from the route handler so
 * it can be tested.
 */
export function buildRadiologyImpressionPrompt(input: RadiologyImpressionInput): string {
  const modalityName = MODALITY_NAMES[input.modality] ?? input.modality ?? "imaging study";
  return `You are a senior radiologist. Read the FINDINGS below from a ${modalityName} ${input.testName ? `(${input.testName}) ` : ""}and write a concise IMPRESSION.

FINDINGS:
${input.findings}

Rules:
- 1 to 4 numbered bullet points.
- Each bullet ≤ 25 words, plain medical language.
- Order by clinical significance (most important first).
- Suggest follow-up imaging or clinical correlation only if findings warrant it.
- Output only the numbered impression list. No heading, no preamble, no disclaimer.`;
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
Center Name: Care Diagnostics

Message purpose: ${purpose}

Keep it brief, friendly, and professional. Include the center name. Do not include any placeholder brackets.`;
}

// ---------------------------------------------------------------------------
// Multimodal OCR — bill / receipt scanning
// ---------------------------------------------------------------------------

export interface BillOcrResult {
  vendor: string;
  date: string;           // YYYY-MM-DD or empty
  amount: number;         // total payable
  gstAmount: number;
  category: string;       // best-guess expense category
  description: string;    // concise line-item summary
  paymentMode: string;    // cash | card | upi | cheque | other
  confidence: "high" | "medium" | "low";
}

/**
 * Send a bill/receipt image to Gemini Vision and extract key expense fields.
 * Returns a BillOcrResult; numeric fields default to 0 on parse failure.
 */
export async function geminiOcrBill(
  imageBase64: string,
  mimeType: string,
  options: GeminiGenerateOptions = {}
): Promise<BillOcrResult> {
  const baseUrl =
    options.baseUrl ?? process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com";
  const apiKey = options.apiKey ?? process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? "";

  const prompt = `You are an accounting assistant. Extract the following fields from this bill / invoice / receipt image and return ONLY valid JSON — no markdown fences, no explanation.

JSON schema:
{
  "vendor": "string — shop / supplier name",
  "date": "string — date in YYYY-MM-DD format, empty string if not found",
  "amount": number — total payable amount (after tax, inclusive of GST),
  "gstAmount": number — GST / tax portion only (0 if not shown),
  "category": "string — one of: Salaries, Rent, Utilities, Office Supplies, Medical Supplies, Lab Reagents, Equipment, Maintenance, Travel, Food, Marketing, Professional Fees, Taxes, Insurance, Miscellaneous",
  "description": "string — brief 1-line description of what was purchased",
  "paymentMode": "string — one of: cash, card, upi, cheque, other",
  "confidence": "string — one of: high, medium, low — your confidence in the extracted data"
}

Return ONLY the JSON object.`;

  const url = `${baseUrl}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: imageBase64 } },
        ],
      }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0.1 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini OCR error: ${res.status} ${err}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "{}";

  let parsed: Partial<BillOcrResult> = {};
  try {
    // Strip markdown fences if the model wraps them anyway
    const clean = raw.replace(/^```[a-z]*\n?/, "").replace(/```$/, "").trim();
    parsed = JSON.parse(clean) as Partial<BillOcrResult>;
  } catch { /* fall through to defaults */ }

  return {
    vendor: parsed.vendor ?? "",
    date: parsed.date ?? "",
    amount: Number(parsed.amount ?? 0),
    gstAmount: Number(parsed.gstAmount ?? 0),
    category: parsed.category ?? "Miscellaneous",
    description: parsed.description ?? "",
    paymentMode: parsed.paymentMode ?? "cash",
    confidence: parsed.confidence ?? "low",
  };
}

// ---------------------------------------------------------------------------
// Multimodal OCR — bank statement parsing
// ---------------------------------------------------------------------------

export interface BankTransaction {
  date: string;          // YYYY-MM-DD
  description: string;
  debit: number;         // amount going out (positive number, 0 if credit)
  credit: number;        // amount coming in (positive number, 0 if debit)
  balance: number;       // running balance after this row (0 if not shown)
  reference: string;     // cheque no / UTR / ref
}

/**
 * Parse a bank statement from plain CSV/text or from an image.
 * Pass either `text` (raw CSV or copied text) or `imageBase64 + mimeType`.
 */
export async function geminiParseBankStatement(
  input: { text: string } | { imageBase64: string; mimeType: string },
  options: GeminiGenerateOptions = {}
): Promise<BankTransaction[]> {
  const baseUrl =
    options.baseUrl ?? process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com";
  const apiKey = options.apiKey ?? process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? "";

  const prompt = `You are a bank statement parser. Extract every transaction row and return ONLY a JSON array — no markdown fences, no explanation.

Each element must follow this schema:
{
  "date": "YYYY-MM-DD",
  "description": "narration / merchant name",
  "debit": number (amount withdrawn/paid, positive, 0 if this row is a credit),
  "credit": number (amount deposited/received, positive, 0 if this row is a debit),
  "balance": number (running balance after this row, 0 if not shown),
  "reference": "cheque number / UTR / transaction ID if present, else empty string"
}

Rules:
- Parse every data row; skip header rows and totals rows.
- For Indian formats: Dr = debit, Cr = credit.
- Dates may be in various formats — convert all to YYYY-MM-DD.
- Return ONLY the JSON array.`;

  const url = `${baseUrl}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const parts: unknown[] =
    "text" in input
      ? [{ text: prompt }, { text: input.text }]
      : [{ text: prompt }, { inlineData: { mimeType: input.mimeType, data: input.imageBase64 } }];

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { maxOutputTokens: 8192, temperature: 0.1 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini bank statement error: ${res.status} ${err}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "[]";

  try {
    const clean = raw.replace(/^```[a-z]*\n?/, "").replace(/```$/, "").trim();
    const arr = JSON.parse(clean) as Partial<BankTransaction>[];
    return arr.map((r) => ({
      date: r.date ?? "",
      description: r.description ?? "",
      debit: Number(r.debit ?? 0),
      credit: Number(r.credit ?? 0),
      balance: Number(r.balance ?? 0),
      reference: r.reference ?? "",
    }));
  } catch {
    return [];
  }
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
  return geminiGenerate(prompt, { ...options, maxTokens: 200 });
}
