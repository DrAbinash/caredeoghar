import nodemailer from "nodemailer";
import { db } from "@workspace/db";
import { emailSettingsTable } from "@workspace/db/schema";

export async function getEmailSettings() {
  const [settings] = await db.select().from(emailSettingsTable).limit(1);
  return settings ?? null;
}

export async function getTransporter() {
  const s = await getEmailSettings();
  if (!s || !s.smtpHost || !s.smtpUser) return null;
  return nodemailer.createTransport({
    host: s.smtpHost,
    port: Number(s.smtpPort),
    secure: s.smtpSecure,
    auth: { user: s.smtpUser, pass: s.smtpPassword },
  });
}

export function getAllRecipients(settings: { adminEmail: string; extraRecipients: string }) {
  const extra: string[] = JSON.parse(settings.extraRecipients || "[]");
  const all = [settings.adminEmail, ...extra].filter(Boolean);
  return [...new Set(all)];
}

export async function sendBillEditEmail(params: {
  billNumber: string;
  patientName: string;
  editedBy: string;
  reason: string;
  changes: { field: string; from: string | null; to: string | null }[];
}) {
  const s = await getEmailSettings();
  if (!s || !s.billEditEnabled) return;

  const transport = await getTransporter();
  if (!transport) return;

  const recipients = getAllRecipients(s);
  if (recipients.length === 0) return;

  const changeRows = params.changes
    .map(c => `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:600">${c.field}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;color:#dc2626">${c.from ?? "—"}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;color:#16a34a">${c.to ?? "—"}</td>
    </tr>`)
    .join("");

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:12px">
      <div style="background:#1e40af;color:white;padding:16px 20px;border-radius:8px 8px 0 0;margin-bottom:0">
        <h2 style="margin:0;font-size:18px">Bill Edited — ${params.billNumber}</h2>
      </div>
      <div style="background:white;padding:20px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0">
        <p style="margin:0 0 12px"><strong>Patient:</strong> ${params.patientName}</p>
        <p style="margin:0 0 12px"><strong>Edited by:</strong> ${params.editedBy}</p>
        <p style="margin:0 0 16px"><strong>Reason:</strong> ${params.reason}</p>
        <h3 style="font-size:14px;margin:0 0 8px;color:#374151">Changes Made</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f1f5f9">
              <th style="padding:6px 12px;text-align:left">Field</th>
              <th style="padding:6px 12px;text-align:left">Before</th>
              <th style="padding:6px 12px;text-align:left">After</th>
            </tr>
          </thead>
          <tbody>${changeRows}</tbody>
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:#94a3b8">Sent by DiagnoCenter ERP • ${new Date().toLocaleString("en-IN")}</p>
      </div>
    </div>`;

  await transport.sendMail({
    from: `"${s.fromName}" <${s.fromAddress}>`,
    to: recipients.join(", "),
    subject: `[Bill Edit] ${params.billNumber} — ${params.patientName}`,
    html,
  });
}

export async function sendDailySummaryEmail(params: {
  date: string;
  totalRevenue: number;
  totalBills: number;
  paidBills: number;
  pendingBills: number;
  totalPayments: number;
  billsEdited: number;
}) {
  const s = await getEmailSettings();
  if (!s || !s.dailySummaryEnabled) return;

  const transport = await getTransporter();
  if (!transport) return;

  const recipients = getAllRecipients(s);
  if (recipients.length === 0) return;

  const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  const rows = [
    ["Date", params.date],
    ["Total Revenue Collected", inr(params.totalRevenue)],
    ["Bills Created", String(params.totalBills)],
    ["Bills Paid", String(params.paidBills)],
    ["Bills Pending / Partial", String(params.pendingBills)],
    ["Payments Received", inr(params.totalPayments)],
    ["Bills Edited", String(params.billsEdited)],
  ];

  const rowHtml = rows.map(([label, value]) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#6b7280;font-size:13px">${label}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:600;font-size:13px">${value}</td>
    </tr>`).join("");

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#f8fafc;padding:24px;border-radius:12px">
      <div style="background:#059669;color:white;padding:16px 20px;border-radius:8px 8px 0 0">
        <h2 style="margin:0;font-size:18px">Daily Summary Report</h2>
        <p style="margin:4px 0 0;opacity:0.85;font-size:13px">${params.date}</p>
      </div>
      <div style="background:white;padding:20px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0">
        <table style="width:100%;border-collapse:collapse">${rowHtml}</table>
        <p style="margin:16px 0 0;font-size:11px;color:#94a3b8">DiagnoCenter ERP — Automated Daily Report</p>
      </div>
    </div>`;

  await transport.sendMail({
    from: `"${s.fromName}" <${s.fromAddress}>`,
    to: recipients.join(", "),
    subject: `[Daily Report] DiagnoCenter — ${params.date}`,
    html,
  });
}
