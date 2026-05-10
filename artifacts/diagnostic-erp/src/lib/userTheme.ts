import { useState, useEffect, useCallback } from "react";
import { api } from "./fetchApi";
import { readStaffSession, writeStaffSession } from "./staffSession";

const LS_PREFIX = "sidebar_theme_user_";
const CHANGE_EVENT = "user-theme-change";

export function getUserTheme(userId: number | string): string | null {
  try {
    return window.localStorage.getItem(LS_PREFIX + userId) ?? null;
  } catch {
    return null;
  }
}

// Keep the in-memory ERP session object in sync so that after a within-session
// theme write or clear the next render sees the correct session.user.sidebarTheme.
// This is what allows the "account value first" precedence to work correctly even
// between the moment the user clicks a swatch and the next login.
function syncSessionTheme(userId: number | string, themeId: string | null): void {
  try {
    const sess = readStaffSession();
    if (sess && sess.user.id === Number(userId)) {
      writeStaffSession({ ...sess, user: { ...sess.user, sidebarTheme: themeId } });
    }
  } catch { /* ignore */ }
}

export function setUserTheme(userId: number | string, themeId: string): void {
  try {
    window.localStorage.setItem(LS_PREFIX + userId, themeId);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { userId: String(userId), themeId } }));
  } catch { /* ignore */ }
  // Keep session current for the precedence chain on next render.
  syncSessionTheme(userId, themeId);
  // Persist to DB in background — localStorage + session are the immediate cache.
  // Failure is silently swallowed so a network hiccup never breaks theming.
  void api.patch(`/api/users/${userId}/sidebar-theme`, { sidebarTheme: themeId }).catch(() => {});
}

export function clearUserTheme(userId: number | string): void {
  try {
    window.localStorage.removeItem(LS_PREFIX + userId);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { userId: String(userId), themeId: null } }));
  } catch { /* ignore */ }
  // Null the session theme so the UI immediately falls back to clinic default.
  syncSessionTheme(userId, null);
  // Reset on server so the next login on any device also falls back to clinic default.
  void api.patch(`/api/users/${userId}/sidebar-theme`, { sidebarTheme: null }).catch(() => {});
}

/**
 * React hook for the per-user sidebar theme.
 *
 * Precedence (highest to lowest):
 *   1. `serverTheme` — the DB value passed in from the staff-login session.
 *      When provided (even as `null`) it is always authoritative: a non-null
 *      value wins over stale localStorage; an explicit `null` (user reset) is
 *      NOT overridden by a stale local cache.
 *      After a write/clear, `syncSessionTheme` keeps the session current so
 *      the next render always has an up-to-date `serverTheme`.
 *   2. localStorage (`sidebar_theme_user_<id>`) — fallback when no session
 *      exists (e.g. ERP opened without logging in through the portal).
 *   3. Callers should fall back to the clinic-wide default and then "navy".
 *
 * @param userId       The authenticated user's id (or null/undefined).
 * @param serverTheme  `session.user.sidebarTheme` — the DB value at login,
 *                     kept current by `syncSessionTheme` on every write/clear.
 *                     Pass `undefined` (or omit) when there is no session.
 */
export function useUserTheme(
  userId: number | string | null | undefined,
  serverTheme?: string | null,
): {
  userTheme: string | null;
  setTheme: (id: string) => void;
  clearTheme: () => void;
} {
  // Resolve with account value first; only fall back to localStorage when
  // serverTheme is undefined (no active session at all).
  function resolve(): string | null {
    if (userId == null) return null;
    return serverTheme !== undefined ? serverTheme : (getUserTheme(userId) ?? null);
  }

  const [userTheme, setLocal] = useState<string | null>(resolve);

  useEffect(() => {
    // Re-resolve whenever userId or the account value changes.
    // serverTheme is kept fresh by syncSessionTheme after every write/clear.
    setLocal(resolve());

    if (userId == null) return;

    const handler = (e: Event) => {
      const { userId: uid } = (e as CustomEvent<{ userId: string; themeId: string | null }>).detail;
      if (uid !== String(userId)) return;
      // After setUserTheme/clearUserTheme:
      //   • localStorage has been updated (or removed) already.
      //   • syncSessionTheme has updated session.user.sidebarTheme.
      // Read localStorage here; the next render will pass the updated
      // serverTheme so the effect re-runs and confirms the resolved value.
      setLocal(getUserTheme(userId));
    };
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  }, [userId, serverTheme]); // eslint-disable-line react-hooks/exhaustive-deps

  const setTheme = useCallback((id: string) => {
    if (userId != null) setUserTheme(userId, id);
  }, [userId]);

  const clearTheme = useCallback(() => {
    if (userId != null) clearUserTheme(userId);
  }, [userId]);

  return { userTheme, setTheme, clearTheme };
}
