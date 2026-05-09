import { Router } from "express";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
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

async function getKioskSettings() {
  const [s] = await db.select().from(clinicSettingsTable).limit(1);
  return s ?? null;
}

// GET /api/kiosk/config — public, no auth
kioskRouter.get("/config", async (_req, res): Promise<void> => {
  const s = await getKioskSettings();
  if (!s) {
    res.json({ enabled: false, clinicName: "DiagnoCenter", tagline: "", logoDataUrl: null, upiVpa: "", upiName: "", welcomeMessage: "" });
    return;
  }
  const settings = s as Record<string, unknown>;
  res.json({
    enabled: (settings["kioskEnabled"] as boolean | null) ?? false,
    upiVpa: (settings["kioskUpiVpa"] as string | null) ?? "",
    upiName: (settings["kioskUpiName"] as string | null) ?? "",
    welcomeMessage: (settings["kioskWelcomeMessage"] as string | null) ?? "",
    kioskAllowedTestIds: (settings["kioskAllowedTestIds"] as string | null) ?? "[]",
    clinicName: s.name,
    tagline: s.tagline,
    logoDataUrl: s.logoDataUrl ?? null,
    address: s.address ?? "",
    phone: s.phone ?? "",
  });
});

// GET /api/kiosk/tests — public, no auth
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

// RegisterBody schema
const RegisterBody = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).default(""),
  phone: z.string().min(7).max(15),
  gender: z.enum(["male", "female", "other"]),
  dateOfBirth: z.string().max(20).default(""),
  testIds: z.array(z.number().int().positive()).min(1).max(30),
  utrReference: z.string().min(3).max(100),
  clientTotal: z.number().positive(),
});

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

// POST /api/kiosk/register — public, rate-limited
kioskRouter.post("/register", registerLimiter, async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  const { firstName, lastName, phone, gender, dateOfBirth, testIds, utrReference, clientTotal } = parsed.data;

  // 1. Fetch & validate tests
  const tests = await db
    .select({
      id: testsTable.id,
      name: testsTable.name,
      price: testsTable.price,
      department: testsTable.department,
    })
    .from(testsTable)
    .where(and(eq(testsTable.isActive, true), inArray(testsTable.id, testIds)));

  if (tests.length !== testIds.length) {
    res.status(400).json({ error: "One or more selected tests are no longer available. Please go back and reselect." });
    return;
  }

  const subtotal = tests.reduce((s, t) => s + Number(t.price), 0);

  // Verify client total matches server calculation
  if (Math.abs(subtotal - clientTotal) > 1) {
    res.status(400).json({ error: "Total mismatch — please restart and try again." });
    return;
  }

  // 2. Get first ledger
  const [firstLedger] = await db
    .select({ id: ledgersTable.id })
    .from(ledgersTable)
    .orderBy(ledgersTable.id)
    .limit(1);
  const ledgerId = firstLedger?.id ?? 1;

  // 3. Find or create patient by phone
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

  // 4. Create order number (unique per kiosk session)
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const orderNumber = `KIOSK-${stamp}-${rand}`;

  // 5. Insert order
  const [orderRow] = await db.insert(ordersTable).values({
    orderNumber,
    patientId: patientDbId,
    status: "pending",
    totalAmount: subtotal.toFixed(2),
    ledgerId,
    notes: `Kiosk self-registration | UPI UTR: ${utrReference}`,
  }).returning();

  // 6. Insert order test lines
  for (const t of tests) {
    await db.insert(orderTestsTable).values({
      orderId: orderRow.id,
      testId: t.id,
      price: Number(t.price).toFixed(2),
    });
  }

  // 7. Create bill
  const billNumber = await generateKioskBillNumber();
  const [billRow] = await db.insert(billsTable).values({
    billNumber,
    orderId: orderRow.id,
    patientId: patientDbId,
    subtotal: subtotal.toFixed(2),
    discount: "0.00",
    taxAmount: "0.00",
    totalAmount: subtotal.toFixed(2),
    paidAmount: subtotal.toFixed(2),
    balanceAmount: "0.00",
    status: "paid",
    ledgerId,
    createdByName: "Kiosk Self-Registration",
  }).returning();

  // 8. Record payment
  await db.insert(paymentsTable).values({
    billId: billRow.id,
    amount: subtotal.toFixed(2),
    method: "upi",
    referenceNumber: utrReference,
    recordedByName: "Kiosk",
    notes: "Kiosk self-registration UPI payment",
  });

  // 9. Update patient ledger if needed
  await db.update(patientsTable).set({ ledgerId }).where(
    and(eq(patientsTable.id, patientDbId), sql`${patientsTable.ledgerId} IS NULL`),
  );

  // 10. Generate queue token (non-blocking)
  let tokenInfo: { tokenNo: number; tokenDate: string } | null = null;
  try {
    tokenInfo = await generateTokenForBill({
      ledgerId,
      billId: billRow.id,
      patientId: patientDbId,
      source: "kiosk",
    });
  } catch { /* token failure must not block */ }

  // 11. Generate per-test tokens (non-blocking)
  let testTokens: Array<{ orderTestId: number; testName: string; department: string; roomNumber: string; tokenNo: number }> = [];
  try {
    testTokens = await generateTestTokensForOrder({
      ledgerId,
      billId: billRow.id,
      orderId: orderRow.id,
      patientId: patientDbId,
      source: "kiosk",
    });
  } catch { /* non-blocking */ }

  res.status(201).json({
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
  });
});
