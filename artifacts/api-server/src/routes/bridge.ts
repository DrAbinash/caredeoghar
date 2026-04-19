// Fingerprint Bridge API
// Pairs with a small desktop service (see /bridge-service) that talks to USB
// scanners (ZKTeco, Mantra MFS100, Morpho, etc.) via vendor SDK and performs
// the actual capture + matching locally. The server only stores templates and
// records identification results — never the raw biometric data.
import { Router } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import {
  staffTable, staffAttendanceTable,
  bridgeFingerprintTemplatesTable, userSessionsTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";

export const bridgeRouter = Router();

const SESSION_HOURS = 8;

// Bridge can optionally present a shared secret so random clients can't enroll
const BRIDGE_SECRET = process.env["FINGERPRINT_BRIDGE_SECRET"] ?? "";

function requireBridgeAuth(req: Parameters<Parameters<typeof bridgeRouter.use>[0]>[0], res: Parameters<Parameters<typeof bridgeRouter.use>[0]>[1], next: () => void) {
  if (!BRIDGE_SECRET) return next(); // dev mode: no auth
  const provided = String(req.headers["x-bridge-secret"] ?? "");
  if (provided !== BRIDGE_SECRET) return res.status(401).json({ error: "Bridge auth failed" });
  next();
}

// ── Health & configuration ────────────────────────
bridgeRouter.get("/info", (_req, res) => {
  res.json({
    requiresAuth: !!BRIDGE_SECRET,
    sessionHours: SESSION_HOURS,
    serverTime: new Date().toISOString(),
    supportedScopes: ["staff", "user"],
  });
});

// ── Enroll a fingerprint template ─────────────────
// Bridge captures the print using vendor SDK and POSTs the resulting template here.
bridgeRouter.post("/enroll", requireBridgeAuth, async (req, res) => {
  const body = req.body as { scope?: string; scopeId?: number; vendor?: string; template?: string; fingerName?: string; quality?: number };
  const scope = body.scope === "user" ? "user" : "staff";
  const scopeId = Number(body.scopeId);
  const template = body.template;
  if (!scopeId || !template || template.length < 8) {
    return res.status(400).json({ error: "scopeId and template required" });
  }

  // Sanity check the scopeId exists
  if (scope === "staff") {
    const [s] = await db.select().from(staffTable).where(eq(staffTable.id, scopeId));
    if (!s) return res.status(404).json({ error: "Staff not found" });
  } else {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, scopeId));
    if (!u) return res.status(404).json({ error: "User not found" });
  }

  const [row] = await db.insert(bridgeFingerprintTemplatesTable).values({
    scope, scopeId,
    vendor: (body.vendor as string) || "generic",
    template,
    fingerName: body.fingerName ?? null,
    quality: body.quality ?? null,
  }).returning({
    id: bridgeFingerprintTemplatesTable.id,
    scope: bridgeFingerprintTemplatesTable.scope,
    scopeId: bridgeFingerprintTemplatesTable.scopeId,
    vendor: bridgeFingerprintTemplatesTable.vendor,
    fingerName: bridgeFingerprintTemplatesTable.fingerName,
    enrolledAt: bridgeFingerprintTemplatesTable.enrolledAt,
  });
  res.status(201).json(row);
});

// ── List templates for a scope (so the bridge can pull candidates for matching) ──
bridgeRouter.get("/templates", requireBridgeAuth, async (req, res) => {
  const { scope, scopeId } = req.query as Record<string, string>;
  const conditions = [];
  if (scope === "staff" || scope === "user") conditions.push(eq(bridgeFingerprintTemplatesTable.scope, scope));
  if (scopeId) conditions.push(eq(bridgeFingerprintTemplatesTable.scopeId, Number(scopeId)));
  const rows = await db.select().from(bridgeFingerprintTemplatesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(bridgeFingerprintTemplatesTable.enrolledAt));
  res.json(rows);
});

// List enrolled fingers for a single subject (frontend uses this to show count)
bridgeRouter.get("/templates/list", async (req, res) => {
  const scope = req.query.scope === "user" ? "user" : "staff";
  const scopeId = Number(req.query.scopeId);
  if (!scopeId) return res.status(400).json({ error: "scopeId required" });
  const rows = await db.select({
    id: bridgeFingerprintTemplatesTable.id,
    vendor: bridgeFingerprintTemplatesTable.vendor,
    fingerName: bridgeFingerprintTemplatesTable.fingerName,
    quality: bridgeFingerprintTemplatesTable.quality,
    enrolledAt: bridgeFingerprintTemplatesTable.enrolledAt,
    lastUsedAt: bridgeFingerprintTemplatesTable.lastUsedAt,
  }).from(bridgeFingerprintTemplatesTable)
    .where(and(eq(bridgeFingerprintTemplatesTable.scope, scope), eq(bridgeFingerprintTemplatesTable.scopeId, scopeId)))
    .orderBy(desc(bridgeFingerprintTemplatesTable.enrolledAt));
  res.json(rows);
});

bridgeRouter.delete("/templates/:id", async (req, res) => {
  await db.delete(bridgeFingerprintTemplatesTable).where(eq(bridgeFingerprintTemplatesTable.id, Number(req.params.id)));
  res.json({ ok: true });
});

// ── Identify staff and punch attendance ───────────
// Bridge has already done the matching and posts the matched template id.
bridgeRouter.post("/staff-punch", requireBridgeAuth, async (req, res) => {
  const body = req.body as { templateId?: number; action?: string };
  const templateId = Number(body.templateId);
  if (!templateId) return res.status(400).json({ error: "templateId required" });
  const action = body.action === "out" ? "out" : "in";

  const [tmpl] = await db.select().from(bridgeFingerprintTemplatesTable).where(eq(bridgeFingerprintTemplatesTable.id, templateId));
  if (!tmpl || tmpl.scope !== "staff") return res.status(404).json({ error: "Template not found" });

  await db.update(bridgeFingerprintTemplatesTable).set({ lastUsedAt: new Date() }).where(eq(bridgeFingerprintTemplatesTable.id, templateId));
  const [staff] = await db.select().from(staffTable).where(eq(staffTable.id, tmpl.scopeId));
  if (!staff) return res.status(404).json({ error: "Staff not found" });

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  // Smart toggle: if action='in' but already punched in (no out), treat as out
  const [existing] = await db.select().from(staffAttendanceTable)
    .where(and(eq(staffAttendanceTable.staffId, staff.id), eq(staffAttendanceTable.attendanceDate, today)));
  const resolved = action === "in" && existing?.punchIn && !existing.punchOut ? "out" : action;

  const result = await db.transaction(async (tx) => {
    if (resolved === "in") {
      const inserted = await tx.insert(staffAttendanceTable)
        .values({ staffId: staff.id, attendanceDate: today, punchIn: now, source: "usb-bridge" })
        .onConflictDoNothing({ target: [staffAttendanceTable.staffId, staffAttendanceTable.attendanceDate] })
        .returning();
      if (inserted.length > 0) return inserted[0];
      const updated = await tx.update(staffAttendanceTable)
        .set({ punchIn: now, source: "usb-bridge" })
        .where(and(
          eq(staffAttendanceTable.staffId, staff.id),
          eq(staffAttendanceTable.attendanceDate, today),
          sql`${staffAttendanceTable.punchIn} IS NULL`,
        ))
        .returning();
      if (updated.length > 0) return updated[0];
      throw new Error("Already punched in today");
    } else {
      const updated = await tx.update(staffAttendanceTable)
        .set({ punchOut: now })
        .where(and(
          eq(staffAttendanceTable.staffId, staff.id),
          eq(staffAttendanceTable.attendanceDate, today),
          sql`${staffAttendanceTable.punchIn} IS NOT NULL`,
          sql`${staffAttendanceTable.punchOut} IS NULL`,
        ))
        .returning();
      if (updated.length === 0) throw new Error("Must punch in first");
      return updated[0];
    }
  }).catch((e: Error) => ({ error: e.message }));

  if ("error" in result) return res.status(409).json({ error: result.error, staff });
  return res.json({ staff: { id: staff.id, name: `${staff.firstName} ${staff.lastName}`, staffId: staff.staffId, role: staff.role }, attendance: result, action: resolved });
});

// ── Identify user and create login session ────────
bridgeRouter.post("/user-login", requireBridgeAuth, async (req, res) => {
  const body = req.body as { templateId?: number };
  const templateId = Number(body.templateId);
  if (!templateId) return res.status(400).json({ error: "templateId required" });

  const [tmpl] = await db.select().from(bridgeFingerprintTemplatesTable).where(eq(bridgeFingerprintTemplatesTable.id, templateId));
  if (!tmpl || tmpl.scope !== "user") return res.status(404).json({ error: "Template not found" });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, tmpl.scopeId));
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!user.isActive) return res.status(403).json({ error: "User is deactivated" });

  await db.update(bridgeFingerprintTemplatesTable).set({ lastUsedAt: new Date() }).where(eq(bridgeFingerprintTemplatesTable.id, templateId));

  const token = crypto.randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await db.insert(userSessionsTable).values({
    token, userId: user.id, userName: user.name, expiresAt, loginMethod: "fingerprint",
  });

  res.json({
    token,
    expiresAt: expiresAt.toISOString(),
    user: { id: user.id, name: user.name, role: user.role },
  });
});

// ── Verify a session token (used by client to bootstrap) ──
bridgeRouter.get("/session/verify", async (req, res) => {
  const token = String(req.query.token ?? "");
  if (!token) return res.json({ active: false });
  const [s] = await db.select().from(userSessionsTable).where(eq(userSessionsTable.token, token));
  if (!s || !s.isActive || new Date(s.expiresAt) < new Date()) return res.json({ active: false });
  res.json({ active: true, user: { id: s.userId, name: s.userName }, loginMethod: s.loginMethod, expiresAt: s.expiresAt });
});

bridgeRouter.post("/session/logout", async (req, res) => {
  const token = String(req.body.token ?? "");
  if (token) await db.update(userSessionsTable).set({ isActive: false }).where(eq(userSessionsTable.token, token));
  res.json({ ok: true });
});

export default bridgeRouter;
