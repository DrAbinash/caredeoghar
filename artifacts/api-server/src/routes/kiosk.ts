import { Router } from "express";
import rateLimit from "express-rate-limit";
import { db, pool } from "@workspace/db";
import {
  clinicSettingsTable, testsTable, patientsTable, ordersTable,
  orderTestsTable, billsTable, paymentsTable, ledgersTable,
} from "@workspace/db/schema";
import { eq, sql, and, inArray } from "drizzle-orm";
import { generateTokenForBill } from "./tokens";
import { generateTestTokensForOrder } from "./test-tokens";
import { z } from "zod/v4";

export const kioskRouter = Router();

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many registration attempts. Please try again later." },
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many payment requests. Please try again later." },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getKioskSettings() {
  const [s] = await db.select().from(clinicSettingsTable).limit(1);
  return s ?? null;
}

function razorpayAuth(keyId: string, keySecret: string): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

async function generateKioskPatientId(): Promise<string> {
  const [row] = await db.select({ max: sql<string | null>`max(patient_id)` }).from(patientsTable);
  const last = row?.max;
  const next = last ? parseInt(last.slice(2), 10) + 1 : 1;
  return `P-${String(next).padStart(5, "0")}`;
}

async function generateKioskBillNumber(): Promise<string> {
  const date = new Date();
  const yyyymm = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  const [row] = await db
    .select({ maxBill: sql<string | null>`MAX(bill_number)` })
    .from(billsTable)
    .where(sql`bill_number ~ '^[0-9]+$'`);
  let seq = 1;
  if (row?.maxBill) {
    const legacy = row.maxBill.match(/^BILL-(\d{6})-(\d+)$/);
    const numeric = row.maxBill.match(/^(\d{6})(\d{4,})$/);
    if (legacy) seq = Number(legacy[2]) + 1;
    else if (numeric) seq = Number(numeric[2]) + 1;
  }
  return `${yyyymm}${String(seq).padStart(4, "0")}`;
}

/** Shared patient + order + bill + token creation logic */
async function createPatientBillAndTokens(params: {
  firstName: string;
  lastName: string;
  phone: string;
  gender: string;
  dateOfBirth: string;
  testIds: number[];
  paymentMethod: string;
  paymentReference: string;
  paymentAmount: number;
}) {
  const { firstName, lastName, phone, gender, dateOfBirth, testIds, paymentMethod, paymentReference, paymentAmount } = params;

  const tests = await db
    .select({ id: testsTable.id, name: testsTable.name, price: testsTable.price })
    .from(testsTable)
    .where(and(eq(testsTable.isActive, true), inArray(testsTable.id, testIds)));

  const subtotal = tests.reduce((s, t) => s + Number(t.price), 0);

  const [firstLedger] = await db
    .select({ id: ledgersTable.id })
    .from(ledgersTable)
    .orderBy(ledgersTable.id)
    .limit(1);
  const ledgerId = firstLedger?.id ?? 1;

  // Find or create patient by phone
  const [existing] = await db.select().from(patientsTable).where(eq(patientsTable.phone, phone)).limit(1);
  let patientDbId: number;
  let patientCode: string;
  let isNewPatient: boolean;

  if (existing) {
    patientDbId = existing.id;
    patientCode = existing.patientId;
    isNewPatient = false;
  } else {
    const patientId = await generateKioskPatientId();
    const [newPat] = await db.insert(patientsTable).values({
      patientId,
      firstName,
      lastName,
      phone,
      gender,
      dateOfBirth: dateOfBirth || "",
    }).returning();
    patientDbId = newPat.id;
    patientCode = newPat.patientId;
    isNewPatient = true;
  }

  // Create order
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const orderNumber = `KIOSK-${stamp}-${rand}`;

  const [orderRow] = await db.insert(ordersTable).values({
    orderNumber,
    patientId: patientDbId,
    status: "pending",
    totalAmount: subtotal.toFixed(2),
    ledgerId,
    notes: `Kiosk self-registration | ${paymentMethod.toUpperCase()} ref: ${paymentReference}`,
  }).returning();

  for (const t of tests) {
    await db.insert(orderTestsTable).values({
      orderId: orderRow.id,
      testId: t.id,
      price: Number(t.price).toFixed(2),
    });
  }

  const billNumber = await generateKioskBillNumber();
  const [billRow] = await db.insert(billsTable).values({
    billNumber,
    orderId: orderRow.id,
    patientId: patientDbId,
    subtotal: subtotal.toFixed(2),
    discount: "0.00",
    taxAmount: "0.00",
    totalAmount: subtotal.toFixed(2),
    paidAmount: paymentAmount.toFixed(2),
    balanceAmount: Math.max(0, subtotal - paymentAmount).toFixed(2),
    status: paymentAmount >= subtotal ? "paid" : "partial",
    ledgerId,
    createdByName: "Kiosk Self-Registration",
  }).returning();

  await db.insert(paymentsTable).values({
    billId: billRow.id,
    amount: paymentAmount.toFixed(2),
    method: paymentMethod,
    referenceNumber: paymentReference,
    recordedByName: "Kiosk",
    notes: `Kiosk self-registration ${paymentMethod} payment`,
  });

  await db.update(patientsTable).set({ ledgerId }).where(
    and(eq(patientsTable.id, patientDbId), sql`${patientsTable.ledgerId} IS NULL`),
  );

  let tokenInfo: { tokenNo: number; tokenDate: string } | null = null;
  try {
    tokenInfo = await generateTokenForBill({ ledgerId, billId: billRow.id, patientId: patientDbId, source: "kiosk" });
  } catch { /* non-blocking */ }

  let testTokens: Array<{ orderTestId: number; testName: string; department: string; roomNumber: string; tokenNo: number }> = [];
  try {
    testTokens = await generateTestTokensForOrder({ ledgerId, billId: billRow.id, orderId: orderRow.id, patientId: patientDbId, source: "kiosk" });
  } catch { /* non-blocking */ }

  return {
    success: true,
    billNumber: billRow.billNumber,
    billId: billRow.id,
    totalAmount: subtotal,
    patientCode,
    patientName: `${firstName} ${lastName}`.trim(),
    isNewPatient,
    tokenNo: tokenInfo?.tokenNo ?? null,
    tokenDate: tokenInfo?.tokenDate ?? null,
    testTokens,
  };
}

// ── GET /api/kiosk/config ─────────────────────────────────────────────────────
kioskRouter.get("/config", async (_req, res): Promise<void> => {
  const s = await getKioskSettings();
  if (!s) {
    res.json({ enabled: false, clinicName: "Care Diagnostics", tagline: "", logoDataUrl: null, upiVpa: "", upiName: "", welcomeMessage: "", razorpayEnabled: false });
    return;
  }
  const settings = s as Record<string, unknown>;
  const keyId = process.env.RAZORPAY_KEY_ID || (s.razorpayKeyId ?? "");
  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";
  const payuKey = s.payuMerchantKey ?? "";
  const payuSalt = process.env.PAYU_MERCHANT_SALT ?? "";
  res.json({
    enabled: (settings["kioskEnabled"] as boolean | null) ?? false,
    upiVpa: (settings["kioskUpiVpa"] as string | null) ?? "",
    upiName: (settings["kioskUpiName"] as string | null) ?? "",
    welcomeMessage: (settings["kioskWelcomeMessage"] as string | null) ?? "",
    clinicName: s.name,
    tagline: s.tagline,
    logoDataUrl: s.logoDataUrl ?? null,
    address: s.address ?? "",
    phone: s.phone ?? "",
    razorpayEnabled: Boolean(keyId && keySecret),
    payuEnabled: Boolean(s.payuEnabled && payuKey && payuSalt),
  });
});

// ── GET /api/kiosk/tests ──────────────────────────────────────────────────────
kioskRouter.get("/tests", async (_req, res): Promise<void> => {
  const s = await getKioskSettings();
  const settings = (s ?? {}) as Record<string, unknown>;
  const allowedRaw = (settings["kioskAllowedTestIds"] as string | null) ?? "[]";
  let allowedIds: number[] = [];
  try { allowedIds = JSON.parse(allowedRaw); } catch { allowedIds = []; }

  const rows = await db
    .select({
      id: testsTable.id,
      code: testsTable.code,
      name: testsTable.name,
      category: testsTable.category,
      price: testsTable.price,
      department: testsTable.department,
      duration: testsTable.duration,
    })
    .from(testsTable)
    .where(eq(testsTable.isActive, true))
    .orderBy(testsTable.category, testsTable.name);

  const tests = allowedIds.length > 0 ? rows.filter(t => allowedIds.includes(t.id)) : rows;
  res.json({ tests: tests.map(t => ({ ...t, price: Number(t.price) })) });
});

// ── POST /api/kiosk/create-payment ───────────────────────────────────────────
// Creates a Razorpay payment link; stores a pending session in kiosk_payment_sessions.
// Rate-limited; public.
const CreatePaymentBody = z.object({
  testIds: z.array(z.number().int().positive()).min(1).max(30),
  patientName: z.string().min(1).max(150),
  phone: z.string().min(7).max(15),
});

kioskRouter.post("/create-payment", paymentLimiter, async (req, res): Promise<void> => {
  const parsed = CreatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  const { testIds, patientName, phone } = parsed.data;

  const s = await getKioskSettings();
  const keyId = process.env.RAZORPAY_KEY_ID || (s?.razorpayKeyId ?? "");
  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";

  if (!keyId || !keySecret) {
    res.status(503).json({ error: "Payment gateway not configured. Please ask staff for assistance.", fallbackMode: true });
    return;
  }

  // Calculate authoritative amount from DB
  const tests = await db
    .select({ id: testsTable.id, price: testsTable.price })
    .from(testsTable)
    .where(and(eq(testsTable.isActive, true), inArray(testsTable.id, testIds)));

  if (tests.length !== testIds.length) {
    res.status(400).json({ error: "One or more selected tests are no longer available. Please go back and reselect." });
    return;
  }

  const subtotal = tests.reduce((acc, t) => acc + Number(t.price), 0);
  const amountPaise = Math.round(subtotal * 100);

  if (amountPaise <= 0) {
    res.status(400).json({ error: "Amount must be greater than zero." });
    return;
  }

  const sessionRef = `KIOSK${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  // Create Razorpay payment link
  let paymentLinkId = "";
  let paymentLinkUrl = "";
  try {
    const rpRes = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: razorpayAuth(keyId, keySecret),
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        description: `Kiosk Registration — ${patientName}`,
        reference_id: sessionRef,
        customer: { name: patientName, contact: phone },
        notes: { session_ref: sessionRef, kiosk: "true" },
        reminder_enable: false,
        expire_by: Math.floor(Date.now() / 1000) + 1800,
      }),
    });
    if (!rpRes.ok) {
      const err = await rpRes.json().catch(() => ({})) as { error?: { description?: string } };
      res.status(502).json({ error: `Payment gateway error: ${err.error?.description ?? "unknown"}` });
      return;
    }
    const rpData = await rpRes.json() as { id: string; short_url: string };
    paymentLinkId = rpData.id;
    paymentLinkUrl = rpData.short_url;
  } catch {
    res.status(502).json({ error: "Could not reach payment gateway. Please try again or ask staff." });
    return;
  }

  // Persist session
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO kiosk_payment_sessions (payment_link_id, session_ref, test_ids, amount_paise, patient_name, status, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW() + INTERVAL '30 minutes')`,
      [paymentLinkId, sessionRef, JSON.stringify(testIds), amountPaise, patientName],
    );
  } finally {
    client.release();
  }

  res.json({ paymentLinkId, paymentLinkUrl, amountPaise, subtotal });
});

// ── GET /api/kiosk/payment-status/:paymentLinkId ──────────────────────────────
// Polls Razorpay for the status of a payment link. Called every ~4 s from kiosk UI.
kioskRouter.get("/payment-status/:paymentLinkId", async (req, res): Promise<void> => {
  const { paymentLinkId } = req.params;
  if (!paymentLinkId || paymentLinkId.length > 60) {
    res.status(400).json({ error: "Invalid payment link ID" });
    return;
  }

  const s = await getKioskSettings();
  const keyId = process.env.RAZORPAY_KEY_ID || (s?.razorpayKeyId ?? "");
  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";

  if (!keyId || !keySecret) {
    res.status(503).json({ error: "Payment gateway not configured." });
    return;
  }

  try {
    const rpRes = await fetch(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(paymentLinkId)}`, {
      headers: { Authorization: razorpayAuth(keyId, keySecret) },
    });
    if (!rpRes.ok) {
      res.status(502).json({ error: "Payment gateway error while checking status." });
      return;
    }
    const rpData = await rpRes.json() as {
      status: string;
      amount_paid: number;
      amount: number;
      payments?: Array<{ payment_id: string; status: string }>;
    };

    const paid = rpData.status === "paid";
    const razorpayPaymentId = paid
      ? (rpData.payments?.find(p => p.status === "captured")?.payment_id ?? rpData.payments?.[0]?.payment_id ?? "")
      : "";

    res.json({ status: rpData.status, paid, razorpayPaymentId, amountPaid: rpData.amount_paid });
  } catch {
    res.status(502).json({ error: "Could not reach payment gateway." });
  }
});

// ── POST /api/kiosk/register ──────────────────────────────────────────────────
// Two modes:
//   - razorpay: paymentLinkId provided → verify payment via Razorpay → create records
//   - upi (fallback): testIds + utrReference + clientTotal → create records with UTR note

const RegisterBody = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).default(""),
  phone: z.string().min(7).max(15),
  gender: z.enum(["male", "female", "other"]),
  age: z.number().int().min(0).max(130),
  dateOfBirth: z.string().max(20).default(""),
  // Razorpay mode (mutually exclusive with testIds/utrReference)
  paymentLinkId: z.string().max(80).optional(),
  razorpayPaymentId: z.string().max(80).optional(),
  // Fallback UPI mode
  testIds: z.array(z.number().int().positive()).min(1).max(30).optional(),
  utrReference: z.string().max(100).optional(),
  clientTotal: z.number().optional(),
});

kioskRouter.post("/register", registerLimiter, async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const { firstName, lastName, phone, gender, age, dateOfBirth, paymentLinkId, razorpayPaymentId, testIds, utrReference, clientTotal } = parsed.data;

  // Derive date of birth from age if DOB not provided
  const resolvedDob = dateOfBirth || `${new Date().getFullYear() - age}-01-01`;

  if (paymentLinkId) {
    // ── RAZORPAY MODE ─────────────────────────────────────────────────────────
    const s = await getKioskSettings();
    const keyId = process.env.RAZORPAY_KEY_ID || (s?.razorpayKeyId ?? "");
    const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";

    if (!keyId || !keySecret) {
      res.status(503).json({ error: "Payment gateway not configured." });
      return;
    }

    // 1. Verify payment with Razorpay
    let amountPaisePaid = 0;
    try {
      const rpRes = await fetch(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(paymentLinkId)}`, {
        headers: { Authorization: razorpayAuth(keyId, keySecret) },
      });
      if (!rpRes.ok) {
        res.status(502).json({ error: "Payment verification failed. Please ask staff for assistance." });
        return;
      }
      const rpData = await rpRes.json() as { status: string; amount_paid: number; amount: number };
      if (rpData.status !== "paid" || rpData.amount_paid < rpData.amount) {
        res.status(402).json({ error: "Payment has not been confirmed yet. Please complete the payment and wait for confirmation." });
        return;
      }
      amountPaisePaid = rpData.amount_paid;
    } catch {
      res.status(502).json({ error: "Could not verify payment. Please ask staff for assistance." });
      return;
    }

    // 2. Look up the pending session to get authoritative test IDs and amount
    const client = await pool.connect();
    let sessionTestIds: number[] = [];
    let sessionAmountPaise = 0;
    try {
      const r = await client.query<{ test_ids: string; amount_paise: number; status: string }>(
        `SELECT test_ids, amount_paise, status FROM kiosk_payment_sessions WHERE payment_link_id = $1`,
        [paymentLinkId],
      );
      if (r.rowCount === 0) {
        res.status(404).json({ error: "Session not found. Please restart registration." });
        return;
      }
      const session = r.rows[0]!;
      if (session.status === "completed") {
        res.status(409).json({ error: "This payment has already been registered. Please see staff." });
        return;
      }
      sessionTestIds = JSON.parse(session.test_ids) as number[];
      sessionAmountPaise = session.amount_paise;

      // Mark session completed immediately to prevent double-registration
      await client.query(`UPDATE kiosk_payment_sessions SET status = 'completed', razorpay_payment_id = $2 WHERE payment_link_id = $1`, [paymentLinkId, razorpayPaymentId ?? ""]);
    } finally {
      client.release();
    }

    if (amountPaisePaid < sessionAmountPaise) {
      res.status(402).json({ error: "Payment amount does not match. Please ask staff for assistance." });
      return;
    }

    const result = await createPatientBillAndTokens({
      firstName, lastName, phone, gender,
      dateOfBirth: resolvedDob,
      testIds: sessionTestIds,
      paymentMethod: "razorpay",
      paymentReference: razorpayPaymentId ?? paymentLinkId,
      paymentAmount: amountPaisePaid / 100,
    });
    res.status(201).json(result);
    return;
  }

  // ── UPI FALLBACK MODE ─────────────────────────────────────────────────────
  if (!testIds || !utrReference || !clientTotal) {
    res.status(400).json({ error: "Either paymentLinkId (Razorpay) or testIds + utrReference + clientTotal (UPI fallback) are required." });
    return;
  }

  // Verify tests exist and total matches
  const tests = await db
    .select({ id: testsTable.id, price: testsTable.price })
    .from(testsTable)
    .where(and(eq(testsTable.isActive, true), inArray(testsTable.id, testIds)));

  if (tests.length !== testIds.length) {
    res.status(400).json({ error: "One or more selected tests are no longer available." });
    return;
  }

  const subtotal = tests.reduce((s, t) => s + Number(t.price), 0);
  if (Math.abs(subtotal - clientTotal) > 1) {
    res.status(400).json({ error: "Total mismatch — please restart and try again." });
    return;
  }

  const result = await createPatientBillAndTokens({
    firstName, lastName, phone, gender,
    dateOfBirth: resolvedDob,
    testIds,
    paymentMethod: "upi",
    paymentReference: utrReference,
    paymentAmount: subtotal,
  });
  res.status(201).json(result);
});
