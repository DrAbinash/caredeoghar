/**
 * CARE Emergency Billing Export
 * Generates CARE_EMERGENCY_BILLING_JSON_V1 (and optional CSV twin) for import
 * into an on-prem CARE ERP via Settings → Emergency Billing.
 *
 * Endpoints (all require super-admin auth):
 *   POST /upload-doctors   — replace CARE doctors master (body: { csv: string })
 *   POST /upload-tests     — replace CARE tests master   (body: { csv: string })
 *   GET  /master-status    — row counts + last upload timestamps
 *   GET  /preview          — totals for a date range (no mapping needed)
 *   GET  /generate         — full export package (JSON + CSVs + totals)
 */

import { Router } from "express";
import { createHash } from "node:crypto";
import { db } from "@workspace/db";
import {
  billsTable,
  ordersTable,
  orderTestsTable,
  testsTable,
  doctorsTable,
  patientsTable,
  paymentsTable,
  careDoctorsMasterTable,
  careTestsMasterTable,
} from "@workspace/db/schema";
import { eq, and, isNull, inArray, sql, count } from "drizzle-orm";

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Simple RFC-4180 CSV parser — handles quoted fields and CRLF/LF. */
function parseCsv(raw: string): string[][] {
  const src = raw.replace(/^\ufeff/, ""); // strip BOM
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else { inQ = false; }
      } else { field += c; }
      continue;
    }
    if (c === '"')  { inQ = true; continue; }
    if (c === ",")  { cur.push(field.trim()); field = ""; continue; }
    if (c === "\r") { continue; }
    if (c === "\n") { cur.push(field.trim()); rows.push(cur); cur = []; field = ""; continue; }
    field += c;
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field.trim()); rows.push(cur); }
  return rows.filter(r => r.some(f => f.length > 0));
}

/** Normalise a name for fuzzy matching: strip Dr./Mr./Mrs., collapse spaces, lowercase. */
function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Deterministic UUID v5-like from bill ID (SHA-1 based). */
function billUuid(billId: number): string {
  const h = createHash("sha1")
    .update("care-export-replit-v1:" + billId)
    .digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    "5" + h.slice(13, 16),
    ((parseInt(h[16]!, 16) & 0x3 | 0x8).toString(16)) + h.slice(17, 20),
    h.slice(20, 32),
  ].join("-");
}

/** Map Replit payment method → CARE-accepted method. */
function careMethod(method: string): "cash" | "upi" | "card" {
  const m = method.toLowerCase();
  if (m === "upi") return "upi";
  if (m === "card" || m === "debit card" || m === "credit card") return "card";
  return "cash"; // cash, cheque, neft, rtgs, other → cash
}

/** IST date string (YYYY-MM-DD) for a UTC timestamp. */
function istDateStr(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Calcutta" });
}

/** Zero-pad number. */
const pad = (n: number, w: number) => String(n).padStart(w, "0");

// ── Step A: Master upload ──────────────────────────────────────────────────────

router.post("/upload-doctors", async (req, res) => {
  const raw = req.body?.csv;
  if (typeof raw !== "string" || !raw.trim()) {
    res.status(400).json({ error: "Missing 'csv' field in body" });
    return;
  }
  const rows = parseCsv(raw);
  if (rows.length < 2) { res.status(400).json({ error: "CSV must have a header row and at least one data row" }); return; }

  const headers = rows[0]!.map(h => h.toLowerCase().replace(/[^a-z]/g, ""));
  const idIdx   = headers.findIndex(h => h === "id");
  const nameIdx = headers.findIndex(h => h === "name");
  const specIdx = headers.findIndex(h => h === "specialization");

  if (idIdx === -1 || nameIdx === -1) {
    res.status(400).json({ error: "CSV must have columns: id, name (specialization optional)" });
    return;
  }

  const data = rows.slice(1).map((r, i) => {
    const careId = parseInt(r[idIdx] ?? "", 10);
    if (isNaN(careId)) throw new Error(`Row ${i + 2}: id is not a number`);
    return {
      careId,
      name: (r[nameIdx] ?? "").trim(),
      specialization: specIdx >= 0 ? (r[specIdx] ?? "").trim() : "",
    };
  }).filter(d => d.name);

  try {
    await db.transaction(async (tx) => {
      await tx.delete(careDoctorsMasterTable);
      if (data.length > 0) await tx.insert(careDoctorsMasterTable).values(data);
    });
    res.json({ ok: true, rows: data.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

router.post("/upload-tests", async (req, res) => {
  const raw = req.body?.csv;
  if (typeof raw !== "string" || !raw.trim()) {
    res.status(400).json({ error: "Missing 'csv' field in body" });
    return;
  }
  const rows = parseCsv(raw);
  if (rows.length < 2) { res.status(400).json({ error: "CSV must have a header row and at least one data row" }); return; }

  const headers = rows[0]!.map(h => h.toLowerCase().replace(/[^a-z_]/g, "").replace(/_/g, ""));
  const col = (name: string) => headers.findIndex(h => h === name);

  const idIdx       = col("id");
  const codeIdx     = col("code");
  const nameIdx     = col("name");
  const categoryIdx = col("category");
  const priceIdx    = col("price");
  const activeIdx   = col("isactive");

  if (idIdx === -1 || nameIdx === -1) {
    res.status(400).json({ error: "CSV must have columns: id, name (code, category, price, is_active optional)" });
    return;
  }

  const data = rows.slice(1).map((r, i) => {
    const careId = parseInt(r[idIdx] ?? "", 10);
    if (isNaN(careId)) throw new Error(`Row ${i + 2}: id is not a number`);
    const priceRaw = priceIdx >= 0 ? parseFloat(r[priceIdx] ?? "0") : 0;
    const isActiveRaw = activeIdx >= 0 ? r[activeIdx] : "true";
    return {
      careId,
      code: codeIdx >= 0 ? (r[codeIdx] ?? "").trim() : "",
      name: (r[nameIdx] ?? "").trim(),
      category: categoryIdx >= 0 ? (r[categoryIdx] ?? "").trim() : "",
      price: isNaN(priceRaw) ? "0" : priceRaw.toFixed(2),
      isActive: isActiveRaw?.toLowerCase() !== "false" && isActiveRaw !== "0",
    };
  }).filter(d => d.name);

  try {
    await db.transaction(async (tx) => {
      await tx.delete(careTestsMasterTable);
      if (data.length > 0) await tx.insert(careTestsMasterTable).values(data);
    });
    res.json({ ok: true, rows: data.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
  }
});

// ── Master status ──────────────────────────────────────────────────────────────

router.get("/master-status", async (_req, res) => {
  const [docCount] = await db.select({ n: count() }).from(careDoctorsMasterTable);
  const [testCount] = await db.select({ n: count() }).from(careTestsMasterTable);
  const [latestDoc]  = await db.select({ uploadedAt: careDoctorsMasterTable.uploadedAt })
    .from(careDoctorsMasterTable).orderBy(sql`uploaded_at DESC`).limit(1);
  const [latestTest] = await db.select({ uploadedAt: careTestsMasterTable.uploadedAt })
    .from(careTestsMasterTable).orderBy(sql`uploaded_at DESC`).limit(1);

  res.json({
    doctors: { rows: docCount?.n ?? 0, uploadedAt: latestDoc?.uploadedAt ?? null },
    tests:   { rows: testCount?.n ?? 0, uploadedAt: latestTest?.uploadedAt ?? null },
  });
});

// ── Helper: fetch billing data for a date range ────────────────────────────────

async function fetchBillingData(from: string, to: string) {
  // Non-cancelled bills in IST date range
  const billRows = await db
    .select({
      bill:    billsTable,
      order:   ordersTable,
      patient: patientsTable,
      doctor:  doctorsTable,
    })
    .from(billsTable)
    .innerJoin(ordersTable,   eq(billsTable.orderId,   ordersTable.id))
    .innerJoin(patientsTable, eq(billsTable.patientId, patientsTable.id))
    .leftJoin(doctorsTable,   eq(ordersTable.doctorId, doctorsTable.id))
    .where(
      and(
        isNull(billsTable.cancelledAt),
        sql`(${billsTable.createdAt} AT TIME ZONE 'Asia/Calcutta')::date BETWEEN ${from}::date AND ${to}::date`,
      )
    )
    .orderBy(billsTable.createdAt);

  if (billRows.length === 0) return { billRows, testsByOrder: new Map(), paysByBill: new Map() };

  const orderIds = [...new Set(billRows.map(b => b.order.id))];
  const billIds  = billRows.map(b => b.bill.id);

  const [orderTestRows, paymentRows] = await Promise.all([
    db.select({ ot: orderTestsTable, test: testsTable })
      .from(orderTestsTable)
      .innerJoin(testsTable, eq(orderTestsTable.testId, testsTable.id))
      .where(and(inArray(orderTestsTable.orderId, orderIds), eq(orderTestsTable.status, "active"))),
    db.select().from(paymentsTable).where(inArray(paymentsTable.billId, billIds)),
  ]);

  const testsByOrder = new Map<number, typeof orderTestRows>();
  for (const row of orderTestRows) {
    const arr = testsByOrder.get(row.ot.orderId) ?? [];
    arr.push(row);
    testsByOrder.set(row.ot.orderId, arr);
  }

  const paysByBill = new Map<number, typeof paymentRows>();
  for (const p of paymentRows) {
    const arr = paysByBill.get(p.billId) ?? [];
    arr.push(p);
    paysByBill.set(p.billId, arr);
  }

  return { billRows, testsByOrder, paysByBill };
}

// ── Step B: Preview totals ─────────────────────────────────────────────────────

router.get("/preview", async (req, res) => {
  const { from, to } = req.query as Record<string, string>;
  if (!from || !to) { res.status(400).json({ error: "from and to are required (YYYY-MM-DD)" }); return; }

  const { billRows, testsByOrder } = await fetchBillingData(from, to);

  let totalTests = 0;
  for (const b of billRows) totalTests += (testsByOrder.get(b.order.id) ?? []).length;

  const subtotal = billRows.reduce((s, b) => s + Number(b.bill.subtotal), 0);
  const discount = billRows.reduce((s, b) => s + Number(b.bill.discount), 0);
  const total    = billRows.reduce((s, b) => s + Number(b.bill.totalAmount), 0);
  const paid     = billRows.reduce((s, b) => s + Number(b.bill.paidAmount), 0);
  const balance  = billRows.reduce((s, b) => s + Number(b.bill.balanceAmount), 0);
  const withDoctor = billRows.filter(b => b.doctor !== null).length;

  res.json({ bills: billRows.length, tests: totalTests, subtotal, discount, total, paid, balance, withDoctor, from, to });
});

// ── Step C+D: Generate export package ─────────────────────────────────────────

router.get("/generate", async (req, res) => {
  const { from, to, includeCSV } = req.query as Record<string, string>;
  if (!from || !to) { res.status(400).json({ error: "from and to are required (YYYY-MM-DD)" }); return; }

  // Check masters are populated
  const [docCount]  = await db.select({ n: count() }).from(careDoctorsMasterTable);
  const [testCount] = await db.select({ n: count() }).from(careTestsMasterTable);
  if ((docCount?.n ?? 0) === 0 || (testCount?.n ?? 0) === 0) {
    res.status(400).json({ error: "Upload CARE doctors.csv and tests.csv first." });
    return;
  }

  const [careDocs, careTests] = await Promise.all([
    db.select().from(careDoctorsMasterTable),
    db.select().from(careTestsMasterTable),
  ]);

  const { billRows, testsByOrder, paysByBill } = await fetchBillingData(from, to);

  // Build lookup maps
  const careDocByNameExact = new Map(careDocs.map(d => [d.name.toLowerCase().trim(), d]));
  const careDocByNameFuzzy = new Map(careDocs.map(d => [normName(d.name), d]));
  const careTestByCode     = new Map(careTests.map(t => [t.code.toLowerCase().trim(), t]));
  const careTestByName     = new Map(careTests.map(t => [t.name.toLowerCase().trim(), t]));

  // Mapping reports
  type DocMapRow = { replitName: string; careId: number | null; careName: string; matchType: string };
  type TestMapRow = { replitCode: string; replitName: string; careId: number | null; careName: string; matchType: string };
  const docMapRows   = new Map<string, DocMapRow>();
  const testMapRows  = new Map<string, TestMapRow>();
  const errors: { billNumber: string; reason: string }[] = [];

  function mapDoctor(name: string | null): { careId: number | null; careName: string | null; matchType: string } {
    if (!name) return { careId: null, careName: null, matchType: "walk-in" };
    const key = name.toLowerCase().trim();
    if (docMapRows.has(key)) {
      const r = docMapRows.get(key)!;
      return { careId: r.careId, careName: r.careName || null, matchType: r.matchType };
    }
    let match = careDocByNameExact.get(key);
    let matchType = "exact";
    if (!match) { match = careDocByNameFuzzy.get(normName(name)); matchType = "fuzzy"; }
    const row: DocMapRow = {
      replitName: name,
      careId: match?.careId ?? null,
      careName: match?.name ?? "",
      matchType: match ? matchType : "unmatched",
    };
    docMapRows.set(key, row);
    return { careId: row.careId, careName: row.careName || null, matchType: row.matchType };
  }

  function mapTest(code: string, name: string): {
    careId: number | null; careCode: string; careName: string; careCategory: string; matchType: string;
  } {
    const testKey = code.toLowerCase().trim() + "|" + name.toLowerCase().trim();
    if (testMapRows.has(testKey)) {
      const r = testMapRows.get(testKey)!;
      return { careId: r.careId, careCode: (r as unknown as { careCode: string }).careCode ?? "", careName: r.careName, careCategory: (r as unknown as { careCategory: string }).careCategory ?? "", matchType: r.matchType };
    }
    let match = careTestByCode.get(code.toLowerCase().trim());
    let matchType = "code";
    if (!match || !code.trim()) { match = careTestByName.get(name.toLowerCase().trim()); matchType = "name"; }
    const row = {
      replitCode: code,
      replitName: name,
      careId: match?.careId ?? null,
      careCode: match?.code ?? "",
      careName: match?.name ?? "",
      careCategory: match?.category ?? "",
      matchType: match ? matchType : "unmatched",
    };
    testMapRows.set(testKey, row as unknown as TestMapRow);
    return { careId: row.careId, careCode: row.careCode, careName: row.careName, careCategory: row.careCategory, matchType: row.matchType };
  }

  // Fixed CARE session UUID (no real sessions — placeholder per spec)
  const SESSION_UUID = "00000000-0000-4000-8000-000000000001";

  // DS225-compliant transaction shape
  type CareTransaction = {
    emergencyTransactionUuid: string;
    emergencyBillNumber: string;
    emergencySessionUuid: string;
    status: "PENDING";
    createdAt: string;
    createdByStaffId: 0;
    createdByStaffName: "Replit Export";
    voidedAt: null;
    voidedByStaffName: null;
    voidReason: null;
    patient: {
      carePatientId: null;
      uhid: null;
      firstName: string;
      lastName: string;
      sex: "M" | "F" | "O";
      ageValue: number | null;
      ageUnit: string | null;
      dateOfBirth: string | null;
      mobile: string;
    };
    referringDoctorId: number | null;
    referringDoctorName: string | null;
    lines: Array<{
      careServiceId: number;
      serviceCode: string;
      serviceName: string;
      category: string;
      quantity: number;
      unitPrice: number;
      lineGross: number;
    }>;
    grossAmount: number;
    discountAmount: number;
    discountReason: null;
    netAmount: number;
    amountReceived: number;
    dueAmount: number;
    payments: Array<{ method: string; amount: number }>;
    notes: string;
    tariffSyncedAt: null;
  };

  const transactions: CareTransaction[] = [];
  let billSeq = 0;

  for (const { bill, order, patient, doctor } of billRows) {
    const tests = testsByOrder.get(order.id) ?? [];
    const pays  = paysByBill.get(bill.id) ?? [];

    // Map doctor
    const doctorMap = mapDoctor(doctor?.name ?? null);

    // Map tests → build DS225 lines
    const lineErrors: string[] = [];
    const lines: CareTransaction["lines"] = [];
    for (const { ot, test } of tests) {
      const testMap = mapTest(test.code, test.name);
      if (testMap.careId === null) {
        lineErrors.push(`test "${test.name}" (code: ${test.code}) unmapped`);
        continue;
      }
      const unitPrice = Number(ot.price);
      lines.push({
        careServiceId: testMap.careId,
        serviceCode: testMap.careCode || test.code,
        serviceName: ot.displayName ?? test.name,
        category: testMap.careCategory || test.category,
        quantity: 1,
        unitPrice,
        lineGross: Number((unitPrice * 1).toFixed(2)),
      });
    }

    if (lineErrors.length > 0) {
      errors.push({ billNumber: bill.billNumber, reason: lineErrors.join("; ") });
      continue;
    }
    if (lines.length === 0) {
      errors.push({ billNumber: bill.billNumber, reason: "No active tests found" });
      continue;
    }

    // Unmatched referred doctor → skip bill
    if (doctor && doctorMap.careId === null && doctorMap.matchType !== "walk-in") {
      errors.push({
        billNumber: bill.billNumber,
        reason: `Referring doctor "${doctor.name}" not found in CARE doctors master`,
      });
      continue;
    }

    billSeq++;
    const billDate = istDateStr(new Date(bill.createdAt));
    const emgDate  = billDate.replace(/-/g, "");

    // Patient — use DB first/last name fields directly
    const rawFirst = (patient as unknown as { firstName?: string }).firstName ?? patient.name ?? "";
    const rawLast  = (patient as unknown as { lastName?: string }).lastName ?? "";
    const firstName = rawFirst.trim() || (patient.name.split(" ")[0] ?? patient.name);
    const lastName  = rawLast.trim() || (patient.name.includes(" ") ? patient.name.split(" ").slice(1).join(" ") : "-") || "-";
    const genderRaw = ((patient as unknown as { gender?: string }).gender ?? "").toLowerCase();
    const sex: "M" | "F" | "O" = genderRaw === "male" ? "M" : genderRaw === "female" ? "F" : "O";
    const rawPhone = ((patient as unknown as { phone?: string }).phone ?? "").replace(/\D/g, "");
    const mobile   = rawPhone || "0000000000";
    const dob      = (patient as unknown as { dateOfBirth?: string }).dateOfBirth ?? null;
    const ageValue = (patient as unknown as { ageValue?: number | null }).ageValue ?? null;
    const ageUnit  = (patient as unknown as { ageUnit?: string | null }).ageUnit ?? null;

    transactions.push({
      emergencyTransactionUuid: billUuid(bill.id),
      emergencyBillNumber: `EMG-${emgDate}-${pad(billSeq, 5)}`,
      emergencySessionUuid: SESSION_UUID,
      status: "PENDING",
      createdAt: new Date(bill.createdAt).toISOString(),
      createdByStaffId: 0,
      createdByStaffName: "Replit Export",
      voidedAt: null,
      voidedByStaffName: null,
      voidReason: null,
      patient: {
        carePatientId: null,
        uhid: null,
        firstName,
        lastName,
        sex,
        ageValue,
        ageUnit,
        dateOfBirth: dob || null,
        mobile,
      },
      referringDoctorId: doctorMap.careId,
      referringDoctorName: doctorMap.careId ? (doctorMap.careName ?? doctor?.name ?? null) : null,
      lines,
      grossAmount: Number(bill.subtotal),
      discountAmount: Number(bill.discount),
      discountReason: null,
      netAmount: Number(bill.totalAmount),
      amountReceived: Number(bill.paidAmount),
      dueAmount: Number(bill.balanceAmount),
      payments: pays.map(p => ({ method: careMethod(p.method), amount: Number(p.amount) })),
      notes: `replit-bill:${bill.billNumber}`,
      tariffSyncedAt: null,
    });
  }

  // ── Root JSON envelope — key order matters for checksum
  const exportedAt = new Date().toISOString();
  const unsignedObj = {
    format: "CARE_EMERGENCY_BILLING_JSON_V1",
    version: 1,
    exportedAt,
    masterDataLastSyncedAt: null,
    sessions: [] as unknown[],
    transactions,
  };
  const checksum  = createHash("sha256").update(JSON.stringify(unsignedObj)).digest("hex");
  const finalJson = JSON.stringify({ ...unsignedObj, checksumSha256: checksum }, null, 2);

  // ── Mapping report CSVs
  const docMapCsv = [
    "Replit Doctor Name,CARE Doctor ID,CARE Doctor Name,Match Type",
    ...[...docMapRows.values()].map(r =>
      [r.replitName, r.careId ?? "", r.careName, r.matchType].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  const testMapCsv = [
    "Replit Code,Replit Name,CARE Test ID,CARE Test Name,Match Type",
    ...[...testMapRows.values()].map(r =>
      [r.replitCode, r.replitName, r.careId ?? "", r.careName, r.matchType].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  // ── Totals
  const grossTotal = transactions.reduce((s, t) => s + t.grossAmount, 0);
  const discTotal  = transactions.reduce((s, t) => s + t.discountAmount, 0);
  const netTotal   = transactions.reduce((s, t) => s + t.netAmount, 0);
  const paidTotal  = transactions.reduce((s, t) => s + t.amountReceived, 0);
  const dueTotal   = transactions.reduce((s, t) => s + t.dueAmount, 0);
  const withRef    = transactions.filter(t => t.referringDoctorId !== null).length;
  const fmt = (n: number) => n.toFixed(2);

  const totalsTxt = [
    `CARE Emergency Export — Totals`,
    `Date Range   : ${from} to ${to}`,
    `Generated At : ${exportedAt}`,
    ``,
    `Bills Exported         : ${transactions.length}`,
    `Bills Skipped (errors) : ${errors.length}`,
    `Gross Amount           : ${fmt(grossTotal)}`,
    `Discount               : ${fmt(discTotal)}`,
    `Net Amount             : ${fmt(netTotal)}`,
    `Amount Received        : ${fmt(paidTotal)}`,
    `Due Amount             : ${fmt(dueTotal)}`,
    `With Referring Doctor  : ${withRef}`,
  ].join("\n");

  // ── Optional CSV twin (CARE_EMERGENCY_BILLING_V1) — exact CARE column order
  let csvTwin: string | null = null;
  if (includeCSV === "true" || includeCSV === "1") {
    const CSV_HEADER = "format,emergency_transaction_uuid,emergency_bill_number,emergency_session_uuid,status,created_at,created_by_staff_id,created_by_staff_name,voided_at,voided_by_staff_name,void_reason,care_patient_id,uhid,first_name,last_name,sex,age_value,age_unit,date_of_birth,mobile,referring_doctor_id,referring_doctor_name,service_ids,service_codes,service_names,quantities,unit_prices,gross_amount,discount_amount,discount_reason,net_amount,amount_received,due_amount,payment_methods,payment_amounts,notes,tariff_synced_at";
    const csvRows: string[] = [CSV_HEADER];
    for (const t of transactions) {
      csvRows.push([
        "CARE_EMERGENCY_BILLING_V1",
        t.emergencyTransactionUuid,
        t.emergencyBillNumber,
        t.emergencySessionUuid,
        t.status,
        t.createdAt,
        t.createdByStaffId,
        t.createdByStaffName,
        t.voidedAt ?? "",
        t.voidedByStaffName ?? "",
        t.voidReason ?? "",
        t.patient.carePatientId ?? "",
        t.patient.uhid ?? "",
        t.patient.firstName,
        t.patient.lastName,
        t.patient.sex,
        t.patient.ageValue ?? "",
        t.patient.ageUnit ?? "",
        t.patient.dateOfBirth ?? "",
        t.patient.mobile,
        t.referringDoctorId ?? "",
        t.referringDoctorName ?? "",
        t.lines.map(l => l.careServiceId).join("|"),
        t.lines.map(l => l.serviceCode).join("|"),
        t.lines.map(l => l.serviceName).join("|"),
        t.lines.map(l => l.quantity).join("|"),
        t.lines.map(l => l.unitPrice.toFixed(2)).join("|"),
        t.grossAmount.toFixed(2),
        t.discountAmount.toFixed(2),
        t.discountReason ?? "",
        t.netAmount.toFixed(2),
        t.amountReceived.toFixed(2),
        t.dueAmount.toFixed(2),
        t.payments.map(p => p.method).join("|"),
        t.payments.map(p => p.amount.toFixed(2)).join("|"),
        t.notes,
        t.tariffSyncedAt ?? "",
      ].join(","));
    }
    csvTwin = csvRows.join("\n");
  }

  // ── Errors CSV
  const errorsCsv = errors.length === 0 ? null : [
    "Bill Number,Reason",
    ...errors.map(e => `"${e.billNumber}","${e.reason.replace(/"/g, '""')}"`),
  ].join("\n");

  res.json({
    json: finalJson,
    docMappingCsv: docMapCsv,
    testMappingCsv: testMapCsv,
    totalsTxt,
    csvTwin,
    errorsCsv,
    stats: {
      exported: transactions.length,
      skipped: errors.length,
      from,
      to,
    },
  });
});

export default router;
