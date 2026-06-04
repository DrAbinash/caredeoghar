// Premium A5 Bill Print Template
// Modern, clean, black-and-white, professional design for diagnostic centers.
// Optimized for 1-2 test radiology bills with adaptive density modes.

import { type PrintBillData, type PrintClinic } from "./printBill";
import { type BillPaperSize } from "./billPrintSettings";

export type BuildPremiumBillOpts = {
  bill: PrintBillData;
  clinic: PrintClinic;
  paperSize: BillPaperSize;
  isBW: boolean;
  qrDataUrl: string;
  reprintBy?: string;
  reprintReason?: string;
  copyType?: "patient" | "office" | "both";
  copyLabel?: string;
  // Toggles
  showQr?: boolean;
  showAmountInWords?: boolean;
  showSignatureLine?: boolean;
  showComputerGenerated?: boolean;
  showReportMessage?: boolean;
  showServiceFooter?: boolean;
  showBrandingFooter?: boolean;
  // Custom footer note
  customFooter?: string | null;
  // Custom report collection note
  reportCollectionNote?: string | null;
};

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

function calcAge(dob?: string | null, ageValue?: number | null, ageUnit?: string | null): string {
  if (ageValue != null && ageUnit) {
    if (ageUnit === "years") return ageValue > 0 ? `${ageValue} Y` : "";
    if (ageUnit === "months") return `${ageValue} M`;
    if (ageUnit === "days") return `${ageValue} D`;
  }
  if (!dob) return "";
  const d = new Date(dob);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  let y = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) y--;
  return y > 0 ? `${y} Y` : "";
}

function fmt(n: number | string): string {
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numberToWords(num: number): string {
  const ones = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const n = Math.round(num);
  if (n === 0) return "Zero Rupees Only";
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const hundred = Math.floor((n % 1000) / 100);
  const rem = n % 100;
  let parts: string[] = [];
  if (crore > 0) parts.push(`${ones[crore]} Crore`);
  if (lakh > 0) parts.push(`${ones[lakh]} Lakh`);
  if (thousand > 0) parts.push(`${ones[thousand]} Thousand`);
  if (hundred > 0) parts.push(`${ones[hundred]} Hundred`);
  if (rem > 0) {
    if (rem < 10) parts.push(ones[rem]);
    else if (rem < 20) parts.push(teens[rem - 10]);
    else parts.push(`${tens[Math.floor(rem / 10)]}${rem % 10 > 0 ? " " + ones[rem % 10] : ""}`);
  }
  const str = parts.join(" ");
  return `${str} Rupees Only`;
}

export function buildPremiumBillPrintHtml(opts: BuildPremiumBillOpts): string {
  const {
    bill, clinic, paperSize, isBW, qrDataUrl,
    reprintBy, reprintReason, copyLabel,
    showQr = true, showAmountInWords = false, showSignatureLine = true,
    showComputerGenerated = true, showReportMessage = true,
    showServiceFooter = true, showBrandingFooter = true,
    customFooter,
    reportCollectionNote,
  } = opts;

  const tests = (bill.order?.tests ?? []).filter((t) => (t.status ?? "active") !== "cancelled");
  const cancelled = (bill.order?.tests ?? []).filter((t) => (t.status ?? "active") === "cancelled");
  const billDigits = String(bill.billNumber).replace(/^BILL-?/i, "").replace(/-/g, "");
  const ageStr = calcAge(bill.patient?.dateOfBirth, bill.patient?.ageValue, bill.patient?.ageUnit);
  const ageGender = [ageStr, bill.patient?.gender].filter(Boolean).join(" / ").toUpperCase();
  const created = bill.createdAt ? new Date(bill.createdAt) : new Date();
  const isCancelled = (bill.status ?? "") === "cancelled";
  const rawDoctor = bill.order?.doctor?.name ?? "";
  const testCount = tests.length;

  // ── Density mode ──
  const isSparse = testCount <= 2;
  const isCompact = testCount > 6;
  const isNormal = !isSparse && !isCompact;
  const densityClass = isSparse ? "premium-sparse-mode" : isCompact ? "compact-mode" : "normal-mode";

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
  const bankAmt = payByMode["bank transfer"] || 0;

  // ── Page sizing ──
  const isA5 = paperSize === "A5-portrait" || paperSize === "A5-landscape";
  const pageSizeStr = paperSize === "A5-landscape" ? "A5 landscape" : paperSize === "A5-portrait" ? "A5 portrait" : paperSize === "half-a4" ? "148mm 210mm" : "A4 portrait";
  const pageWidth = paperSize === "A5-landscape" ? "198mm" : paperSize === "A5-portrait" ? "136mm" : paperSize === "half-a4" ? "148mm" : "210mm";
  const pageHeight = paperSize === "A5-landscape" ? "136mm" : paperSize === "A5-portrait" ? "198mm" : paperSize === "half-a4" ? "210mm" : "auto";

  // ── Font sizing based on density ──
  const basePx = isSparse ? "15px" : isCompact ? "11px" : "13px";
  const headerPx = isSparse ? "16px" : isCompact ? "11px" : "14px";
  const titlePx = isSparse ? "17px" : isCompact ? "14px" : "15px";
  const patientPx = isSparse ? "16px" : isCompact ? "12px" : "14px";
  const tablePx = isSparse ? "14px" : isCompact ? "10px" : "12px";
  const totalPx = isSparse ? "14px" : isCompact ? "11px" : "13px";
  const bigTotalPx = isSparse ? "16px" : isCompact ? "13px" : "15px";
  const footerPx = isSparse ? "12px" : isCompact ? "10px" : "11px";
  const tinyPx = isSparse ? "11px" : isCompact ? "9px" : "10px";
  const qrSize = isSparse ? "85px" : isCompact ? "50px" : "65px";
  const pageMargin = isA5 ? "4mm" : "8mm";

  // ── Billed-by name ──
  const billedByName = (() => {
    try {
      if (typeof window === "undefined") return "";
      const raw = window.localStorage.getItem("erp_session");
      if (!raw) return "";
      return JSON.parse(raw).user?.name ?? "";
    } catch { return ""; }
  })();

  // ── Test rows ──
  const showCode = clinic?.billShowCode !== false;
  const showCategory = clinic?.billShowCategory !== false;
  const colCount = 3 + (showCode ? 1 : 0) + (showCategory ? 1 : 0);
  const testRows = tests.map((t, i) => {
    const code = t.test?.code ?? "";
    const name = t.displayName ?? t.test?.name ?? "";
    const cat = t.test?.category ?? "";
    const rowPad = isSparse ? "6px 8px" : isCompact ? "3px 4px" : "4px 6px";
    const codeFont = `font-size:${Math.round(Number(tablePx) * 0.9)}px`;
    return `<tr>
      <td style="padding:${rowPad};border:1px solid #ccc;font-size:${tablePx};text-align:center;font-weight:600">${i + 1}</td>
      ${showCode ? `<td style="padding:${rowPad};border:1px solid #ccc;font-family:monospace;${codeFont}">${esc(code)}</td>` : ""}
      <td style="padding:${rowPad};border:1px solid #ccc;font-size:${tablePx};font-weight:600">${esc(name)}</td>
      ${showCategory ? `<td style="padding:${rowPad};border:1px solid #ccc;font-size:${tablePx};color:#333">${esc(cat)}</td>` : ""}
      <td style="padding:${rowPad};border:1px solid #ccc;text-align:right;font-weight:700;font-size:${tablePx}">₹${fmt(t.price)}</td>
    </tr>`;
  }).join("");

  const cancelledRow = cancelled.length === 0 ? "" : `
    <div style="margin-top:4px;font-size:${tinyPx};color:#999">
      <em>Cancelled: ${esc(cancelled.map((t) => t.displayName ?? t.test?.name ?? "").join(", "))}</em>
    </div>`;

  // ── Payment rows ──
  const payRows = (bill.payments ?? []).map((p) => {
    const ref = p.referenceNumber ? ` (${esc(p.referenceNumber)})` : "";
    const dt = p.createdAt ? new Date(p.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "";
    return `<tr>
      <td style="padding:1px 0;font-size:${tinyPx};text-transform:capitalize">${esc(p.method)}${ref ? `<span style="color:#777;font-size:${Math.round(Number(tinyPx) * 0.85)}px">${ref}</span>` : ""}</td>
      <td style="padding:1px 0;text-align:right;font-weight:700;font-size:${tinyPx}">₹${fmt(p.amount)}</td>
      ${dt ? `<td style="padding:1px 0;text-align:right;font-size:${Math.round(Number(tinyPx) * 0.85)}px;color:#777">${esc(dt)}</td>` : ""}
    </tr>`;
  }).join("");

  const hasPayDetail = (bill.payments ?? []).length > 0;

  // ── Copy label ──
  const copyLabelDiv = copyLabel ? `<div style="text-align:right;font-size:${tinyPx};font-weight:800;color:#555;border:1px dashed #999;display:inline-block;padding:2px 6px;float:right">${esc(copyLabel)}</div>` : "";

  // ── Balance due display ──
  const balanceDue = Number(bill.balanceAmount);
  const hasDue = balanceDue > 0;
  const hasRefund = Number(bill.totalAmount) < 0; // refund logic
  const refundAmount = Math.abs(Number(bill.totalAmount)); // if negative
  // Normal case: show balance due
  const balanceRow = hasDue
    ? `<tr>
      <td style="padding:3px 4px;border-top:2px solid #000;font-weight:900;font-size:${bigTotalPx};color:#c62828">BALANCE DUE</td>
      <td style="padding:3px 4px;border-top:2px solid #000;text-align:right;font-weight:900;font-size:${bigTotalPx};color:#c62828">₹${fmt(bill.balanceAmount)}</td>
    </tr>`
    : `<tr>
      <td style="padding:3px 4px;border-top:2px solid #000;font-weight:900;font-size:${bigTotalPx}">BALANCE DUE</td>
      <td style="padding:3px 4px;border-top:2px solid #000;text-align:right;font-weight:900;font-size:${bigTotalPx};color:green">₹0.00</td>
    </tr>`;

  // ── Payment mode breakdown rows ──
  const modeBreakdownRows = [
    cashAmt > 0 ? `<tr><td style="padding:1px 4px;font-size:${tinyPx};color:#444">Cash</td><td style="padding:1px 4px;text-align:right;font-size:${tinyPx};color:#444">₹${fmt(cashAmt)}</td></tr>` : "",
    upiAmt > 0 ? `<tr><td style="padding:1px 4px;font-size:${tinyPx};color:#444">UPI</td><td style="padding:1px 4px;text-align:right;font-size:${tinyPx};color:#444">₹${fmt(upiAmt)}</td></tr>` : "",
    cardAmt > 0 ? `<tr><td style="padding:1px 4px;font-size:${tinyPx};color:#444">Card</td><td style="padding:1px 4px;text-align:right;font-size:${tinyPx};color:#444">₹${fmt(cardAmt)}</td></tr>` : "",
    insAmt > 0 ? `<tr><td style="padding:1px 4px;font-size:${tinyPx};color:#444">Insurance</td><td style="padding:1px 4px;text-align:right;font-size:${tinyPx};color:#444">₹${fmt(insAmt)}</td></tr>` : "",
    chqAmt > 0 ? `<tr><td style="padding:1px 4px;font-size:${tinyPx};color:#444">Cheque</td><td style="padding:1px 4px;text-align:right;font-size:${tinyPx};color:#444">₹${fmt(chqAmt)}</td></tr>` : "",
    bankAmt > 0 ? `<tr><td style="padding:1px 4px;font-size:${tinyPx};color:#444">Bank Transfer</td><td style="padding:1px 4px;text-align:right;font-size:${tinyPx};color:#444">₹${fmt(bankAmt)}</td></tr>` : "",
  ].filter(Boolean).join("");

  // ── Amount in words ──
  const amountInWords = showAmountInWords ? `<div style="font-size:${tinyPx};font-style:italic;color:#444;margin:2px 0 4px">${esc(numberToWords(Number(bill.totalAmount)))}</div>` : "";

  // ── Service footer line ──
  const serviceFooter = showServiceFooter
    ? `<div style="font-size:${Math.round(Number(tinyPx) * 0.9)}px;color:#666;text-align:center;margin:3px 0">MRI &middot; CT SCAN &middot; ULTRASOUND &middot; DIGITAL X-RAY &middot; MAMMOGRAPHY &middot; PATHOLOGY</div>`
    : "";

  // ── Report collection message ──
  const reportMessage = showReportMessage
    ? `<div style="font-size:${tinyPx};color:#666;text-align:center;margin:2px 0">Please collect report within 7 days or download online using QR verification.</div>`
    : "";

  // ── Branding footer ──
  const brandingFooter = showBrandingFooter
    ? `<div style="font-size:${Math.round(Number(footerPx) * 1.1)}px;font-weight:800;color:#000;text-align:center;margin:4px 0 2px;letter-spacing:0.5px">THANK YOU FOR CHOOSING CARE DIAGNOSTICS</div>`
    : "";

  // ── Custom footer ──
  const customFooterLine = customFooter
    ? `<div style="font-size:${footerPx};font-weight:700;color:#000;text-align:center;margin:2px 0">${esc(customFooter)}</div>`
    : reportCollectionNote
    ? `<div style="font-size:${footerPx};font-weight:700;color:#000;text-align:center;margin:2px 0">${esc(reportCollectionNote)}</div>`
    : "";

  // ── Signature line ──
  const signatureLine = showSignatureLine
    ? `<div style="border-bottom:1px solid #000;width:130px;margin-bottom:1px"></div><div style="font-size:${tinyPx};color:#555">Authorised Signature</div>`
    : "";

  // ── Computer generated note ──
  const computerGenerated = showComputerGenerated
    ? `<div style="font-size:${tinyPx};color:#555;text-align:center">COMPUTER GENERATED INVOICE. NO SIGNATURE REQUIRED.</div>`
    : "";

  // ── QR code ──
  const qrBlock = showQr && qrDataUrl
    ? `<div style="text-align:center">
      <img src="${qrDataUrl}" alt="QR" style="width:${qrSize};height:${qrSize};display:block;margin:0 auto"/>
      <div style="font-size:${Math.round(Number(tinyPx) * 0.9)}px;color:#666;margin-top:1px">Scan to Verify</div>
    </div>`
    : "";

  // ── Main page layout ──
  const page = `
    <section class="receipt ${densityClass}" style="${isA5 ? "display:flex;flex-direction:column;" : ""}" data-density="${densityClass}">
      ${reprintBy || reprintReason ? `<div style="text-align:center;font-size:${tinyPx};color:#a16207;border:1px dashed #d97706;padding:2px 4px;margin-bottom:4px;text-transform:uppercase;font-weight:700">DUPLICATE / RE-PRINT${reprintBy ? ` · BY ${esc(reprintBy)}` : ""}${reprintReason ? ` · ${esc(reprintReason)}` : ""}</div>` : ""}
      ${copyLabelDiv ? `<div style="margin-bottom:4px;overflow:hidden">${copyLabelDiv}</div>` : ""}

      <!-- HEADER: Logo left, Clinic info right -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:4px">
        <tr>
          <td style="vertical-align:top;padding:0;width:50%">
            ${clinic?.logoDataUrl ? `<img src="${clinic.logoDataUrl}" alt="logo" style="max-height:${isSparse ? "90px" : "60px"};max-width:180px;object-fit:contain;display:block;margin-bottom:3px"/>` : ""}
            <div style="font-size:${Math.round(Number(headerPx) * 1.1)}px;font-weight:900;color:#000;letter-spacing:0.5px">${esc(clinic?.name || "CARE DIAGNOSTICS")}</div>
            <div style="font-size:${basePx};color:#333;font-weight:600;line-height:1.2">${esc(clinic?.tagline || "Touching Lives With Care")}</div>
          </td>
          <td style="vertical-align:top;text-align:right;padding:0;font-size:${headerPx};line-height:1.45;color:#000;font-weight:700">
            ${clinic?.address ? `<div>${esc(clinic.address.replace(/\s*\n\s*/g, ", ").trim())}</div>` : ""}
            ${clinic?.phone ? `<div>PH: ${esc(clinic.phone)}</div>` : ""}
            ${clinic?.email ? `<div>${esc(clinic.email)}</div>` : ""}
            ${clinic?.website ? `<div>${esc(clinic.website)}</div>` : ""}
            ${clinic?.gstin ? `<div style="margin-top:1px;font-weight:800">GSTIN: ${esc(clinic.gstin)}</div>` : ""}
          </td>
        </tr>
      </table>

      <!-- THICK SEPARATOR -->
      <div style="border-top:2px solid #000;margin-bottom:6px"></div>

      <!-- TITLE ROW -->
      <div style="border-bottom:1px solid #000;padding:3px 0;margin-bottom:6px">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:0;vertical-align:middle">
              <div style="font-size:${titlePx};font-weight:800;letter-spacing:1.2px;text-transform:uppercase">INVOICE / RECEIPT${isCancelled ? " — CANCELLED" : ""}</div>
            </td>
            <td style="padding:0;vertical-align:middle;text-align:right;white-space:nowrap">
              <div style="font-size:${titlePx};font-weight:800">BILL NO: ${esc(billDigits)}</div>
            </td>
          </tr>
        </table>
      </div>

      <!-- PATIENT INFO -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:6px">
        <tr>
          <td style="vertical-align:top;padding:0;width:50%">
            <div style="font-size:${patientPx};font-weight:900;line-height:1.2;text-transform:uppercase">${esc(`${bill.patient?.firstName ?? ""} ${bill.patient?.lastName ?? ""}`.trim())}</div>
            <div style="font-size:${patientPx};font-weight:700;color:#333;margin-top:2px">${esc(ageGender)}</div>
            <div style="font-size:${patientPx};font-weight:700;color:#333;margin-top:2px">
              REF: <strong>${rawDoctor ? esc(rawDoctor.match(/^\s*DR\.?\s*/i) ? rawDoctor.trim().toUpperCase() : "DR. " + rawDoctor.trim().toUpperCase()) : "SELF / WALK-IN"}</strong>
            </div>
          </td>
          <td style="vertical-align:top;text-align:right;padding:0;font-size:${patientPx};line-height:1.35;white-space:nowrap;color:#000">
            <div style="font-weight:800">${created.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()} &nbsp;${created.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase()}</div>
            <div>PH: ${esc(bill.patient?.phone ?? "")}</div>
            <div>ID: ${esc(bill.patient?.patientId ?? "")}</div>
          </td>
        </tr>
      </table>

      <!-- THIN SEPARATOR -->
      <div style="border-bottom:1px solid #ccc;margin-bottom:6px"></div>

      <!-- TEST TABLE -->
      <table style="width:100%;border-collapse:collapse;font-size:${tablePx};margin-bottom:6px">
        <thead>
          <tr>
            <th style="padding:5px 6px;border:1px solid #ccc;text-align:center;font-weight:800;background:#f5f5f5">#</th>
            ${showCode ? `<th style="padding:5px 6px;border:1px solid #ccc;text-align:left;font-weight:800;background:#f5f5f5">CODE</th>` : ""}
            <th style="padding:5px 6px;border:1px solid #ccc;text-align:left;font-weight:800;background:#f5f5f5">TEST NAME</th>
            ${showCategory ? `<th style="padding:5px 6px;border:1px solid #ccc;text-align:left;font-weight:800;background:#f5f5f5">CATEGORY</th>` : ""}
            <th style="padding:5px 6px;border:1px solid #ccc;text-align:right;font-weight:800;background:#f5f5f5">AMOUNT (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${testRows || `<tr><td colspan="${colCount}" style="padding:8px;text-align:center;color:#999;border:1px solid #ccc">No tests on this bill</td></tr>`}
        </tbody>
      </table>
      ${cancelledRow}

      <!-- AMOUNT IN WORDS -->
      ${amountInWords}

      <!-- BOTTOM: QR + Payment left, Summary right -->
      <table style="width:100%;border-collapse:separate;border-spacing:0;margin-top:8px;table-layout:fixed">
        <colgroup>
          <col style="width:${qrBlock ? "95px" : "0"}"/>
          <col/>
          <col style="width:${isA5 ? "180px" : "220px"}"/>
        </colgroup>
        <tbody>
          <tr>
            <!-- QR (left) -->
            <td style="vertical-align:bottom;padding:0">
              ${qrBlock}
            </td>
            <!-- Payment details (middle) -->
            <td style="vertical-align:top;padding:0 8px 0 0;font-size:${tinyPx}">
              ${hasPayDetail ? `<div style="font-weight:800;border-bottom:1px solid #999;padding-bottom:1px;margin-bottom:2px;font-size:${Math.round(Number(tinyPx) * 1.1)}px">PAYMENT DETAILS</div>
                <table style="width:100%;border-collapse:collapse"><tbody>${payRows}</tbody></table>
                ${modeBreakdownRows ? `<div style="font-weight:700;border-top:1px solid #ccc;margin-top:2px;padding-top:2px;font-size:${Math.round(Number(tinyPx) * 1.05)}px">TOTAL PAID</div><table style="width:100%;border-collapse:collapse"><tbody>${modeBreakdownRows}</tbody></table>` : ""}` : ""}
            </td>
            <!-- Totals (right) -->
            <td style="vertical-align:top;padding:0">
              <table style="width:100%;border-collapse:collapse;font-size:${totalPx};table-layout:fixed">
                <tbody>
                  <tr><td style="padding:2px 4px">SUBTOTAL</td><td style="padding:2px 4px;text-align:right;white-space:nowrap">₹${fmt(bill.subtotal)}</td></tr>
                  ${Number(bill.discount) > 0 ? `<tr><td style="padding:2px 4px">DISCOUNT</td><td style="padding:2px 4px;text-align:right;white-space:nowrap">₹${fmt(bill.discount)}</td></tr>` : ""}
                  <tr>
                    <td style="padding:3px 4px;border-top:2px solid #000;font-weight:900;font-size:${bigTotalPx}">TOTAL</td>
                    <td style="padding:3px 4px;border-top:2px solid #000;text-align:right;font-weight:900;font-size:${bigTotalPx};white-space:nowrap">₹${fmt(bill.totalAmount)}</td>
                  </tr>
                  <tr><td style="padding:2px 4px;border-top:1px solid #000;font-weight:800">PAID</td><td style="padding:2px 4px;border-top:1px solid #000;text-align:right;font-weight:800;white-space:nowrap;color:green">₹${fmt(bill.paidAmount)}</td></tr>
                  ${balanceRow}
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- SPACER pushes footer to bottom on A5 -->
      ${isA5 ? '<div style="flex:1"></div>' : ""}

      <!-- FOOTER PANEL -->
      <div style="margin-top:4px;border-top:1px solid #000;padding-top:4px;page-break-inside:avoid">
        ${brandingFooter}
        ${customFooterLine}
        ${serviceFooter}
        ${reportMessage}
        ${computerGenerated}
        <table style="width:100%;border-collapse:collapse;margin-top:4px">
          <tr>
            <td style="text-align:left;padding:0;vertical-align:bottom">
              ${signatureLine}
            </td>
            <td style="text-align:right;padding:0;vertical-align:bottom;font-size:${tinyPx};color:#555">
              ${billedByName ? `<div>Billed By: ${esc(billedByName)}</div>` : ""}
              ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
            </td>
          </tr>
        </table>
      </div>
    </section>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Bill ${esc(bill.billNumber)}</title>
<style>
  @page { size: ${pageSizeStr}; margin: ${pageMargin}; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; }
  body { background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; font-size: ${basePx}; ${isBW ? "filter: grayscale(1) contrast(1.35); -webkit-print-color-adjust: exact; print-color-adjust: exact;" : ""} }
  .receipt { width: ${pageWidth}; padding: 2mm 3mm; box-sizing: border-box; }
  .receipt { min-height: ${pageHeight === "auto" ? "100vh" : pageHeight}; }
  .receipt[data-density="premium-sparse-mode"] { min-height: ${pageHeight === "auto" ? "100vh" : pageHeight}; }
  .receipt[data-density="normal-mode"] { min-height: ${pageHeight === "auto" ? "100vh" : pageHeight}; }
  .receipt[data-density="compact-mode"] { min-height: ${pageHeight === "auto" ? "100vh" : pageHeight}; }
  table { width: 100%; }
  .page-break-before { page-break-before: always; }
  /* Prevent breaks inside important blocks */
  .receipt > div:last-child { page-break-inside: avoid; }
  .receipt table tr { page-break-inside: avoid; }
  @media print {
    body { margin: 0; padding: 0; }
    .receipt { margin: 0; }
  }
</style></head><body>${page}</body></html>`;
}
