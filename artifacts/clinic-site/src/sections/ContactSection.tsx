import { useState } from "react";
import { Phone, Mail, MapPin } from "lucide-react";
import type { Section, SiteSettings } from "../types";
import { buttonClass } from "../theme";

function get(c: Record<string, unknown>, k: string, fb = ""): string {
  return typeof c[k] === "string" ? (c[k] as string) : fb;
}
function getBool(c: Record<string, unknown>, k: string, fb = true): boolean {
  return typeof c[k] === "boolean" ? (c[k] as boolean) : fb;
}

export default function ContactSection({ section, settings }: { section: Section; settings: SiteSettings }) {
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
