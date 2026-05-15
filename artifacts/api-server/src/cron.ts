import cron from "node-cron";
import { db } from "@workspace/db";
import {
  emailSettingsTable, billsTable, billAuditsTable, paymentsTable,
  doctorsTable, commissionRulesTable, orderTestsTable, ordersTable, testsTable,
  dicomNodesTable, dicomPullJobsTable,
} from "@workspace/db/schema";
import { sendDailySummaryEmail, sendCommissionMonthEndEmail, sendMonthlyAuditEmail } from "./email";
import { runBooksSanity } from "./routes/books-sanity";
import { auditRunsTable } from "@workspace/db/schema";
import { gte, and, lte, eq, inArray, isNull, or, lt } from "drizzle-orm";

let currentTask: ReturnType<typeof cron.schedule> | null = null;
// Track already-fired events per day to avoid double-firing
const firedToday = new Set<string>();

export function startCronScheduler() {
  scheduleDaily();
  scheduleMonthEndCommission();
  scheduleDicomAutoPull();
  scheduleMonthlyAudit();
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly Money-Trail Audit auto-run
// Fires at 06:00 on the 1st of every month. Snapshots the previous calendar
// month's Books-Sanity report into audit_runs (source="cron", completedAt=null
// so it shows as "auto-run, awaiting review"), then emails the headline +
// anomaly summary to the configured admin email.
// ─────────────────────────────────────────────────────────────────────────────

function scheduleMonthlyAudit() {
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();
      if (now.getDate() !== 1) return;
      if (now.getHours() !== 6 || now.getMinutes() !== 0) return;

      const key = `monthly-audit-${now.toISOString().slice(0, 10)}`;
      if (firedToday.has(key)) return;
      firedToday.add(key);

      await fireMonthlyAudit(now);
    } catch (err) {
      console.error("[cron] monthly audit check failed:", err);
    }
  });

  console.log("[cron] Monthly money-trail audit scheduler started (fires at 06:00 on day 1 of each month)");
}

function pad2(n: number) { return String(n).padStart(2, "0"); }

export async function fireMonthlyAudit(now: Date): Promise<void> {
  // Previous calendar month: from = first day of prev month, to = last day of prev month
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);  // day 0 of this month = last of prev
  const prevMonthStart = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), 1);
  const from = `${prevMonthStart.getFullYear()}-${pad2(prevMonthStart.getMonth() + 1)}-${pad2(prevMonthStart.getDate())}`;
  const to = `${prevMonthEnd.getFullYear()}-${pad2(prevMonthEnd.getMonth() + 1)}-${pad2(prevMonthEnd.getDate())}`;

  console.log(`[cron] Running monthly money-trail audit for ${from} → ${to}`);

  // Restart-safe dedupe: if a cron-source audit already exists for this exact
  // period (e.g. process restarted between 06:00 and the next-month boundary),
  // skip the run rather than inserting a duplicate.
  const existing = await db.select({ id: auditRunsTable.id }).from(auditRunsTable)
    .where(and(eq(auditRunsTable.source, "cron"), eq(auditRunsTable.periodFrom, from), eq(auditRunsTable.periodTo, to)))
    .limit(1);
  if (existing.length > 0) {
    console.log(`[cron] Monthly audit for ${from} → ${to} already exists (#${existing[0].id}); skipping.`);
    return;
  }

  const report = await runBooksSanity({ from, to });
  const anomalyCount = report.anomalies.reduce((s, a) => s + a.count, 0);
  const highCount = report.anomalies.filter((a) => a.severity === "high").reduce((s, a) => s + a.count, 0);
  const totalImpact = report.anomalies.reduce((s, a) => s + (a.totalAmount || 0), 0);

  let inserted: typeof auditRunsTable.$inferSelect;
  try {
    [inserted] = await db.insert(auditRunsTable).values({
      periodFrom: from,
      periodTo: to,
      completedAt: null,
      completedBy: null,
      source: "cron",
      notes: null,
      anomalyCount,
      highCount,
      totalImpact: String(totalImpact),
      snapshot: report,
    }).returning();
  } catch (err) {
    // Unique-index violation: another worker beat us to the insert. Treat
    // as a no-op so cron retries don't crash the loop.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("audit_runs_cron_unique_idx") || msg.includes("duplicate key")) {
      console.log(`[cron] Monthly audit for ${from} → ${to} was inserted concurrently; skipping.`);
      return;
    }
    throw err;
  }

  // Best-effort email — never fails the audit save
  try {
    const result = await sendMonthlyAuditEmail({
      auditId: inserted.id,
      periodFrom: from,
      periodTo: to,
      anomalyCount,
      highCount,
      totalImpact,
      report,
    });
    if (result.ok) {
      await db.update(auditRunsTable).set({ emailSentAt: new Date() }).where(eq(auditRunsTable.id, inserted.id));
      console.log(`[cron] Monthly audit #${inserted.id} emailed`);
    } else {
      console.warn(`[cron] Monthly audit #${inserted.id} saved but email failed: ${result.error}`);
    }
  } catch (err) {
    console.error("[cron] monthly audit email send threw:", err);
  }
}

// ── DICOM Auto-Pull scheduler ────────────────────────────────────────────────
// Every 5 minutes: find all active nodes with autoPull=true whose last pull
// is older than their configured pullIntervalMinutes (or never pulled), and
// create a new dicom_pull_job for each. The local DICOM Pull Agent picks these
// jobs up and executes the actual findscu + movescu commands.

function scheduleDicomAutoPull() {
  cron.schedule("*/5 * * * *", async () => {
    try {
      await fireDicomAutoPull();
    } catch (err) {
      console.error("[cron] DICOM auto-pull check failed:", err);
    }
  });
  console.log("[cron] DICOM auto-pull scheduler started (checks every 5 minutes)");
}

async function fireDicomAutoPull() {
  const now = new Date();

  // Fetch all active nodes with autoPull enabled
  const nodes = await db.select().from(dicomNodesTable)
    .where(and(eq(dicomNodesTable.isActive, true), eq(dicomNodesTable.autoPull, true)));

  if (nodes.length === 0) return;

  for (const node of nodes) {
    const intervalMs = (node.pullIntervalMinutes ?? 15) * 60 * 1000;
    const lastPull   = node.lastPullAt ? new Date(node.lastPullAt).getTime() : 0;
    const dueAt      = lastPull + intervalMs;

    if (now.getTime() < dueAt) continue; // not yet due

    // Check if there's already a pending or running job for this node
    const [existing] = await db.select({ id: dicomPullJobsTable.id })
      .from(dicomPullJobsTable)
      .where(
        and(
          eq(dicomPullJobsTable.nodeId, node.id),
          or(
            eq(dicomPullJobsTable.status, "pending"),
            eq(dicomPullJobsTable.status, "running"),
          ),
        ),
      )
      .limit(1);

    if (existing) continue; // already queued

    // Calculate date range
    const todayStr = now.toISOString().split("T")[0];
    const daysBack = (node.pullQueryDays ?? 1) - 1;
    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - daysBack);
    const fromStr = fromDate.toISOString().split("T")[0];

    await db.insert(dicomPullJobsTable).values({
      nodeId:       node.id,
      triggerType:  "auto",
      status:       "pending",
      queryDateFrom: fromStr,
      queryDateTo:   todayStr,
    });

    console.log(`[cron] Created auto pull job for DICOM node ${node.aeTitle} (${node.modality})`);
  }
}

function scheduleDaily() {
  cron.schedule("* * * * *", async () => {
    try {
      const [settings] = await db.select().from(emailSettingsTable).limit(1);
      if (!settings || !settings.dailySummaryEnabled) return;

      const now = new Date();
      const [hour, minute] = settings.dailySummaryTime.split(":").map(Number);
      const key = `daily-${now.toISOString().split("T")[0]}`;

      if (now.getHours() === hour && now.getMinutes() === minute && !firedToday.has(key)) {
        firedToday.add(key);
        await fireDailySummary();
      }
    } catch (err) {
      console.error("[cron] daily summary check failed:", err);
    }
  });

  console.log("[cron] Daily summary scheduler started (checks every minute)");
}

function scheduleMonthEndCommission() {
  // Check every minute — fires at 20:00 on the last day of each month
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();

      // 20:00 exactly
      if (hour !== 20 || minute !== 0) return;

      // Check if today is the last day of the month
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (tomorrow.getMonth() === now.getMonth()) return; // not last day

      const key = `commission-${now.toISOString().split("T")[0]}`;
      if (firedToday.has(key)) return;
      firedToday.add(key);

      await fireMonthEndCommission(now);
    } catch (err) {
      console.error("[cron] month-end commission check failed:", err);
    }
  });

  console.log("[cron] Month-end commission scheduler started (fires at 20:00 on last day of month)");
}

export async function runDailySummary() {
  return fireDailySummary();
}

export async function runMonthEndCommission(now: Date = new Date()) {
  return fireMonthEndCommission(now);
}

async function fireDailySummary() {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [bills, payments, audits] = await Promise.all([
      db.select().from(billsTable).where(
        and(gte(billsTable.createdAt, todayStart), lte(billsTable.createdAt, todayEnd))
      ),
      db.select().from(paymentsTable).where(
        and(gte(paymentsTable.createdAt, todayStart), lte(paymentsTable.createdAt, todayEnd))
      ),
      db.select().from(billAuditsTable).where(
        and(gte(billAuditsTable.createdAt, todayStart), lte(billAuditsTable.createdAt, todayEnd))
      ),
    ]);

    const totalRevenue = payments.reduce((s, p) => s + Number(p.amount), 0);
    const totalBills = bills.length;
    const paidBills = bills.filter(b => b.status === "paid").length;
    const pendingBills = bills.filter(b => b.status === "pending" || b.status === "partial").length;
    const totalPayments = payments.reduce((s, p) => s + Number(p.amount), 0);
    const billsEdited = new Set(audits.map(a => a.billId)).size;

    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

    await sendDailySummaryEmail({
      date: today,
      totalRevenue,
      totalBills,
      paidBills,
      pendingBills,
      totalPayments,
      billsEdited,
    });

    console.log(`[cron] Daily summary sent for ${today}`);
  } catch (err) {
    console.error("[cron] Failed to send daily summary:", err);
  }
}

async function fireMonthEndCommission(now: Date) {
  try {
    // Month boundaries
    const fromDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const toDate   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const fromStr  = fromDate.toISOString().split("T")[0];
    const toStr    = toDate.toISOString().split("T")[0];
    const month    = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

    // Fetch all doctors, rules, tests
    const doctors  = await db.select().from(doctorsTable);
    const allRules = await db.select().from(commissionRulesTable);
    const allTests = await db.select().from(testsTable);
    const testMap  = new Map(allTests.map(t => [t.id, t]));

    // Fetch orders for the month
    const orders = await db.select().from(ordersTable)
      .where(and(gte(ordersTable.createdAt, fromDate), lte(ordersTable.createdAt, toDate)));

    const orderIds = orders.map(o => o.id);
    const orderTests = orderIds.length
      ? await db.select().from(orderTestsTable).where(inArray(orderTestsTable.orderId, orderIds))
      : [];

    const report = doctors.map(doctor => {
      const doctorOrders = orders.filter(o => o.doctorId === doctor.id);
      const rules = allRules.filter(r => r.doctorId === doctor.id && r.isActive);

      let totalRevenue = 0, totalCommission = 0, testCount = 0;
      for (const order of doctorOrders) {
        const ots = orderTests.filter(ot => ot.orderId === order.id);
        for (const ot of ots) {
          const test = testMap.get(ot.testId);
          const price = Number(ot.price);
          totalRevenue += price;
          testCount++;

          // Apply rules (same logic as commission route)
          let matched = rules.find(r => {
            if (!r.isExclusive) return false;
            if (r.scope === "test" && r.testIds) return (JSON.parse(r.testIds) as number[]).includes(ot.testId);
            if (r.scope === "category" && r.categories && test) return (JSON.parse(r.categories) as string[]).includes(test.category || "");
            return false;
          });
          if (!matched) matched = rules.find(r => {
            if (r.scope === "test" && r.testIds) return (JSON.parse(r.testIds) as number[]).includes(ot.testId);
            if (r.scope === "category" && r.categories && test) return (JSON.parse(r.categories) as string[]).includes(test.category || "");
            return r.scope === "all";
          });
          if (matched) {
            const val = Number(matched.value);
            totalCommission += matched.type === "percentage" ? (price * val) / 100 : val;
          } else {
            const defVal = Number(doctor.defaultCommission);
            if (defVal > 0) totalCommission += doctor.defaultCommissionType === "percentage" ? (price * defVal) / 100 : defVal;
          }
        }
      }

      return {
        doctor: { name: doctor.name, specialization: doctor.specialization ?? "" },
        orderCount: doctorOrders.length,
        testCount,
        totalRevenue,
        totalCommission,
        effectiveRate: totalRevenue > 0 ? Number(((totalCommission / totalRevenue) * 100).toFixed(2)) : 0,
      };
    }).filter(r => r.orderCount > 0);

    const grandTotal = {
      doctors: report.length,
      orders: report.reduce((s, r) => s + r.orderCount, 0),
      revenue: report.reduce((s, r) => s + r.totalRevenue, 0),
      commission: report.reduce((s, r) => s + r.totalCommission, 0),
    };

    await sendCommissionMonthEndEmail({ month, from: fromStr, to: toStr, report, grandTotal });
    console.log(`[cron] Month-end commission email sent for ${month}`);
  } catch (err) {
    console.error("[cron] Failed to send month-end commission email:", err);
  }
}
