import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

const ROLES = ["admin", "manager", "billing", "lab", "receptionist"];

const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  admin: ["/", "/patients", "/orders", "/tests", "/billing", "/payments", "/doctors", "/reports", "/report-generator", "/inventory", "/referrals", "/accounting", "/settings", "/register"],
  manager: ["/", "/patients", "/orders", "/billing", "/payments", "/doctors", "/reports", "/referrals", "/accounting", "/register"],
  billing: ["/", "/patients", "/billing", "/payments", "/register"],
  lab: ["/orders", "/tests", "/report-generator", "/inventory"],
  receptionist: ["/", "/patients", "/orders", "/register"],
};

router.get("/", async (_req, res) => {
  const users = await db.select().from(usersTable).orderBy(usersTable.name);
  res.json(users.map(u => ({ ...u, pin: undefined })));
});

router.post("/", async (req, res) => {
  const { name, email, role, permissions, pin } = req.body;
  if (!name || !email || !role) return res.status(400).json({ error: "name, email and role are required" });

  const perms = permissions ?? DEFAULT_PERMISSIONS[role] ?? DEFAULT_PERMISSIONS.receptionist;
  const [user] = await db
    .insert(usersTable)
    .values({ name, email, role, permissions: JSON.stringify(perms), pin: pin || null })
    .returning();
  res.status(201).json({ ...user, pin: undefined });
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

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ ...user, pin: undefined });
});

router.delete("/:id", async (req, res) => {
  await db.delete(usersTable).where(eq(usersTable.id, Number(req.params.id)));
  res.json({ ok: true });
});

router.get("/default-permissions", async (_req, res) => {
  res.json(DEFAULT_PERMISSIONS);
});

export default router;
