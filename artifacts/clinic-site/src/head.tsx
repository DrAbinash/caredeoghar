import { useEffect } from "react";
import type { SiteSettings, Page } from "./types";

function setOrCreate(selector: string, create: () => HTMLElement) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  return el;
}
function setMeta(name: string, content: string, attrName: "name" | "property" = "name") {
  if (!content) return;
  const el = setOrCreate(`meta[${attrName}="${name}"]`, () => {
    const m = document.createElement("meta");
    m.setAttribute(attrName, name);
    return m;
  });
  el.setAttribute("content", content);
}

const MANAGED_HEAD_ID = "site-managed-head";

export function HeadManager({ settings, page }: { settings: SiteSettings; page: Page | null }) {
  useEffect(() => {
    // Title
    const pageTitle = page?.seoMetaTitle || page?.title;
    document.title = pageTitle && settings.siteTitle
      ? `${pageTitle} | ${settings.siteTitle}`
      : pageTitle || settings.siteTitle || settings.seoMetaTitle || "Clinic";

    // Description
    const desc = page?.seoMetaDescription || settings.seoMetaDescription || settings.tagline;
    setMeta("description", desc);

    // Open Graph
    setMeta("og:title", pageTitle || settings.seoMetaTitle || settings.siteTitle, "property");
    setMeta("og:description", desc, "property");
    if (settings.seoOgImage) setMeta("og:image", settings.seoOgImage, "property");
    setMeta("og:type", "website", "property");

    // Verification meta tags
    setMeta("facebook-domain-verification", settings.facebookMetaTag);
    setMeta("p:domain_verify", settings.pinterestMetaTag);
    setMeta("google-adsense-account", settings.googleAdsenseId);

    // Favicon
    if (settings.faviconUrl) {
      let link = document.head.querySelector<HTMLLinkElement>("link[rel='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = settings.faviconUrl;
    }

    // Custom + analytics scripts (managed wrapper, replaced on each change)
    const old = document.getElementById(MANAGED_HEAD_ID);
    if (old) old.remove();

    const wrap = document.createElement("div");
    wrap.id = MANAGED_HEAD_ID;
    wrap.style.display = "none";
    let html = "";

    if (settings.googleTagManagerId) {
      html += `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${settings.googleTagManagerId}');</script>`;
    }
    if (settings.googleAnalyticsId) {
      html += `<script async src="https://www.googletagmanager.com/gtag/js?id=${settings.googleAnalyticsId}"></script>`;
      html += `<script>window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${settings.googleAnalyticsId}');</script>`;
    }
    if (settings.metaPixelId) {
      html += `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init', '${settings.metaPixelId}');fbq('track', 'PageView');</script>`;
    }
    if (settings.googleAdsenseId) {
      html += `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${settings.googleAdsenseId}" crossorigin="anonymous"></script>`;
    }
    if (settings.customHeadHtml) {
      html += settings.customHeadHtml;
    }
    if (html) {
      wrap.innerHTML = html;
      // Move scripts so they execute (innerHTML scripts won't run by default)
      const scripts = Array.from(wrap.querySelectorAll("script"));
      for (const s of scripts) {
        const newScript = document.createElement("script");
        for (const a of Array.from(s.attributes)) newScript.setAttribute(a.name, a.value);
        if (s.textContent) newScript.textContent = s.textContent;
        s.replaceWith(newScript);
      }
      document.head.appendChild(wrap);
    }
  }, [settings, page]);

  return null;
}
