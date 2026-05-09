import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Star, Facebook, Instagram, Twitter, Youtube, Linkedin, Menu, X as XIcon,
} from "lucide-react";
import type { Section, SiteSettings, Page } from "./types";
import { parseSocial } from "./types";
import { buttonClass } from "./theme";
import { resolveAssetUrl } from "./config";

const SAFE_URL_RE = /^(https?:|mailto:|tel:|\/(?!\/))/i;

function safeUrl(url: string, fallback = ""): string {
  if (!url) return fallback;
  return SAFE_URL_RE.test(url.trim()) ? url.trim() : fallback;
}

function get(c: Record<string, unknown>, k: string, fb = ""): string {
  return typeof c[k] === "string" ? (c[k] as string) : fb;
}
function getBool(c: Record<string, unknown>, k: string, fb = true): boolean {
  return typeof c[k] === "boolean" ? (c[k] as boolean) : fb;
}

// ───── LAZY SECTION IMPORTS — each file is its own chunk ─────
const LazyAppointmentSection = lazy(() => import("./sections/AppointmentSection"));
const LazyFaqSection         = lazy(() => import("./sections/FaqSection"));
const LazyGallerySection     = lazy(() => import("./sections/GallerySection"));
const LazyCustomHtmlSection  = lazy(() => import("./sections/CustomHtmlSection"));
const LazyContactSection     = lazy(() => import("./sections/ContactSection"));

function SectionFallback() {
  return <div style={{ minHeight: 120 }} />;
}

// ───── HEADER ─────
export function HeaderSection({ section, settings, pages, basePath }: { section: Section; settings: SiteSettings; pages: Page[]; basePath: string }) {
  const c = section.config;
  const showLogo = getBool(c, "showLogo", true);
  const ctaLabel = get(c, "ctaLabel", "Book Appointment");
  const ctaUrl = get(c, "ctaUrl", "/appointment");
  const [loc] = useLocation();
  const [open, setOpen] = useState(false);
  const navPages = pages.filter((p) => p.showInNav && p.status === "published");
  useEffect(() => { setOpen(false); }, [loc]);
  const safeCta = safeUrl(ctaUrl, "/appointment");
  const ctaHref = safeCta.startsWith("/") ? `${basePath}${safeCta.replace(/^\//, "")}` : safeCta;
  return (
    <header className="site-header">
      <div className="container-narrow site-header-row">
        <a href="/erp/portal" className={`${buttonClass(settings, "primary")} header-staff-login`} style={{ flexShrink: 0 }}>Staff Login</a>

        <div className="header-right">
          <Link to="/" className={buttonClass(settings, "primary")}>
            {showLogo && settings.logoUrl
              ? <img src={resolveAssetUrl(settings.logoUrl)} alt={settings.siteTitle} style={{ height: 28, maxWidth: 120, objectFit: "contain" }} />
              : <span>{settings.siteTitle || "Clinic"}</span>}
          </Link>
          {navPages.map((p) => (
            <Link key={p.id} to={p.slug === "home" ? "/" : `/${p.slug}`} className={buttonClass(settings, "primary")}>
              {p.title}
            </Link>
          ))}
          {ctaLabel && (
            <a href={ctaHref} className={buttonClass(settings, "primary")}>{ctaLabel}</a>
          )}
        </div>

        {navPages.length > 0 && (
          <button className="nav-toggle" style={{ marginLeft: "auto" }} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? <XIcon size={20} /> : <Menu size={20} />}
          </button>
        )}
      </div>
      {open && navPages.length > 0 && (
        <nav className="nav-mobile" style={{ display: "flex" }}>
          <Link to="/" className={buttonClass(settings, "primary")} style={{ justifyContent: "center" }}>{settings.siteTitle || "Clinic"}</Link>
          {navPages.map((p) => (
            <Link key={p.id} to={p.slug === "home" ? "/" : `/${p.slug}`} className={buttonClass(settings, "primary")} style={{ justifyContent: "center", marginTop: ".25rem" }}>
              {p.title}
            </Link>
          ))}
          {ctaLabel && (
            <a href={ctaHref} className={buttonClass(settings, "primary")} style={{ justifyContent: "center", marginTop: ".25rem" }}>{ctaLabel}</a>
          )}
          <a href="/erp/portal" className={buttonClass(settings, "primary")} style={{ justifyContent: "center", marginTop: ".25rem" }}>Staff Login</a>
        </nav>
      )}
    </header>
  );
}

// ───── HERO ─────
export function HeroSection({ section, settings, basePath }: { section: Section; settings: SiteSettings; basePath: string }) {
  const c = section.config;
  const heading = get(c, "heading", "Welcome");
  const subheading = get(c, "subheading");
  const imageUrl = get(c, "imageUrl");
  const ctaLabel = get(c, "ctaLabel");
  const ctaUrl = get(c, "ctaUrl", "#");
  return (
    <section className="section" style={{
      background: imageUrl
        ? `linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.55)), url(${resolveAssetUrl(imageUrl)}) center/cover`
        : `linear-gradient(135deg, hsl(var(--site-primary)) 0%, hsl(var(--site-primary) / 0.75) 100%)`,
      color: imageUrl ? "white" : "hsl(var(--site-primary-fg))",
      minHeight: "55vh",
      display: "flex",
      alignItems: "center",
    }}>
      <div className="container-narrow text-center">
        <h1 className="h-display" style={{ marginBottom: "1rem" }}>{heading}</h1>
        {subheading && <p style={{ fontSize: "clamp(1rem, 1.5vw, 1.2rem)", maxWidth: 700, margin: "0 auto 1.5rem", opacity: 0.95 }}>{subheading}</p>}
        {ctaLabel && (
          <a href={(() => { const s = safeUrl(ctaUrl, "#"); return s.startsWith("/") ? `${basePath}${s.replace(/^\//, "")}` : s; })()}
             className={buttonClass(settings, "primary")}
             style={{ background: "white", color: "hsl(var(--site-primary))" }}>
            {ctaLabel}
          </a>
        )}
        {settings.tagline && !subheading && <p style={{ marginTop: "1rem", opacity: 0.9 }}>{settings.tagline}</p>}
      </div>
    </section>
  );
}

// ───── SERVICES ─────
export function ServicesSection({ section }: { section: Section }) {
  const c = section.config;
  const heading = get(c, "heading", "Our Services");
  const items = Array.isArray(c.items) ? (c.items as Array<{ title: string; desc: string }>) : [];
  return (
    <section className="section muted-bg">
      <div className="container-narrow">
        <h2 className="h-section text-center" style={{ marginBottom: "2rem" }}>{heading}</h2>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {items.map((it, i) => (
            <div key={i} className="card-soft">
              <h3 style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: ".4rem" }}>{it.title}</h3>
              <p className="subtle" style={{ fontSize: ".95rem" }}>{it.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───── REVIEWS ─────
export function ReviewsSection({ section }: { section: Section }) {
  const c = section.config;
  const heading = get(c, "heading", "What Patients Say");
  const items = Array.isArray(c.items) ? (c.items as Array<{ name: string; rating: number; text: string }>) : [];
  return (
    <section className="section muted-bg">
      <div className="container-narrow">
        <h2 className="h-section text-center" style={{ marginBottom: "2rem" }}>{heading}</h2>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {items.map((it, i) => (
            <div key={i} className="card-soft">
              <div style={{ display: "flex", gap: 2, color: "#f59e0b", marginBottom: ".5rem" }}>
                {Array.from({ length: Math.max(0, Math.min(5, Number(it.rating) || 5)) }).map((_, j) => <Star key={j} size={16} fill="currentColor" />)}
              </div>
              <p style={{ fontSize: ".95rem", marginBottom: ".75rem" }}>"{it.text}"</p>
              <div style={{ fontWeight: 600, fontSize: ".9rem" }}>— {it.name}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───── CONNECT ─────
export function ConnectSection({ section, settings }: { section: Section; settings: SiteSettings }) {
  const heading = get(section.config, "heading", "Connect With Us");
  const social = parseSocial(settings.socialLinks);
  const items: Array<[string, React.ReactNode]> = [
    ["facebook",  <Facebook  size={20} key="f" />],
    ["instagram", <Instagram size={20} key="i" />],
    ["twitter",   <Twitter   size={20} key="t" />],
    ["youtube",   <Youtube   size={20} key="y" />],
    ["linkedin",  <Linkedin  size={20} key="l" />],
  ];
  return (
    <section className="section muted-bg">
      <div className="container-narrow text-center">
        <h2 className="h-section" style={{ marginBottom: "1.5rem" }}>{heading}</h2>
        <div style={{ display: "flex", gap: ".75rem", justifyContent: "center", flexWrap: "wrap" }}>
          {items.filter(([k]) => social[k] && safeUrl(social[k])).map(([k, icon]) => (
            <a key={k} href={safeUrl(social[k])} target="_blank" rel="noreferrer"
               style={{ width: 48, height: 48, borderRadius: 9999, background: "hsl(var(--site-primary))", color: "hsl(var(--site-primary-fg))", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {icon}
            </a>
          ))}
          {Object.keys(social).filter((k) => !["facebook","instagram","twitter","youtube","linkedin"].includes(k) && social[k]).length === 0 && Object.keys(social).every((k) => !social[k]) && (
            <span className="subtle">Add social links in your Site Profile.</span>
          )}
        </div>
      </div>
    </section>
  );
}

// ───── SUBSCRIBE ─────
export function SubscribeSection({ section, settings }: { section: Section; settings: SiteSettings }) {
  const c = section.config;
  const heading = get(c, "heading", "Subscribe");
  const subheading = get(c, "subheading");
  const placeholder = get(c, "placeholder", "your@email.com");
  const submitLabel = get(c, "submitLabel", "Subscribe");
  const [done, setDone] = useState(false);
  return (
    <section className="section">
      <div className="container-narrow text-center" style={{ maxWidth: 540 }}>
        <h2 className="h-section">{heading}</h2>
        {subheading && <p className="subtle" style={{ marginTop: ".5rem", marginBottom: "1.25rem" }}>{subheading}</p>}
        {done ? <div className="card-soft" style={{ marginTop: "1rem" }}>Thanks for subscribing!</div> : (
          <form onSubmit={(e) => { e.preventDefault(); setDone(true); }} style={{ display: "flex", gap: ".5rem", marginTop: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
            <input className="input-soft" type="email" required placeholder={placeholder} style={{ flex: "1 1 240px", minWidth: 0 }} />
            <button type="submit" className={buttonClass(settings, "primary")}>{submitLabel}</button>
          </form>
        )}
      </div>
    </section>
  );
}

// ───── FOOTER ─────
export function FooterSection({ section, settings, basePath }: { section: Section; settings: SiteSettings; basePath: string }) {
  const c = section.config;
  const text = get(c, "text", `© ${new Date().getFullYear()} ${settings.siteTitle}`);
  const links = Array.isArray(c.links) ? (c.links as Array<{ label: string; url: string }>) : [];
  return (
    <footer style={{ background: "hsl(var(--site-fg))", color: "hsl(var(--site-bg))", padding: "2.5rem 1.25rem" }}>
      <div className="container-narrow" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
        <div style={{ opacity: 0.85, fontSize: ".95rem" }}>{text}</div>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          {links.map((l, i) => {
            const s = safeUrl(l.url, "#");
            const href = s.startsWith("/") ? `${basePath}${s.replace(/^\//, "")}` : s;
            return (
              <a key={i} href={href}
                 style={{ color: "inherit", opacity: 0.85, textDecoration: "underline" }}>{l.label}</a>
            );
          })}
        </div>
      </div>
    </footer>
  );
}

// ───── DISPATCHER ─────
export function SectionRenderer(props: { section: Section; settings: SiteSettings; pages: Page[]; basePath: string }) {
  const { section } = props;
  if (!section.enabled) return null;
  switch (section.type) {
    case "header":    return <HeaderSection {...props} />;
    case "hero":      return <HeroSection {...props} />;
    case "services":  return <ServicesSection section={section} />;
    case "reviews":   return <ReviewsSection section={section} />;
    case "connect":   return <ConnectSection section={section} settings={props.settings} />;
    case "subscribe": return <SubscribeSection section={section} settings={props.settings} />;
    case "footer":    return <FooterSection {...props} />;
    case "appointment":
      return (
        <Suspense fallback={<SectionFallback />}>
          <LazyAppointmentSection section={section} settings={props.settings} />
        </Suspense>
      );
    case "faq":
      return (
        <Suspense fallback={<SectionFallback />}>
          <LazyFaqSection section={section} />
        </Suspense>
      );
    case "gallery":
      return (
        <Suspense fallback={<SectionFallback />}>
          <LazyGallerySection section={section} />
        </Suspense>
      );
    case "custom_html":
      return (
        <Suspense fallback={<SectionFallback />}>
          <LazyCustomHtmlSection section={section} />
        </Suspense>
      );
    case "contact":
      return (
        <Suspense fallback={<SectionFallback />}>
          <LazyContactSection section={section} settings={props.settings} />
        </Suspense>
      );
    default: return null;
  }
}
