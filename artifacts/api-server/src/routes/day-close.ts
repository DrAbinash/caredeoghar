import { Router } from "express";
import { db, paymentsTable, dayClosuresTable, userDayClosuresTable, billsTable, usersTable } from "@workspace/db";
import { eq, and, gt, lte, desc, sql } from "drizzle-orm";
import { z } from "zod";
import type { Response, NextFunction } from "express";
import type { StaffAuthRequest } from "../middleware/requireStaffAuth";

// Inline super-admin gate that works on the regular ERP staff session
// (req.staffSession.role === "super_admin"). The site-wide
// `requireSuperAdmin` middleware uses the X-SA-Token header issued by
// the Super Admin Portal — that is not in scope here because the reopen
// button lives inside the regular ERP UI.
function requireSuperAdminStaff(req: StaffAuthRequest, res: Response, next: NextFunction): void {
  if (req.staffSession?.role !== "super_admin") {
    res.status(403).json({ error: "Super-admin role required" });
    return;
  }
  next();
}

export const dayCloseRouter = Router();

// ── Helpers ────────────────────────────────────────────────────────────────

function n(v: unknown): number {
  return Number(v ?? 0) || 0;
}

// Compute the coverage window for the next close: from the latest existing
// closure's `coveredToTs` (exclusive) up to "now" (inclusive). Returns null
// from when no prior closure exists — the SQL builder uses gt(ts, null) by
// just omitting the lower bound.
async function lastClosureBoundary(): Promise<Date | null> {
  const [last] = await db
    .select({ coveredToTs: dayClosuresTable.coveredToTs })
    .from(dayClosuresTable)
    .where(eq(dayClosuresTable.status, "closed"))
    .orderBy(desc(dayClosuresTable.coveredToTs))
    .limit(1);
  return last?.coveredToTs ? new Date(last.coveredToTs) : null;
}

type MethodTotals = { cash: number; upi: number; card: number; cheque: number; other: number; total: number; count: number };

function emptyTotals(): MethodTotals {
  return { cash: 0, upi: 0, card: 0, cheque: 0, other: 0, total: 0, count: 0 };
}

function bucketMethod(method: string): keyof Omit<MethodTotals, "total" | "count"> {
  const m = (method || "").toLowerCase();
  if (m === "cash") return "cash";
  if (m === "upi") return "upi";
  if (m === "card") return "card";
  if (m === "cheque") return "cheque";
  return "other";
}

// Aggregate payments in the window (from, to] grouped overall + by staff.
async function summarizeWindow(from: Date | null, to: Date) {
  const where = from
    ? and(gt(paymentsTable.createdAt, from), lte(paymentsTable.createdAt, to))
    : lte(paymentsTable.createdAt, to);

  const rows = await db
    .select({
      id: paymentsTable.id,
      amount: paymentsTable.amount,
      method: paymentsTable.method,
      createdAt: paymentsTable.createdAt,
      recordedByName: paymentsTable.recordedByName,
      billId: paymentsTable.billId,
    })
    .from(paymentsTable)
    .where(where);

  const overall = emptyTotals();
  // payments table only stores `recordedByName` (free text) — no FK to users
  // — so we group by that string. `userId` is kept on the row shape for
  // forward compatibility but is always null for now.
  const byStaff = new Map<string, MethodTotals & { userId: number | null; userName: string }>();
  const billIds = new Set<number>();

  for (const r of rows) {
    const amt = n(r.amount);
    const bucket = bucketMethod(r.method);
    overall[bucket] += amt;
    overall.total += amt;
    overall.count += 1;
    if (r.billId != null) billIds.add(r.billId);

    const name = (r.recordedByName ?? "").trim() || "Unassigned";
    if (!byStaff.has(name)) {
      byStaff.set(name, { ...emptyTotals(), userId: null, userName: name });
    }
    const s = byStaff.get(name)!;
    s[bucket] += amt;
    s.total += amt;
    s.count += 1;
  }

  return {
    overall,
    byStaff: Array.from(byStaff.values()).sort((a, b) => b.total - a.total),
    billsCount: billIds.size,
  };
}

// ── Routes ─────────────────────────────────────────────────────────────────

// Preview what closing the day right now would look like.
dayCloseRouter.get("/preview", async (_req, res) => {
  const from = await lastClosureBoundary();
  const to = new Date();
  const summary = await summarizeWindow(from, to);
  res.json({
    coveredFromTs: from,
    coveredToTs: to,
    expected: summary.overall,
    byStaff: summary.byStaff,
    billsCount: summary.billsCount,
    paymentsCount: summary.overall.count,
  });
});

const CreateBody = z.object({
  actuals: z.object({
    cash: z.coerce.number().min(0).default(0),
    upi: z.coerce.number().min(0).default(0),
    card: z.coerce.number().min(0).default(0),
    cheque: z.coerce.number().min(0).default(0),
    other: z.coerce.number().min(0).default(0),
  }),
  varianceNote: z.string().max(2000).default(""),
});

// Close the day.
dayCloseRouter.post("/", async (req, res) => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.format() });
    return;
  }
  const { actuals, varianceNote } = parsed.data;

  // Wrap the boundary-read + summarize + insert in a single transaction
  // and take a Postgres advisory lock so two concurrent close attempts
  // serialize. Without this, two clerks pressing "Close" within the same
  // millisecond would each compute the same boundary and create two
  // overlapping closures covering the same payments.
  const inserted = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(7390021)`);

    const [last] = await tx
      .select({ coveredToTs: dayClosuresTable.coveredToTs })
      .from(dayClosuresTable)
      .where(eq(dayClosuresTable.status, "closed"))
      .orderBy(desc(dayClosuresTable.coveredToTs))
      .limit(1);
    const from = last?.coveredToTs ? new Date(last.coveredToTs) : null;
    const to = new Date();
    const summary = await summarizeWindow(from, to);

    const totalExpected = summary.overall.total;
    const totalActual = actuals.cash + actuals.upi + actuals.card + actuals.cheque + actuals.other;
    const variance = totalActual - totalExpected;

    const istDateLabel = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(to);
    const session = (req as StaffAuthRequest).staffSession;
    const closedByName = session?.subjectName || "Unknown";

    const [row] = await tx
      .insert(dayClosuresTable)
      .values({
        closureDate: istDateLabel,
        closedAt: to,
        closedByUserId: session?.subjectId ?? null,
        closedByName,
        coveredFromTs: from,
        coveredToTs: to,
        expectedCash: String(summary.overall.cash),
        expectedUpi: String(summary.overall.upi),
        expectedCard: String(summary.overall.card),
        expectedCheque: String(summary.overall.cheque),
        expectedOther: String(summary.overall.other),
        actualCash: String(actuals.cash),
        actualUpi: String(actuals.upi),
        actualCard: String(actuals.card),
        actualCheque: String(actuals.cheque),
        actualOther: String(actuals.other),
        variance: String(variance),
        varianceNote,
        billsCount: summary.billsCount,
        paymentsCount: summary.overall.count,
        totalExpected: String(totalExpected),
        totalActual: String(totalActual),
        staffBreakdown: summary.byStaff,
        status: "closed",
      })
      .returning();
    return row;
  });

  req.log?.info({ closureId: inserted.id, totalExpected: inserted.totalExpected, totalActual: inserted.totalActual, variance: inserted.variance }, "Day closed");
  res.status(201).json(inserted);
});

// List all closures, newest first.
dayCloseRouter.get("/", async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
  const rows = await db
    .select()
    .from(dayClosuresTable)
    .orderBy(desc(dayClosuresTable.closedAt))
    .limit(limit);
  res.json(rows);
});

// Single closure detail.
dayCloseRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db.select().from(dayClosuresTable).where(eq(dayClosuresTable.id, id)).limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

// Re-open a closed day. SUPER-ADMIN role (regular ERP staff session) ONLY.
// We don't use the X-SA-Token-based `requireSuperAdmin` middleware here
// because the reopen action lives inside the regular ERP UI; gating on
// `staffSession.role === "super_admin"` matches that surface.
const ReopenBody = z.object({ reason: z.string().min(3).max(2000) });
dayCloseRouter.post("/:id/reopen", requireSuperAdminStaff, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = ReopenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Reason is required (min 3 chars)" });
    return;
  }
  const session = (req as StaffAuthRequest).staffSession;
  const reopenedByName = session?.subjectName || "Super-admin";
  const [updated] = await db
    .update(dayClosuresTable)
    .set({
      status: "reopened",
      reopenedAt: new Date(),
      reopenedByUserId: session?.subjectId ?? null,
      reopenedByName,
      reopenReason: parsed.data.reason,
    })
    .where(and(eq(dayClosuresTable.id, id), eq(dayClosuresTable.status, "closed")))
    .returning();
  if (!updated) {
    res.status(409).json({ error: "Closure not found or already reopened" });
    return;
  }
  req.log?.warn({ closureId: id, reopenedBy: reopenedByName }, "Day closure RE-OPENED");
  res.json(updated);
});

// ── Per-user helpers ────────────────────────────────────────────────────────

const OWNER_ROLES = new Set(["admin", "super_admin", "owner"]);

// Find the open-window start for a specific user:
// MAX(last overall day close, last user's own close).
// Both boundaries reset the window, so whichever is more recent wins.
async function userWindowBoundary(userName: string): Promise<Date | null> {
  const [lastOverall] = await db
    .select({ ts: dayClosuresTable.coveredToTs })
    .from(dayClosuresTable)
    .where(eq(dayClosuresTable.status, "closed"))
    .orderBy(desc(dayClosuresTable.coveredToTs))
    .limit(1);

  const [lastUser] = await db
    .select({ ts: userDayClosuresTable.closedAt })
    .from(userDayClosuresTable)
    .where(eq(userDayClosuresTable.userName, userName))
    .orderBy(desc(userDayClosuresTable.closedAt))
    .limit(1);

  const t1 = lastOverall?.ts ? new Date(lastOverall.ts) : null;
  const t2 = lastUser?.ts    ? new Date(lastUser.ts)    : null;
  if (!t1 && !t2) return null;
  if (!t1) return t2;
  if (!t2) return t1;
  return t1 > t2 ? t1 : t2;
}

type UserSummary = {
  totals: MethodTotals;
  billsCount: number;
  totalBilled: number;
  totalDue: number;
};

async function summarizeUserWindow(
  userName: string,
  from: Date | null,
  to: Date,
): Promise<UserSummary> {
  const pWhere = from
    ? and(eq(paymentsTable.recordedByName, userName), gt(paymentsTable.createdAt, from), lte(paymentsTable.createdAt, to))
    : and(eq(paymentsTable.recordedByName, userName), lte(paymentsTable.createdAt, to));

  const payments = await db
    .select({ amount: paymentsTable.amount, method: paymentsTable.method })
    .from(paymentsTable)
    .where(pWhere);

  const totals = emptyTotals();
  for (const p of payments) {
    const amt    = n(p.amount);
    const bucket = bucketMethod(p.method);
    totals[bucket] += amt;
    totals.total   += amt;
    totals.count++;
  }

  const bWhere = from
    ? and(
        eq(billsTable.createdByName, userName),
        gt(billsTable.createdAt, from),
        lte(billsTable.createdAt, to),
        sql`${billsTable.status} != 'cancelled'`,
      )
    : and(
        eq(billsTable.createdByName, userName),
        lte(billsTable.createdAt, to),
        sql`${billsTable.status} != 'cancelled'`,
      );

  const bills = await db
    .select({ totalAmount: billsTable.totalAmount, balanceAmount: billsTable.balanceAmount })
    .from(billsTable)
    .where(bWhere);

  return {
    totals,
    billsCount:  bills.length,
    totalBilled: bills.reduce((s, b) => s + n(b.totalAmount), 0),
    totalDue:    bills.reduce((s, b) => s + n(b.balanceAmount), 0),
  };
}

// ── Per-user routes ──────────────────────────────────────────────────────────

// Preview: current user's open window summary.
dayCloseRouter.get("/my-preview", async (req, res) => {
  const session  = (req as StaffAuthRequest).staffSession;
  const userName = session?.subjectName?.trim() ?? "";
  if (!userName) { res.status(401).json({ error: "Not authenticated" }); return; }

  const from = await userWindowBoundary(userName);
  const to   = new Date();
  const s    = await summarizeUserWindow(userName, from, to);

  res.json({
    userName,
    coveredFromTs: from,
    coveredToTs:   to,
    expected:      s.totals,
    billsCount:    s.billsCount,
    paymentsCount: s.totals.count,
    totalBilled:   s.totalBilled,
    totalDue:      s.totalDue,
  });
});

// List: current user's past closures.
dayCloseRouter.get("/my-list", async (req, res) => {
  const session  = (req as StaffAuthRequest).staffSession;
  const userName = session?.subjectName?.trim() ?? "";
  if (!userName) { res.status(401).json({ error: "Not authenticated" }); return; }

  const rows = await db
    .select()
    .from(userDayClosuresTable)
    .where(eq(userDayClosuresTable.userName, userName))
    .orderBy(desc(userDayClosuresTable.closedAt))
    .limit(60);

  res.json(rows);
});

const UserCloseBody = z.object({
  actuals: z.object({
    cash:   z.coerce.number().min(0).default(0),
    upi:    z.coerce.number().min(0).default(0),
    card:   z.coerce.number().min(0).default(0),
    cheque: z.coerce.number().min(0).default(0),
    other:  z.coerce.number().min(0).default(0),
  }),
  varianceNote: z.string().max(2000).default(""),
  notes:        z.string().max(2000).default(""),
});

// Close: record the current user's day close snapshot.
dayCloseRouter.post("/my-close", async (req, res) => {
  const session  = (req as StaffAuthRequest).staffSession;
  const userName = session?.subjectName?.trim() ?? "";
  const userId   = session?.subjectId ?? null;
  if (!userName) { res.status(401).json({ error: "Not authenticated" }); return; }

  const parsed = UserCloseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const { actuals, varianceNote, notes } = parsed.data;

  const inserted = await db.transaction(async (tx) => {
    // Per-user advisory lock to prevent duplicate concurrent closes.
    const lockId = BigInt(
      Math.abs(userName.split("").reduce((a, c) => ((a * 31 + c.charCodeAt(0)) | 0), 0)),
    );
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockId})`);

    const from = await userWindowBoundary(userName);
    const to   = new Date();
    const s    = await summarizeUserWindow(userName, from, to);

    const totalExpected = s.totals.total;
    const totalActual   = actuals.cash + actuals.upi + actuals.card + actuals.cheque + actuals.other;
    const variance      = totalActual - totalExpected;

    const istDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(to);

    const [row] = await tx
      .insert(userDayClosuresTable)
      .values({
        userId,
        userName,
        closureDate:    istDate,
        closedAt:       to,
        coveredFromTs:  from,
        coveredToTs:    to,
        expectedCash:   String(s.totals.cash),
        expectedUpi:    String(s.totals.upi),
        expectedCard:   String(s.totals.card),
        expectedCheque: String(s.totals.cheque),
        expectedOther:  String(s.totals.other),
        totalExpected:  String(totalExpected),
        totalBilled:    String(s.totalBilled),
        totalDue:       String(s.totalDue),
        billsCount:     s.billsCount,
        paymentsCount:  s.totals.count,
        actualCash:     String(actuals.cash),
        actualUpi:      String(actuals.upi),
        actualCard:     String(actuals.card),
        actualCheque:   String(actuals.cheque),
        actualOther:    String(actuals.other),
        totalActual:    String(totalActual),
        variance:       String(variance),
        varianceNote,
        notes,
      })
      .returning();
    return row;
  });

  req.log?.info({ closureId: inserted.id, userName, variance: inserted.variance }, "User day closed");
  res.status(201).json(inserted);
});

// Staff close status — owner/admin only. Shows which active users have
// closed their day since the last overall close.
dayCloseRouter.get("/staff-status", async (req, res) => {
  const session = (req as StaffAuthRequest).staffSession;
  if (!session || !OWNER_ROLES.has(session.role)) {
    res.status(403).json({ error: "Owner/admin access required" });
    return;
  }

  const lastOverall = await lastClosureBoundary();

  const activeUsers = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.isActive, true));

  const allUserCloses = await db
    .select({
      userName:    userDayClosuresTable.userName,
      closedAt:    userDayClosuresTable.closedAt,
      totalActual: userDayClosuresTable.totalActual,
      totalBilled: userDayClosuresTable.totalBilled,
      variance:    userDayClosuresTable.variance,
    })
    .from(userDayClosuresTable)
    .where(
      lastOverall
        ? gt(userDayClosuresTable.closedAt, lastOverall)
        : sql`1=1`,
    )
    .orderBy(desc(userDayClosuresTable.closedAt));

  const closeMap = new Map<string, typeof allUserCloses[number]>();
  for (const c of allUserCloses) {
    if (!closeMap.has(c.userName)) closeMap.set(c.userName, c);
  }

  const users = activeUsers.map((u) => {
    const close = closeMap.get(u.name);
    return {
      userId:         u.id,
      userName:       u.name,
      isClosed:       !!close,
      closedAt:       close?.closedAt ?? null,
      totalCollected: n(close?.totalActual),
      totalBilled:    n(close?.totalBilled),
      variance:       n(close?.variance),
    };
  });

  res.json({ users, lastOverallClose: lastOverall });
});

export default dayCloseRouter;
