/**
 * Phase 10C: Ollama Local Model Proxy
 * Proxies radiology AI requests to a locally configured Ollama instance.
 * Settings stored in clinic_settings.ollamaBaseUrl + ollamaModel.
 * All output is labelled "AI Draft – Requires Radiologist Review".
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { clinicSettingsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { type StaffAuthRequest } from "../middleware/requireStaffAuth";

export const radiologyOllamaRouter = Router();

async function getOllamaConfig(): Promise<{ baseUrl: string; model: string } | null> {
  const rows = await db
    .select({
      ollamaBaseUrl: clinicSettingsTable.ollamaBaseUrl,
      ollamaModel: clinicSettingsTable.ollamaModel,
    })
    .from(clinicSettingsTable)
    .orderBy(desc(clinicSettingsTable.id))
    .limit(1);

  const row = rows[0];
  if (!row?.ollamaBaseUrl) return null;
  return {
    baseUrl: row.ollamaBaseUrl.replace(/\/$/, ""),
    model: row.ollamaModel ?? "llama3",
  };
}

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

// ── Test connection ───────────────────────────────────────────────────────────
radiologyOllamaRouter.post("/test", async (req, res): Promise<void> => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const baseUrl = (b.baseUrl ? String(b.baseUrl) : "").replace(/\/$/, "");
  const model = b.model ? String(b.model) : "llama3";

  if (!baseUrl) { res.status(400).json({ error: "baseUrl required" }); return; }

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    const resp = await fetch(`${baseUrl}/api/tags`, { signal: ac.signal });
    clearTimeout(timer);
    if (!resp.ok) { res.status(502).json({ ok: false, error: `Ollama returned ${resp.status}` }); return; }
    const data = await resp.json() as { models?: { name: string }[] };
    const models = (data.models ?? []).map((m) => m.name);
    res.json({ ok: true, models });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ ok: false, error: msg });
  }
});

// ── Generate findings via Ollama ──────────────────────────────────────────────
radiologyOllamaRouter.post("/findings", async (req, res): Promise<void> => {
  const config = await getOllamaConfig();
  if (!config) { res.status(503).json({ error: "Ollama is not configured. Set the base URL in Settings → Radiology." }); return; }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const modality = String(b.modality ?? "").trim();
  const testName = String(b.testName ?? "").trim();
  const clinicalHistory = String(b.clinicalHistory ?? "").trim();

  if (!modality && !testName) { res.status(400).json({ error: "modality or testName required" }); return; }

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

// ── Generate impression via Ollama ────────────────────────────────────────────
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

// ── Generate differential via Ollama ─────────────────────────────────────────
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
