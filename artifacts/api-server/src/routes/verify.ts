import { Router } from "express";
import { db, billsTable, patientsTable, clinicSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const verifyRouter = Router();

// Public bill verification endpoint. The QR code printed on every bill
// (when clinic.qrOnBillEnabled is on) encodes the URL
//   https://<host>/api/verify/bill/<billNumber>
// pointing here. Anyone scanning the QR (regulator, patient, auditor) gets
// a self-contained read-only HTML page proving the bill exists in the
// database and showing its key totals + status. No PHI beyond what is
// already on the printed receipt is returned. No auth — that's the point.
verifyRouter.get("/bill/:billNumber", async (req, res) => {
  const billNumber = String(req.params.billNumber || "").trim();
  if (!billNumber || billNumber.length > 64) {
    res.status(400).type("text/html").send(renderInvalid("Invalid bill number"));
    return;
  }

  const [bill] = await db
    .select({
      id: billsTable.id,
      billNumber: billsTable.billNumber,
      totalAmount: billsTable.totalAmount,
      paidAmount: billsTable.paidAmount,
      balanceAmount: billsTable.balanceAmount,
      status: billsTable.status,
      createdAt: billsTable.createdAt,
      cancelledAt: billsTable.cancelledAt,
      patientFirst: patientsTable.firstName,
      patientLast: patientsTable.lastName,
      patientCode: patientsTable.patientId,
    })
    .from(billsTable)
    .leftJoin(patientsTable, eq(billsTable.patientId, patientsTable.id))
    .where(eq(billsTable.billNumber, billNumber))
    .limit(1);

  if (!bill) {
    res.status(404).type("text/html").send(renderNotFound(billNumber));
    return;
  }

  const [clinic] = await db.select().from(clinicSettingsTable).limit(1);
  const clinicName = clinic?.name ?? "Diagnostic Centre";

  const patientName = bill.patientFirst
    ? `${bill.patientFirst} ${bill.patientLast ?? ""}`.trim()
    : "Unknown";
  const issued = bill.createdAt
    ? new Date(bill.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : "—";
  const cancelled = !!bill.cancelledAt;

  res.type("text/html").send(renderVerified({
    clinicName,
    billNumber: bill.billNumber,
    patientName,
    patientCode: bill.patientCode ?? "",
    issued,
    total: Number(bill.totalAmount),
    paid: Number(bill.paidAmount),
    balance: Number(bill.balanceAmount),
    status: cancelled ? "cancelled" : (bill.status ?? "pending"),
  }));
});

const esc = (s: string) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c),
  );
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SHELL_CSS = `
  body { font-family: -apple-system, system-ui, "Segoe UI", Roboto, Arial, sans-serif;
    margin:0; background:#f6f8fb; color:#0f172a; }
  .wrap { max-width: 520px; margin: 0 auto; padding: 32px 16px; }
  .card { background: white; border-radius: 16px; padding: 28px 24px;
    box-shadow: 0 4px 24px rgba(15,23,42,0.06); border:1px solid #e2e8f0; }
  .badge { display:inline-flex; align-items:center; gap:6px; padding:6px 12px;
    border-radius: 999px; font-size: 13px; font-weight:600; }
  .ok  { background:#dcfce7; color:#166534; }
  .warn{ background:#fef3c7; color:#92400e; }
  .bad { background:#fee2e2; color:#991b1b; }
  h1 { font-size:18px; margin:14px 0 4px; }
  .muted { color:#64748b; font-size: 12px; }
  table { width:100%; border-collapse: collapse; margin-top: 18px; font-size:14px; }
  td { padding: 8px 0; border-top: 1px solid #f1f5f9; }
  td:last-child { text-align:right; font-weight:600; }
  .total td { border-top: 2px solid #0f172a; font-size:15px; padding-top:12px; }
  .footer { margin-top: 18px; font-size: 11px; color:#94a3b8; text-align:center; }
`;

function renderVerified(b: {
  clinicName: string; billNumber: string; patientName: string;
  patientCode: string; issued: string;
  total: number; paid: number; balance: number; status: string;
}) {
  const statusClass =
    b.status === "paid" ? "ok" :
    b.status === "partial" ? "warn" :
    b.status === "cancelled" ? "bad" : "warn";
  const statusLabel =
    b.status === "cancelled" ? "❌ Cancelled" :
    b.status === "paid" ? "✅ Verified — Paid" :
    "✅ Verified";
  return `<!doctype html><html lang="en"><head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>Bill ${esc(b.billNumber)} — Verification</title>
    <style>${SHELL_CSS}</style>
  </head><body>
    <div class="wrap"><div class="card">
      <span class="badge ${statusClass}">${statusLabel}</span>
      <h1>${esc(b.clinicName)}</h1>
      <div class="muted">This bill was issued by ${esc(b.clinicName)} and is recorded in their system.</div>
      <table>
        <tr><td>Bill Number</td><td>${esc(b.billNumber)}</td></tr>
        <tr><td>Patient</td><td>${esc(b.patientName)}</td></tr>
        ${b.patientCode ? `<tr><td>Patient ID</td><td>${esc(b.patientCode)}</td></tr>` : ""}
        <tr><td>Issued</td><td>${esc(b.issued)}</td></tr>
        <tr><td>Status</td><td style="text-transform:capitalize">${esc(b.status)}</td></tr>
        <tr><td>Paid</td><td>${inr(b.paid)}</td></tr>
        <tr><td>Balance</td><td>${inr(b.balance)}</td></tr>
        <tr class="total"><td>Total Amount</td><td>${inr(b.total)}</td></tr>
      </table>
      <div class="footer">Verified at ${esc(new Date().toLocaleString("en-IN"))}</div>
    </div></div>
  </body></html>`;
}

function renderNotFound(billNumber: string) {
  return `<!doctype html><html lang="en"><head>
    <meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>Bill not found</title><style>${SHELL_CSS}</style>
  </head><body><div class="wrap"><div class="card">
    <span class="badge bad">⚠️ Not Found</span>
    <h1>This bill could not be verified</h1>
    <div class="muted">Bill number <strong>${esc(billNumber)}</strong> does not exist in our records. It may be a forged or invalid receipt.</div>
  </div></div></body></html>`;
}

function renderInvalid(msg: string) {
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Invalid request</title><style>${SHELL_CSS}</style></head>
  <body><div class="wrap"><div class="card"><span class="badge bad">⚠️ Invalid</span><h1>${esc(msg)}</h1></div></div></body></html>`;
}

export default verifyRouter;
