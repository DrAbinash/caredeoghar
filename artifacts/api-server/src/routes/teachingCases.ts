/**
 * Phase 8: Teaching Files & Interesting Cases Registry
 *
 * Routes:
 *  GET /api/teaching-cases — list with search/filter
 *  GET /api/teaching-cases/:id — detail
 *  POST /api/teaching-cases — create
 *  PUT /api/teaching-cases/:id — update
 *  DELETE /api/teaching-cases/:id — delete
 *  POST /api/teaching-cases/:id/favorite — toggle favorite
 *  POST /api/teaching-cases/:id/view — record view
 *  POST /api/teaching-cases/:id/note — add note
 *  GET /api/teaching-cases/collections — list collections
 *  POST /api/teaching-cases/collections — create collection
 *  PUT /api/teaching-cases/collections/:id — update collection
 *  GET /api/teaching-cases/analytics — dashboard stats
 *  POST /api/teaching-cases/anonymize — anonymize patient data
 *  POST /api/teaching-cases/search — full-text search
 *
 * Security: requireStaffAuth, owner-only for mutations
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  teachingCasesTable,
  teachingCaseImagesTable,
  teachingCaseCollectionsTable,
  teachingCaseFavoritesTable,
  teachingCaseViewsTable,
  teachingCaseNotesTable,
  measurementHistoryTable,
} from "@workspace/db";
import { eq, and, like, desc, sql, count, inArray } from "drizzle-orm";
import { type StaffAuthRequest, FULL_ACCESS_ROLES } from "../middleware/requireStaffAuth";

export const teachingCasesRouter = Router();

function isOwner(req: StaffAuthRequest): boolean {
  const u = req.staffSession ?? null;
  if (!u) return false;
  if (FULL_ACCESS_ROLES.has(u.role)) return true;
  return u.permissions.includes("ai_reporting.configure");
}

function getUserId(req: StaffAuthRequest): number | null {
  return req.staffSession?.subjectId ?? null;
}

function getUserName(req: StaffAuthRequest): string | null {
  return req.staffSession?.subjectName ?? null;
}

// ─── LIST / SEARCH ───────────────────────────────────────────────────────────
teachingCasesRouter.get("/", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  const userId = getUserId(sReq);

  const {
    q, category, difficulty, modality, bodyPart, diagnosis, tag,
    status, createdBy, research, limit = "50", offset = "0",
  } = req.query;

  const conditions = [];
  if (q) {
    const likeQ = `%${String(q)}%`;
    conditions.push(sql`(
      ${like(teachingCasesTable.title, likeQ)} OR
      ${like(teachingCasesTable.diagnosis, likeQ)} OR
      ${like(teachingCasesTable.findings, likeQ)} OR
      ${like(teachingCasesTable.impression, likeQ)}
    )`);
  }
  if (category) conditions.push(eq(teachingCasesTable.category, String(category)));
  if (difficulty) conditions.push(eq(teachingCasesTable.difficulty, String(difficulty)));
  if (modality) conditions.push(eq(teachingCasesTable.modality, String(modality)));
  if (bodyPart) conditions.push(eq(teachingCasesTable.bodyPart, String(bodyPart)));
  if (diagnosis) conditions.push(eq(teachingCasesTable.diagnosis, String(diagnosis)));
  if (status) conditions.push(eq(teachingCasesTable.status, String(status)));
  if (createdBy) conditions.push(eq(teachingCasesTable.createdById, Number(createdBy)));
  if (research) conditions.push(eq(teachingCasesTable.isResearchCandidate, String(research) === "true"));
  if (tag) {
    conditions.push(sql`${teachingCasesTable.tagsJson}::text LIKE ${`%${String(tag)}%`}`);
  }

  const baseQuery = conditions.length > 0
    ? db.select().from(teachingCasesTable).where(and(...conditions))
    : db.select().from(teachingCasesTable);

  const rows = await baseQuery
    .orderBy(desc(teachingCasesTable.createdAt))
    .limit(Number(limit))
    .offset(Number(offset));

  // Count total
  const countQuery = conditions.length > 0
    ? db.select({ count: count() }).from(teachingCasesTable).where(and(...conditions))
    : db.select({ count: count() }).from(teachingCasesTable);
  const [{ count: total }] = await countQuery;

  // Check favorites for the user
  let favorites: number[] = [];
  if (userId) {
    const favs = await db
      .select({ teachingCaseId: teachingCaseFavoritesTable.teachingCaseId })
      .from(teachingCaseFavoritesTable)
      .where(eq(teachingCaseFavoritesTable.userId, userId));
    favorites = favs.map((f) => f.teachingCaseId);
  }

  res.json({ cases: rows, total, favorites });
});

// ─── GET DETAIL ──────────────────────────────────────────────────────────────
teachingCasesRouter.get("/:id", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  const userId = getUserId(sReq);
  const id = Number(req.params.id);

  const [caseRow] = await db.select().from(teachingCasesTable).where(eq(teachingCasesTable.id, id)).limit(1);
  if (!caseRow) { res.status(404).json({ error: "Not found" }); return; }

  const images = await db
    .select().from(teachingCaseImagesTable)
    .where(eq(teachingCaseImagesTable.teachingCaseId, id))
    .orderBy(teachingCaseImagesTable.sortOrder);

  const notes = await db
    .select().from(teachingCaseNotesTable)
    .where(eq(teachingCaseNotesTable.teachingCaseId, id))
    .orderBy(desc(teachingCaseNotesTable.createdAt));

  const isFav = userId
    ? (await db.select().from(teachingCaseFavoritesTable)
        .where(and(eq(teachingCaseFavoritesTable.teachingCaseId, id), eq(teachingCaseFavoritesTable.userId, userId)))
        .limit(1)).length > 0
    : false;

  // Increment view count
  await db.update(teachingCasesTable)
    .set({ viewCount: sql`${teachingCasesTable.viewCount} + 1` })
    .where(eq(teachingCasesTable.id, id));

  // Record view
  if (userId) {
    await db.insert(teachingCaseViewsTable).values({
      teachingCaseId: id,
      userId,
      userName: getUserName(sReq),
    }).catch(() => { /* ignore */ });
  }

  res.json({ case: caseRow, images, notes, isFavorite: isFav });
});

// ─── CREATE ──────────────────────────────────────────────────────────────────
teachingCasesRouter.post("/", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  if (!isOwner(sReq)) { res.status(403).json({ error: "Insufficient permissions." }); return; }

  const userId = getUserId(sReq)!;
  const userName = getUserName(sReq);
  const body = req.body as Record<string, unknown>;

  const [newCase] = await db.insert(teachingCasesTable).values({
    title: String(body.title ?? ""),
    diagnosis: body.diagnosis ? String(body.diagnosis) : null,
    category: String(body.category ?? "Uncategorized"),
    difficulty: String(body.difficulty ?? "intermediate"),
    source: String(body.source ?? "manual"),
    modality: body.modality ? String(body.modality) : null,
    bodyPart: body.bodyPart ? String(body.bodyPart) : null,
    studyDescription: body.studyDescription ? String(body.studyDescription) : null,
    findings: body.findings ? String(body.findings) : null,
    impression: body.impression ? String(body.impression) : null,
    measurements: body.measurements ? String(body.measurements) : null,
    learningPoints: body.learningPoints ? String(body.learningPoints) : null,
    pearls: body.pearls ? String(body.pearls) : null,
    pitfalls: body.pitfalls ? String(body.pitfalls) : null,
    tagsJson: body.tags ? JSON.stringify(Array.isArray(body.tags) ? body.tags : []) : "[]",
    classification: body.classification ? String(body.classification) : null,
    classificationValue: body.classificationValue ? String(body.classificationValue) : null,
    isResearchCandidate: Boolean(body.isResearchCandidate ?? false),
    researchStatus: body.researchStatus ? String(body.researchStatus) : null,
    createdById: userId,
    createdByName: userName,
    status: "draft",
    isAnonymized: false,
  }).returning();

  res.json({ case: newCase });
});

// ─── UPDATE ──────────────────────────────────────────────────────────────────
teachingCasesRouter.put("/:id", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  if (!isOwner(sReq)) { res.status(403).json({ error: "Insufficient permissions." }); return; }

  const id = Number(req.params.id);
  const body = req.body as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  const stringFields = ["title", "diagnosis", "category", "difficulty", "source", "modality", "bodyPart", "studyDescription", "findings", "impression", "measurements", "learningPoints", "pearls", "pitfalls", "classification", "classificationValue", "researchStatus", "status", "aiNotes", "aiSummary"];
  for (const f of stringFields) {
    if (body[f] !== undefined) updates[f] = String(body[f] ?? "");
  }
  if (body.isResearchCandidate !== undefined) updates.isResearchCandidate = Boolean(body.isResearchCandidate);
  if (body.isAnonymized !== undefined) updates.isAnonymized = Boolean(body.isAnonymized);
  if (body.tags) updates.tagsJson = JSON.stringify(Array.isArray(body.tags) ? body.tags : []);

  await db.update(teachingCasesTable).set(updates).where(eq(teachingCasesTable.id, id));
  res.json({ success: true });
});

// ─── DELETE ──────────────────────────────────────────────────────────────────
teachingCasesRouter.delete("/:id", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  if (!isOwner(sReq)) { res.status(403).json({ error: "Insufficient permissions." }); return; }

  const id = Number(req.params.id);
  await db.delete(teachingCasesTable).where(eq(teachingCasesTable.id, id));
  await db.delete(teachingCaseImagesTable).where(eq(teachingCaseImagesTable.teachingCaseId, id));
  await db.delete(teachingCaseFavoritesTable).where(eq(teachingCaseFavoritesTable.teachingCaseId, id));
  await db.delete(teachingCaseNotesTable).where(eq(teachingCaseNotesTable.teachingCaseId, id));
  await db.delete(teachingCaseViewsTable).where(eq(teachingCaseViewsTable.teachingCaseId, id));

  res.json({ success: true });
});

// ─── TOGGLE FAVORITE ─────────────────────────────────────────────────────────
teachingCasesRouter.post("/:id/favorite", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  const userId = getUserId(sReq);
  if (!userId) { res.status(401).json({ error: "Not authenticated." }); return; }

  const id = Number(req.params.id);
  const existing = await db.select()
    .from(teachingCaseFavoritesTable)
    .where(and(eq(teachingCaseFavoritesTable.teachingCaseId, id), eq(teachingCaseFavoritesTable.userId, userId)))
    .limit(1);

  if (existing.length > 0) {
    await db.delete(teachingCaseFavoritesTable)
      .where(and(eq(teachingCaseFavoritesTable.teachingCaseId, id), eq(teachingCaseFavoritesTable.userId, userId)));
    res.json({ isFavorite: false });
  } else {
    await db.insert(teachingCaseFavoritesTable).values({
      teachingCaseId: id,
      userId,
      userName: getUserName(sReq),
    });
    res.json({ isFavorite: true });
  }
});

// ─── ADD NOTE ────────────────────────────────────────────────────────────────
teachingCasesRouter.post("/:id/note", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  const userId = getUserId(sReq);
  if (!userId) { res.status(401).json({ error: "Not authenticated." }); return; }

  const id = Number(req.params.id);
  const { note } = req.body as { note?: string };
  if (!note?.trim()) { res.status(400).json({ error: "Note is required." }); return; }

  const [newNote] = await db.insert(teachingCaseNotesTable).values({
    teachingCaseId: id,
    userId,
    userName: getUserName(sReq),
    note: note.trim(),
  }).returning();

  res.json({ note: newNote });
});

// ─── COLLECTIONS ─────────────────────────────────────────────────────────────
teachingCasesRouter.get("/collections", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  const userId = getUserId(sReq);

  const rows = await db
    .select().from(teachingCaseCollectionsTable)
    .where(userId ? eq(teachingCaseCollectionsTable.ownerId, userId) : undefined)
    .orderBy(desc(teachingCaseCollectionsTable.createdAt));

  res.json({ collections: rows });
});

teachingCasesRouter.post("/collections", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  if (!isOwner(sReq)) { res.status(403).json({ error: "Insufficient permissions." }); return; }

  const userId = getUserId(sReq)!;
  const { name, description, isShared } = req.body as { name?: string; description?: string; isShared?: boolean };
  if (!name?.trim()) { res.status(400).json({ error: "Name is required." }); return; }

  const [newCol] = await db.insert(teachingCaseCollectionsTable).values({
    name: name.trim(),
    description: description ?? null,
    ownerId: userId,
    ownerName: getUserName(sReq),
    isShared: isShared ?? false,
    caseIdsJson: "[]",
  }).returning();

  res.json({ collection: newCol });
});

teachingCasesRouter.put("/collections/:id", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  if (!isOwner(sReq)) { res.status(403).json({ error: "Insufficient permissions." }); return; }

  const id = Number(req.params.id);
  const { name, description, isShared, caseIds } = req.body as { name?: string; description?: string; isShared?: boolean; caseIds?: number[] };
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description;
  if (isShared !== undefined) updates.isShared = isShared;
  if (caseIds) updates.caseIdsJson = JSON.stringify(caseIds);

  await db.update(teachingCaseCollectionsTable).set(updates).where(eq(teachingCaseCollectionsTable.id, id));
  res.json({ success: true });
});

// ─── FAVORITES ───────────────────────────────────────────────────────────────
teachingCasesRouter.get("/favorites", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  const userId = getUserId(sReq);
  if (!userId) { res.status(401).json({ error: "Not authenticated." }); return; }

  const favRows = await db
    .select({ teachingCaseId: teachingCaseFavoritesTable.teachingCaseId })
    .from(teachingCaseFavoritesTable)
    .where(eq(teachingCaseFavoritesTable.userId, userId));

  const favIds = favRows.map((f) => f.teachingCaseId);
  if (favIds.length === 0) { res.json({ cases: [] }); return; }

  const rows = await db
    .select().from(teachingCasesTable)
    .where(sql`${teachingCasesTable.id} IN (${sql.join(favIds, sql`, `)})`)
    .orderBy(desc(teachingCasesTable.createdAt));

  res.json({ cases: rows });
});

// ─── RESEARCH CASES ────────────────────────────────────────────────────────────
teachingCasesRouter.get("/research", async (req, res): Promise<void> => {
  const rows = await db
    .select().from(teachingCasesTable)
    .where(eq(teachingCasesTable.isResearchCandidate, true))
    .orderBy(desc(teachingCasesTable.createdAt));

  res.json({ cases: rows });
});

// ─── ANALYTICS ───────────────────────────────────────────────────────────────
teachingCasesRouter.get("/analytics", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  const userId = getUserId(sReq);

  const totalCases = await db.select({ count: count() }).from(teachingCasesTable);
  const totalViews = await db.select({ count: count() }).from(teachingCaseViewsTable);
  const myCases = userId
    ? await db.select({ count: count() }).from(teachingCasesTable).where(eq(teachingCasesTable.createdById, userId))
    : [{ count: 0 }];
  const myFavorites = userId
    ? await db.select({ count: count() }).from(teachingCaseFavoritesTable).where(eq(teachingCaseFavoritesTable.userId, userId))
    : [{ count: 0 }];
  const researchCases = await db.select({ count: count() }).from(teachingCasesTable).where(eq(teachingCasesTable.isResearchCandidate, true));

  const byCategory = await db
    .select({ category: teachingCasesTable.category, count: count() })
    .from(teachingCasesTable)
    .groupBy(teachingCasesTable.category);

  const byModality = await db
    .select({ modality: teachingCasesTable.modality, count: count() })
    .from(teachingCasesTable)
    .where(sql`${teachingCasesTable.modality} IS NOT NULL`)
    .groupBy(teachingCasesTable.modality);

  const mostViewed = await db
    .select().from(teachingCasesTable)
    .orderBy(desc(teachingCasesTable.viewCount))
    .limit(10);

  res.json({
    totalCases: totalCases[0]?.count ?? 0,
    totalViews: totalViews[0]?.count ?? 0,
    myCases: myCases[0]?.count ?? 0,
    myFavorites: myFavorites[0]?.count ?? 0,
    researchCases: researchCases[0]?.count ?? 0,
    byCategory,
    byModality,
    mostViewed,
  });
});

// ─── LEGACY ANALYTICS (dashboard) ───────────────────────────────────────────
teachingCasesRouter.get("/analytics/dashboard", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  if (!isOwner(sReq)) { res.status(403).json({ error: "Insufficient permissions." }); return; }

  const userId = getUserId(sReq);
  const totalCases = await db.select({ count: count() }).from(teachingCasesTable);
  const totalViews = await db.select({ count: count() }).from(teachingCaseViewsTable);
  const myCases = userId
    ? await db.select({ count: count() }).from(teachingCasesTable).where(eq(teachingCasesTable.createdById, userId))
    : [{ count: 0 }];
  const myFavorites = userId
    ? await db.select({ count: count() }).from(teachingCaseFavoritesTable).where(eq(teachingCaseFavoritesTable.userId, userId))
    : [{ count: 0 }];
  const researchCases = await db.select({ count: count() }).from(teachingCasesTable).where(eq(teachingCasesTable.isResearchCandidate, true));

  // By category
  const byCategory = await db
    .select({ category: teachingCasesTable.category, count: count() })
    .from(teachingCasesTable)
    .groupBy(teachingCasesTable.category);

  // By modality
  const byModality = await db
    .select({ modality: teachingCasesTable.modality, count: count() })
    .from(teachingCasesTable)
    .where(sql`${teachingCasesTable.modality} IS NOT NULL`)
    .groupBy(teachingCasesTable.modality);

  // Most viewed
  const mostViewed = await db
    .select().from(teachingCasesTable)
    .orderBy(desc(teachingCasesTable.viewCount))
    .limit(10);

  res.json({
    totalCases: totalCases[0]?.count ?? 0,
    totalViews: totalViews[0]?.count ?? 0,
    myCases: myCases[0]?.count ?? 0,
    myFavorites: myFavorites[0]?.count ?? 0,
    researchCases: researchCases[0]?.count ?? 0,
    byCategory,
    byModality,
    mostViewed,
  });
});

// ─── ANONYMIZE ───────────────────────────────────────────────────────────────
teachingCasesRouter.post("/:id/anonymize", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  if (!isOwner(sReq)) { res.status(403).json({ error: "Insufficient permissions." }); return; }

  const id = Number(req.params.id);
  await db.update(teachingCasesTable).set({
    isAnonymized: true,
    anonymizedAt: new Date(),
  }).where(eq(teachingCasesTable.id, id));

  res.json({ success: true });
});

// ─── MEASUREMENT HISTORY ─────────────────────────────────────────────────────
teachingCasesRouter.get("/measurements/:patientId", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  const patientId = Number(req.params.patientId);
  const { type } = req.query;

  const conditions = [eq(measurementHistoryTable.patientId, patientId)];
  if (type) conditions.push(eq(measurementHistoryTable.measurementType, String(type)));

  const rows = await db
    .select().from(measurementHistoryTable)
    .where(and(...conditions))
    .orderBy(desc(measurementHistoryTable.measuredAt));

  // Group by measurement type
  const grouped: Record<string, typeof rows> = {};
  for (const row of rows) {
    const key = row.measurementType;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  }

  res.json({ measurements: rows, grouped });
});

// ─── GENERATE TEACHING CASE FROM REPORT ──────────────────────────────────────
// Phase 10C: Teaching Generator — create a draft teaching case from a finalised radiology report
teachingCasesRouter.post("/generate-from-report", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  const userId = getUserId(sReq);
  const userName = getUserName(sReq);
  const body = req.body as Record<string, unknown>;

  const {
    modality, testName, bodyPart,
    clinicalHistory, findings, impression, diagnosis,
    category = "general",
  } = body as {
    modality?: string; testName?: string;
    bodyPart?: string; clinicalHistory?: string; findings?: string;
    impression?: string; diagnosis?: string; category?: string;
  };

  if (!findings && !impression) {
    res.status(400).json({ error: "findings or impression required to generate a teaching case" });
    return;
  }

  // Build a concise teaching summary from the report fields
  const title = [modality, testName ?? bodyPart, diagnosis ?? "Interesting Case"]
    .filter(Boolean).join(" — ");

  // Combine clinical history + findings into the findings field; impression stays separate
  const combinedFindings = [
    clinicalHistory ? `Clinical History: ${clinicalHistory}` : null,
    findings ? `Findings:\n${findings}` : null,
  ].filter(Boolean).join("\n\n");

  const [newCase] = await db.insert(teachingCasesTable).values({
    title,
    category: String(category),
    modality: modality ? String(modality) : null,
    bodyPart: bodyPart ? String(bodyPart) : null,
    diagnosis: diagnosis ? String(diagnosis) : null,
    findings: combinedFindings || null,
    impression: impression ? String(impression) : null,
    difficulty: "intermediate",
    status: "draft",
    isResearchCandidate: false,
    isAnonymized: false,
    createdById: userId ?? 0,
    createdByName: userName ?? null,
  }).returning();

  res.json({ case: newCase, message: "Teaching case draft created from report. AI Draft — Requires Radiologist Review before publishing." });
});

teachingCasesRouter.post("/measurements", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  const userId = getUserId(sReq);
  const userName = getUserName(sReq);

  const body = req.body as Record<string, unknown>;
  const [newMeasurement] = await db.insert(measurementHistoryTable).values({
    patientId: Number(body.patientId ?? 0),
    measurementType: String(body.measurementType ?? "other"),
    measurementLabel: String(body.measurementLabel ?? ""),
    value: String(body.value ?? ""),
    unit: String(body.unit ?? "mm"),
    bodyPart: body.bodyPart ? String(body.bodyPart) : null,
    side: body.side ? String(body.side) : null,
    level: body.level ? String(body.level) : null,
    studyId: body.studyId ? Number(body.studyId) : null,
    studyInstanceUid: body.studyInstanceUid ? String(body.studyInstanceUid) : null,
    accessionNumber: body.accessionNumber ? String(body.accessionNumber) : null,
    seriesNumber: body.seriesNumber ? String(body.seriesNumber) : null,
    imageNumber: body.imageNumber ? String(body.imageNumber) : null,
    modality: body.modality ? String(body.modality) : null,
    measuredById: userId ?? null,
    measuredByName: userName ?? null,
  }).returning();

  res.json({ measurement: newMeasurement });
});
