import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { portalSessionsTable, usersTable } from "@workspace/db/schema";
import { and, eq, gt } from "drizzle-orm";

export interface StaffAuthRequest extends Request {
  staffSession?: {
    id: number;
    subjectId: number;
    subjectName: string;
    role: string;
    permissions: string[];
    maxDiscount: number | null;
  };
}

const FULL_ACCESS_ROLES = new Set(["admin", "super_admin"]);

/**
 * Express middleware that requires a valid, active, non-expired staff portal
 * session token in the `Authorization: Bearer <token>` request header.
 *
 * After validating the session it loads the corresponding user record to:
 *   - Verify the account is still active (`isActive = true`).
 *   - Attach `role`, `permissions`, and `maxDiscount` so that downstream
 *     `requireStaffPermission` middleware can enforce module-level access
 *     control entirely on the server side.
 */
export async function requireStaffAuth(
  req: StaffAuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (!token) {
    res.status(401).json({ error: "Staff authentication required" });
    return;
  }

  const [session] = await db
    .select()
    .from(portalSessionsTable)
    .where(
      and(
        eq(portalSessionsTable.token, token),
        eq(portalSessionsTable.scope, "staff"),
        gt(portalSessionsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!session) {
    res.status(401).json({ error: "Invalid or expired staff session. Please log in again." });
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      role: usersTable.role,
      permissions: usersTable.permissions,
      maxDiscount: usersTable.maxDiscount,
      isActive: usersTable.isActive,
    })
    .from(usersTable)
    .where(eq(usersTable.id, session.subjectId))
    .limit(1);

  if (!user || !user.isActive) {
    res.status(401).json({ error: "Staff account is inactive or no longer exists. Please contact an administrator." });
    return;
  }

  let permissions: string[] = [];
  try {
    if (user.permissions) {
      const parsed = JSON.parse(user.permissions);
      if (Array.isArray(parsed)) {
        permissions = parsed.filter((p) => typeof p === "string");
      }
    }
  } catch {
    /* leave permissions empty */
  }

  req.staffSession = {
    id: session.id,
    subjectId: session.subjectId,
    subjectName: session.subjectName,
    role: user.role,
    permissions,
    maxDiscount: user.maxDiscount != null ? Number(user.maxDiscount) : null,
  };

  next();
}

/**
 * Middleware factory that enforces a module-level permission on top of
 * `requireStaffAuth`. Must be used *after* `requireStaffAuth` in the chain.
 *
 * Admin and super_admin roles always pass through.  All other roles must have
 * the requested permission string present in their `permissions` array.
 *
 * @param permission  The permission path string, e.g. `"/patients"`,
 *                    `"/billing"`, `"/accounting"`, `"/settings"`.
 */
export function requireStaffPermission(permission: string) {
  return (req: StaffAuthRequest, res: Response, next: NextFunction): void => {
    const session = req.staffSession;
    if (!session) {
      res.status(401).json({ error: "Staff authentication required" });
      return;
    }

    if (FULL_ACCESS_ROLES.has(session.role)) {
      next();
      return;
    }

    if (session.permissions.includes(permission)) {
      next();
      return;
    }

    res.status(403).json({ error: "Access denied: you do not have permission to access this module." });
  };
}
