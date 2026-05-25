// Care Diagnostics Document Scan Bridge
// -------------------------------------------------------------
// Runs on each workstation that has a document scanner (flatbed or ADF).
// Browser pages call http://127.0.0.1:8766/* for scan/health.
// The bridge talks to:
//   • a vendor adapter (WIA / SANE / Folder-watch / Mock)
//   • returns base64 images to the ERP frontend
//
// Configuration via environment variables:
//   BRIDGE_SCAN_PORT        (default 8766)
//   BRIDGE_SCAN_VENDOR      mock | wia | sane | folder-watch
//   SCAN_WATCH_FOLDER       (folder-watch only) watched folder path
//   WIA_DEVICE_INDEX        1-based index for multiple WIA devices (default 1)
//   WIA_DPI                 Resolution for WIA scans (default 300)
//   SANE_DPI                Resolution for SANE scans (default 300)
//
// Security:
//   The bridge binds to 127.0.0.1 only. CORS allows the ERP origin derived
//   from ERP_BASE_URL or explicitly via BRIDGE_ALLOW_ORIGINS.

import express from "express";
import cors from "cors";
import { loadAdapter } from "./adapters/index.js";

const PORT = Number(process.env.BRIDGE_SCAN_PORT ?? 8766);
const VENDOR = process.env.BRIDGE_SCAN_VENDOR ?? "mock";
const ERP_BASE = (process.env.ERP_BASE_URL ?? "").replace(/\/$/, "");

// BRIDGE_ALLOW_ORIGINS must be explicitly configured. Defaults to the ERP
// origin when ERP_BASE_URL is set, or denies all cross-origin requests.
const _rawAllow = process.env.BRIDGE_ALLOW_ORIGINS ?? "";
if (_rawAllow.trim() === "*") {
  console.error("[scan-bridge] FATAL: BRIDGE_ALLOW_ORIGINS=\"*\" is not permitted. Set it to the specific ERP origin, e.g. https://erp.yourdomain.com");
  process.exit(1);
}

let ALLOW;
if (_rawAllow.trim()) {
  ALLOW = _rawAllow.split(",").map((s) => s.trim()).filter(Boolean);
} else if (ERP_BASE) {
  try {
    ALLOW = [new URL(ERP_BASE).origin];
  } catch {
    ALLOW = [];
  }
} else {
  ALLOW = [];
}

const adapter = await loadAdapter(VENDOR);
console.log(`[scan-bridge] Loaded adapter: ${VENDOR} (${adapter.name})`);
if (ALLOW.length === 0) {
  console.warn("[scan-bridge] WARNING: No BRIDGE_ALLOW_ORIGINS configured and ERP_BASE_URL is not set. Cross-origin browser requests will be blocked.");
}

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cors({ origin: ALLOW.length > 0 ? ALLOW : false, credentials: false }));

// ── Health / device status ───────────────────────────────────────────────────────
app.get("/health", async (_req, res) => {
  try {
    const status = await adapter.status();
    res.json({ ok: true, vendor: VENDOR, adapter: adapter.name, version: "1.0.0", ...status });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, vendor: VENDOR, adapter: adapter.name });
  }
});

// ── Scan a document and return base64 image ──────────────────────────────────────────────────────────────────
app.post("/scan", async (_req, res) => {
  try {
    const result = await adapter.scan();
    res.json({ ok: true, imageBase64: result.imageBase64, mimeType: result.mimeType ?? "image/jpeg" });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[scan-bridge] Listening on http://127.0.0.1:${PORT}`);
  console.log(`[scan-bridge] ERP: ${ERP_BASE || "(not configured)"}`);
  console.log(`[scan-bridge] Allowed origins: ${ALLOW.join(", ") || "(none — CORS blocked)"}`);
});
