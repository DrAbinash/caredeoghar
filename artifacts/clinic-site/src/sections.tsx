import { useEffect, useState, useMemo } from "react";
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
  const isActive = (slug: string) => (loc === "/" && slug === "home") || loc === `/${slug}`;
  return (
    <header className="site-header">
      <div className="container-narrow site-header-row">
        {/* Far left — Staff Login (always visible, compact on mobile) */}
        <a href="/erp/portal" className={`${buttonClass(settings, "primary")} header-staff-login`} style={{ flexShrink: 0 }}>Staff Login</a>

        {/* Far right — Clinic name + nav links + CTA, hidden on mobile (in hamburger instead) */}
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

        {/* Mobile hamburger */}
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

// ───── APPOINTMENT / BOOK NOW ─────
type BookingConfig = { enabled: boolean; keyId: string; vipEnabled: boolean };
type TestItem = { id: number; code: string; name: string; category: string; price: string };
type PkgItem  = { id: number; code: string; name: string; price: string; description: string };

async function bookingGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) { const e = await res.json().catch(() => ({})) as { error?: string }; throw new Error(e.error || res.statusText); }
  return res.json() as Promise<T>;
}

async function bookingPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
  if (!res.ok) { const e = await res.json().catch(() => ({})) as { error?: string }; throw new Error(e.error || res.statusText); }
  return res.json() as Promise<T>;
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as unknown as Record<string, unknown>).Razorpay) { resolve(true); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export function AppointmentSection({ section, settings }: { section: Section; settings: SiteSettings }) {
  const c = section.config;
  const heading = get(c, "heading", "Book an Appointment");
  const subheading = get(c, "subheading");

  const [config, setConfig] = useState<BookingConfig | null>(null);
  const [tests, setTests] = useState<TestItem[]>([]);
  const [pkgs, setPkgs] = useState<PkgItem[]>([]);
  const [step, setStep] = useState<"form" | "select" | "pay" | "done">("form");
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [successRef, setSuccessRef] = useState("");
  const [catFilter, setCatFilter] = useState("all");

  // Patient details
  const [pd, setPd] = useState({ name: "", phone: "", email: "", date: "", notes: "", isVip: false });
  // Selected items
  const [selTests, setSelTests] = useState<Set<number>>(new Set());
  const [selPkgs, setSelPkgs] = useState<Set<number>>(new Set());

  useEffect(() => {
    bookingGet<BookingConfig>("/api/public/booking/config").then(setConfig).catch(() => setConfig({ enabled: false, keyId: "", vipEnabled: false }));
  }, []);

  const loadCatalog = () => {
    if (tests.length === 0) bookingGet<{ tests: TestItem[] }>("/api/public/booking/tests").then((d) => setTests(d.tests)).catch(() => {});
    if (pkgs.length === 0) bookingGet<{ packages: PkgItem[] }>("/api/public/booking/packages").then((d) => setPkgs(d.packages)).catch(() => {});
  };

  // Compute total from selected tests + packages
  const total = useMemo(() => {
    const t = tests.filter((t) => selTests.has(t.id)).reduce((s, t) => s + Number(t.price), 0);
    const p = pkgs.filter((p) => selPkgs.has(p.id)).reduce((s, p) => s + Number(p.price), 0);
    return t + p;
  }, [tests, pkgs, selTests, selPkgs]);

  const categories = useMemo(() => ["all", ...Array.from(new Set(tests.map((t) => t.category))).sort()], [tests]);

  const filteredTests = useMemo(() => catFilter === "all" ? tests : tests.filter((t) => t.category === catFilter), [tests, catFilter]);

  const toggleTest = (id: number) => setSelTests((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const togglePkg  = (id: number) => setSelPkgs((s)  => { const n = new Set(s);  n.has(id) ? n.delete(id) : n.add(id);  return n;  });

  // WhatsApp fallback
  function handleWhatsApp(e: React.FormEvent) {
    e.preventDefault();
    if (settings.whatsappNumber) {
      const msg = `Hi, I'd like to book an appointment.\nName: ${pd.name}\nPhone: ${pd.phone}\nPreferred date: ${pd.date}\nNote: ${pd.notes}`;
      const num = settings.whatsappNumber.replace(/[^0-9]/g, "");
      window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank");
    }
    setStep("done");
  }

  async function handlePay() {
    if (selTests.size === 0 && selPkgs.size === 0) { setError("Please select at least one test or package."); return; }
    setError(""); setPaying(true);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) { setError("Could not load payment gateway. Please try again."); setPaying(false); return; }

      const res = await bookingPost<{ bookingRef: string; razorpayOrderId: string; amountPaise: number; keyId: string }>("/api/public/booking/create-order", {
        name: pd.name, phone: pd.phone, email: pd.email, selectedDate: pd.date,
        testIds: Array.from(selTests), packageIds: Array.from(selPkgs),
        totalAmount: total, notes: pd.notes, isVip: pd.isVip,
      });

      const RZP = (window as unknown as { Razorpay: new (opts: Record<string, unknown>) => { open(): void } }).Razorpay;
      const rzp = new RZP({
        key: res.keyId,
        amount: res.amountPaise,
        currency: "INR",
        order_id: res.razorpayOrderId,
        name: settings.siteTitle || "Diagnostic Center",
        description: `Test booking — ${res.bookingRef}`,
        prefill: { name: pd.name, contact: pd.phone, email: pd.email },
        theme: { color: "#6366f1" },
        handler: async (payment: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await bookingPost<{ success: boolean; bookingRef: string }>("/api/public/booking/verify-payment", {
              razorpayOrderId: payment.razorpay_order_id,
              razorpayPaymentId: payment.razorpay_payment_id,
              razorpaySignature: payment.razorpay_signature,
            });
            setSuccessRef(res.bookingRef);
            setStep("done");
          } catch {
            setError("Payment verification failed. Please contact us with your payment ID: " + payment.razorpay_payment_id);
          }
          setPaying(false);
        },
        modal: { ondismiss: () => setPaying(false) },
      });
      rzp.open();
    } catch (e: unknown) {
      const msg = (e as { message?: string }).message || "Something went wrong.";
      setError(msg); setPaying(false);
    }
  }

  // If online booking not enabled or still loading, show traditional WhatsApp form
  if (!config || !config.enabled) {
    const fallback = !config || !config.enabled;
    const showForm = fallback || !config.keyId;
    if (showForm || step === "form" && !config?.enabled) {
      return (
        <section className="section">
          <div className="container-narrow" style={{ maxWidth: 640 }}>
            <h2 className="h-section text-center" style={{ marginBottom: ".5rem" }}>{heading}</h2>
            {subheading && <p className="subtle text-center" style={{ marginBottom: "2rem" }}>{subheading}</p>}
            {step === "done" ? (
              <div className="card-soft text-center"><strong>Thanks!</strong> Your request has been sent. We'll confirm shortly.</div>
            ) : (
              <form onSubmit={handleWhatsApp} className="grid gap-3">
                <input className="input-soft" placeholder="Your name" required value={pd.name} onChange={(e) => setPd({ ...pd, name: e.target.value })} />
                <input className="input-soft" placeholder="Phone number" required value={pd.phone} onChange={(e) => setPd({ ...pd, phone: e.target.value })} />
                <input className="input-soft" type="date" value={pd.date} onChange={(e) => setPd({ ...pd, date: e.target.value })} />
                <textarea className="input-soft" placeholder="What test or service?" rows={3} value={pd.notes} onChange={(e) => setPd({ ...pd, notes: e.target.value })} />
                <button type="submit" className={buttonClass(settings, "primary")} style={{ justifyContent: "center" }}>Request Appointment</button>
              </form>
            )}
          </div>
        </section>
      );
    }
  }

  // ── Online booking flow ──
  return (
    <section className="section">
      <div className="container-narrow" style={{ maxWidth: 720 }}>
        <h2 className="h-section text-center" style={{ marginBottom: ".5rem" }}>{heading}</h2>
        {subheading && <p className="subtle text-center" style={{ marginBottom: "2rem" }}>{subheading}</p>}

        {step === "done" ? (
          <div className="card-soft text-center" style={{ maxWidth: 480, margin: "0 auto" }}>
            <div style={{ fontSize: "3rem", marginBottom: ".5rem" }}>✅</div>
            <h3 style={{ fontWeight: 700, fontSize: "1.15rem", marginBottom: ".5rem" }}>Payment Successful!</h3>
            <p className="subtle" style={{ marginBottom: "1rem" }}>Your booking reference is</p>
            <div style={{ fontFamily: "monospace", fontSize: "1.3rem", fontWeight: 800, letterSpacing: 2, color: "hsl(var(--site-primary))", marginBottom: "1rem" }}>{successRef}</div>
            <p className="subtle" style={{ fontSize: ".9rem" }}>Please save this reference. Our staff will confirm your appointment shortly. You may receive a call or WhatsApp message.</p>
          </div>
        ) : step === "form" ? (
          <form onSubmit={(e) => { e.preventDefault(); loadCatalog(); setStep("select"); }} className="card-soft grid gap-3" style={{ maxWidth: 520, margin: "0 auto" }}>
            <h3 style={{ fontWeight: 700, marginBottom: ".25rem" }}>Your Details</h3>
            <input className="input-soft" placeholder="Full name *" required value={pd.name} onChange={(e) => setPd({ ...pd, name: e.target.value })} />
            <input className="input-soft" placeholder="Phone number *" required value={pd.phone} onChange={(e) => setPd({ ...pd, phone: e.target.value })} />
            <input className="input-soft" type="email" placeholder="Email (optional)" value={pd.email} onChange={(e) => setPd({ ...pd, email: e.target.value })} />
            <input className="input-soft" type="date" required value={pd.date} onChange={(e) => setPd({ ...pd, date: e.target.value })} min={new Date().toISOString().slice(0, 10)} />
            <textarea className="input-soft" placeholder="Special instructions (optional)" rows={2} value={pd.notes} onChange={(e) => setPd({ ...pd, notes: e.target.value })} />
            {config?.vipEnabled && (
              <label style={{ display: "flex", alignItems: "center", gap: ".5rem", cursor: "pointer", fontSize: ".92rem" }}>
                <input type="checkbox" checked={pd.isVip} onChange={(e) => setPd({ ...pd, isVip: e.target.checked })} style={{ width: 16, height: 16 }} />
                <span>⭐ VIP Queue — priority service</span>
              </label>
            )}
            <button type="submit" className={buttonClass(settings, "primary")} style={{ justifyContent: "center" }}>Next: Choose Tests →</button>
          </form>
        ) : step === "select" ? (
          <div className="grid gap-4">
            {/* Category filter */}
            {categories.length > 2 && (
              <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                {categories.map((cat) => (
                  <button key={cat} onClick={() => setCatFilter(cat)}
                    style={{ padding: ".3rem .8rem", borderRadius: 9999, fontSize: ".85rem", fontWeight: 600, background: catFilter === cat ? "hsl(var(--site-primary))" : "hsl(var(--site-muted))", color: catFilter === cat ? "hsl(var(--site-primary-fg))" : "inherit", border: "none", cursor: "pointer" }}>
                    {cat === "all" ? "All" : cat}
                  </button>
                ))}
              </div>
            )}

            {/* Packages */}
            {pkgs.length > 0 && (
              <div>
                <h3 style={{ fontWeight: 700, marginBottom: ".75rem" }}>Health Packages</h3>
                <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                  {pkgs.map((p) => (
                    <button key={p.id} type="button" onClick={() => togglePkg(p.id)}
                      style={{ textAlign: "left", padding: ".75rem 1rem", borderRadius: "var(--site-radius)", border: `2px solid ${selPkgs.has(p.id) ? "hsl(var(--site-primary))" : "hsl(var(--site-muted))"}`, background: selPkgs.has(p.id) ? "hsl(var(--site-primary) / .07)" : "hsl(var(--site-muted) / .4)", cursor: "pointer", transition: "border-color .15s" }}>
                      <div style={{ fontWeight: 700, fontSize: ".95rem" }}>{p.name}</div>
                      {p.description && <div style={{ fontSize: ".8rem", opacity: .7, marginTop: ".25rem" }}>{p.description}</div>}
                      <div style={{ fontWeight: 700, color: "hsl(var(--site-primary))", marginTop: ".4rem" }}>₹{Number(p.price).toLocaleString("en-IN")}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Individual tests */}
            {filteredTests.length > 0 && (
              <div>
                <h3 style={{ fontWeight: 700, marginBottom: ".75rem" }}>Individual Tests</h3>
                <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
                  {filteredTests.map((t) => (
                    <button key={t.id} type="button" onClick={() => toggleTest(t.id)}
                      style={{ textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", padding: ".6rem .9rem", borderRadius: "var(--site-radius)", border: `1.5px solid ${selTests.has(t.id) ? "hsl(var(--site-primary))" : "hsl(var(--site-muted))"}`, background: selTests.has(t.id) ? "hsl(var(--site-primary) / .07)" : "hsl(var(--site-muted) / .3)", cursor: "pointer" }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: ".9rem" }}>{t.name}</span>
                        <span style={{ fontSize: ".75rem", opacity: .6, marginLeft: ".5rem" }}>{t.code}</span>
                      </div>
                      <span style={{ fontWeight: 700, fontSize: ".9rem", color: "hsl(var(--site-primary))", whiteSpace: "nowrap" }}>₹{Number(t.price).toLocaleString("en-IN")}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Sticky summary */}
            {(selTests.size > 0 || selPkgs.size > 0) && (
              <div className="card-soft" style={{ position: "sticky", bottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap", background: "hsl(var(--site-bg))" }}>
                <div>
                  <span className="subtle">{selTests.size + selPkgs.size} item(s) selected</span>
                  <span style={{ fontWeight: 800, fontSize: "1.15rem", marginLeft: "1rem", color: "hsl(var(--site-primary))" }}>₹{total.toLocaleString("en-IN")}</span>
                </div>
                <button type="button" className={buttonClass(settings, "primary")} onClick={() => setStep("pay")} style={{ justifyContent: "center" }}>Review &amp; Pay →</button>
              </div>
            )}
          </div>
        ) : (
          /* step === "pay" */
          <div className="card-soft" style={{ maxWidth: 520, margin: "0 auto" }}>
            <h3 style={{ fontWeight: 700, marginBottom: "1rem" }}>Order Summary</h3>
            <div style={{ marginBottom: "1rem" }}>
              <div className="subtle" style={{ marginBottom: ".4rem", fontSize: ".85rem" }}>Patient Details</div>
              <div style={{ fontWeight: 600 }}>{pd.name} · {pd.phone}</div>
              <div className="subtle" style={{ fontSize: ".9rem" }}>Appointment: {pd.date}{pd.isVip ? " · ⭐ VIP" : ""}</div>
            </div>
            <div style={{ borderTop: "1px solid hsl(var(--site-muted))", paddingTop: ".75rem", marginBottom: ".75rem" }}>
              {tests.filter((t) => selTests.has(t.id)).map((t) => (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: ".3rem 0", fontSize: ".9rem" }}>
                  <span>{t.name}</span><span style={{ fontWeight: 600 }}>₹{Number(t.price).toLocaleString("en-IN")}</span>
                </div>
              ))}
              {pkgs.filter((p) => selPkgs.has(p.id)).map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: ".3rem 0", fontSize: ".9rem" }}>
                  <span>{p.name} (Package)</span><span style={{ fontWeight: 600 }}>₹{Number(p.price).toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: "1.1rem", borderTop: "2px solid hsl(var(--site-primary) / .3)", paddingTop: ".75rem", marginBottom: "1.25rem" }}>
              <span>Total</span><span style={{ color: "hsl(var(--site-primary))" }}>₹{total.toLocaleString("en-IN")}</span>
            </div>
            {error && <div style={{ color: "red", fontSize: ".85rem", marginBottom: ".75rem", padding: ".5rem .75rem", background: "hsl(0 85% 95%)", borderRadius: "var(--site-radius)" }}>{error}</div>}
            <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
              <button type="button" className={buttonClass(settings, "outline")} onClick={() => setStep("select")} style={{ justifyContent: "center" }}>← Back</button>
              <button type="button" className={buttonClass(settings, "primary")} onClick={handlePay} disabled={paying} style={{ justifyContent: "center", flex: 1 }}>
                {paying ? "Processing…" : `Pay ₹${total.toLocaleString("en-IN")} →`}
              </button>
            </div>
            <p className="subtle" style={{ fontSize: ".78rem", marginTop: "1rem", textAlign: "center" }}>Payments are processed securely via Razorpay</p>
          </div>
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
