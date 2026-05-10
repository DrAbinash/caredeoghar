import { useState, useEffect, useCallback } from "react";
import { api } from "./fetchApi";

const LS_PREFIX = "sidebar_theme_user_";
const CHANGE_EVENT = "user-theme-change";

export function getUserTheme(userId: number | string): string | null {
  try {
    return window.localStorage.getItem(LS_PREFIX + userId) ?? null;
  } catch {
    return null;
  }
}

export function setUserTheme(userId: number | string, themeId: string): void {
  try {
    window.localStorage.setItem(LS_PREFIX + userId, themeId);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { userId: String(userId), themeId } }));
  } catch { /* ignore */ }
  // Persist to server in background — localStorage is the immediate cache.
  // Failure is silently swallowed so a network hiccup never breaks theming.
  void api.patch(`/api/users/${userId}/sidebar-theme`, { sidebarTheme: themeId }).catch(() => {});
}

export function clearUserTheme(userId: number | string): void {
  try {
    window.localStorage.removeItem(LS_PREFIX + userId);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { userId: String(userId), themeId: null } }));
  } catch { /* ignore */ }
  // Reset on server too so the next login on any device falls back to clinic default.
  void api.patch(`/api/users/${userId}/sidebar-theme`, { sidebarTheme: null }).catch(() => {});
}

export function useUserTheme(userId: number | string | null | undefined): {
  userTheme: string | null;
  setTheme: (id: string) => void;
  clearTheme: () => void;
} {
  const [userTheme, setLocal] = useState<string | null>(() =>
    userId != null ? getUserTheme(userId) : null,
  );

  useEffect(() => {
    if (userId == null) { setLocal(null); return; }
    setLocal(getUserTheme(userId));
    const handler = (e: Event) => {
      const { userId: uid } = (e as CustomEvent<{ userId: string; themeId: string | null }>).detail;
      if (uid === String(userId)) setLocal(getUserTheme(userId));
    };
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  }, [userId]);

  const setTheme = useCallback((id: string) => {
    if (userId != null) setUserTheme(userId, id);
  }, [userId]);

  const clearTheme = useCallback(() => {
    if (userId != null) clearUserTheme(userId);
  }, [userId]);

  return { userTheme, setTheme, clearTheme };
}
