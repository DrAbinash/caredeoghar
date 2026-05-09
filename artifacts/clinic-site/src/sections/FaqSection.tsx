import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Section, Faq } from "../types";
import { api } from "../api";

function get(c: Record<string, unknown>, k: string, fb = ""): string {
  return typeof c[k] === "string" ? (c[k] as string) : fb;
}

export default function FaqSection({ section }: { section: Section }) {
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
