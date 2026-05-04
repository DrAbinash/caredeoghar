import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Phone, Mail, MapPin, Star, ChevronDown, Facebook, Instagram, Twitter, Youtube, Linkedin, Menu, X as XIcon,
} from "lucide-react";
import DOMPurify from "dompurify";
import type { Section, SiteSettings, Page, Faq, Photo } from "./types";
import { parseSocial } from "./types";
import { buttonClass } from "./theme";
import { api } from "./api";
import { resolveAssetUrl } from "./config";

function sanitizeCustomHtml(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["allowfullscreen", "loading", "referrerpolicy", "frameborder", "allow", "target"],
  });
}

function get(c: Record<string, unknown>, k: string, fb = ""): string {
  return typeof c[k] === "string" ? (c[k] as string) : fb;
}
function getBool(c: Record<string, unknown>, k: string, fb = true): boolean {
  return typeof c[k] === "boolean" ? (c[k] as boolean) : fb;
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
  const ctaHref = ctaUrl.startsWith("/") ? `${basePath}${ctaUrl.replace(/^\//, "")}` : ctaUrl;
  const isActive = (slug: string) => (loc === "/" && slug === "home") || loc === `/${slug}`;
  return (
    <header className="site-header">
      <div className="container-narrow site-header-row">
        <Link to="/" className="flex items-center gap-2 font-bold" style={{ fontSize: "1.05rem", minWidth: 0 }}>
          {showLogo && settings.logoUrl
            ? <img src={resolveAssetUrl(settings.logoUrl)} alt={settings.siteTitle} style={{ height: 36, maxWidth: 160, objectFit: "contain" }} />
            : <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{settings.siteTitle || "Clinic"}</span>}
        </Link>
        <nav className="nav-desktop">
          {navPages.map((p) => (
            <Link key={p.id} to={p.slug === "home" ? "/" : `/${p.slug}`} className={`nav-link ${isActive(p.slug) ? "active" : ""}`}>
              {p.title}
            </Link>
          ))}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          {ctaLabel && (
            <a href={ctaHref} className={`${buttonClass(settings, "primary")} header-cta-desktop`}>{ctaLabel}</a>
          )}
          {navPages.length > 0 && (
            <button className="nav-toggle" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              {open ? <XIcon size={20} /> : <Menu size={20} />}
            </button>
          )}
        </div>
      </div>
      {open && navPages.length > 0 && (
        <nav className="nav-mobile" style={{ display: "flex" }}>
          {navPages.map((p) => (
            <Link key={p.id} to={p.slug === "home" ? "/" : `/${p.slug}`} className={`nav-link ${isActive(p.slug) ? "active" : ""}`}>
              {p.title}
            </Link>
          ))}
          {ctaLabel && (
            <a href={ctaHref} className={buttonClass(settings, "primary")} style={{ justifyContent: "center", marginTop: ".5rem" }}>{ctaLabel}</a>
          )}
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
          <a href={ctaUrl.startsWith("/") ? `${basePath}${ctaUrl.replace(/^\//, "")}` : ctaUrl}
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

// ───── APPOINTMENT ─────
export function AppointmentSection({ section, settings }: { section: Section; settings: SiteSettings }) {
  const c = section.config;
  const heading = get(c, "heading", "Book an Appointment");
  const subheading = get(c, "subheading");
  const submitLabel = get(c, "submitLabel", "Request Appointment");
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", date: "", note: "" });
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (settings.whatsappNumber) {
      const msg = `Hi, I'd like to book an appointment.\nName: ${form.name}\nPhone: ${form.phone}\nPreferred date: ${form.date}\nNote: ${form.note}`;
      const num = settings.whatsappNumber.replace(/[^0-9]/g, "");
      window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank");
    }
    setSubmitted(true);
  }
  return (
    <section className="section">
      <div className="container-narrow" style={{ maxWidth: 640 }}>
        <h2 className="h-section text-center" style={{ marginBottom: ".5rem" }}>{heading}</h2>
        {subheading && <p className="subtle text-center" style={{ marginBottom: "2rem" }}>{subheading}</p>}
        {submitted ? (
          <div className="card-soft text-center"><strong>Thanks!</strong> Your request has been sent. We'll confirm shortly.</div>
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-3">
            <input className="input-soft" placeholder="Your name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input-soft" placeholder="Phone number" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className="input-soft" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <textarea className="input-soft" placeholder="What test or service?" rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <button type="submit" className={buttonClass(settings, "primary")} style={{ justifyContent: "center" }}>{submitLabel}</button>
          </form>
        )}
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

// ───── CONTACT ─────
export function ContactSection({ section, settings }: { section: Section; settings: SiteSettings }) {
  const c = section.config;
  const heading = get(c, "heading", "Reach Us");
  const mapEmbed = get(c, "mapEmbed");
  const showForm = getBool(c, "showForm", true);
  return (
    <section className="section">
      <div className="container-narrow">
        <h2 className="h-section text-center" style={{ marginBottom: "2rem" }}>{heading}</h2>
        <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <div className="card-soft">
            {settings.address && <p style={{ display: "flex", gap: ".5rem", marginBottom: ".75rem" }}><MapPin size={18} /> {settings.address}</p>}
            {settings.contactPhone && <p style={{ display: "flex", gap: ".5rem", marginBottom: ".75rem" }}><Phone size={18} /> <a href={`tel:${settings.contactPhone}`}>{settings.contactPhone}</a></p>}
            {settings.contactEmail && <p style={{ display: "flex", gap: ".5rem" }}><Mail size={18} /> <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a></p>}
          </div>
          {mapEmbed
            ? <div className="card-soft" style={{ padding: 0, overflow: "hidden", minHeight: 240 }}>
                <iframe src={mapEmbed} style={{ border: 0, width: "100%", height: "100%", minHeight: 240 }} allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="Map" />
              </div>
            : showForm && <ContactForm settings={settings} />}
        </div>
      </div>
    </section>
  );
}

function ContactForm({ settings }: { settings: SiteSettings }) {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  if (submitted) return <div className="card-soft"><strong>Message sent.</strong> We'll get back to you soon.</div>;
  return (
    <form className="card-soft grid gap-2" onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}>
      <input className="input-soft" required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <input className="input-soft" required placeholder="Email or phone" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <textarea className="input-soft" placeholder="How can we help?" rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
      <button type="submit" className={buttonClass(settings, "primary")} style={{ justifyContent: "center" }}>Send Message</button>
    </form>
  );
}

// ───── CONNECT ─────
export function ConnectSection({ section, settings }: { section: Section; settings: SiteSettings }) {
  const c = section.config;
  const heading = get(c, "heading", "Connect With Us");
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
          {items.filter(([k]) => social[k]).map(([k, icon]) => (
            <a key={k} href={social[k]} target="_blank" rel="noreferrer"
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

// ───── FAQ ─────
export function FaqSection({ section }: { section: Section }) {
  const c = section.config;
  const heading = get(c, "heading", "Frequently Asked Questions");
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { api.faqs().then((d) => setFaqs((d.faqs || []).filter((f) => f.enabled))).catch(() => {}); }, []);
  return (
    <section className="section">
      <div className="container-narrow" style={{ maxWidth: 760 }}>
        <h2 className="h-section text-center" style={{ marginBottom: "2rem" }}>{heading}</h2>
        <div className="grid gap-2">
          {faqs.length === 0 && <p className="subtle text-center">No FAQs yet.</p>}
          {faqs.map((f) => (
            <div key={f.id} className="card-soft" style={{ padding: 0 }}>
              <button onClick={() => setOpen(open === f.id ? null : f.id)} style={{ width: "100%", padding: "1rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", background: "transparent", textAlign: "left", fontWeight: 600 }}>
                <span>{f.question}</span>
                <ChevronDown size={18} style={{ transform: open === f.id ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
              </button>
              {open === f.id && <div style={{ padding: "0 1.25rem 1rem" }} className="subtle">{f.answer}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───── GALLERY ─────
export function GallerySection({ section }: { section: Section }) {
  const c = section.config;
  const heading = get(c, "heading", "Gallery");
  const category = get(c, "category", "general");
  const [photos, setPhotos] = useState<Photo[]>([]);
  useEffect(() => { api.photos(category).then((d) => setPhotos(d.photos || [])).catch(() => {}); }, [category]);
  return (
    <section className="section">
      <div className="container-narrow">
        <h2 className="h-section text-center" style={{ marginBottom: "2rem" }}>{heading}</h2>
        {photos.length === 0 ? <p className="subtle text-center">Add photos in the Photo Library.</p> : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
            {photos.map((p) => (
              <div key={p.id} style={{ aspectRatio: "1 / 1", overflow: "hidden", borderRadius: "var(--site-radius)", background: "hsl(var(--site-muted))" }}>
                <img src={resolveAssetUrl(p.url)} alt={p.alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ───── CUSTOM HTML ─────
export function CustomHtmlSection({ section }: { section: Section }) {
  const c = section.config;
  const html = get(c, "html");
  const sanitized = sanitizeCustomHtml(html);
  return <section className="section"><div className="container-narrow" dangerouslySetInnerHTML={{ __html: sanitized }} /></section>;
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
          {links.map((l, i) => (
            <a key={i} href={l.url.startsWith("/") ? `${basePath}${l.url.replace(/^\//, "")}` : l.url}
               style={{ color: "inherit", opacity: 0.85, textDecoration: "underline" }}>{l.label}</a>
          ))}
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
    case "header":      return <HeaderSection {...props} />;
    case "hero":        return <HeroSection {...props} />;
    case "services":    return <ServicesSection section={section} />;
    case "appointment": return <AppointmentSection section={section} settings={props.settings} />;
    case "reviews":     return <ReviewsSection section={section} />;
    case "contact":     return <ContactSection section={section} settings={props.settings} />;
    case "connect":     return <ConnectSection section={section} settings={props.settings} />;
    case "subscribe":   return <SubscribeSection section={section} settings={props.settings} />;
    case "faq":         return <FaqSection section={section} />;
    case "gallery":     return <GallerySection section={section} />;
    case "custom_html": return <CustomHtmlSection section={section} />;
    case "footer":      return <FooterSection {...props} />;
    default:            return null;
  }
}
