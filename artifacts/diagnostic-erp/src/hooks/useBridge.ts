import { useEffect, useState, useCallback } from "react";

const BRIDGE_URL = (() => {
  const stored = typeof window !== "undefined" ? window.localStorage.getItem("bridgeUrl") : null;
  return stored ?? "http://127.0.0.1:8765";
})();

export type BridgeStatus = {
  connected: boolean;
  vendor?: string;
  deviceConnected?: boolean;
  deviceModel?: string;
  error?: string;
};

async function bridgeFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BRIDGE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Bridge error ${r.status}`);
  return j as T;
}

export function useBridgeStatus(pollMs = 5000) {
  const [status, setStatus] = useState<BridgeStatus>({ connected: false });
  const ping = useCallback(async () => {
    try {
      const j = await bridgeFetch<{ vendor: string; deviceConnected?: boolean; deviceModel?: string; error?: string }>("/health");
      setStatus({ connected: true, ...j });
    } catch (e) {
      setStatus({ connected: false, error: e instanceof Error ? e.message : "offline" });
    }
  }, []);
  useEffect(() => {
    ping();
    const t = setInterval(ping, pollMs);
    return () => clearInterval(t);
  }, [ping, pollMs]);
  return { status, refresh: ping };
}

export const bridge = {
  url: BRIDGE_URL,
  health: () => bridgeFetch("/health"),
  enroll: (scope: "staff" | "user", scopeId: number, fingerName?: string) =>
    bridgeFetch<{ ok: boolean; template: { id: number } }>("/enroll", {
      method: "POST",
      body: JSON.stringify({ scope, scopeId, fingerName }),
    }),
  staffPunch: (action: "in" | "out") =>
    bridgeFetch<{ staff: { id: number; name: string; staffId: string; role: string }; attendance: unknown; action: string; score: number }>("/staff-punch", {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  userLogin: () =>
    bridgeFetch<{ token: string; expiresAt: string; user: { id: number; name: string; role: string }; score: number }>("/user-login", { method: "POST" }),
};
