// Pluggable PACS provider abstraction.
//
// Two providers are recognised today:
//   - "orthanc"  — REST-API native; rich endpoints under /studies, /patients, etc.
//                  Configured via ORTHANC_URL / ORTHANC_USERNAME / ORTHANC_PASSWORD.
//   - "conquest" — DICOM-over-TCP server with a CGI-style HTTP interface
//                  (default port 5678) at /cgi-bin/dgate. Has limited REST
//                  capabilities; many features require local file access on the
//                  Conquest host (dicom.ini, worklist directory).
//
// The viewer/browser routes in `routes/pacs.ts` remain Orthanc-specific.
// This abstraction is what new code (DICOM nodes, MWL push, share links)
// uses so it can branch by provider.

export type PacsProviderType = "orthanc" | "conquest" | "none";

export interface PacsProvider {
  type: PacsProviderType;
  displayName: string;
  baseUrl: string | null;
  // Reachability check — quick HTTP HEAD/GET. Real DIMSE C-ECHO requires a
  // native DICOM library; this is a lightweight liveness probe.
  health(): Promise<{ ok: boolean; status?: number; message?: string }>;
  // Capability hints that drive the UI ("Show CD export button", etc.).
  capabilities: {
    studyArchive: boolean;        // Can return a ZIP of a study's DICOM files
    teleradiologyShare: boolean;  // Can mint signed share URLs natively
    mwlPush: boolean;             // Can accept MWL entries via REST
    instanceMetadata: boolean;    // Can return DICOM tags as JSON
  };
}

class OrthancProvider implements PacsProvider {
  readonly type = "orthanc" as const;
  readonly displayName = "Orthanc";
  readonly baseUrl: string | null;
  private readonly user: string;
  private readonly pass: string;
  readonly capabilities = {
    studyArchive: true,
    teleradiologyShare: true,
    mwlPush: true,
    instanceMetadata: true,
  };
  constructor(url: string, user: string, pass: string) {
    this.baseUrl = url || null;
    this.user = user;
    this.pass = pass;
  }
  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.user && this.pass) {
      h["Authorization"] = "Basic " + Buffer.from(`${this.user}:${this.pass}`).toString("base64");
    }
    return h;
  }
  async health(): Promise<{ ok: boolean; status?: number; message?: string }> {
    if (!this.baseUrl) return { ok: false, message: "ORTHANC_URL not set" };
    try {
      const resp = await fetch(`${this.baseUrl}/system`, { headers: this.headers() });
      return { ok: resp.ok, status: resp.status, message: resp.ok ? "OK" : `HTTP ${resp.status}` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "fetch failed" };
    }
  }
}

class ConquestProvider implements PacsProvider {
  readonly type = "conquest" as const;
  readonly displayName = "Conquest";
  readonly baseUrl: string | null;
  readonly capabilities = {
    studyArchive: false,        // Conquest can build ZIPs but only via lua scripts
    teleradiologyShare: false,  // No native signed URLs
    mwlPush: false,             // Requires file-system write to WL directory
    instanceMetadata: true,     // dgate CGI returns basic patient/study lists
  };
  constructor(url: string) {
    this.baseUrl = url || null;
  }
  async health(): Promise<{ ok: boolean; status?: number; message?: string }> {
    if (!this.baseUrl) return { ok: false, message: "CONQUEST_URL not set" };
    try {
      // Conquest's built-in HTTP server returns the dgate landing page on GET /.
      const resp = await fetch(`${this.baseUrl}/`, { method: "GET" });
      return { ok: resp.ok, status: resp.status, message: resp.ok ? "OK" : `HTTP ${resp.status}` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "fetch failed" };
    }
  }
}

class NoneProvider implements PacsProvider {
  readonly type = "none" as const;
  readonly displayName = "Not configured";
  readonly baseUrl = null;
  readonly capabilities = {
    studyArchive: false, teleradiologyShare: false, mwlPush: false, instanceMetadata: false,
  };
  async health() { return { ok: false, message: "No PACS provider configured" }; }
}

export function getPacsProvider(): PacsProvider {
  const explicit = (process.env.PACS_PROVIDER || "").toLowerCase();
  const orthancUrl = (process.env.ORTHANC_URL || "").replace(/\/$/, "");
  const conquestUrl = (process.env.CONQUEST_URL || "").replace(/\/$/, "");

  if (explicit === "conquest" || (!explicit && conquestUrl && !orthancUrl)) {
    return new ConquestProvider(conquestUrl);
  }
  if (explicit === "orthanc" || (!explicit && orthancUrl)) {
    return new OrthancProvider(orthancUrl, process.env.ORTHANC_USERNAME || "", process.env.ORTHANC_PASSWORD || "");
  }
  return new NoneProvider();
}

// Block obviously dangerous targets to limit SSRF abuse. The tcpProbe is
// reachable from any authenticated session, so we refuse cloud metadata
// services and other well-known hostile destinations even though most ERP
// installs are firewalled to a LAN.
const SSRF_BLOCK_LITERAL = new Set([
  "169.254.169.254",   // AWS / GCP / Azure / DigitalOcean metadata
  "100.100.100.200",   // Alibaba Cloud metadata
  "fd00:ec2::254",     // AWS IPv6 metadata
]);
function isBlockedHost(host: string): string | null {
  const h = host.trim().toLowerCase();
  if (!h) return "host is empty";
  if (SSRF_BLOCK_LITERAL.has(h)) return `${h} is a cloud metadata endpoint and is blocked`;
  // Block AWS metadata range 169.254.169.x just in case.
  if (/^169\.254\.169\.\d+$/.test(h)) return "169.254.169.0/24 is blocked (cloud metadata range)";
  return null;
}

// TCP reachability check used by the DICOM Node "Test" button. Real C-ECHO
// requires a native DIMSE library; this verifies that the modality is at
// least listening on the configured AE port.
export async function tcpProbe(host: string, port: number, timeoutMs = 3000): Promise<{
  ok: boolean; latencyMs: number; message: string;
}> {
  const blocked = isBlockedHost(host);
  if (blocked) return { ok: false, latencyMs: 0, message: blocked };
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, latencyMs: 0, message: `Invalid port ${port}` };
  }
  const net = await import("node:net");
  const start = Date.now();
  return await new Promise((resolve) => {
    const sock = new net.Socket();
    let resolved = false;
    const finish = (ok: boolean, msg: string) => {
      if (resolved) return;
      resolved = true;
      try { sock.destroy(); } catch { /* noop */ }
      resolve({ ok, latencyMs: Date.now() - start, message: msg });
    };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => finish(true, `TCP connect OK (${Date.now() - start}ms)`));
    sock.once("timeout", () => finish(false, `Timed out after ${timeoutMs}ms`));
    sock.once("error", (err) => finish(false, err.message));
    try {
      sock.connect(port, host);
    } catch (err) {
      finish(false, err instanceof Error ? err.message : "connect threw");
    }
  });
}
