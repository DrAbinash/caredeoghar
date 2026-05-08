import { useEffect, useMemo, useState } from "react";
import { Router as WouterRouter, useLocation } from "wouter";
import { api, setPreviewToken } from "./api";
import type { SiteSettings, Page, Popup } from "./types";
import { parseSections } from "./types";
import { applyTheme } from "./theme";
import { HeadManager } from "./head";
import { SectionRenderer } from "./sections";
import { WhatsAppFab, PopupHost } from "./widgets";

const BASE = import.meta.env.BASE_URL; // includes trailing slash, e.g. "/site/"
const ROUTER_BASE = BASE.replace(/\/$/, "");

// Preview mode requires a short-lived server-issued token passed as
// `?preview_token=<uuid>`.  The bare `?preview=1` flag is no longer
// accepted because it let any unauthenticated visitor view draft content.
function getPreviewToken(): string {
  return new URLSearchParams(window.location.search).get("preview_token") ?? "";
}

function PageView({ slug, settings, pages, popups, isPreview }: { slug: string; settings: SiteSettings; pages: Page[]; popups: Popup[]; isPreview: boolean }) {
  const page = useMemo(() => {
    const list = isPreview ? pages : pages.filter((p) => p.status === "published");
    const exact = list.find((p) => p.slug === slug);
    if (exact) return exact;
    // Only fall back to home for the root path itself
    if (slug === "home") return list.find((p) => p.slug === "home") ?? null;
    return null;
  }, [pages, slug, isPreview]);

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
  const hasHeader = sections.some((s) => s.type === "header");
  const hasFooter = sections.some((s) => s.type === "footer");
  const defaultHeader = { id: "__auto_header", type: "header", enabled: true, config: {} } as const;
  const defaultFooter = { id: "__auto_footer", type: "footer", enabled: true, config: {} } as const;
  return (
    <>
      <HeadManager settings={settings} page={page} />
      {!hasHeader && <SectionRenderer section={defaultHeader} settings={settings} pages={pages} basePath={BASE} />}
      <main style={{ flex: "1 1 auto" }}>
        {sections.map((s) => (
          <SectionRenderer key={s.id} section={s} settings={settings} pages={pages} basePath={BASE} />
        ))}
      </main>
      {!hasFooter && <SectionRenderer section={defaultFooter} settings={settings} pages={pages} basePath={BASE} />}
      <PopupHost popups={popups} currentSlug={page.slug} basePath={BASE} />
    </>
  );
}

function AppShell({ settings, pages, popups, isPreview }: { settings: SiteSettings; pages: Page[]; popups: Popup[]; isPreview: boolean }) {
  const [loc] = useLocation();
  const slug = loc === "/" || loc === "" ? "home" : loc.replace(/^\//, "").split("/")[0];
  const showSiteContent = true;

  if (!showSiteContent) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
        <div>
          <h1 className="h-display">Coming soon</h1>
          <p className="subtle" style={{ marginTop: ".75rem", maxWidth: 480 }}>
            This site hasn't been published yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {isPreview && <div className="preview-banner">Preview mode — showing drafts. Visitors won't see this until you publish.</div>}
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }} className={isPreview ? "pt-8" : ""}>
        <PageView slug={slug} settings={settings} pages={pages} popups={popups} isPreview={isPreview} />
        <WhatsAppFab settings={settings} />
      </div>
    </>
  );
}

type PreviewState = "idle" | "verifying" | "valid" | "invalid";

function App() {
  const [data, setData] = useState<{ settings: SiteSettings; pages: Page[]; popups: Popup[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>("idle");

  const previewToken = getPreviewToken();

  useEffect(() => {
    if (!previewToken) {
      setPreviewState("idle");
      return;
    }
    setPreviewState("verifying");
    api.verifyPreview(previewToken)
      .then((r) => setPreviewState(r.valid ? "valid" : "invalid"))
      .catch(() => setPreviewState("invalid"));
  }, [previewToken]);

  useEffect(() => {
    if (previewToken && previewState === "verifying") return;

    if (previewToken && previewState === "valid") {
      setPreviewToken(previewToken);
    }

    Promise.all([api.settings(), api.pages(), api.popups().catch(() => ({ popups: [] }))])
      .then(([settings, pageRes, popupRes]) => {
        applyTheme(settings);
        setData({ settings, pages: pageRes.pages || [], popups: popupRes.popups || [] });
      })
      .catch((e: Error) => setError(e.message));
  }, [previewToken, previewState]);

  const isPreview = previewState === "valid";

  if (previewToken && previewState === "verifying") {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><div className="subtle">Verifying preview access…</div></div>;
  }

  if (previewToken && previewState === "invalid") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
        <div>
          <h1 className="h-section">Preview link expired</h1>
          <p className="subtle" style={{ marginTop: ".5rem", maxWidth: 420, margin: ".5rem auto 0" }}>
            This preview link is invalid or has expired. Please generate a new one from the Website Builder.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return <div style={{ padding: "3rem", textAlign: "center" }}><h1 className="h-section">Site unavailable</h1><p className="subtle">{error}</p></div>;
  }
  if (!data) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><div className="subtle">Loading…</div></div>;
  }

  return (
    <WouterRouter base={ROUTER_BASE}>
      <AppShell settings={data.settings} pages={data.pages} popups={data.popups} isPreview={isPreview} />
    </WouterRouter>
  );
}

export default App;
