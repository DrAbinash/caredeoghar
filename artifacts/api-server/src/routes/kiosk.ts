import { Router } from "express";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { db, pool } from "@workspace/db";
import {
  clinicSettingsTable, testsTable, patientsTable, ordersTable,
  orderTestsTable, billsTable, paymentsTable, ledgersTable,
} from "@workspace/db/schema";
import { eq, sql, and, inArray } from "drizzle-orm";
import { generateTokenForBill } from "./tokens";
import { generateTestTokensForOrder } from "./test-tokens";
import { z } from "zod/v4";
import { logger } from "../lib/logger";

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

// ── ICICI Helpers ─────────────────────────────────────────────────────────────

const ICICI_UAT_BASE = "https://pgpayuat.icicibank.com";
const ICICI_PROD_BASE = "https://pgpay.icicibank.com";

function getIciciBase() {
  return process.env.NODE_ENV === "production" ? ICICI_PROD_BASE : ICICI_UAT_BASE;
}

function generateIciciSecureHash(params: Record<string, string>, secretKey: string): string {
  const keys = Object.keys(params).sort();
  const hashText = keys.map((k) => params[k]).join("");
  return crypto.createHmac("sha256", secretKey).update(hashText).digest("hex");
}

function formatTxnDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getKioskSettings() {
  const [s] = await db.select().from(clinicSettingsTable).limit(1);
  return s ?? null;
}

function razorpayAuth(keyId: string, keySecret: string): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

async function generateKioskPatientId(): Promise<string> {
  // max(patient_id) is WRONG because string comparison is lexicographic:
  // 'P-00009' > 'P-00010' in Postgres, so the max string is not the latest number.
  const [row] = await db
    .select({ max: sql<number | null>`MAX(REGEXP_REPLACE(patient_id, '[^0-9]', '', 'g')::int)` })
    .from(patientsTable);
  const next = (row?.max ?? 0) + 1;
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

function getKioskBase(req: { headers: Record<string, string | string[] | undefined> }): string {
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) return `https://${domains.split(",")[0]}`;
  const host = String(req.headers["host"] || "localhost");
  return `${host.startsWith("localhost") || host.startsWith("127.0.0") || host.startsWith("192.168.") ? "http" : "https"}://${host}`;
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
  const iciciMerchantId = process.env.ICICI_MERCHANT_ID || (s.iciciMerchantId ?? "");
  const iciciSecretKey = process.env.ICICI_SECRET_KEY || (s.iciciSecretKey ?? "");
  res.json({
    enabled: (settings["kioskEnabled"] as boolean | null) ?? false,
    paymentGateway: (settings["kioskPaymentGateway"] as string | null) ?? "upi",
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
    iciciEnabled: Boolean(s.iciciEnabled && iciciMerchantId && iciciSecretKey),
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
    // ── GATEWAY-AWARE MODE (Razorpay or ICICI) ──────────────────────────────────
    const client = await pool.connect();
    let sessionTestIds: number[] = [];
    let sessionAmountPaise = 0;
    let sessionGateway: string = "razorpay";
    let sessionStatus: string = "";
    let sessionRazorpayId: string | null = null;
    let sessionIciciRef: string | null = null;
    try {
      const r = await client.query<{
        test_ids: string; amount_paise: number; status: string;
        gateway: string; razorpay_payment_id: string | null; icici_provider_ref_id: string | null;
      }>(
        `SELECT test_ids, amount_paise, status, gateway, razorpay_payment_id, icici_provider_ref_id
         FROM kiosk_payment_sessions WHERE payment_link_id = $1`,
        [paymentLinkId],
      );
      if (r.rowCount === 0) {
        res.status(404).json({ error: "Session not found. Please restart registration." });
        return;
      }
      const session = r.rows[0]!;
      sessionStatus = session.status;
      sessionGateway = session.gateway || "razorpay";
      sessionTestIds = JSON.parse(session.test_ids) as number[];
      sessionAmountPaise = session.amount_paise;
      sessionRazorpayId = session.razorpay_payment_id;
      sessionIciciRef = session.icici_provider_ref_id;
    } finally {
      client.release();
    }

    if (sessionStatus === "completed") {
      res.status(409).json({ error: "This payment has already been registered. Please see staff." });
      return;
    }

    if (sessionGateway === "icici") {
      // ── ICICI MODE ── verify server-side status
      const settings = await getKioskSettings();
      const s = settings as Record<string, unknown>;
      const iciciMerchantId = process.env.ICICI_MERCHANT_ID || (s["iciciMerchantId"] as string | undefined) || "";
      const iciciAggregatorId = process.env.ICICI_AGGREGATOR_ID || (s["iciciAggregatorId"] as string | undefined) || "";
      const iciciSecretKey = process.env.ICICI_SECRET_KEY || (s["iciciSecretKey"] as string | undefined) || "";
      let verified = false;
      if (iciciSecretKey && iciciMerchantId) {
        try {
          const statusHashParams: Record<string, string> = {
            aggregatorID: iciciAggregatorId,
            merchantId: iciciMerchantId,
            merchantTxnNo: paymentLinkId,
            originalTxnNo: paymentLinkId,
            transactionType: "STATUS",
          };
          const statusHash = generateIciciSecureHash(statusHashParams, iciciSecretKey);
          const statusRes = await fetch(`${getIciciBase()}/pg/api/command`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              merchantId: iciciMerchantId,
              aggregatorID: iciciAggregatorId,
              merchantTxnNo: paymentLinkId,
              originalTxnNo: paymentLinkId,
              transactionType: "STATUS",
              secureHash: statusHash,
            }),
          });
          const statusData = (await statusRes.json()) as {
            txnStatus?: string; txnResponseCode?: string; responseCode?: string;
          };
          verified = statusData.txnStatus === "SUC" || statusData.txnResponseCode === "0000" || statusData.responseCode === "000";
        } catch { /* fall through */ }
      }
      if (!verified) {
        res.status(402).json({ error: "Payment verification failed. Please complete the payment and try again." });
        return;
      }
      {
        const c2 = await pool.connect();
        try {
          await c2.query(
            `UPDATE kiosk_payment_sessions SET status = 'completed', icici_provider_ref_id = $2 WHERE payment_link_id = $1`,
            [paymentLinkId, sessionIciciRef ?? ""],
          );
        } finally { c2.release(); }
      }
      const result = await createPatientBillAndTokens({
        firstName, lastName, phone, gender,
        dateOfBirth: resolvedDob,
        testIds: sessionTestIds,
        paymentMethod: "icici",
        paymentReference: paymentLinkId,
        paymentAmount: sessionAmountPaise / 100,
      });
      res.status(201).json(result);
      return;
    }

    // ── RAZORPAY MODE ──
    const s = await getKioskSettings();
    const keyId = process.env.RAZORPAY_KEY_ID || (s?.razorpayKeyId ?? "");
    const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";
    if (!keyId || !keySecret) {
      res.status(503).json({ error: "Payment gateway not configured." });
      return;
    }
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
    if (amountPaisePaid < sessionAmountPaise) {
      res.status(402).json({ error: "Payment amount does not match. Please ask staff for assistance." });
      return;
    }
    {
      const c2 = await pool.connect();
      try {
        await c2.query(
          `UPDATE kiosk_payment_sessions SET status = 'completed', razorpay_payment_id = $2 WHERE payment_link_id = $1`,
          [paymentLinkId, razorpayPaymentId ?? ""],
        );
      } finally { c2.release(); }
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

// ── POST /api/kiosk/icici-initiate ────────────────────────────────────────────────────────
kioskRouter.post("/icici-initiate", paymentLimiter, async (req, res): Promise<void> => {
  const settings = await getKioskSettings();
  const s = settings as Record<string, unknown>;
  if (!s["kioskEnabled"] || !s["iciciEnabled"]) {
    res.status(403).json({ error: "ICICI kiosk payments not enabled." });
    return;
  }

  const merchantId = process.env.ICICI_MERCHANT_ID || (s["iciciMerchantId"] as string | undefined) || "";
  const aggregatorId = process.env.ICICI_AGGREGATOR_ID || (s["iciciAggregatorId"] as string | undefined) || "";
  const secretKey = process.env.ICICI_SECRET_KEY || (s["iciciSecretKey"] as string | undefined) || "";
  if (!merchantId || !secretKey) {
    res.status(503).json({ error: "ICICI payment gateway not configured. Please contact staff." });
    return;
  }

  const body = req.body as {
    firstName: string; lastName: string; phone: string; email?: string;
    testIds: number[]; totalAmount: number;
  };
  const { firstName, lastName, phone, email = "", testIds, totalAmount } = body;

  if (!firstName?.trim() || !phone?.trim()) {
    res.status(400).json({ error: "Name and phone are required." });
    return;
  }
  if (!Array.isArray(testIds) || testIds.length === 0) {
    res.status(400).json({ error: "Please select at least one test." });
    return;
  }
  const amount = Number(totalAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "Invalid total amount." });
    return;
  }

  // Validate amount against DB
  const tests = await db
    .select({ id: testsTable.id, price: testsTable.price })
    .from(testsTable)
    .where(and(eq(testsTable.isActive, true), inArray(testsTable.id, testIds)));
  if (tests.length !== testIds.length) {
    res.status(400).json({ error: "One or more selected tests are no longer available." });
    return;
  }
  const dbSubtotal = tests.reduce((acc, t) => acc + Number(t.price), 0);
  if (Math.abs(dbSubtotal - amount) > 1) {
    res.status(400).json({ error: "Total mismatch — please restart and try again." });
    return;
  }

  const sessionRef = `KIOSK${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const base = getKioskBase(req);
  const returnUrl = `${base}/api/kiosk/icici-callback`;
  const txnDate = formatTxnDate();
  const amountStr = amount.toFixed(2);
  const mobile = phone.replace(/\D/g, "").slice(-10);
  const patientName = `${firstName} ${lastName}`.trim();
  const addlParam1 = sessionRef;
  const addlParam2 = "kiosk";

  const hashParams: Record<string, string> = {
    addlParam1,
    addlParam2,
    aggregatorID: aggregatorId,
    amount: amountStr,
    currencyCode: "356",
    customerEmailID: email.trim() || "care.deoghar@gmail.com",
    customerMobileNo: mobile,
    customerName: patientName,
    merchantId,
    merchantTxnNo: sessionRef,
    payType: "0",
    returnURL: returnUrl,
    transactionType: "SALE",
    txnDate,
  };
  const secureHash = generateIciciSecureHash(hashParams, secretKey);

  const payload = {
    merchantId,
    aggregatorID: aggregatorId,
    merchantTxnNo: sessionRef,
    amount: amountStr,
    currencyCode: "356",
    payType: "0",
    customerEmailID: email.trim() || "care.deoghar@gmail.com",
    transactionType: "SALE",
    returnURL: returnUrl,
    txnDate,
    customerMobileNo: mobile,
    customerName: patientName,
    addlParam1,
    addlParam2,
    secureHash,
  };

  try {
    const iciciUrl = `${getIciciBase()}/pg/api/v2/initiateSale`;
    logger.info({ iciciUrl, merchantId, aggregatorId, sessionRef }, "Kiosk ICICI initiateSale request");
    const iciciRes = await fetch(iciciUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const iciciData = (await iciciRes.json()) as {
      responseCode?: string;
      merchantId?: string;
      merchantTxnNo?: string;
      redirectURI?: string;
      tranCtx?: string;
      secureHash?: string;
      respDescription?: string;
    };
    logger.info({ status: iciciRes.status, responseCode: iciciData.responseCode, respDescription: iciciData.respDescription }, "Kiosk ICICI initiateSale response");
    if (!iciciRes.ok || !iciciData.tranCtx || iciciData.responseCode !== "R1000") {
      res.status(502).json({ error: "Could not initiate ICICI payment. Please try again.", details: iciciData.respDescription || iciciData.responseCode });
      return;
    }

    const redirectTo = `${iciciData.redirectURI}?tranCtx=${encodeURIComponent(iciciData.tranCtx)}`;
    const amountPaise = Math.round(amount * 100);

    // Persist session
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO kiosk_payment_sessions (payment_link_id, session_ref, test_ids, amount_paise, patient_name, patient_details, status, gateway, icici_transaction_id, icici_provider_ref_id, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', 'icici', $7, $8, NOW(), NOW() + INTERVAL '30 minutes')`,
        [sessionRef, sessionRef, JSON.stringify(testIds), amountPaise, patientName,
         JSON.stringify({ firstName, lastName, phone, email }), sessionRef, iciciData.tranCtx],
      );
    } finally {
      client.release();
    }

    res.json({ sessionRef, redirectUrl: redirectTo, tranCtx: iciciData.tranCtx });
  } catch (err) {
    logger.error({ err, merchantId, sessionRef }, "Kiosk ICICI initiateSale exception");
    res.status(502).json({ error: "Could not connect to ICICI payment gateway. Please try again." });
  }
});

// ── ICICI callback handler (shared GET + POST) ──────────────────────────────────

async function handleKioskIciciCallback(req: any, res: any, queryOrBody: Record<string, string>): Promise<void> {
  const base = getKioskBase(req);
  const erpBase = `${base}/erp`;

  logger.info({ keys: Object.keys(queryOrBody), queryOrBody }, "Kiosk ICICI callback received");

  const { merchantTxnNo, responseCode, respDescription, txnID, status } = queryOrBody;
  if (!merchantTxnNo) {
    res.redirect(`${erpBase}/kiosk?failed=1&reason=missing_txn_id`);
    return;
  }

  const client = await pool.connect();
  let session: { session_ref: string; test_ids: string; amount_paise: number; patient_name: string; patient_details: string; status: string } | null = null;
  try {
    const r = await client.query<{ session_ref: string; test_ids: string; amount_paise: number; patient_name: string; patient_details: string; status: string }>(
      `SELECT session_ref, test_ids, amount_paise, patient_name, patient_details, status FROM kiosk_payment_sessions WHERE payment_link_id = $1`,
      [merchantTxnNo],
    );
    if (r.rowCount === 0) {
      session = null;
    } else {
      session = r.rows[0]!;
    }
  } catch { /* fall through */ }

  if (!session) {
    client.release();
    res.redirect(`${erpBase}/kiosk?failed=1&reason=session_not_found`);
    return;
  }

  // Already completed
  if (session.status === "completed") {
    client.release();
    res.redirect(`${erpBase}/kiosk?success=1&ref=${encodeURIComponent(session.session_ref)}&gateway=icici`);
    return;
  }

  const settings = await getKioskSettings();
  const s = settings as Record<string, unknown>;
  const iciciMerchantId = process.env.ICICI_MERCHANT_ID || (s["iciciMerchantId"] as string | undefined) || "";
  const iciciAggregatorId = process.env.ICICI_AGGREGATOR_ID || (s["iciciAggregatorId"] as string | undefined) || "";
  const iciciSecretKey = process.env.ICICI_SECRET_KEY || (s["iciciSecretKey"] as string | undefined) || "";

  // Server-side status verification
  if (iciciSecretKey && iciciMerchantId) {
    try {
      const statusHashParams: Record<string, string> = {
        aggregatorID: iciciAggregatorId,
        merchantId: iciciMerchantId,
        merchantTxnNo,
        originalTxnNo: merchantTxnNo,
        transactionType: "STATUS",
      };
      const statusHash = generateIciciSecureHash(statusHashParams, iciciSecretKey);
      const statusRes = await fetch(`${getIciciBase()}/pg/api/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          merchantId: iciciMerchantId,
          aggregatorID: iciciAggregatorId,
          merchantTxnNo,
          originalTxnNo: merchantTxnNo,
          transactionType: "STATUS",
          secureHash: statusHash,
        }),
      });
      const statusData = (await statusRes.json()) as {
        txnStatus?: string;
        txnResponseCode?: string;
        responseCode?: string;
        respDescription?: string;
      };
      if (statusData.txnStatus === "SUC" || statusData.txnResponseCode === "0000" || statusData.responseCode === "000") {
        await client.query(
          `UPDATE kiosk_payment_sessions SET status = 'completed', icici_provider_ref_id = $2 WHERE payment_link_id = $1`,
          [merchantTxnNo, txnID || ""],
        );
        client.release();
        res.redirect(`${erpBase}/kiosk?success=1&ref=${encodeURIComponent(session.session_ref)}&gateway=icici`);
        return;
      }
    } catch { /* fall through */ }
  }

  // Defensive success-by-code
  const successCodes = ["0000", "000", "success", "SUCCESS", "SUC", "TXN_SUCCESS"];
  const isSuccessByCode = successCodes.includes(responseCode) || successCodes.includes(status);
  if (isSuccessByCode) {
    await client.query(
      `UPDATE kiosk_payment_sessions SET status = 'completed', icici_provider_ref_id = $2 WHERE payment_link_id = $1`,
      [merchantTxnNo, txnID || ""],
    );
    client.release();
    res.redirect(`${erpBase}/kiosk?success=1&ref=${encodeURIComponent(session.session_ref)}&gateway=icici`);
    return;
  }

  // Mark failed
  await client.query(
    `UPDATE kiosk_payment_sessions SET status = 'failed' WHERE payment_link_id = $1`,
    [merchantTxnNo],
  );
  client.release();
  res.redirect(`${erpBase}/kiosk?failed=1&reason=${encodeURIComponent(respDescription || "Payment not completed")}`);
}

kioskRouter.get("/icici-callback", async (req, res): Promise<void> => {
  const merged = { ...(req.query as Record<string, string>), ...(req.body as Record<string, string>) };
  await handleKioskIciciCallback(req, res, merged);
});

kioskRouter.post("/icici-callback", async (req, res): Promise<void> => {
  const merged = { ...(req.query as Record<string, string>), ...(req.body as Record<string, string>) };
  await handleKioskIciciCallback(req, res, merged);
});

// ── GET /api/kiosk/icici-status/:sessionRef ──────────────────────────────────────────
kioskRouter.get("/icici-status/:sessionRef", async (req, res): Promise<void> => {
  const { sessionRef } = req.params;
  if (!sessionRef || sessionRef.length > 60) {
    res.status(400).json({ error: "Invalid session reference" });
    return;
  }

  const client = await pool.connect();
  try {
    const r = await client.query<{ status: string; icici_transaction_id: string | null; icici_provider_ref_id: string | null }>(
      `SELECT status, icici_transaction_id, icici_provider_ref_id FROM kiosk_payment_sessions WHERE session_ref = $1`,
      [sessionRef],
    );
    if (r.rowCount === 0) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const row = r.rows[0]!;
    const completed = row.status === "completed";
    res.json({ status: row.status, completed, sessionRef: row.icici_transaction_id, providerRef: row.icici_provider_ref_id });
  } finally {
    client.release();
  }
});
