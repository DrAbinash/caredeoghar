import { useEffect, useState, useMemo } from "react";
import type { Section, SiteSettings } from "../types";
import { buttonClass } from "../theme";

function get(c: Record<string, unknown>, k: string, fb = ""): string {
  return typeof c[k] === "string" ? (c[k] as string) : fb;
}

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

export default function AppointmentSection({ section, settings }: { section: Section; settings: SiteSettings }) {
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

  const [pd, setPd] = useState({ name: "", phone: "", email: "", date: "", notes: "", isVip: false });
  const [selTests, setSelTests] = useState<Set<number>>(new Set());
  const [selPkgs, setSelPkgs] = useState<Set<number>>(new Set());

  useEffect(() => {
    bookingGet<BookingConfig>("/api/public/booking/config").then(setConfig).catch(() => setConfig({ enabled: false, keyId: "", vipEnabled: false }));
  }, []);

  const loadCatalog = () => {
    if (tests.length === 0) bookingGet<{ tests: TestItem[] }>("/api/public/booking/tests").then((d) => setTests(d.tests)).catch(() => {});
    if (pkgs.length === 0) bookingGet<{ packages: PkgItem[] }>("/api/public/booking/packages").then((d) => setPkgs(d.packages)).catch(() => {});
  };

  const total = useMemo(() => {
    const t = tests.filter((t) => selTests.has(t.id)).reduce((s, t) => s + Number(t.price), 0);
    const p = pkgs.filter((p) => selPkgs.has(p.id)).reduce((s, p) => s + Number(p.price), 0);
    return t + p;
  }, [tests, pkgs, selTests, selPkgs]);

  const categories = useMemo(() => ["all", ...Array.from(new Set(tests.map((t) => t.category))).sort()], [tests]);
  const filteredTests = useMemo(() => catFilter === "all" ? tests : tests.filter((t) => t.category === catFilter), [tests, catFilter]);

  const toggleTest = (id: number) => setSelTests((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const togglePkg  = (id: number) => setSelPkgs((s)  => { const n = new Set(s);  n.has(id) ? n.delete(id) : n.add(id);  return n;  });

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

  if (!config || !config.enabled) {
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
              <button type="button" onClick={() => setStep("select")} style={{ background: "hsl(var(--site-muted))", color: "inherit", border: "none", borderRadius: "var(--site-radius)", padding: ".6rem 1.1rem", cursor: "pointer", fontWeight: 600 }}>← Back</button>
              <button type="button" className={buttonClass(settings, "primary")} onClick={handlePay} disabled={paying} style={{ flex: 1, justifyContent: "center" }}>
                {paying ? "Processing…" : `Pay ₹${total.toLocaleString("en-IN")} via Razorpay`}
              </button>
            </div>
            <p className="subtle" style={{ fontSize: ".78rem", marginTop: "1rem", textAlign: "center" }}>Payments are processed securely via Razorpay</p>
          </div>
        )}
      </div>
    </section>
  );
}
