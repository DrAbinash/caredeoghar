import { useCallback } from "react";

function getBaseUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;
  return "https://localhost";
}

export function useApi() {
  const request = useCallback(async (method: string, path: string, body?: unknown): Promise<any> => {
    const base = getBaseUrl();
    const url = `${base}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      throw new Error(data?.error || `Request failed (${res.status})`);
    }
    return data;
  }, []);

  const get = useCallback((path: string) => request("GET", path), [request]);
  const post = useCallback((path: string, body: unknown) => request("POST", path, body), [request]);
  const put = useCallback((path: string, body: unknown) => request("PUT", path, body), [request]);
  const del = useCallback((path: string) => request("DELETE", path), [request]);

  return { get, post, put, delete: del };
}
