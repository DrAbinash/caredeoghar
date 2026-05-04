import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable, superAdminSessionsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

export const superAdminRouter = Router();

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

// POST /api/super-admin/login — validates name + PIN, creates session token
superAdminRouter.post("/login", loginLimiter, async (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const pin = typeof req.body.pin === "string" ? req.body.pin.trim() : "";
  if (!name || !pin) {
    return res.status(400).json({ error: "name and pin are required" });
  }

  const [user] = await db.select().from(usersTable)
    .where(and(eq(usersTable.name, name), eq(usersTable.isActive, true)));

  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  if (user.role !== "super_admin") return res.status(403).json({ error: "Access denied — not a super admin" });
  if (!user.pin) return res.status(401).json({ error: "No PIN configured for this user" });

  const pinMatches = await verifyPin(pin, user.pin);
  if (!pinMatches) return res.status(401).json({ error: "Invalid credentials" });

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
superAdminRouter.post("/logout", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "token is required" });

  await db.update(superAdminSessionsTable)
    .set({ isActive: false })
    .where(eq(superAdminSessionsTable.token, token));

  res.json({ ok: true });
});

// POST /api/super-admin/verify — check if token is active.
// Token is accepted in the request body (never in the query string to avoid
// exposure in logs, browser history, and reverse-proxy access logs).
superAdminRouter.post("/verify", async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token : null;
  if (!token) return res.json({ active: false, userName: null });

  const [session] = await db.select().from(superAdminSessionsTable)
    .where(eq(superAdminSessionsTable.token, token));

  if (!session || !session.isActive || new Date(session.expiresAt) < new Date()) {
    if (session && session.isActive && new Date(session.expiresAt) < new Date()) {
      // Auto-deactivate expired sessions
      await db.update(superAdminSessionsTable)
        .set({ isActive: false })
        .where(eq(superAdminSessionsTable.token, token));
    }
    return res.json({ active: false, userName: null });
  }

  res.json({ active: true, userName: session.userName, expiresAt: session.expiresAt });
});
