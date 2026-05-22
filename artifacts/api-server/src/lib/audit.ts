import { db, auditLogsTable } from "@workspace/db";
import type { InsertAuditLog } from "@workspace/db/schema";
import type { Request } from "express";
import { logger } from "./logger";

/**
 * Write an immutable audit log entry.
 * This is a fire-and-forget helper: errors are logged but never thrown,
 * so a failed audit write never breaks a business transaction.
 */
export async function auditLog(payload: Omit<InsertAuditLog, "ipAddress" | "userAgent"> & { ipAddress?: string; userAgent?: string }): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      userId: payload.userId ?? null,
      userName: payload.userName ?? "system",
      role: payload.role ?? "system",
      action: payload.action,
      module: payload.module,
      entityType: payload.entityType ?? null,
      entityId: payload.entityId ?? null,
      oldValue: payload.oldValue ? String(payload.oldValue).slice(0, 65535) : null,
      newValue: payload.newValue ? String(payload.newValue).slice(0, 65535) : null,
      ipAddress: payload.ipAddress ?? null,
      userAgent: payload.userAgent ?? null,
      reason: payload.reason ?? null,
    });
  } catch (err) {
    logger.error({ err, payload }, "Audit log write failed");
  }
}

/**
 * Convenience helper that extracts IP and UA from an Express request.
 */
export async function auditFromRequest(
  req: Request,
  payload: Omit<InsertAuditLog, "ipAddress" | "userAgent">,
): Promise<void> {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : (req.ip ?? req.socket?.remoteAddress ?? "");
  await auditLog({
    ...payload,
    ipAddress: ip,
    userAgent: req.headers["user-agent"] ?? "",
  });
}
