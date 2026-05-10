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

// Keep the in-memory ERP session object in sync so Layout.tsx doesn't read
// a stale session.user.sidebarTheme after a within-session theme change.
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
  // Keep the session object current so a hard-reload shows the right theme immediately.
  syncSessionTheme(userId, themeId);
  // Persist to DB in background — localStorage is the immediate cache.
  // Failure is silently swallowed so a network hiccup never breaks theming.
  void api.patch(`/api/users/${userId}/sidebar-theme`, { sidebarTheme: themeId }).catch(() => {});
}

export function clearUserTheme(userId: number | string): void {
  try {
    window.localStorage.removeItem(LS_PREFIX + userId);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { userId: String(userId), themeId: null } }));
  } catch { /* ignore */ }
  // Clear session too so the UI immediately falls back to clinic default within this session.
  syncSessionTheme(userId, null);
  // Reset on server so the next login on any device falls back to clinic default.
  void api.patch(`/api/users/${userId}/sidebar-theme`, { sidebarTheme: null }).catch(() => {});
}

/**
 * React hook for the per-user sidebar theme.
 *
 * @param userId       The authenticated user's id.
 * @param serverTheme  The DB value returned by the staff-login response
 *                     (session.user.sidebarTheme). Used ONLY to seed
 *                     localStorage on a fresh device where no local value
 *                     exists yet. Has no effect if localStorage already
 *                     contains a value for this user.
 */
export function useUserTheme(
  userId: number | string | null | undefined,
  serverTheme?: string | null,
): {
  userTheme: string | null;
  setTheme: (id: string) => void;
  clearTheme: () => void;
} {
  const [userTheme, setLocal] = useState<string | null>(() => {
    if (userId == null) return null;
    const local = getUserTheme(userId);
    if (local === null && serverTheme) {
      // Seed localStorage from the login-time DB value on a fresh device.
      // This gives localStorage an authoritative starting point without an
      // extra API fetch, and lets the existing reactive machinery take over.
      try {
        window.localStorage.setItem(LS_PREFIX + userId, serverTheme);
      } catch { /* ignore */ }
      return serverTheme;
    }
    return local;
  });

  useEffect(() => {
    if (userId == null) { setLocal(null); return; }
    // Re-read after userId changes (e.g. different staff logs in on same tab).
    const local = getUserTheme(userId);
    if (local === null && serverTheme) {
      try { window.localStorage.setItem(LS_PREFIX + userId, serverTheme); } catch { /* ignore */ }
      setLocal(serverTheme);
    } else {
      setLocal(local);
    }
    const handler = (e: Event) => {
      const { userId: uid } = (e as CustomEvent<{ userId: string; themeId: string | null }>).detail;
      if (uid === String(userId)) setLocal(getUserTheme(userId));
    };
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  }, [userId]); // intentionally omit serverTheme — seed only once per userId

  const setTheme = useCallback((id: string) => {
    if (userId != null) setUserTheme(userId, id);
  }, [userId]);

  const clearTheme = useCallback(() => {
    if (userId != null) clearUserTheme(userId);
  }, [userId]);

  return { userTheme, setTheme, clearTheme };
}
