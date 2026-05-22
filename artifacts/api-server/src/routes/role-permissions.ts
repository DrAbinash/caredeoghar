import { Router } from "express";
import { z } from "zod/v4";
import { db, rolePermissionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireSuperAdmin } from "../middleware/requireSuperAdmin";
import { requireSuperAdminUsb } from "../middleware/requireSuperAdminUsb";
import { logger } from "../lib/logger";
import { PERMISSION_MODULES, ERP_ROLES } from "@workspace/db/schema";

const router = Router();

router.use(requireSuperAdminUsb);
router.use(requireSuperAdmin);

// GET /api/admin/role-permissions — list all permission rows
router.get("/", async (_req, res) => {
  const rows = await db.select().from(rolePermissionsTable);
  // Group by role for the UI
  const grouped: Record<string, typeof rows> = {};
  for (const r of ERP_ROLES) grouped[r] = [];
  for (const row of rows) {
    if (!grouped[row.role]) grouped[row.role] = [];
    grouped[row.role].push(row);
  }
  res.json({ roles: ERP_ROLES, modules: PERMISSION_MODULES, permissions: grouped });
});

// PUT /api/admin/role-permissions — upsert a permission row
const UpsertBody = z.object({
  role: z.string().min(1),
  module: z.string().min(1),
  canView: z.boolean().default(false),
  canCreate: z.boolean().default(false),
  canEdit: z.boolean().default(false),
  canDelete: z.boolean().default(false),
  canPrint: z.boolean().default(false),
  canReprint: z.boolean().default(false),
  canRefund: z.boolean().default(false),
  canExport: z.boolean().default(false),
  canApprove: z.boolean().default(false),
  canFinalize: z.boolean().default(false),
});

router.put("/", async (req, res) => {
  const body = UpsertBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid body", details: body.error.format() });
    return;
  }
  const d = body.data;

  try {
    const existing = await db
      .select()
      .from(rolePermissionsTable)
      .where(and(eq(rolePermissionsTable.role, d.role), eq(rolePermissionsTable.module, d.module)))
      .limit(1);

    if (existing[0]) {
      await db
        .update(rolePermissionsTable)
        .set({
          canView: d.canView,
          canCreate: d.canCreate,
          canEdit: d.canEdit,
          canDelete: d.canDelete,
          canPrint: d.canPrint,
          canReprint: d.canReprint,
          canRefund: d.canRefund,
          canExport: d.canExport,
          canApprove: d.canApprove,
          canFinalize: d.canFinalize,
          updatedAt: new Date(),
        })
        .where(eq(rolePermissionsTable.id, existing[0].id));
      res.json({ updated: true, id: existing[0].id });
    } else {
      const [created] = await db
        .insert(rolePermissionsTable)
        .values({
          role: d.role,
          module: d.module,
          canView: d.canView,
          canCreate: d.canCreate,
          canEdit: d.canEdit,
          canDelete: d.canDelete,
          canPrint: d.canPrint,
          canReprint: d.canReprint,
          canRefund: d.canRefund,
          canExport: d.canExport,
          canApprove: d.canApprove,
          canFinalize: d.canFinalize,
        })
        .returning();
      res.status(201).json({ created: true, id: created.id });
    }
  } catch (err) {
    logger.error({ err }, "Role permission upsert failed");
    res.status(500).json({ error: "Failed to save role permission" });
  }
});

// POST /api/admin/role-permissions/seed — bootstrap default permissions
router.post("/seed", async (_req, res) => {
  try {
    // Super admin = all permissions
    for (const mod of PERMISSION_MODULES) {
      await db
        .insert(rolePermissionsTable)
        .values({
          role: "super_admin",
          module: mod,
          canView: true,
          canCreate: true,
          canEdit: true,
          canDelete: true,
          canPrint: true,
          canReprint: true,
          canRefund: true,
          canExport: true,
          canApprove: true,
          canFinalize: true,
        })
        .onConflictDoNothing({ target: [rolePermissionsTable.role, rolePermissionsTable.module] });
    }

    // Admin = everything except backups and audit
    for (const mod of PERMISSION_MODULES) {
      const isRestricted = mod === "backups" || mod === "audit";
      await db
        .insert(rolePermissionsTable)
        .values({
          role: "admin",
          module: mod,
          canView: true,
          canCreate: !isRestricted,
          canEdit: !isRestricted,
          canDelete: !isRestricted,
          canPrint: true,
          canReprint: true,
          canRefund: true,
          canExport: true,
          canApprove: true,
          canFinalize: true,
        })
        .onConflictDoNothing({ target: [rolePermissionsTable.role, rolePermissionsTable.module] });
    }

    // Reception — patients, appointments, billing (view only), dashboard
    for (const mod of PERMISSION_MODULES) {
      const perms = {
        patients: { canView: true, canCreate: true, canEdit: true, canPrint: true, canExport: false },
        billing: { canView: true, canCreate: false, canEdit: false, canPrint: true, canExport: false },
        dashboard: { canView: true, canCreate: false, canEdit: false, canPrint: false, canExport: false },
        payments: { canView: true, canCreate: true, canEdit: false, canPrint: true, canExport: false },
        appointments: { canView: true, canCreate: true, canEdit: true, canPrint: true, canExport: false },
      } as Record<string, Record<string, boolean>>;
      const m = perms[mod] ?? { canView: false, canCreate: false, canEdit: false, canPrint: false, canExport: false };
      await db
        .insert(rolePermissionsTable)
        .values({
          role: "reception",
          module: mod,
          canView: m.canView ?? false,
          canCreate: m.canCreate ?? false,
          canEdit: m.canEdit ?? false,
          canDelete: false,
          canPrint: m.canPrint ?? false,
          canReprint: false,
          canRefund: false,
          canExport: m.canExport ?? false,
          canApprove: false,
          canFinalize: false,
        })
        .onConflictDoNothing({ target: [rolePermissionsTable.role, rolePermissionsTable.module] });
    }

    res.json({ seeded: true });
  } catch (err) {
    logger.error({ err }, "Role permission seed failed");
    res.status(500).json({ error: "Failed to seed role permissions" });
  }
});

export { router as rolePermissionsRouter };
