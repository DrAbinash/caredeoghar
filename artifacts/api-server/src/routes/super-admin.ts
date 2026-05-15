import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import {
  usersTable,
  superAdminSessionsTable,
  doctorsTable,
  testsTable,
  ledgersTable,
  billsTable,
  patientsTable,
  ordersTable,
  appointmentsTable,
  auditRunsTable,
} from "@workspace/db/schema";
import { eq, and, asc, desc, isNull, or, sql } from "drizzle-orm";
import { runBooksSanity } from "./books-sanity";
import {
  requireSuperAdminUsb,
  isValidUsbKey,
  isUsbGateEnforced,
} from "../middleware/requireSuperAdminUsb";
import { requireSuperAdmin } from "../middleware/requireSuperAdmin";

export const superAdminRouter = Router();

// Body schema for the USB pen-drive key verification endpoint. The client reads
// `superadmin.key` off the user's plugged-in pen drive and posts its content.
const UsbVerifyBody = z.object({
  key: z.string().min(1, "key is required").max(4096),
});

// Rate limiter for the USB verify endpoint — slow brute-force attempts.
const usbVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many USB key attempts. Please try again later." },
});

// POST /api/super-admin/usb/verify — checks a presented USB key against the
// SUPER_ADMIN_USB_KEY env secret. Used by both the super-admin-portal unlock
// screen and the billing UI's "Detect USB key" affordance to decide whether
// to reveal the super-admin link.
//
// Public on purpose (no auth) so an unauthenticated client can ask "is this
// pen drive valid?" before bothering the user with a PIN screen — but rate
// limited so it can't be brute-forced from the internet. Returns the same
// shape on success and failure so timing is uniform.
superAdminRouter.post("/usb/verify", usbVerifyLimiter, (req, res): void => {
  const parsed = UsbVerifyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Invalid request" });
    return;
  }
  const ok = isValidUsbKey(parsed.data.key);
  if (!ok) {
    res.status(401).json({ ok: false, error: "Invalid USB key" });
    return;
  }
  res.json({ ok: true, enforced: isUsbGateEnforced() });
});

// GET /api/super-admin/usb/status — tells the client whether the pen-drive
// gate is enforced on this server (i.e. SUPER_ADMIN_USB_KEY is set). Used by
// the billing UI to decide whether to show the "Insert USB key" affordance
// at all. No secrets in the response.
superAdminRouter.get("/usb/status", (_req, res): void => {
  res.json({ enforced: isUsbGateEnforced() });
});

// No generated zod schemas exist for these auth endpoints (they are not in
// the OpenAPI spec), so we declare local schemas and use the same safeParse
// pattern as the validated routes (appointments, expenses, etc.).
const LoginBody = z.object({
  name: z.string().trim().min(1, "name is required"),
  pin: z.string().trim().min(1, "pin is required"),
});

const LogoutBody = z.object({
  token: z.string().min(1, "token is required"),
});

const VerifyBody = z.object({
  token: z.string().min(1).optional(),
});

// Rate limiter: max 5 attempts per IP per 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
});

function generateToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

function isBcryptHash(value: string): boolean {
  return value.startsWith("$2a$") || value.startsWith("$2b$") || value.startsWith("$2y$");
}

// Constant-time PIN verification with plaintext legacy fallback
async function verifyPin(plain: string, stored: string): Promise<boolean> {
  if (isBcryptHash(stored)) {
    return bcrypt.compare(plain, stored);
  }
  // Legacy plaintext — constant-time compare
  const a = Buffer.from(plain);
  const b = Buffer.from(stored);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// POST /api/super-admin/login — validates name + PIN, creates session token.
// Gated by the USB pen-drive middleware: without a valid X-SA-USB-Key header
// the request is rejected before the PIN is even checked. This makes the
// super-admin login surface invisible to anyone without the physical key.
superAdminRouter.post("/login", requireSuperAdminUsb, loginLimiter, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }
  const { name, pin } = parsed.data;

  const [user] = await db.select().from(usersTable)
    .where(and(sql`lower(${usersTable.name}) = lower(${name})`, eq(usersTable.isActive, true)));

  if (!user) { res.status(401).json({ error: "Invalid credentials" }); return; }
  if (user.role !== "super_admin") { res.status(403).json({ error: "Access denied — not a super admin" }); return; }
  if (!user.pin) { res.status(401).json({ error: "No PIN configured for this user" }); return; }

  const pinMatches = await verifyPin(pin, user.pin);
  if (!pinMatches) { res.status(401).json({ error: "Invalid credentials" }); return; }

  // Transparently upgrade plaintext legacy PINs to bcrypt on first successful login
  if (!isBcryptHash(user.pin)) {
    const hashed = await bcrypt.hash(pin, 12);
    await db.update(usersTable).set({ pin: hashed }).where(eq(usersTable.id, user.id));
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8-hour session

  await db.insert(superAdminSessionsTable).values({
    token,
    userId: user.id,
    userName: user.name,
    expiresAt,
    isActive: true,
  });

  res.json({ token, userName: user.name, expiresAt: expiresAt.toISOString() });
});

// POST /api/super-admin/logout — revoke a session token
superAdminRouter.post("/logout", async (req, res): Promise<void> => {
  const parsed = LogoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }
  const { token } = parsed.data;

  await db.update(superAdminSessionsTable)
    .set({ isActive: false })
    .where(eq(superAdminSessionsTable.token, token));

  res.json({ ok: true });
});

// POST /api/super-admin/verify — check if token is active.
// Token is accepted in the request body (never in the query string to avoid
// exposure in logs, browser history, and reverse-proxy access logs).
superAdminRouter.post("/verify", async (req, res): Promise<void> => {
  const parsed = VerifyBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }
  const token = parsed.data.token ?? null;
  if (!token) { res.json({ active: false, userName: null }); return; }

  const [session] = await db.select().from(superAdminSessionsTable)
    .where(eq(superAdminSessionsTable.token, token));

  if (!session || !session.isActive || new Date(session.expiresAt) < new Date()) {
    if (session && session.isActive && new Date(session.expiresAt) < new Date()) {
      // Auto-deactivate expired sessions
      await db.update(superAdminSessionsTable)
        .set({ isActive: false })
        .where(eq(superAdminSessionsTable.token, token));
    }
    res.json({ active: false, userName: null });
    return;
  }

  res.json({ active: true, userName: session.userName, expiresAt: session.expiresAt });
});

// ── GET /api/super-admin/doctors-list — thin read for SA portal pages ─────────
// Returns id, name, ledgerId, specialization — all fields the portal dropdowns
// and the AssignDoctors modal need. Protected by requireSuperAdmin (which also
// checks the USB key when the gate is enforced).
superAdminRouter.get("/doctors-list", requireSuperAdmin, async (_req, res): Promise<void> => {
  const doctors = await db
    .select({
      id: doctorsTable.id,
      name: doctorsTable.name,
      specialization: doctorsTable.specialization,
      ledgerId: doctorsTable.ledgerId,
      defaultCommission: doctorsTable.defaultCommission,
      defaultCommissionType: doctorsTable.defaultCommissionType,
    })
    .from(doctorsTable)
    .orderBy(asc(doctorsTable.name));
  res.json({ doctors });
});

// ── GET /api/super-admin/tests-list — thin read for SA portal pages ───────────
superAdminRouter.get("/tests-list", requireSuperAdmin, async (_req, res): Promise<void> => {
  const tests = await db
    .select({
      id: testsTable.id,
      name: testsTable.name,
      category: testsTable.category,
    })
    .from(testsTable)
    .where(eq(testsTable.isActive, true))
    .orderBy(asc(testsTable.name));
  res.json({ tests });
});

// ── GET /api/super-admin/books — ledgers with stats for Books page ────────────
// Mirrors the GET /api/ledgers logic but protected by SA auth instead of staff
// auth, since the Books page lives in the super-admin portal.
superAdminRouter.get("/books", requireSuperAdmin, async (_req, res): Promise<void> => {
  // Ensure default ledger exists
  const [existing] = await db.select({ id: ledgersTable.id }).from(ledgersTable).where(eq(ledgersTable.id, 1));
  if (!existing) {
    await db.execute(sql`
      INSERT INTO ledgers (id, name, is_default, created_at)
      VALUES (1, 'Default / Walk-in', true, NOW())
      ON CONFLICT (id) DO NOTHING
    `);
  }

  const ledgers = await db.select().from(ledgersTable).orderBy(ledgersTable.id);

  // For id=1 (default), also count rows where ledger_id IS NULL (legacy rows).
  // Each table gets its own typed condition to avoid Drizzle's strict column brand checks.
  const result = await Promise.all(
    ledgers.map(async (l) => {
      const isDefault = l.id === 1;
      const [doctorCount, patientCount, billCount, orderCount, appointmentCount] = await Promise.all([
        db.select({ c: sql<number>`count(*)` }).from(doctorsTable)
          .where(isDefault ? or(eq(doctorsTable.ledgerId, 1), isNull(doctorsTable.ledgerId))! : eq(doctorsTable.ledgerId, l.id)),
        db.select({ c: sql<number>`count(*)` }).from(patientsTable)
          .where(isDefault ? or(eq(patientsTable.ledgerId, 1), isNull(patientsTable.ledgerId))! : eq(patientsTable.ledgerId, l.id)),
        db.select({ c: sql<number>`count(*)` }).from(billsTable)
          .where(isDefault ? or(eq(billsTable.ledgerId, 1), isNull(billsTable.ledgerId))! : eq(billsTable.ledgerId, l.id)),
        db.select({ c: sql<number>`count(*)` }).from(ordersTable)
          .where(isDefault ? or(eq(ordersTable.ledgerId, 1), isNull(ordersTable.ledgerId))! : eq(ordersTable.ledgerId, l.id)),
        db.select({ c: sql<number>`count(*)` }).from(appointmentsTable)
          .where(isDefault ? or(eq(appointmentsTable.ledgerId, 1), isNull(appointmentsTable.ledgerId))! : eq(appointmentsTable.ledgerId, l.id)),
      ]);
      return {
        ...l,
        doctorCount: Number(doctorCount[0]?.c ?? 0),
        patientCount: Number(patientCount[0]?.c ?? 0),
        billCount: Number(billCount[0]?.c ?? 0),
        orderCount: Number(orderCount[0]?.c ?? 0),
        appointmentCount: Number(appointmentCount[0]?.c ?? 0),
      };
    }),
  );

  res.json(result);
});

// ─────────────────────────────────────────────────────────────────────────────
// MONEY TRAIL AUDIT RUNS
// ─────────────────────────────────────────────────────────────────────────────
// All routes require both the USB pen-drive gate and a valid super-admin
// session token. Snapshots persist a Books-Sanity report to the audit_runs
// table so the audit trail survives later edits to the underlying bills.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SaveAuditBody = z.object({
  from: z.string().regex(ISO_DATE_RE, "from must be YYYY-MM-DD"),
  to: z.string().regex(ISO_DATE_RE, "to must be YYYY-MM-DD"),
  notes: z.string().max(4000).optional(),
});

async function getCurrentSuperAdminName(req: import("express").Request): Promise<string> {
  try {
    const token = (req.header("x-sa-token") ?? "").trim();
    if (!token) return "super-admin";
    const [row] = await db
      .select({ userName: superAdminSessionsTable.userName })
      .from(superAdminSessionsTable)
      .where(eq(superAdminSessionsTable.token, token))
      .limit(1);
    return row?.userName ?? "super-admin";
  } catch {
    return "super-admin";
  }
}

// Live preview: run a Books-Sanity report without persisting. Gated by USB +
// SA so the Money-Trail Audit page in the super-admin-portal can fetch it
// using saAuthHeaders() (the regular /api/books-sanity route is gated by
// requireStaffAuth which doesn't recognise SA tokens).
superAdminRouter.get("/books-sanity-preview", requireSuperAdminUsb, requireSuperAdmin, async (req, res) => {
  const fromRaw = typeof req.query.from === "string" ? req.query.from : null;
  const toRaw = typeof req.query.to === "string" ? req.query.to : null;
  if ((fromRaw && !ISO_DATE_RE.test(fromRaw)) || (toRaw && !ISO_DATE_RE.test(toRaw))) {
    res.status(400).json({ error: "from/to must be YYYY-MM-DD" });
    return;
  }
  if (fromRaw && toRaw && fromRaw > toRaw) {
    res.status(400).json({ error: "'from' must be on or before 'to'" });
    return;
  }
  const report = await runBooksSanity({ from: fromRaw, to: toRaw });
  res.json(report);
});

// List past audit runs (most recent first). No snapshot payload — just a
// summary row per audit. Use GET /:id to fetch the full snapshot.
superAdminRouter.get("/audit-runs", requireSuperAdminUsb, requireSuperAdmin, async (_req, res) => {
  const rows = await db.select({
    id: auditRunsTable.id,
    periodFrom: auditRunsTable.periodFrom,
    periodTo: auditRunsTable.periodTo,
    generatedAt: auditRunsTable.generatedAt,
    completedAt: auditRunsTable.completedAt,
    completedBy: auditRunsTable.completedBy,
    source: auditRunsTable.source,
    notes: auditRunsTable.notes,
    anomalyCount: auditRunsTable.anomalyCount,
    highCount: auditRunsTable.highCount,
    totalImpact: auditRunsTable.totalImpact,
    emailSentAt: auditRunsTable.emailSentAt,
  }).from(auditRunsTable).orderBy(desc(auditRunsTable.generatedAt)).limit(200);
  res.json({ items: rows });
});

// Fetch a single past audit including the full snapshot payload.
superAdminRouter.get("/audit-runs/:id", requireSuperAdminUsb, requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db.select().from(auditRunsTable).where(eq(auditRunsTable.id, id)).limit(1);
  if (!row) {
    res.status(404).json({ error: "Audit not found" });
    return;
  }
  res.json(row);
});

// Run a fresh Books-Sanity report and persist it. Marks the audit complete
// in a single step (the operator already reviewed the on-screen report
// before clicking "Mark Audit Complete").
superAdminRouter.post("/audit-runs", requireSuperAdminUsb, requireSuperAdmin, async (req, res) => {
  const parsed = SaveAuditBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }
  const { from, to, notes } = parsed.data;
  if (from > to) {
    res.status(400).json({ error: "'from' must be on or before 'to'" });
    return;
  }

  const report = await runBooksSanity({ from, to });
  const anomalyCount = report.anomalies.reduce((s, a) => s + a.count, 0);
  const highCount = report.anomalies.filter((a) => a.severity === "high").reduce((s, a) => s + a.count, 0);
  const totalImpact = report.anomalies.reduce((s, a) => s + (a.totalAmount || 0), 0);
  const completedBy = await getCurrentSuperAdminName(req);

  const [inserted] = await db.insert(auditRunsTable).values({
    periodFrom: from,
    periodTo: to,
    completedAt: new Date(),
    completedBy,
    source: "manual",
    notes: notes ?? null,
    anomalyCount,
    highCount,
    totalImpact: String(totalImpact),
    snapshot: report,
  }).returning();

  res.json(inserted);
});

// Hard-delete an audit run. Super-admin only (already enforced by middleware).
superAdminRouter.delete("/audit-runs/:id", requireSuperAdminUsb, requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(auditRunsTable).where(eq(auditRunsTable.id, id));
  res.json({ ok: true });
});
