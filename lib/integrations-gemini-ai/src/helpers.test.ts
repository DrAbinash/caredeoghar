import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  geminiGenerate,
  buildClinicalNotePrompt,
  buildBillingInsightsPrompt,
  buildPatientMessagePrompt,
  generateClinicalNote,
  generateBillingInsights,
  generatePatientMessage,
  type ClinicalNotePatient,
  type BillingInsightsMetrics,
  type PatientMessagePatient,
  type PatientMessageType,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// geminiGenerate
// ---------------------------------------------------------------------------

function makeGeminiResponse(text: string, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => (ok ? "" : text),
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  } as unknown as Response;
}

describe("geminiGenerate", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns trimmed text from a valid Gemini response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeGeminiResponse("  Patient is healthy.  ")
    );

    const result = await geminiGenerate("test prompt", {
      baseUrl: "https://example.com",
      apiKey: "test-key",
    });

    expect(result).toBe("Patient is healthy.");
  });

  it("returns empty string when candidates array is absent", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [] }),
    } as unknown as Response);

    const result = await geminiGenerate("test prompt", {
      baseUrl: "https://example.com",
      apiKey: "test-key",
    });

    expect(result).toBe("");
  });

  it("returns empty string when candidates parts contain no text", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{}] } }],
      }),
    } as unknown as Response);

    const result = await geminiGenerate("test prompt", {
      baseUrl: "https://example.com",
      apiKey: "test-key",
    });

    expect(result).toBe("");
  });

  it("returns empty string when the model returns null-ish nested fields", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: null }] }),
    } as unknown as Response);

    const result = await geminiGenerate("prompt", {
      baseUrl: "https://example.com",
      apiKey: "key",
    });

    expect(result).toBe("");
  });

  it("throws a descriptive error when the API returns a non-ok status", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "Rate limit exceeded",
    } as unknown as Response);

    await expect(
      geminiGenerate("prompt", { baseUrl: "https://example.com", apiKey: "k" })
    ).rejects.toThrow("Gemini API error: 429 Rate limit exceeded");
  });

  it("throws when the API returns a 500 error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    } as unknown as Response);

    await expect(
      geminiGenerate("prompt", { baseUrl: "https://example.com", apiKey: "k" })
    ).rejects.toThrow("Gemini API error: 500");
  });

  it("includes the correct model and maxTokens in the request body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeGeminiResponse("ok"));

    await geminiGenerate("my prompt", {
      baseUrl: "https://api.example.com",
      apiKey: "abc",
      maxTokens: 256,
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("gemini-2.5-flash");
    expect(url).toContain("abc");

    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[0].text).toBe("my prompt");
    expect(body.generationConfig.maxOutputTokens).toBe(256);
  });

  it("falls back to env vars when no options are provided", async () => {
    vi.stubEnv("AI_INTEGRATIONS_GEMINI_BASE_URL", "https://env.example.com");
    vi.stubEnv("AI_INTEGRATIONS_GEMINI_API_KEY", "env-key");

    vi.mocked(fetch).mockResolvedValueOnce(makeGeminiResponse("env result"));

    const result = await geminiGenerate("prompt");

    expect(result).toBe("env result");
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://env.example.com");
    expect(url).toContain("env-key");
  });
});

// ---------------------------------------------------------------------------
// buildClinicalNotePrompt
// ---------------------------------------------------------------------------

const SAMPLE_PATIENT: ClinicalNotePatient = {
  firstName: "Amit",
  lastName: "Sharma",
  patientId: "P-001",
  gender: "Male",
  dateOfBirth: "1980-05-15",
  bloodGroup: "O+",
};

describe("buildClinicalNotePrompt", () => {
  it("includes patient name, ID, gender, DOB, and blood group", () => {
    const prompt = buildClinicalNotePrompt(SAMPLE_PATIENT, "CBC — Haematology — Status: completed");

    expect(prompt).toContain("Amit Sharma");
    expect(prompt).toContain("P-001");
    expect(prompt).toContain("Male");
    expect(prompt).toContain("1980-05-15");
    expect(prompt).toContain("O+");
  });

  it("includes the test history when provided", () => {
    const testHistory = "CBC (Complete Blood Count) — Haematology — Status: completed\nLFT (Liver Function Test) — Biochemistry — Status: pending";
    const prompt = buildClinicalNotePrompt(SAMPLE_PATIENT, testHistory);

    expect(prompt).toContain("CBC");
    expect(prompt).toContain("LFT");
  });

  it("uses 'No tests recorded yet' when test history is empty", () => {
    const prompt = buildClinicalNotePrompt(SAMPLE_PATIENT, "");

    expect(prompt).toContain("No tests recorded yet");
  });

  it("uses 'Not specified' when blood group is null", () => {
    const patient = { ...SAMPLE_PATIENT, bloodGroup: null };
    const prompt = buildClinicalNotePrompt(patient, "");

    expect(prompt).toContain("Not specified");
  });

  it("uses 'Not specified' when blood group is undefined", () => {
    const { bloodGroup: _unused, ...patientWithoutBG } = SAMPLE_PATIENT;
    const prompt = buildClinicalNotePrompt(
      patientWithoutBG as ClinicalNotePatient,
      ""
    );

    expect(prompt).toContain("Not specified");
  });

  it("instructs the model to produce a 3-4 sentence clinical summary", () => {
    const prompt = buildClinicalNotePrompt(SAMPLE_PATIENT, "");

    expect(prompt).toContain("3-4 sentences");
    expect(prompt.toLowerCase()).toContain("clinical");
  });
});

// ---------------------------------------------------------------------------
// buildBillingInsightsPrompt
// ---------------------------------------------------------------------------

const SAMPLE_METRICS: BillingInsightsMetrics = {
  fromLabel: "01/04/2026",
  toLabel: "30/04/2026",
  totalBills: 120,
  totalRevenue: 450000,
  paidCount: 90,
  pendingCount: 20,
  partialCount: 10,
  totalDiscount: 15000,
  collectionRate: "75.0",
  avgBill: "4200",
};

describe("buildBillingInsightsPrompt", () => {
  it("includes the date period labels", () => {
    const prompt = buildBillingInsightsPrompt(SAMPLE_METRICS);

    expect(prompt).toContain("01/04/2026");
    expect(prompt).toContain("30/04/2026");
  });

  it("includes total bills count", () => {
    const prompt = buildBillingInsightsPrompt(SAMPLE_METRICS);

    expect(prompt).toContain("120");
  });

  it("includes paid, pending, and partial counts", () => {
    const prompt = buildBillingInsightsPrompt(SAMPLE_METRICS);

    expect(prompt).toContain("90");
    expect(prompt).toContain("20");
    expect(prompt).toContain("10");
  });

  it("includes collection rate", () => {
    const prompt = buildBillingInsightsPrompt(SAMPLE_METRICS);

    expect(prompt).toContain("75.0%");
  });

  it("includes average bill amount", () => {
    const prompt = buildBillingInsightsPrompt(SAMPLE_METRICS);

    expect(prompt).toContain("4200");
  });

  it("instructs the model to produce 3-5 actionable insights", () => {
    const prompt = buildBillingInsightsPrompt(SAMPLE_METRICS);

    expect(prompt).toContain("3-5");
    expect(prompt.toLowerCase()).toContain("insight");
  });

  it("works correctly with zero bills (edge case)", () => {
    const zeroMetrics: BillingInsightsMetrics = {
      ...SAMPLE_METRICS,
      totalBills: 0,
      paidCount: 0,
      pendingCount: 0,
      partialCount: 0,
      totalRevenue: 0,
      totalDiscount: 0,
      collectionRate: "0",
      avgBill: "0",
    };

    const prompt = buildBillingInsightsPrompt(zeroMetrics);
    expect(prompt).toContain("Total Bills: 0");
    expect(prompt).toContain("0% collection rate");
  });
});

// ---------------------------------------------------------------------------
// generateClinicalNote (end-to-end: prompt build + geminiGenerate)
// ---------------------------------------------------------------------------

describe("generateClinicalNote", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the AI response text for a patient with test history", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Patient summary note." }] } }],
      }),
    } as unknown as Response);

    const result = await generateClinicalNote(
      SAMPLE_PATIENT,
      "CBC — Haematology — Status: completed",
      { baseUrl: "https://api.example.com", apiKey: "test-key" }
    );

    expect(result).toBe("Patient summary note.");

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[0].text).toContain("Amit Sharma");
    expect(body.contents[0].parts[0].text).toContain("CBC");
  });

  it("returns empty string when the model produces no output", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [] }),
    } as unknown as Response);

    const result = await generateClinicalNote(SAMPLE_PATIENT, "", {
      baseUrl: "https://api.example.com",
      apiKey: "k",
    });

    expect(result).toBe("");
  });

  it("propagates errors from the AI API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => "Service Unavailable",
    } as unknown as Response);

    await expect(
      generateClinicalNote(SAMPLE_PATIENT, "", {
        baseUrl: "https://api.example.com",
        apiKey: "k",
      })
    ).rejects.toThrow("Gemini API error: 503");
  });
});

// ---------------------------------------------------------------------------
// buildPatientMessagePrompt
// ---------------------------------------------------------------------------

const SAMPLE_MSG_PATIENT: PatientMessagePatient = {
  firstName: "Priya",
  lastName: "Mehta",
};

describe("buildPatientMessagePrompt", () => {
  it("includes the patient's full name in the prompt", () => {
    const prompt = buildPatientMessagePrompt(SAMPLE_MSG_PATIENT, "followup");

    expect(prompt).toContain("Priya Mehta");
  });

  it("includes the center name DiagnoCenter", () => {
    const prompt = buildPatientMessagePrompt(SAMPLE_MSG_PATIENT, "followup");

    expect(prompt).toContain("DiagnoCenter");
  });

  it("includes follow-up purpose text for 'followup' type", () => {
    const prompt = buildPatientMessagePrompt(SAMPLE_MSG_PATIENT, "followup");

    expect(prompt).toContain("follow-up");
    expect(prompt).toContain("scheduled tests");
  });

  it("includes results-ready purpose text for 'results' type", () => {
    const prompt = buildPatientMessagePrompt(SAMPLE_MSG_PATIENT, "results");

    expect(prompt).toContain("test results are ready");
  });

  it("includes payment-reminder purpose text for 'payment' type", () => {
    const prompt = buildPatientMessagePrompt(SAMPLE_MSG_PATIENT, "payment");

    expect(prompt).toContain("payment reminder");
    expect(prompt).toContain("outstanding dues");
  });

  it("instructs the model to keep the message under 60 words", () => {
    const prompt = buildPatientMessagePrompt(SAMPLE_MSG_PATIENT, "followup");

    expect(prompt).toContain("60 words");
  });

  it("instructs the model not to use placeholder brackets", () => {
    const prompt = buildPatientMessagePrompt(SAMPLE_MSG_PATIENT, "payment");

    expect(prompt.toLowerCase()).toContain("placeholder");
  });

  it("produces different prompts for different message types", () => {
    const followupPrompt = buildPatientMessagePrompt(SAMPLE_MSG_PATIENT, "followup");
    const resultsPrompt  = buildPatientMessagePrompt(SAMPLE_MSG_PATIENT, "results");
    const paymentPrompt  = buildPatientMessagePrompt(SAMPLE_MSG_PATIENT, "payment");

    expect(followupPrompt).not.toBe(resultsPrompt);
    expect(resultsPrompt).not.toBe(paymentPrompt);
    expect(followupPrompt).not.toBe(paymentPrompt);
  });
});

// ---------------------------------------------------------------------------
// generatePatientMessage (end-to-end: prompt build + geminiGenerate)
// ---------------------------------------------------------------------------

describe("generatePatientMessage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the drafted message text from a valid AI response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Dear Priya, your results are ready at DiagnoCenter." }] } }],
      }),
    } as unknown as Response);

    const result = await generatePatientMessage(SAMPLE_MSG_PATIENT, "results", {
      baseUrl: "https://api.example.com",
      apiKey: "test-key",
    });

    expect(result).toBe("Dear Priya, your results are ready at DiagnoCenter.");

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[0].text).toContain("Priya Mehta");
    expect(body.contents[0].parts[0].text).toContain("DiagnoCenter");
  });

  it("sends the request with maxTokens capped at 200 by default", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Hi Priya!" }] } }],
      }),
    } as unknown as Response);

    await generatePatientMessage(SAMPLE_MSG_PATIENT, "followup", {
      baseUrl: "https://api.example.com",
      apiKey: "k",
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig.maxOutputTokens).toBe(200);
  });

  it("includes the correct message purpose in the prompt for 'payment' type", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Payment reminder sent." }] } }],
      }),
    } as unknown as Response);

    await generatePatientMessage(SAMPLE_MSG_PATIENT, "payment", {
      baseUrl: "https://api.example.com",
      apiKey: "k",
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[0].text).toContain("outstanding dues");
  });

  it("returns empty string when the model produces no output", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [] }),
    } as unknown as Response);

    const result = await generatePatientMessage(SAMPLE_MSG_PATIENT, "followup", {
      baseUrl: "https://api.example.com",
      apiKey: "k",
    });

    expect(result).toBe("");
  });

  it("returns empty string when the model returns null-ish nested fields", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: null }] }),
    } as unknown as Response);

    const result = await generatePatientMessage(SAMPLE_MSG_PATIENT, "followup", {
      baseUrl: "https://api.example.com",
      apiKey: "k",
    });

    expect(result).toBe("");
  });

  it("propagates errors from the AI API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "Rate limit exceeded",
    } as unknown as Response);

    await expect(
      generatePatientMessage(SAMPLE_MSG_PATIENT, "results", {
        baseUrl: "https://api.example.com",
        apiKey: "k",
      })
    ).rejects.toThrow("Gemini API error: 429");
  });
});

// ---------------------------------------------------------------------------
// generateBillingInsights (end-to-end: prompt build + geminiGenerate)
// ---------------------------------------------------------------------------

describe("generateBillingInsights", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns insights text from a valid AI response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: "1. Improve collection rate.\n2. Reduce discounts." }],
            },
          },
        ],
      }),
    } as unknown as Response);

    const result = await generateBillingInsights(SAMPLE_METRICS, {
      baseUrl: "https://api.example.com",
      apiKey: "test-key",
    });

    expect(result).toBe("1. Improve collection rate.\n2. Reduce discounts.");

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[0].text).toContain("75.0%");
    expect(body.contents[0].parts[0].text).toContain("120");
  });

  it("returns empty string when the model produces no output", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{}] } }] }),
    } as unknown as Response);

    const result = await generateBillingInsights(SAMPLE_METRICS, {
      baseUrl: "https://api.example.com",
      apiKey: "k",
    });

    expect(result).toBe("");
  });

  it("propagates errors from the AI API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "Rate limit exceeded",
    } as unknown as Response);

    await expect(
      generateBillingInsights(SAMPLE_METRICS, {
        baseUrl: "https://api.example.com",
        apiKey: "k",
      })
    ).rejects.toThrow("Gemini API error: 429");
  });
});
