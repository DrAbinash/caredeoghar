import cron from "node-cron";
import { db } from "@workspace/db";
import { emailSettingsTable, billsTable, billAuditsTable, paymentsTable, doctorsTable, commissionRulesTable, orderTestsTable, ordersTable, testsTable } from "@workspace/db/schema";
import { sendDailySummaryEmail, sendCommissionMonthEndEmail } from "./email";
import { gte, and, lte, eq, inArray } from "drizzle-orm";

let currentTask: ReturnType<typeof cron.schedule> | null = null;
// Track already-fired events per day to avoid double-firing
const firedToday = new Set<string>();

export function startCronScheduler() {
  scheduleDaily();
  scheduleMonthEndCommission();
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
