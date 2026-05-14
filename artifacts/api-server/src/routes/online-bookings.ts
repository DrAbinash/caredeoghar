import { Router } from "express";
import type { StaffAuthRequest } from "../middleware/requireStaffAuth";
import { db } from "@workspace/db";
import {
  onlineBookingsTable,
  patientsTable,
  patientCounterTable,
  ordersTable,
  orderTestsTable,
  testsTable,
  packagesTable,
  packageTestsTable,
  billsTable,
  paymentsTable,
  clinicSettingsTable,
} from "@workspace/db/schema";
import { eq, desc, and, or, ilike, sql } from "drizzle-orm";
import { generateBillNumber } from "./bills";
import { generateTokenForBill } from "./tokens";
import { generateTestTokensForOrder } from "./test-tokens";
import crypto from "node:crypto";

export const onlineBookingsRouter = Router();

async function generatePatientId(): Promise<string> {
  const [counter] = await db.select().from(patientCounterTable).limit(1);
  let seq = 1;
  if (counter) {
    seq = counter.counter + 1;
    await db.update(patientCounterTable).set({ counter: seq }).where(eq(patientCounterTable.id, counter.id));
  } else {
    await db.insert(patientCounterTable).values({ counter: 1 });
  }
  return `P${String(seq).padStart(5, "0")}`;
}

// GET /api/online-bookings
onlineBookingsRouter.get("/", async (req, res): Promise<void> => {
  const { status, search, page = "1", limit = "30" } = req.query as Record<string, string>;
  const pg = Math.max(1, Number(page));
  const lim = Math.min(100, Math.max(1, Number(limit)));
  const offset = (pg - 1) * lim;

  let query = db
    .select()
    .from(onlineBookingsTable)
    .orderBy(desc(onlineBookingsTable.createdAt))
    .limit(lim)
    .offset(offset)
    .$dynamic();

  const conditions = [];
  if (status && status !== "all") {
    conditions.push(eq(onlineBookingsTable.status, status));
  }
  if (search?.trim()) {
    const pat = `%${search.trim().toLowerCase()}%`;
    conditions.push(
      or(
        ilike(onlineBookingsTable.name, pat),
        ilike(onlineBookingsTable.phone, pat),
        ilike(onlineBookingsTable.bookingRef, pat),
      ),
    );
  }
  if (conditions.length > 0) {
    query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
  }

  const rows = await query;
  res.json({ bookings: rows });
});

// GET /api/online-bookings/:id
onlineBookingsRouter.get("/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(onlineBookingsTable).where(eq(onlineBookingsTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "Booking not found" }); return; }
  res.json(row);
});

// POST /api/online-bookings/:id/cancel
onlineBookingsRouter.post("/:id/cancel", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [booking] = await db.select().from(onlineBookingsTable).where(eq(onlineBookingsTable.id, id)).limit(1);
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
  if (!["paid", "pending_payment"].includes(booking.status)) {
    res.status(400).json({ error: `Cannot cancel a booking with status '${booking.status}'` });
    return;
  }
  const [updated] = await db
    .update(onlineBookingsTable)
    .set({ status: "cancelled" })
    .where(eq(onlineBookingsTable.id, id))
    .returning();
  res.json(updated);
});

// POST /api/online-bookings/:id/confirm
// Creates patient (if not existing), order, bill, and queue tokens
onlineBookingsRouter.post("/:id/confirm", async (req: StaffAuthRequest, res): Promise<void> => {
  const id = Number(req.params.id);
  const [booking] = await db.select().from(onlineBookingsTable).where(eq(onlineBookingsTable.id, id)).limit(1);
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
  if (booking.status !== "paid") {
    res.status(400).json({ error: `Can only confirm bookings with status 'paid'. Current status: '${booking.status}'` });
    return;
  }

  const staffName = req.staffSession?.subjectName || "Staff";

  // Parse test and package IDs
  let testIds: number[] = [];
  let packageIds: number[] = [];
  try {
    testIds = JSON.parse(booking.testIds) as number[];
    packageIds = JSON.parse(booking.packageIds) as number[];
  } catch { /* already empty arrays */ }

  // Resolve package → test IDs
  const extraTestIds: number[] = [];
  if (packageIds.length > 0) {
    const pkgTests = await db
      .select({ testId: packageTestsTable.testId })
      .from(packageTestsTable)
      .where(sql`${packageTestsTable.packageId} = ANY(${packageIds})`);
    for (const pt of pkgTests) extraTestIds.push(pt.testId);
  }

  const allTestIds = [...new Set([...testIds, ...extraTestIds])];
  if (allTestIds.length === 0) {
    res.status(400).json({ error: "No tests could be resolved for this booking." });
    return;
  }

  // Get settings for ledger
  const [settings] = await db.select().from(clinicSettingsTable).limit(1);
  const ledgerId = settings?.onlineBookingLedgerId || 1;

  // Create or find patient by phone
  let patientId: number;
  const [existingPatient] = await db
    .select()
    .from(patientsTable)
    .where(eq(patientsTable.phone, booking.phone))
    .limit(1);

  if (existingPatient) {
    patientId = existingPatient.id;
  } else {
    // Create new patient from booking info
    const nameParts = booking.name.trim().split(/\s+/);
    const firstName = nameParts[0] || booking.name;
    const lastName = nameParts.slice(1).join(" ") || "";
    const newPatientId = await generatePatientId();
    const [newPatient] = await db
      .insert(patientsTable)
      .values({
        patientId: newPatientId,
        firstName,
        lastName,
        phone: booking.phone,
        email: booking.email || null,
        dateOfBirth: "",
        gender: "Unknown",
        ledgerId,
      })
      .returning();
    patientId = newPatient.id;
  }

  // Fetch test prices
  const tests = await db
    .select({ id: testsTable.id, price: testsTable.price, department: testsTable.department })
    .from(testsTable)
    .where(sql`${testsTable.id} = ANY(${allTestIds})`);

  const totalAmount = tests.reduce((sum, t) => sum + Number(t.price), 0);

  // Generate order number
  const orderNumber = `ORD-OB-${Date.now()}`;

  // Create order + order_tests + bill in a transaction
  const { bill, order } = await db.transaction(async (tx) => {
    const [ord] = await tx
      .insert(ordersTable)
      .values({
        orderNumber,
        patientId,
        status: "pending",
        totalAmount: totalAmount.toFixed(2),
        notes: `Online booking ${booking.bookingRef}. ${booking.notes}`.trim(),
        ledgerId,
      })
      .returning();

    for (const test of tests) {
      await tx.insert(orderTestsTable).values({
        orderId: ord.id,
        testId: test.id,
        price: test.price,
      });
    }

    const billNumber = await generateBillNumber(ledgerId);
    const [bill] = await tx
      .insert(billsTable)
      .values({
        billNumber,
        orderId: ord.id,
        patientId,
        subtotal: totalAmount.toFixed(2),
        discount: "0.00",
        taxAmount: "0.00",
        totalAmount: totalAmount.toFixed(2),
        paidAmount: totalAmount.toFixed(2),
        balanceAmount: "0.00",
        status: "paid",
        ledgerId,
        createdByName: `Online Booking (${staffName})`,
      })
      .returning();

    // Record the Razorpay payment
    await tx.insert(paymentsTable).values({
      billId: bill.id,
      amount: totalAmount.toFixed(2),
      method: "Online (Razorpay)",
      referenceNumber: booking.razorpayPaymentId || booking.razorpayOrderId || booking.bookingRef,
      notes: `Paid online via Razorpay. Booking ref: ${booking.bookingRef}`,
      recordedByName: "Online Booking",
    });

    return { bill, order: ord };
  });

  // Generate tokens (VIP if flagged)
  const priority = booking.isVip ? 8 : 2;
  const source = booking.isVip ? "vip" : "online";

  try {
    await generateTokenForBill({
      ledgerId, billId: bill.id, patientId, priority, source,
    });
  } catch { /* non-blocking */ }

  try {
    await generateTestTokensForOrder({
      ledgerId, billId: bill.id, orderId: order.id, patientId, priority, source,
    });
  } catch { /* non-blocking */ }

  // Mark booking confirmed
  const [updated] = await db
    .update(onlineBookingsTable)
    .set({
      status: "confirmed",
      patientId,
      billId: bill.id,
      confirmedByName: staffName,
      confirmedAt: new Date(),
    })
    .where(eq(onlineBookingsTable.id, booking.id))
    .returning();

  res.json({ booking: updated, billId: bill.id, patientId });
});

// POST /api/online-bookings/:id/payment-link
// Creates a Razorpay payment link for an existing booking and returns the link URL.
onlineBookingsRouter.post("/:id/payment-link", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [booking] = await db.select().from(onlineBookingsTable).where(eq(onlineBookingsTable.id, id)).limit(1);
  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }

  const settings = await db.select().from(clinicSettingsTable).limit(1);
  const s = settings[0];
  const keyId = process.env.RAZORPAY_KEY_ID || (s?.razorpayKeyId ?? "");
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
  if (!keyId || !keySecret) {
    res.status(503).json({ error: "Razorpay not configured." });
    return;
  }

  const amountPaise = Math.round(Number(booking.totalAmount) * 100);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    res.status(400).json({ error: "Invalid booking amount." });
    return;
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const base = `${req.protocol}://${req.get("host")}`;
  const callbackUrl = `${base}/?booking=link_success&ref=${encodeURIComponent(booking.bookingRef)}`;

  try {
    const rpRes = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        accept_partial: false,
        description: `DiagnoCenter booking ${booking.bookingRef}`,
        customer: {
          name: booking.name,
          contact: booking.phone.replace(/[^0-9]/g, "").slice(0, 10),
          email: booking.email || undefined,
        },
        notify: { sms: true, email: Boolean(booking.email) },
        reminder_enable: true,
        callback_url: callbackUrl,
        callback_method: "get",
      }),
    });
    if (!rpRes.ok) {
      const err = await rpRes.json().catch(() => ({}));
      res.status(502).json({ error: "Razorpay error.", details: (err as { error?: { description?: string } }).error?.description });
      return;
    }
    const data = (await rpRes.json()) as { short_url: string; id: string };
    res.json({ url: data.short_url, linkId: data.id });
  } catch {
    res.status(502).json({ error: "Could not connect to Razorpay." });
  }
});
