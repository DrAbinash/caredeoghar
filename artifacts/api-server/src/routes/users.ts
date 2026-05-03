import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

const ROLES = ["super_admin", "admin", "manager", "accountant", "billing", "lab", "receptionist"];

const ALL_PATHS = ["/", "/patients", "/orders", "/tests", "/billing", "/payments", "/doctors", "/reports", "/report-generator", "/inventory", "/referrals", "/accounting", "/discounts", "/settings", "/register", "/pacs"];

const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  super_admin: ALL_PATHS,
  admin: ["/", "/patients", "/orders", "/tests", "/billing", "/payments", "/doctors", "/reports", "/report-generator", "/inventory", "/referrals", "/accounting", "/discounts", "/settings", "/register"],
  manager: ["/", "/patients", "/orders", "/billing", "/payments", "/doctors", "/reports", "/referrals", "/accounting", "/discounts", "/register"],
  accountant: ["/", "/accounting", "/reports", "/billing", "/payments"],
  billing: ["/", "/patients", "/billing", "/payments", "/register", "/discounts"],
  lab: ["/orders", "/tests", "/report-generator", "/inventory"],
  receptionist: ["/", "/patients", "/orders", "/register"],
};

const BCRYPT_ROUNDS = 12;

function isBcryptHash(value: string): boolean {
  return value.startsWith("$2a$") || value.startsWith("$2b$") || value.startsWith("$2y$");
}

router.get("/", async (_req, res) => {
  const users = await db.select().from(usersTable).orderBy(usersTable.name);
  res.json(users.map(u => ({ ...u, pin: undefined })));
  return;
});

router.post("/", async (req, res) => {
  const { name, email, role, permissions, pin, maxDiscount } = req.body;
  if (!name || !email || !role) {
    res.status(400).json({ error: "name, email and role are required" });
    return;
  }

  const perms = permissions ?? DEFAULT_PERMISSIONS[role] ?? DEFAULT_PERMISSIONS.receptionist;

  // Hash the PIN before storing — never persist plaintext credentials
  let hashedPin: string | null = null;
  if (pin) {
    if (String(pin).length < 6) {
      res.status(400).json({ error: "PIN must be at least 6 characters" });
      return;
    }
    hashedPin = await bcrypt.hash(String(pin), BCRYPT_ROUNDS);
  }

  const [user] = await db
    .insert(usersTable)
    .values({ name, email, role, permissions: JSON.stringify(perms), pin: hashedPin, maxDiscount: maxDiscount != null ? String(maxDiscount) : null })
    .returning();
  res.status(201).json({ ...user, pin: undefined, maxDiscount: user.maxDiscount != null ? Number(user.maxDiscount) : null });
  return;
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.email !== undefined) updates.email = req.body.email;
  if (req.body.role !== undefined) updates.role = req.body.role;
  if (req.body.permissions !== undefined) updates.permissions = JSON.stringify(req.body.permissions);
  if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
  if (req.body.maxDiscount !== undefined) updates.maxDiscount = req.body.maxDiscount != null ? String(req.body.maxDiscount) : null;

  // Hash the PIN before storing when an admin sets/resets it
  if (req.body.pin !== undefined) {
    if (req.body.pin === null || req.body.pin === "") {
      updates.pin = null;
    } else {
      const pinStr = String(req.body.pin);
      if (pinStr.length < 6) {
        res.status(400).json({ error: "PIN must be at least 6 characters" });
        return;
      }
      updates.pin = await bcrypt.hash(pinStr, BCRYPT_ROUNDS);
    }
  }

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ ...user, pin: undefined, maxDiscount: user.maxDiscount != null ? Number(user.maxDiscount) : null });
  return;
});

router.patch("/:id/password", async (req, res) => {
  const id = Number(req.params.id);
  const { currentPin, newPin } = req.body;
  if (!currentPin || !newPin) {
    res.status(400).json({ error: "currentPin and newPin are required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (!user.pin) {
    res.status(401).json({ error: "Current PIN is incorrect" });
    return;
  }

  // Verify current PIN — support both bcrypt hashes and legacy plaintext
  let currentPinMatches: boolean;
  if (isBcryptHash(user.pin)) {
    currentPinMatches = await bcrypt.compare(String(currentPin), user.pin);
  } else {
    // Legacy plaintext — constant-time compare, then upgrade hash below
    const a = Buffer.from(String(currentPin));
    const b = Buffer.from(user.pin);
    currentPinMatches = a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  if (!currentPinMatches) {
    res.status(401).json({ error: "Current PIN is incorrect" });
    return;
  }

  const newPinStr = String(newPin);
  if (newPinStr.length < 6) {
    res.status(400).json({ error: "New PIN must be at least 6 characters" });
    return;
  }

  const hashed = await bcrypt.hash(newPinStr, BCRYPT_ROUNDS);
  const [updated] = await db.update(usersTable).set({ pin: hashed }).where(eq(usersTable.id, id)).returning();
  res.json({ ...updated, pin: undefined, maxDiscount: updated.maxDiscount != null ? Number(updated.maxDiscount) : null });
  return;
});

router.delete("/:id", async (req, res) => {
  await db.delete(usersTable).where(eq(usersTable.id, Number(req.params.id)));
  res.json({ ok: true });
  return;
});

router.get("/default-permissions", async (_req, res) => {
  res.json(DEFAULT_PERMISSIONS);
  return;
});

export default router;
