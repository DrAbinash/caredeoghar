import { useEffect, useMemo, useState } from "react";
import { Router as WouterRouter, useLocation } from "wouter";
import { api } from "./api";
import type { SiteSettings, Page, Popup } from "./types";
import { parseSections } from "./types";
import { applyTheme } from "./theme";
import { HeadManager } from "./head";
import { SectionRenderer } from "./sections";
import { WhatsAppFab, PopupHost } from "./widgets";

const BASE = import.meta.env.BASE_URL; // includes trailing slash, e.g. "/site/"
const ROUTER_BASE = BASE.replace(/\/$/, "");

function isPreview(): boolean {
  return new URLSearchParams(window.location.search).get("preview") === "1";
}

function PageView({ slug, settings, pages, popups }: { slug: string; settings: SiteSettings; pages: Page[]; popups: Popup[] }) {
  const preview = isPreview();
  const page = useMemo(() => {
    const list = preview ? pages : pages.filter((p) => p.status === "published");
    const exact = list.find((p) => p.slug === slug);
    if (exact) return exact;
    // Only fall back to home for the root path itself
    if (slug === "home") return list.find((p) => p.slug === "home") ?? null;
    return null;
  }, [pages, slug, preview]);

  if (!page) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
        <div>
          <h1 className="h-section">Page not found</h1>
          <p className="subtle" style={{ marginTop: ".5rem" }}>The page "/{slug}" doesn't exist or isn't published.</p>
          <a href={BASE} className="btn-primary" style={{ marginTop: "1rem" }}>← Home</a>
        </div>
      </div>
    );
  }
  const sections = parseSections(page.sections).filter((s) => s.enabled);
  return (
    <>
      <HeadManager settings={settings} page={page} />
      {sections.map((s) => (
        <SectionRenderer key={s.id} section={s} settings={settings} pages={pages} basePath={BASE} />
      ))}
      <PopupHost popups={popups} currentSlug={page.slug} basePath={BASE} />
    </>
  );
}

function AppShell({ settings, pages, popups }: { settings: SiteSettings; pages: Page[]; popups: Popup[] }) {
  const [loc] = useLocation();
  const slug = loc === "/" || loc === "" ? "home" : loc.replace(/^\//, "").split("/")[0];
  const preview = isPreview();
  const showSiteContent = preview || settings.isPublished;

  if (!showSiteContent) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
        <div>
          <h1 className="h-display">Coming soon</h1>
          <p className="subtle" style={{ marginTop: ".75rem", maxWidth: 480 }}>
            This site hasn't been published yet. The owner can preview drafts by appending <code>?preview=1</code> to the URL.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {preview && <div className="preview-banner">Preview mode — showing drafts. Visitors won't see this until you publish.</div>}
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }} className={preview ? "pt-8" : ""}>
        <PageView slug={slug} settings={settings} pages={pages} popups={popups} />
        <WhatsAppFab settings={settings} />
      </div>
    </>
  );
}

function App() {
  const [data, setData] = useState<{ settings: SiteSettings; pages: Page[]; popups: Popup[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.settings(), api.pages(), api.popups().catch(() => ({ popups: [] }))])
      .then(([settings, pageRes, popupRes]) => {
        applyTheme(settings);
        setData({ settings, pages: pageRes.pages || [], popups: popupRes.popups || [] });
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return <div style={{ padding: "3rem", textAlign: "center" }}><h1 className="h-section">Site unavailable</h1><p className="subtle">{error}</p></div>;
  }
  if (!data) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><div className="subtle">Loading…</div></div>;
  }

  return (
    <WouterRouter base={ROUTER_BASE}>
      <AppShell settings={data.settings} pages={data.pages} popups={data.popups} />
    </WouterRouter>
  );
}

export default App;
