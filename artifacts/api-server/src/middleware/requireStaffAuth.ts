import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { portalSessionsTable } from "@workspace/db/schema";
import { and, eq, gt } from "drizzle-orm";

export interface StaffAuthRequest extends Request {
  staffSession?: {
    id: number;
    subjectId: number;
    subjectName: string;
  };
}

/**
 * Express middleware that requires a valid, active, non-expired staff portal
 * session token in the `Authorization: Bearer <token>` request header. Used
 * to gate all sensitive ERP API routes so they are only accessible to
 * authenticated staff members — not by unauthenticated remote callers.
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

  req.staffSession = {
    id: session.id,
    subjectId: session.subjectId,
    subjectName: session.subjectName,
  };

  next();
}
