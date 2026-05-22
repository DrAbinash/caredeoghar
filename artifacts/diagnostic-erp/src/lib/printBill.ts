// Shared bill receipt printing helpers used by BillingDesk (Save & Print +
// Print Bill summary button) and BillDetail (Re-print + ?print=1 auto-print).
//
// Design goals:
//   - Fills A5 (148 x 210 mm) completely — no wasted bottom space
//   - Centered clinic header with logo, name, tagline, address, phone, GSTIN
//   - Bold, legible fonts sized for thermal printers
//   - Clean test table with generous row height
//   - Grand Total with double-border emphasis
//   - Payment mode breakdown (Cash / UPI / Card) when applicable
//   - QR + signature + footer fill the remaining space naturally

export type PrintBillData = {
  billNumber: string;
  subtotal: number | string;
  discount: number | string;
  taxAmount?: number | string;
  totalAmount: number | string;
  paidAmount: number | string;
  balanceAmount: number | string;
  status?: string;
  createdAt?: string;
  patient?: {
    firstName: string;
    lastName: string;
    patientId: string;
    phone?: string | null;
    gender?: string | null;
    dateOfBirth?: string | null;
    ageValue?: number | null;
    ageUnit?: string | null;
  } | null;
  order?: {
    doctor?: { name?: string | null } | null;
    tests?: Array<{
      id?: number;
      price: number | string;
      status?: string | null;
      test?: { code?: string | null; name?: string | null; category?: string | null } | null;
    }>;
  } | null;
  payments?: Array<{
    method: string;
    amount: number | string;
    referenceNumber?: string | null;
    createdAt?: string;
  }>;
  testTokens?: Array<{ department: string; roomNumber: string; tokenNo: number }> | null;
  tokenNo?: number | null;
  reportCollectionNote?: string | null;
};

export type PrintClinic = {
  name?: string;
  tagline?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  gstin?: string;
  logoDataUrl?: string | null;
  footerNote?: string;
  billPrintCopies?: number;
  billShowCode?: boolean;
  billShowCategory?: boolean;
  qrOnBillEnabled?: boolean;
} | undefined | null;

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

function calcAge(dob?: string | null, ageValue?: number | null, ageUnit?: string | null): string {
  if (ageValue != null && ageUnit) {
    if (ageUnit === "years") return ageValue > 0 ? `${ageValue} Yrs` : "";
    if (ageUnit === "months") return `${ageValue} Mo`;
    if (ageUnit === "days") return `${ageValue} D`;
  }
  if (!dob) return "";
  const d = new Date(dob);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  let y = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) y--;
  return y > 0 ? `${y} Yrs` : "";
}

function fmt(n: number | string): string {
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type BuildPrintHtmlOpts = {
  bill: PrintBillData;
  clinic: PrintClinic;
  paperSize: "A4" | "A5";
  isBW: boolean;
  qrDataUrl: string;
  reprintBy?: string;
  reprintReason?: string;
};

export function buildBillPrintHtml(opts: BuildPrintHtmlOpts): string {
  const { bill, clinic, paperSize, isBW, qrDataUrl, reprintBy, reprintReason } = opts;
  const copies = Math.max(1, Math.min(2, Number(clinic?.billPrintCopies ?? 1) || 1));
  const showCode = clinic?.billShowCode !== false;
  const showCategory = clinic?.billShowCategory !== false;
  const qrEnabled = clinic?.qrOnBillEnabled !== false;
  const isA5 = paperSize === "A5";

  const tests = (bill.order?.tests ?? []).filter((t) => (t.status ?? "active") !== "cancelled");
  const cancelled = (bill.order?.tests ?? []).filter((t) => (t.status ?? "active") === "cancelled");
  const billDigits = String(bill.billNumber).replace(/^BILL-?/i, "").replace(/-/g, "");
  const ageStr = calcAge(bill.patient?.dateOfBirth, bill.patient?.ageValue, bill.patient?.ageUnit);
  const ageGender = [ageStr, bill.patient?.gender].filter(Boolean).join(" / ").toUpperCase();
  const created = bill.createdAt ? new Date(bill.createdAt) : new Date();
  const isCancelled = (bill.status ?? "") === "cancelled";
  const rawDoctor = bill.order?.doctor?.name ?? "";

  // ── Aggregated payment amounts ──
  const payByMode: Record<string, number> = {};
  for (const p of bill.payments ?? []) {
    const m = String(p.method).toLowerCase().trim();
    payByMode[m] = (payByMode[m] || 0) + Number(p.amount || 0);
  }
  const cashAmt = payByMode["cash"] || 0;
  const upiAmt = payByMode["upi"] || 0;
  const cardAmt = payByMode["card"] || 0;
  const insAmt = payByMode["insurance"] || 0;
  const chqAmt = payByMode["cheque"] || 0;

  // ── Sizing: generous for A5 readability ──
  const pageMargin = isA5 ? "4mm" : "8mm";
  const clinicNameSize = isA5 ? "24px" : "26px";
  const titleSize = isA5 ? "16px" : "15px";
  const patientNameSize = isA5 ? "18px" : "17px";
  const bodyPx = isA5 ? "15px" : "13px";
  const tablePx = isA5 ? "14px" : "12px";
  const payPx = isA5 ? "13px" : "11px";
  const totalPx = isA5 ? "15px" : "13px";
  const footerPx = isA5 ? "13px" : "11px";
  const tinyPx = isA5 ? "11px" : "9px";

  const colCount = 3 + (showCode ? 1 : 0) + (showCategory ? 1 : 0);

  // ── Test rows with generous height ──
  const testRows = tests.map((t, i) => {
    const code = t.test?.code ?? "";
    const name = t.test?.name ?? "";
    const cat = t.test?.category ?? "";
    return `<tr>
      <td style="padding:5px 6px;border-bottom:1px solid #ccc;font-size:${tablePx}">${i + 1}</td>
      ${showCode ? `<td style="padding:5px 6px;border-bottom:1px solid #ccc;font-family:monospace;font-size:${Math.round(Number(tablePx) * 0.9)}px">${esc(code)}</td>` : ""}
      <td style="padding:5px 6px;border-bottom:1px solid #ccc;font-size:${tablePx}">${esc(name)}</td>
      ${showCategory ? `<td style="padding:5px 6px;border-bottom:1px solid #ccc;font-size:${tablePx};color:#555">${esc(cat)}</td>` : ""}
      <td style="padding:5px 6px;border-bottom:1px solid #ccc;text-align:right;font-weight:700;font-size:${tablePx}">₹${fmt(t.price)}</td>
    </tr>`;
  }).join("");

  const cancelledRow = cancelled.length === 0 ? "" : `
    <div style="margin-top:6px;font-size:${tinyPx};color:#999">
      <em>Cancelled: ${esc(cancelled.map((t) => t.test?.name ?? "").join(", "))}</em>
    </div>`;

  // ── Payment detail rows for middle column ──
  const payRows = (bill.payments ?? []).map((p) => {
    const ref = p.referenceNumber ? ` (${esc(p.referenceNumber)})` : "";
    return `<tr>
      <td style="padding:2px 0;font-size:${payPx};text-transform:capitalize">${esc(p.method)}${ref ? `<span style="color:#777;font-size:${Math.round(Number(payPx) * 0.85)}px">${ref}</span>` : ""}</td>
      <td style="padding:2px 0;text-align:right;font-weight:600;font-size:${payPx}">₹${fmt(p.amount)}</td>
    </tr>`;
  }).join("");

  const hasPayDetail = (bill.payments ?? []).length > 0;

  const page = (copyIdx: number) => `
    <section class="receipt" style="${copyIdx > 0 ? "page-break-before:always;" : ""}">
      <div class="receipt-inner">

      <!-- REPRINT BANNER -->
      ${reprintBy || reprintReason ? `<div style="text-align:center;font-size:${tinyPx};color:#a16207;border:1px dashed #d97706;padding:3px 6px;margin-bottom:6px;text-transform:uppercase;font-weight:700">DUPLICATE / RE-PRINT${reprintBy ? ` · BY ${esc(reprintBy)}` : ""}${reprintReason ? ` · ${esc(reprintReason)}` : ""}</div>` : ""}

      <!-- CLINIC HEADER -->
      <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:6px">
        ${clinic?.logoDataUrl ? `<img src="${clinic.logoDataUrl}" alt="logo" style="max-height:52px;max-width:130px;object-fit:contain;display:block;margin:0 auto 4px"/>` : ""}
        <div style="font-size:${clinicNameSize};font-weight:800;line-height:1.05;letter-spacing:-0.3px">${esc(clinic?.name || "CARE DIAGNOSTICS")}</div>
        ${clinic?.tagline ? `<div style="font-size:${Math.round(Number(bodyPx) * 0.88)}px;color:#444;margin-top:3px;font-weight:600">${esc(clinic.tagline)}</div>` : ""}
        <div style="font-size:${tinyPx};color:#444;margin-top:4px;line-height:1.45">
          ${clinic?.address ? `<div>${esc(clinic.address.replace(/\s*\n\s*/g, ", ").trim())}</div>` : ""}
          <div>${[clinic?.phone && `Ph: ${clinic.phone}`, clinic?.email, clinic?.website].filter(Boolean).map((s) => esc(String(s))).join("  ·  ")}</div>
          ${clinic?.gstin ? `<div style="margin-top:2px;font-weight:600">GSTIN: ${esc(clinic.gstin)}</div>` : ""}
        </div>
      </div>

      <!-- TITLE -->
      <div style="text-align:center;font-size:${titleSize};font-weight:800;letter-spacing:2px;margin:2px 0 8px;text-transform:uppercase;border-bottom:1px solid #888;padding-bottom:4px">INVOICE / RECEIPT${isCancelled ? " — CANCELLED" : ""}</div>

      <!-- PATIENT BLOCK -->
      <div style="border:1px solid #888;padding:6px 8px;margin-bottom:8px;border-radius:2px">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="vertical-align:top;padding:0">
              <div style="font-size:${patientNameSize};font-weight:900;line-height:1.2">${esc(`${bill.patient?.firstName ?? ""} ${bill.patient?.lastName ?? ""}`.trim())}</div>
              <div style="font-size:${bodyPx};font-weight:700;margin-top:3px;color:#333">
                ${ageGender ? `${esc(ageGender)} · ` : ""}PH: ${esc(bill.patient?.phone ?? "")}
              </div>
              <div style="font-size:${tinyPx};color:#555;margin-top:2px">
                REF: <strong>${rawDoctor ? esc(rawDoctor.match(/^\s*DR\.?\s*/i) ? rawDoctor.trim().toUpperCase() : "DR. " + rawDoctor.trim()) : "SELF / WALK-IN"}</strong>
              </div>
            </td>
            <td style="vertical-align:top;text-align:right;padding:0;font-size:${tinyPx};line-height:1.5;white-space:nowrap;color:#555">
              <div>${created.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
              <div>${created.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
              <div style="margin-top:2px">ID: ${esc(bill.patient?.patientId ?? "")}</div>
              <div>BILL: ${esc(billDigits)}</div>
            </td>
          </tr>
        </table>
      </div>

      <!-- TEST TABLE -->
      <table style="width:100%;border-collapse:collapse;font-size:${tablePx};margin-bottom:6px">
        <thead>
          <tr style="border-bottom:1.5px solid #000">
            <th style="padding:5px 6px;text-align:left;font-weight:800">#</th>
            ${showCode ? `<th style="padding:5px 6px;text-align:left;font-weight:800">Code</th>` : ""}
            <th style="padding:5px 6px;text-align:left;font-weight:800">Test Name</th>
            ${showCategory ? `<th style="padding:5px 6px;text-align:left;font-weight:800">Category</th>` : ""}
            <th style="padding:5px 6px;text-align:right;font-weight:800">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${testRows || `<tr><td colspan="${colCount}" style="padding:10px;text-align:center;color:#999">No tests on this bill</td></tr>`}
        </tbody>
      </table>
      ${cancelledRow}

      <!-- BOTTOM: QR + Payment + Totals -->
      <table style="width:100%;border-collapse:separate;border-spacing:0;margin-top:10px;table-layout:fixed">
        <colgroup>
          <col style="width:${qrEnabled && qrDataUrl ? "78px" : "0"}"/>
          <col/>
          <col style="width:${isA5 ? "180px" : "210px"}"/>
        </colgroup>
        <tbody>
          <tr>
            <!-- QR -->
            <td style="vertical-align:top;padding:0">
              ${qrEnabled && qrDataUrl ? `<img src="${qrDataUrl}" alt="QR" style="width:60px;height:60px;display:block"/><div style="font-size:${tinyPx};color:#666;margin-top:2px">Scan to verify</div>` : ""}
            </td>
            <!-- Payment details -->
            <td style="vertical-align:top;padding:0 10px 0 0;font-size:${payPx}">
              ${hasPayDetail ? `<div style="font-weight:800;border-bottom:1px solid #999;padding-bottom:2px;margin-bottom:3px;font-size:${Number(payPx) + 1}px">PAYMENT DETAILS</div>
                <table style="width:100%;border-collapse:collapse"><tbody>${payRows}</tbody></table>` : ""}
            </td>
            <!-- Totals -->
            <td style="vertical-align:top;padding:0">
              <table style="width:100%;border-collapse:collapse;font-size:${totalPx};table-layout:fixed">
                <tbody>
                  <tr><td style="padding:2px 4px">Subtotal</td><td style="padding:2px 4px;text-align:right;white-space:nowrap">₹${fmt(bill.subtotal)}</td></tr>
                  ${Number(bill.discount) > 0 ? `<tr><td style="padding:2px 4px">Discount</td><td style="padding:2px 4px;text-align:right;white-space:nowrap;color:green">−₹${fmt(bill.discount)}</td></tr>` : ""}
                  <tr>
                    <td style="padding:4px 4px;border-top:2px solid #000;border-bottom:2px solid #000;font-weight:900;font-size:${Number(totalPx) + 2}px">Grand Total</td>
                    <td style="padding:4px 4px;border-top:2px solid #000;border-bottom:2px solid #000;text-align:right;font-weight:900;white-space:nowrap;font-size:${Number(totalPx) + 2}px">₹${fmt(bill.totalAmount)}</td>
                  </tr>
                  ${cashAmt > 0 ? `<tr><td style="padding:2px 4px;color:#444">Cash</td><td style="padding:2px 4px;text-align:right;white-space:nowrap;color:#444">₹${fmt(cashAmt)}</td></tr>` : ""}
                  ${upiAmt > 0 ? `<tr><td style="padding:2px 4px;color:#444">UPI</td><td style="padding:2px 4px;text-align:right;white-space:nowrap;color:#444">₹${fmt(upiAmt)}</td></tr>` : ""}
                  ${cardAmt > 0 ? `<tr><td style="padding:2px 4px;color:#444">Card</td><td style="padding:2px 4px;text-align:right;white-space:nowrap;color:#444">₹${fmt(cardAmt)}</td></tr>` : ""}
                  ${insAmt > 0 ? `<tr><td style="padding:2px 4px;color:#444">Insurance</td><td style="padding:2px 4px;text-align:right;white-space:nowrap;color:#444">₹${fmt(insAmt)}</td></tr>` : ""}
                  ${chqAmt > 0 ? `<tr><td style="padding:2px 4px;color:#444">Cheque</td><td style="padding:2px 4px;text-align:right;white-space:nowrap;color:#444">₹${fmt(chqAmt)}</td></tr>` : ""}
                  <tr><td style="padding:3px 4px;border-top:1px solid #000;font-weight:800">Paid</td><td style="padding:3px 4px;border-top:1px solid #000;text-align:right;font-weight:800;white-space:nowrap;color:green">₹${fmt(bill.paidAmount)}</td></tr>
                  <tr><td style="padding:3px 4px;border-top:1px solid #000;font-weight:800">Balance</td><td style="padding:3px 4px;border-top:1px solid #000;text-align:right;font-weight:800;white-space:nowrap;color:${Number(bill.balanceAmount) > 0 ? "#c62828" : "green"}">₹${fmt(bill.balanceAmount)}${Number(bill.balanceAmount) === 0 ? " (PAID)" : ""}</td></tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      </div>

      <!-- FOOTER: pushed to bottom by flexbox -->
      <div class="receipt-footer" style="border-top:1.5px solid #888;padding-top:8px;text-align:center;page-break-inside:avoid">
        <div style="font-size:${footerPx};font-weight:800;color:#000;margin-bottom:3px">${esc(clinic?.footerNote || bill.reportCollectionNote || "Please collect your report within 7 days.")}</div>
        <div style="font-size:${tinyPx};color:#555;margin-bottom:10px">We wish you good health. · Computer-generated invoice — no signature required.</div>
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="text-align:left;padding:0;vertical-align:bottom">
              <div style="border-bottom:1px solid #000;width:140px;margin-bottom:3px"></div>
              <div style="font-size:${tinyPx};color:#555">Authorised Signature</div>
            </td>
            <td style="text-align:right;padding:0;vertical-align:bottom;font-size:${tinyPx};color:#555">
              ${(() => {
                const n = (typeof window !== "undefined" && window.localStorage.getItem("erp_session")) ? JSON.parse(window.localStorage.getItem("erp_session") || "{}").user?.name : "";
                return n ? `<div>Billed by: ${esc(n)}</div>` : "";
              })()}
            </td>
          </tr>
        </table>
      </div>
    </section>`;

  const pages = Array.from({ length: copies }).map((_, i) => page(i)).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Bill ${esc(bill.billNumber)}</title>
<style>
  @page { size: ${paperSize} portrait; margin: ${pageMargin}; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
  body { background: #fff; color: #000; font-family: "Segoe UI", Arial, sans-serif; font-size: ${bodyPx}; ${isBW ? "filter: grayscale(1) contrast(1.35); -webkit-print-color-adjust: exact; print-color-adjust: exact;" : ""} }
  .receipt { width: 100%; min-height: ${isA5 ? "calc(210mm - 8mm)" : "calc(297mm - 16mm)"}; display: flex; flex-direction: column; justify-content: space-between; padding: ${isA5 ? "6px 8px" : "8px 10px"}; }
  .receipt-inner { flex: 1 0 auto; }
  .receipt-footer { flex-shrink: 0; margin-top: auto; }
  table { width: 100%; }
</style></head><body>${pages}</body></html>`;
}

export function printViaIframe(html: string): void {
  const existing = document.getElementById("__bill_print_iframe__");
  if (existing) existing.remove();
  const iframe = document.createElement("iframe");
  iframe.id = "__bill_print_iframe__";
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch { /* ignore */ }
    setTimeout(() => { try { iframe.remove(); } catch { /* ignore */ } }, 1000);
  };
  iframe.onload = doPrint;
  setTimeout(doPrint, 350);
}

export function openBlankPrintWindow(): Window | null {
  const w = window.open("", "_blank", "width=520,height=720");
  if (!w) return null;
  try {
    w.document.open();
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>Preparing receipt…</title></head><body style="font-family:Arial,sans-serif;padding:24px;color:#555">Preparing receipt…</body></html>`,
    );
    w.document.close();
  } catch { /* ignore */ }
  return w;
}

export function writeAndPrint(win: Window | null, html: string): void {
  if (!win) {
    const w = window.open("", "_blank", "width=520,height=720");
    if (!w) { alert("Pop-up blocked. Please allow pop-ups for this site to print bills."); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); setTimeout(() => w.close(), 400); };
    return;
  }
  try {
    win.document.open();
    win.document.write(html);
    win.document.close();
  } catch { /* ignore */ }
  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    try { win.focus(); win.print(); } catch { /* ignore */ }
    setTimeout(() => { try { win.close(); } catch { /* ignore */ } }, 500);
  };
  win.onload = doPrint;
  setTimeout(doPrint, 350);
}
