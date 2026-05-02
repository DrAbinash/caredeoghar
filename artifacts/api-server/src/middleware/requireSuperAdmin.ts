import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { superAdminSessionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

/**
 * Express middleware that requires a valid, active, non-expired super-admin
 * session token in the `X-SA-Token` request header. Used to gate sensitive
 * compliance routes (referral commission, doctor payout ledger) so they are
 * only accessible from the Super Admin Portal — not from the regular ERP UI.
 */
export async function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const headerVal = req.header("x-sa-token");
  const token = (typeof headerVal === "string" ? headerVal : "").trim();
  if (!token) {
    res.status(401).json({ error: "Super admin token required" });
    return;
  }

  const [session] = await db
    .select()
    .from(superAdminSessionsTable)
    .where(eq(superAdminSessionsTable.token, token));

  if (!session || !session.isActive) {
    res.status(401).json({ error: "Invalid super admin session" });
    return;
  }
  if (new Date(session.expiresAt) < new Date()) {
    res.status(401).json({ error: "Super admin session expired" });
    return;
  }
  next();
}
