import { Router } from "express";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import {
  clinicSettingsTable,
  testsTable,
  packagesTable,
  packageTestsTable,
  onlineBookingsTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

export const publicBookingRouter = Router();

const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many booking attempts. Please try again later." },
});

const createOrderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many order attempts. Please try again in 15 minutes." },
});

async function getSettings() {
  const [row] = await db.select().from(clinicSettingsTable).limit(1);
  return row;
}

function generateBookingRef(): string {
  const now = new Date();
  const prefix = `OB${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}${rand}`;
}

// GET /api/public/booking/config
// Returns whether online booking is enabled and the Razorpay key_id (safe to expose)
publicBookingRouter.get("/config", async (_req, res): Promise<void> => {
  const settings = await getSettings();
  if (!settings) {
    res.json({ enabled: false, keyId: "", vipEnabled: false });
    return;
  }
  res.json({
    enabled: settings.onlineBookingEnabled,
    keyId: settings.razorpayKeyId || "",
    vipEnabled: settings.vipQueueEnabled,
  });
});

// GET /api/public/booking/tests
// Returns active tests with prices — public, no auth required
publicBookingRouter.get("/tests", async (_req, res): Promise<void> => {
  const tests = await db
    .select({
      id: testsTable.id,
      code: testsTable.code,
      name: testsTable.name,
      category: testsTable.category,
      department: testsTable.department,
      price: testsTable.price,
      duration: testsTable.duration,
    })
    .from(testsTable)
    .where(and(eq(testsTable.isActive, true)))
    .orderBy(testsTable.category, testsTable.name);
  res.json({ tests });
});

// GET /api/public/booking/packages
// Returns active packages — public, no auth required
publicBookingRouter.get("/packages", async (_req, res): Promise<void> => {
  const pkgs = await db
    .select({
      id: packagesTable.id,
      code: packagesTable.packageCode,
      name: packagesTable.name,
      price: packagesTable.price,
      description: packagesTable.description,
    })
    .from(packagesTable)
    .where(eq(packagesTable.isActive, true))
    .orderBy(packagesTable.name);
  res.json({ packages: pkgs });
});

// POST /api/public/booking/create-order
// Creates a Razorpay order and a pending booking record
publicBookingRouter.post("/create-order", createOrderLimiter, async (req, res): Promise<void> => {
  const settings = await getSettings();
  if (!settings?.onlineBookingEnabled) {
    res.status(403).json({ error: "Online booking is not enabled." });
    return;
  }

  const keyId = process.env.RAZORPAY_KEY_ID || settings.razorpayKeyId;
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
  if (!keyId || !keySecret) {
    res.status(503).json({ error: "Payment gateway not configured. Please contact the clinic." });
    return;
  }

  const {
    name, phone, email = "", selectedDate,
    testIds = [], packageIds = [], totalAmount,
    notes = "", isVip = false,
  } = req.body as {
    name: string; phone: string; email?: string; selectedDate: string;
    testIds?: number[]; packageIds?: number[]; totalAmount: number;
    notes?: string; isVip?: boolean;
  };

  if (!name?.trim() || !phone?.trim() || !selectedDate) {
    res.status(400).json({ error: "Name, phone, and selected date are required." });
    return;
  }
  if (!Array.isArray(testIds) || !Array.isArray(packageIds) || (testIds.length + packageIds.length) === 0) {
    res.status(400).json({ error: "Please select at least one test or package." });
    return;
  }
  const amount = Number(totalAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "Invalid total amount." });
    return;
  }

  const bookingRef = generateBookingRef();
  const amountPaise = Math.round(amount * 100);

  // Create Razorpay order via their REST API
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  let razorpayOrderId = "";
  try {
    const rpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: bookingRef,
        notes: {
          patient_name: name,
          patient_phone: phone,
          booking_ref: bookingRef,
        },
      }),
    });
    if (!rpRes.ok) {
      const err = await rpRes.json().catch(() => ({}));
      res.status(502).json({ error: "Payment gateway error. Please try again.", details: (err as { error?: { description?: string } }).error?.description });
      return;
    }
    const rpData = (await rpRes.json()) as { id: string };
    razorpayOrderId = rpData.id;
  } catch {
    res.status(502).json({ error: "Could not connect to payment gateway. Please try again." });
    return;
  }

  // Save pending booking
  await db.insert(onlineBookingsTable).values({
    bookingRef,
    name: name.trim(),
    phone: phone.trim(),
    email: email.trim(),
    selectedDate,
    testIds: JSON.stringify(testIds),
    packageIds: JSON.stringify(packageIds),
    totalAmount: String(amount),
    notes: notes.trim(),
    isVip: Boolean(isVip) && Boolean(settings.vipQueueEnabled),
    razorpayOrderId,
    status: "pending_payment",
  });

  res.json({ bookingRef, razorpayOrderId, amountPaise, keyId });
});

// POST /api/public/booking/verify-payment
// Verifies Razorpay payment signature, marks booking as paid
publicBookingRouter.post("/verify-payment", bookingLimiter, async (req, res): Promise<void> => {
  const settings = await getSettings();
  if (!settings?.onlineBookingEnabled) {
    res.status(403).json({ error: "Online booking is not enabled." });
    return;
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
  if (!keySecret) {
    res.status(503).json({ error: "Payment gateway not configured." });
    return;
  }

  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body as {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  };

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    res.status(400).json({ error: "Missing payment details." });
    return;
  }

  // HMAC-SHA256 signature verification
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  if (expected !== razorpaySignature) {
    res.status(400).json({ error: "Payment verification failed. Please contact the clinic." });
    return;
  }

  // Find and update the booking
  const [booking] = await db
    .select()
    .from(onlineBookingsTable)
    .where(eq(onlineBookingsTable.razorpayOrderId, razorpayOrderId))
    .limit(1);

  if (!booking) {
    res.status(404).json({ error: "Booking not found." });
    return;
  }
  if (booking.status === "paid" || booking.status === "confirmed") {
    res.json({ success: true, bookingRef: booking.bookingRef, alreadyPaid: true });
    return;
  }

  await db
    .update(onlineBookingsTable)
    .set({
      razorpayPaymentId,
      razorpaySignature,
      status: "paid",
    })
    .where(eq(onlineBookingsTable.id, booking.id));

  res.json({ success: true, bookingRef: booking.bookingRef });
});
