import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { usersTable, superAdminSessionsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import {
  requireSuperAdminUsb,
  isValidUsbKey,
  isUsbGateEnforced,
} from "../middleware/requireSuperAdminUsb";

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
    .where(and(eq(usersTable.name, name), eq(usersTable.isActive, true)));

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
