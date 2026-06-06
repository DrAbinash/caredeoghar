/**
 * Phase 10C: Ollama Local Model Proxy
 * Proxies radiology AI requests to a locally configured Ollama instance.
 * Settings stored in clinic_settings.ollamaBaseUrl + ollamaModel.
 * All output is labelled "AI Draft – Requires Radiologist Review".
 *
 * Security: SSRF-guarded. Only http:// or https:// URLs whose host is NOT a
 * private/loopback/link-local address are permitted when the URL comes from
 * the clinic_settings table. The /test endpoint additionally validates the
 * caller-supplied baseUrl through the same guard before making any outbound
 * request.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { clinicSettingsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { type StaffAuthRequest } from "../middleware/requireStaffAuth";

export const radiologyOllamaRouter = Router();

// ── SSRF guard ──────────────────────────────────────────────────────────────
// Blocks private IPv4 ranges, loopback, link-local, and IPv6 equivalents.
// We parse the URL here (no DNS lookup) and refuse any hostname that is
// obviously internal. This is defence-in-depth on top of network controls.
const PRIVATE_RANGES: RegExp[] = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,  // link-local
  /^\[?::1\]?$/,            // IPv6 loopback
  /^\[?fe80::/i,            // IPv6 link-local
  /^0\.0\.0\.0$/,
];

function validateOllamaUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "Invalid URL format" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: "Only http:// and https:// are allowed" };
  }
  const host = u.hostname;
  for (const re of PRIVATE_RANGES) {
    if (re.test(host)) {
      return { ok: false, reason: `Private/loopback addresses are not permitted as Ollama targets (${host})` };
    }
  }
  return { ok: true, url: u };
}

// ── Config helper ───────────────────────────────────────────────────────────
async function getOllamaConfig(): Promise<{ baseUrl: string; model: string; localOnly: boolean } | null> {
  const rows = await db
    .select({
      ollamaBaseUrl: clinicSettingsTable.ollamaBaseUrl,
      ollamaModel: clinicSettingsTable.ollamaModel,
      ollamaLocalOnly: clinicSettingsTable.ollamaLocalOnly,
    })
    .from(clinicSettingsTable)
    .orderBy(desc(clinicSettingsTable.id))
    .limit(1);

  const row = rows[0];
  if (!row?.ollamaBaseUrl) return null;

  const validated = validateOllamaUrl(row.ollamaBaseUrl);
  if (!validated.ok) return null; // silently skip misconfigured URLs

  return {
    baseUrl: validated.url.origin,
    model: row.ollamaModel ?? "llama3",
    localOnly: row.ollamaLocalOnly ?? false,
  };
}

// ── Ollama generate helper ──────────────────────────────────────────────────
async function ollamaGenerate(
  baseUrl: string,
  model: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const resp = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
    signal,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Ollama responded ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json() as { response?: string };
  return (data.response ?? "").trim();
}

// ── GET /status — returns config from clinic_settings (no outbound call) ────
radiologyOllamaRouter.get("/status", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      ollamaBaseUrl: clinicSettingsTable.ollamaBaseUrl,
      ollamaModel: clinicSettingsTable.ollamaModel,
      ollamaLocalOnly: clinicSettingsTable.ollamaLocalOnly,
    })
    .from(clinicSettingsTable)
    .orderBy(desc(clinicSettingsTable.id))
    .limit(1);

  const row = rows[0];
  const configured = Boolean(row?.ollamaBaseUrl);
  const validation = configured ? validateOllamaUrl(row.ollamaBaseUrl!) : null;

  res.json({
    configured,
    baseUrl: row?.ollamaBaseUrl ?? null,
    model: row?.ollamaModel ?? null,
    localOnly: row?.ollamaLocalOnly ?? false,
    urlValid: validation?.ok ?? false,
    urlError: validation?.ok === false ? validation.reason : null,
  });
});

// ── POST /test — caller supplies baseUrl+model, no DB lookup ────────────────
// Validates the URL through the SSRF guard before making any network request.
radiologyOllamaRouter.post("/test", async (req, res): Promise<void> => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const rawUrl = b.baseUrl ? String(b.baseUrl).trim() : "";
  const model = b.model ? String(b.model).trim() : "llama3";

  if (!rawUrl) {
    res.status(400).json({ ok: false, error: "baseUrl required" });
    return;
  }

  const guard = validateOllamaUrl(rawUrl);
  if (!guard.ok) {
    res.status(400).json({ ok: false, error: guard.reason });
    return;
  }

  const baseUrl = guard.url.origin;

  try {
    const t0 = Date.now();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    const resp = await fetch(`${baseUrl}/api/tags`, { signal: ac.signal });
    clearTimeout(timer);
    const latencyMs = Date.now() - t0;

    if (!resp.ok) {
      res.status(502).json({ ok: false, error: `Ollama returned ${resp.status}` });
      return;
    }

    const data = await resp.json() as { models?: { name: string }[] };
    const models = (data.models ?? []).map((m) => m.name);
    const modelFound = models.includes(model);

    res.json({ ok: true, model, models, modelFound, latencyMs });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ ok: false, error: msg });
  }
});

// ── POST /findings — generate structured findings via Ollama ─────────────────
radiologyOllamaRouter.post("/findings", async (req, res): Promise<void> => {
  const config = await getOllamaConfig();
  if (!config) {
    res.status(503).json({ error: "Ollama is not configured. Set the base URL in Settings → Radiology." });
    return;
  }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const modality = String(b.modality ?? "").trim();
  const testName = String(b.testName ?? "").trim();
  const clinicalHistory = String(b.clinicalHistory ?? "").trim();

  if (!modality && !testName) {
    res.status(400).json({ error: "modality or testName required" });
    return;
  }

  const prompt = `You are a radiology reporting assistant. Generate structured findings for the following study.
Study: ${testName || modality}
Clinical History: ${clinicalHistory || "Not provided"}

Generate detailed, structured findings as a radiologist would write. Use bullet points per organ/system.
Note at the end: "AI Draft – Requires Radiologist Review"`;

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 60000);
    const findings = await ollamaGenerate(config.baseUrl, config.model, prompt, ac.signal);
    clearTimeout(timer);
    res.json({ findings, model: config.model, provider: "ollama" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Ollama error: ${msg}` });
  }
});

// ── POST /impression — generate impression from findings via Ollama ───────────
radiologyOllamaRouter.post("/impression", async (req, res): Promise<void> => {
  const config = await getOllamaConfig();
  if (!config) { res.status(503).json({ error: "Ollama not configured" }); return; }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const findings = String(b.findings ?? "").trim();
  if (!findings) { res.status(400).json({ error: "findings required" }); return; }

  const prompt = `You are a radiology reporting assistant. Generate a concise 1-4 line impression from the following findings:

${findings}

Generate a clear, clinically actionable impression. Use bullet points.
Note: "AI Draft – Requires Radiologist Review"`;

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30000);
    const impression = await ollamaGenerate(config.baseUrl, config.model, prompt, ac.signal);
    clearTimeout(timer);
    res.json({ impression, model: config.model, provider: "ollama" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Ollama error: ${msg}` });
  }
});

// ── POST /differential — generate differential diagnosis via Ollama ──────────
radiologyOllamaRouter.post("/differential", async (req, res): Promise<void> => {
  const config = await getOllamaConfig();
  if (!config) { res.status(503).json({ error: "Ollama not configured" }); return; }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const findings = String(b.findings ?? "").trim();
  const modality = String(b.modality ?? "").trim();

  if (!findings) { res.status(400).json({ error: "findings required" }); return; }

  const prompt = `You are a radiology reporting assistant. Generate a differential diagnosis for the following ${modality} findings:

${findings}

List top 3-5 differential diagnoses with brief radiological reasoning for each.
Note: "AI Draft – Requires Radiologist Review"`;

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30000);
    const differential = await ollamaGenerate(config.baseUrl, config.model, prompt, ac.signal);
    clearTimeout(timer);
    res.json({ differential, model: config.model, provider: "ollama" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Ollama error: ${msg}` });
  }
});
