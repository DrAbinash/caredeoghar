import type { SiteSettings, Page, Faq, Photo, Popup } from "./types";
import { API_BASE } from "./config";

async function get<T>(path: string): Promise<T> {
  const url = API_BASE ? `${API_BASE}${path}` : path;
  // Cross-origin (when API_BASE is set) sends no cookies; same-origin keeps them.
  const credentials: RequestCredentials = API_BASE ? "omit" : "same-origin";
  const res = await fetch(url, { credentials });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  settings:      () => get<SiteSettings>("/api/website/settings"),
  pages:         () => get<{ pages: Page[] }>("/api/website/pages"),
  page:          (id: number) => get<Page>(`/api/website/pages/${id}`),
  faqs:          () => get<{ faqs: Faq[] }>("/api/website/faqs"),
  photos:        (category?: string) => get<{ photos: Photo[] }>(`/api/website/photos${category && category !== "general" ? `?category=${encodeURIComponent(category)}` : ""}`),
  popups:        () => get<{ popups: Popup[] }>("/api/website/popups"),
  verifyPreview: (token: string) => get<{ valid: boolean }>(`/api/website/verify-preview?token=${encodeURIComponent(token)}`),
};
