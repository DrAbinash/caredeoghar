import { Router } from "express";
import {
  db,
  siteSettingsTable,
  sitePagesTable,
  sitePopupsTable,
  siteFaqsTable,
  sitePhotosTable,
} from "@workspace/db";
import { eq, asc, desc } from "drizzle-orm";
import path from "node:path";
import fs from "node:fs/promises";
import multer from "multer";

export const websiteRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Site Settings — singleton row (id = 1). Auto-creates on first read.
// ─────────────────────────────────────────────────────────────────────────────
async function getOrCreateSettings() {
  const [existing] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
  if (existing) return existing;
  const [created] = await db.insert(siteSettingsTable).values({ id: 1 }).returning();
  return created;
}

websiteRouter.get("/settings", async (_req, res) => {
  const s = await getOrCreateSettings();
  res.json(s);
});

websiteRouter.patch("/settings", async (req, res) => {
  await getOrCreateSettings();
  // Whitelist editable fields. We never trust id, createdAt, etc.
  const allowed: (keyof typeof siteSettingsTable.$inferInsert)[] = [
    "siteTitle", "tagline", "about", "contactEmail", "contactPhone",
    "whatsappNumber", "whatsappEnabled", "whatsappGreeting", "address",
    "faviconUrl", "logoUrl",
    "themeId", "primaryColor", "secondaryColor", "accentColor",
    "backgroundColor", "fontHeading", "fontBody", "buttonStyle",
    "customDomain",
    "seoMetaTitle", "seoMetaDescription", "seoKeywords", "seoOgImage",
    "googleAnalyticsId", "googleTagManagerId", "googleAdsenseId",
    "metaPixelId", "facebookMetaTag", "pinterestMetaTag", "customHeadHtml",
    "socialLinks",
  ];
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of allowed) {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  }
  const [updated] = await db
    .update(siteSettingsTable)
    .set(updates)
    .where(eq(siteSettingsTable.id, 1))
    .returning();
  res.json(updated);
});

websiteRouter.post("/publish", async (_req, res) => {
  const s = await getOrCreateSettings();
  const [updated] = await db
    .update(siteSettingsTable)
    .set({
      isPublished: true,
      lastPublishedAt: new Date(),
      publishedRevision: (s.publishedRevision ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(siteSettingsTable.id, 1))
    .returning();
  res.json(updated);
});

websiteRouter.post("/unpublish", async (_req, res) => {
  const [updated] = await db
    .update(siteSettingsTable)
    .set({ isPublished: false, updatedAt: new Date() })
    .where(eq(siteSettingsTable.id, 1))
    .returning();
  res.json(updated);
});

// ─────────────────────────────────────────────────────────────────────────────
// Pages
// ─────────────────────────────────────────────────────────────────────────────
websiteRouter.get("/pages", async (_req, res) => {
  const pages = await db.select().from(sitePagesTable).orderBy(asc(sitePagesTable.orderIndex), asc(sitePagesTable.id));
  res.json({ pages });
});

websiteRouter.get("/pages/:id", async (req, res) => {
  const [p] = await db.select().from(sitePagesTable).where(eq(sitePagesTable.id, Number(req.params.id)));
  if (!p) return res.status(404).json({ error: "Page not found" });
  res.json(p);
});

websiteRouter.post("/pages", async (req, res) => {
  const { slug, title } = req.body ?? {};
  if (!slug || !title) return res.status(400).json({ error: "slug and title required" });
  const dup = await db.select().from(sitePagesTable).where(eq(sitePagesTable.slug, slug));
  if (dup.length > 0) return res.status(409).json({ error: "Slug already in use" });
  const [created] = await db.insert(sitePagesTable).values({
    slug,
    title,
    status: req.body.status ?? "draft",
    orderIndex: Number(req.body.orderIndex ?? 0),
    showInNav: req.body.showInNav ?? true,
    sections: req.body.sections ?? "[]",
    seoMetaTitle: req.body.seoMetaTitle ?? "",
    seoMetaDescription: req.body.seoMetaDescription ?? "",
  }).returning();
  res.status(201).json(created);
});

websiteRouter.patch("/pages/:id", async (req, res) => {
  const id = Number(req.params.id);
  const allowed = ["slug", "title", "status", "orderIndex", "showInNav", "sections", "seoMetaTitle", "seoMetaDescription"];
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
  const [updated] = await db.update(sitePagesTable).set(updates).where(eq(sitePagesTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Page not found" });
  res.json(updated);
});

websiteRouter.delete("/pages/:id", async (req, res) => {
  await db.delete(sitePagesTable).where(eq(sitePagesTable.id, Number(req.params.id)));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Popups
// ─────────────────────────────────────────────────────────────────────────────
websiteRouter.get("/popups", async (_req, res) => {
  const popups = await db.select().from(sitePopupsTable).orderBy(desc(sitePopupsTable.id));
  res.json({ popups });
});

websiteRouter.post("/popups", async (req, res) => {
  const [p] = await db.insert(sitePopupsTable).values({
    title: req.body.title ?? "",
    body: req.body.body ?? "",
    ctaLabel: req.body.ctaLabel ?? "",
    ctaUrl: req.body.ctaUrl ?? "",
    imageUrl: req.body.imageUrl ?? "",
    triggerType: req.body.triggerType ?? "time_delay",
    triggerValue: Number(req.body.triggerValue ?? 5),
    enabled: req.body.enabled ?? true,
  }).returning();
  res.status(201).json(p);
});

websiteRouter.patch("/popups/:id", async (req, res) => {
  const id = Number(req.params.id);
  const allowed = ["title", "body", "ctaLabel", "ctaUrl", "imageUrl", "triggerType", "triggerValue", "enabled"];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
  const [u] = await db.update(sitePopupsTable).set(updates).where(eq(sitePopupsTable.id, id)).returning();
  if (!u) return res.status(404).json({ error: "Popup not found" });
  res.json(u);
});

websiteRouter.delete("/popups/:id", async (req, res) => {
  await db.delete(sitePopupsTable).where(eq(sitePopupsTable.id, Number(req.params.id)));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// FAQs
// ─────────────────────────────────────────────────────────────────────────────
websiteRouter.get("/faqs", async (_req, res) => {
  const faqs = await db.select().from(siteFaqsTable).orderBy(asc(siteFaqsTable.orderIndex), asc(siteFaqsTable.id));
  res.json({ faqs });
});

websiteRouter.post("/faqs", async (req, res) => {
  const { question, answer } = req.body ?? {};
  if (!question || !answer) return res.status(400).json({ error: "question and answer required" });
  const [f] = await db.insert(siteFaqsTable).values({
    question,
    answer,
    orderIndex: Number(req.body.orderIndex ?? 0),
    enabled: req.body.enabled ?? true,
  }).returning();
  res.status(201).json(f);
});

websiteRouter.patch("/faqs/:id", async (req, res) => {
  const id = Number(req.params.id);
  const allowed = ["question", "answer", "orderIndex", "enabled"];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) if (req.body[k] !== undefined) updates[k] = req.body[k];
  const [u] = await db.update(siteFaqsTable).set(updates).where(eq(siteFaqsTable.id, id)).returning();
  if (!u) return res.status(404).json({ error: "FAQ not found" });
  res.json(u);
});

websiteRouter.delete("/faqs/:id", async (req, res) => {
  await db.delete(siteFaqsTable).where(eq(siteFaqsTable.id, Number(req.params.id)));
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Photos — local filesystem upload (data/uploads/site)
// ─────────────────────────────────────────────────────────────────────────────
const UPLOAD_DIR = path.resolve(process.cwd(), "data/uploads/site");
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"]);
const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      try { await fs.mkdir(UPLOAD_DIR, { recursive: true }); cb(null, UPLOAD_DIR); }
      catch (e) { cb(e as Error, UPLOAD_DIR); }
    },
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}_${safe}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

websiteRouter.get("/photos", async (_req, res) => {
  const photos = await db.select().from(sitePhotosTable).orderBy(desc(sitePhotosTable.uploadedAt));
  res.json({ photos });
});

websiteRouter.post("/photos", upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const url = `/uploads/site/${req.file.filename}`;
  const [p] = await db.insert(sitePhotosTable).values({
    url,
    alt: (req.body?.alt as string) ?? "",
    category: (req.body?.category as string) ?? "general",
  }).returning();
  res.status(201).json(p);
});

websiteRouter.delete("/photos/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [p] = await db.select().from(sitePhotosTable).where(eq(sitePhotosTable.id, id));
  // Guard against path traversal: only delete files inside UPLOAD_DIR. We
  // re-derive the absolute path from the basename of the stored url.
  if (p?.url?.startsWith("/uploads/site/")) {
    const base = path.basename(p.url);
    const abs = path.join(UPLOAD_DIR, base);
    if (abs.startsWith(UPLOAD_DIR + path.sep)) {
      await fs.unlink(abs).catch(() => {});
    }
  }
  await db.delete(sitePhotosTable).where(eq(sitePhotosTable.id, id));
  res.json({ ok: true });
});
