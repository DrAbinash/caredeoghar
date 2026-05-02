/**
 * Thin fetch wrapper that automatically adds the X-SA-Token header to every
 * request. Used by Super Admin Portal pages (Commission Rules / Report,
 * Doctor Ledger) to call routes gated by the requireSuperAdmin middleware.
 */

const API_BASE = "/api";

let SA_TOKEN: string | null = null;

export function setSaToken(token: string | null): void {
  SA_TOKEN = token;
}

async function jsonFetch<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (SA_TOKEN) headers["X-SA-Token"] = SA_TOKEN;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const errMsg =
      (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string")
        ? (data as { error: string }).error
        : `${res.status} ${res.statusText}`;
    throw new Error(errMsg);
  }
  return data as T;
}

export const saApi = {
  get: <T>(path: string) => jsonFetch<T>("GET", path),
  post: <T>(path: string, body?: unknown) => jsonFetch<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => jsonFetch<T>("PATCH", path, body),
  delete: <T>(path: string) => jsonFetch<T>("DELETE", path),
};

/**
 * Build a fetch URL+headers for binary downloads (CSV, PDF) that need the
 * super-admin token. Use with a plain `fetch()` call.
 */
export function saAuthHeaders(): Record<string, string> {
  return SA_TOKEN ? { "X-SA-Token": SA_TOKEN } : {};
}
