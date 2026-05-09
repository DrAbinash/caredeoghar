import { useEffect, useState } from "react";
import type { Section, Photo } from "../types";
import { api } from "../api";
import { resolveAssetUrl } from "../config";

function get(c: Record<string, unknown>, k: string, fb = ""): string {
  return typeof c[k] === "string" ? (c[k] as string) : fb;
}

export default function GallerySection({ section }: { section: Section }) {
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
