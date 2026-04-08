import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "sa_token";
const POLL_INTERVAL = 30_000; // 30 seconds

export type SuperAdminState = {
  isActive: boolean;
  userName: string | null;
  isLoading: boolean;
  eject: () => void;
};

async function verifyToken(token: string): Promise<{ active: boolean; userName: string | null }> {
  try {
    const res = await fetch(`/api/super-admin/verify?token=${encodeURIComponent(token)}`);
    if (!res.ok) return { active: false, userName: null };
    return res.json();
  } catch {
    return { active: false, userName: null };
  }
}

export function useSuperAdmin(): SuperAdminState {
  const [token, setToken] = useState<string | null>(() => {
    // On first render, also capture token from URL if present
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get("sa_token");
      if (urlToken) {
        localStorage.setItem(STORAGE_KEY, urlToken);
        // Clean the token from the URL without page reload
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete("sa_token");
        window.history.replaceState({}, "", newUrl.toString());
        return urlToken;
      }
      return localStorage.getItem(STORAGE_KEY);
    }
    return null;
  });

  const [isActive, setIsActive] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!!token);

  const check = useCallback(async (currentToken: string | null) => {
    if (!currentToken) {
      setIsActive(false);
      setUserName(null);
      setIsLoading(false);
      return;
    }
    const result = await verifyToken(currentToken);
    setIsActive(result.active);
    setUserName(result.active ? result.userName : null);
    if (!result.active) {
      // Token expired — clear from storage
      localStorage.removeItem(STORAGE_KEY);
      setToken(null);
    }
    setIsLoading(false);
  }, []);

  // Initial check
  useEffect(() => {
    check(token);
  }, [token, check]);

  // Poll every 30 seconds while active
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => check(token), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [token, check]);

  // Listen for storage changes (if another tab logs out)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const newToken = e.newValue;
        setToken(newToken);
        if (!newToken) {
          setIsActive(false);
          setUserName(null);
        }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const eject = useCallback(async () => {
    const currentToken = localStorage.getItem(STORAGE_KEY);
    if (currentToken) {
      try {
        await fetch("/api/super-admin/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: currentToken }),
        });
      } catch { /* ignore */ }
    }
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setIsActive(false);
    setUserName(null);
  }, []);

  return { isActive, userName, isLoading, eject };
}

export function getSuperAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}
