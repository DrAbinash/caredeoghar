import type { SiteSettings, Page, Faq, Photo, Popup } from "./types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  settings: () => get<SiteSettings>("/api/website/settings"),
  pages:    () => get<{ pages: Page[] }>("/api/website/pages"),
  page:     (id: number) => get<Page>(`/api/website/pages/${id}`),
  faqs:     () => get<{ faqs: Faq[] }>("/api/website/faqs"),
  photos:   (category?: string) => get<{ photos: Photo[] }>(`/api/website/photos${category && category !== "general" ? `?category=${encodeURIComponent(category)}` : ""}`),
  popups:   () => get<{ popups: Popup[] }>("/api/website/popups"),
};
