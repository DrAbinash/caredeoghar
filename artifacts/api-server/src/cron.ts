import cron from "node-cron";
import { db } from "@workspace/db";
import { emailSettingsTable, billsTable, billAuditsTable, paymentsTable } from "@workspace/db/schema";
import { sendDailySummaryEmail } from "./email";
import { sql, gte, and, lte, eq } from "drizzle-orm";

let currentTask: ReturnType<typeof cron.schedule> | null = null;

export function startCronScheduler() {
  // Check settings every minute, reschedule if needed
  scheduleDaily();
}

function scheduleDaily() {
  // Run once a minute to check if the daily summary time has come
  // This is simpler than dynamically rescheduling
  cron.schedule("* * * * *", async () => {
    try {
      const [settings] = await db.select().from(emailSettingsTable).limit(1);
      if (!settings || !settings.dailySummaryEnabled) return;

      const now = new Date();
      const [hour, minute] = settings.dailySummaryTime.split(":").map(Number);

      if (now.getHours() === hour && now.getMinutes() === minute) {
        await fireDailySummary();
      }
    } catch (err) {
      console.error("[cron] daily summary check failed:", err);
    }
  });

  console.log("[cron] Daily summary scheduler started (checks every minute)");
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
