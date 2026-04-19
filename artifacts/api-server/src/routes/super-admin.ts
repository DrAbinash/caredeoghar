import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, superAdminSessionsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

export const superAdminRouter = Router();

function generateToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

// POST /api/super-admin/login — validates name + PIN, creates session token
superAdminRouter.post("/login", async (req, res) => {
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
  if (user.pin !== pin) return res.status(401).json({ error: "Invalid PIN" });

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

// GET /api/super-admin/verify?token=xxx — check if token is active
superAdminRouter.get("/verify", async (req, res) => {
  const token = req.query.token as string;
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
