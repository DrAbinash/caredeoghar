import { Router } from "express";
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
  const [user] = await db
    .insert(usersTable)
    .values({ name, email, role, permissions: JSON.stringify(perms), pin: pin || null, maxDiscount: maxDiscount != null ? String(maxDiscount) : null })
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
  if (req.body.pin !== undefined) updates.pin = req.body.pin;
  if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
  if (req.body.maxDiscount !== undefined) updates.maxDiscount = req.body.maxDiscount != null ? String(req.body.maxDiscount) : null;

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
  if (!user.pin || user.pin !== currentPin) {
    res.status(401).json({ error: "Current PIN is incorrect" });
    return;
  }
  if (String(newPin).length < 4) {
    res.status(400).json({ error: "New PIN must be at least 4 digits" });
    return;
  }

  const [updated] = await db.update(usersTable).set({ pin: String(newPin) }).where(eq(usersTable.id, id)).returning();
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
