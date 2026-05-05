/**
 * Thin wrapper that wires up the SA token for the generated api-client-react
 * hooks.  When the super-admin logs in with a valid token we call setSaToken,
 * which registers a custom-headers getter so every generated hook automatically
 * sends X-SA-Token on every request.
 *
 * The saAuthHeaders() helper is kept for the one binary-download use-case
 * (CSV export via a plain fetch) that cannot use the generated client.
 */

import { setCustomHeadersGetter } from "@workspace/api-client-react";

let SA_TOKEN: string | null = null;

export function setSaToken(token: string | null): void {
  SA_TOKEN = token;
  setCustomHeadersGetter(
    SA_TOKEN !== null ? () => ({ "X-SA-Token": SA_TOKEN! }) : null,
  );
}

/**
 * Returns headers needed for binary downloads (CSV / PDF) that must be
 * fetched with a plain fetch() call instead of the generated client.
 */
export function saAuthHeaders(): Record<string, string> {
  return SA_TOKEN ? { "X-SA-Token": SA_TOKEN } : {};
}
