import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import type { StaffAuthRequest } from "../middleware/requireStaffAuth";

const router = Router();

// Self-service: any authenticated staff member can persist their own sidebar
// theme preference without needing the /settings permission.
// Mounted BEFORE the /settings-gated usersRouter so this endpoint is reachable
// by all roles. Only the authenticated user may update their own record.
router.patch("/:id/sidebar-theme", async (req: StaffAuthRequest, res) => {
  const id = Number(req.params.id);
  if (!req.staffSession || req.staffSession.subjectId !== id) {
    res.status(403).json({ error: "You can only update your own preferences" });
    return;
  }
  const value = typeof req.body.sidebarTheme === "string" ? req.body.sidebarTheme : null;
  await db.update(usersTable).set({ sidebarTheme: value }).where(eq(usersTable.id, id));
  res.json({ ok: true });
  return;
});

export default router;
