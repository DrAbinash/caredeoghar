// Shared bill receipt printing helpers used by BillingDesk (Save & Print +
// Print Bill summary button) and BillDetail (Re-print + ?print=1 auto-print).
//
// Background: Earlier each surface had its own print pipeline. BillDetail
// used a hidden in-page DOM block toggled via `visibility:hidden` which
// printed only the clinic header on reprint (the body had been deleted in
// a prior cleanup) and BillingDesk auto-print sometimes printed a blank
// page because the hidden DOM hadn't been painted before window.print()
// fired. The fix is to render the receipt into a popup window using a
// fully-formed HTML string — no React-render or image-load races.
//
// IMPORTANT: To survive popup blockers, callers MUST call
// `openBlankPrintWindow()` SYNCHRONOUSLY inside the user-gesture event
// handler (e.g. button onClick) and only call `writeAndPrint(win, html)`
// once the async data is ready. Opening the window after an await loses
// the user-activation token and the popup gets blocked.

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
  // Per-department queue tokens (one per department, with room number).
  // BillingDesk passes these from the bill creation response so the receipt
  // can show the patient which queues they're in. Falls back to the single
  // `tokenNo` for legacy bills that didn't generate per-test tokens.
  testTokens?: Array<{ department: string; roomNumber: string; tokenNo: number }> | null;
  tokenNo?: number | null;
  // Optional override; defaults to "Please collect your report within 7 days."
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

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

function calcAgeYrs(dob?: string | null, ageValue?: number | null, ageUnit?: string | null): string {
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

export type BuildPrintHtmlOpts = {
  bill: PrintBillData;
  clinic: PrintClinic;
  paperSize: "A4" | "A5";
  isBW: boolean;
  qrDataUrl: string;
  reprintBy?: string;
  reprintReason?: string;
};

/**
 * Build a single-page A5 (or A4) bill receipt HTML string.
 *
 * Layout matches the CARE DIAGNOSTICS scanned receipt:
 *   • Header: clinic name right-aligned, logo below on right
 *   • Title: "INVOICE / RECEIPT" right-aligned
 *   • Patient block: compact bordered 2-line demographics
 *   • Test table: # | Code | Test | Category | Amount
 *   • Bottom row: QR (left) | Payment details (center) | Totals (right)
 *   • Footer: report collection note + signature line
 *
 * Everything is black/grey — no brand colour theme so it prints
 * reliably on B&W thermal printers.
 */
export function buildBillPrintHtml(opts: BuildPrintHtmlOpts): string {
  const { bill, clinic, paperSize, isBW, qrDataUrl, reprintBy, reprintReason } = opts;
  const copies = Math.max(1, Math.min(2, Number(clinic?.billPrintCopies ?? 1) || 1));
  const showCode = clinic?.billShowCode !== false;
  const showCategory = clinic?.billShowCategory !== false;
  const qrEnabled = clinic?.qrOnBillEnabled !== false;

  const tests = (bill.order?.tests ?? []).filter((t) => (t.status ?? "active") !== "cancelled");
  const cancelled = (bill.order?.tests ?? []).filter((t) => (t.status ?? "active") === "cancelled");
  const billDigits = String(bill.billNumber).replace(/^BILL-?/i, "").replace(/-/g, "");
  const ageStr = calcAgeYrs(bill.patient?.dateOfBirth, bill.patient?.ageValue, bill.patient?.ageUnit);
  const ageGender = [ageStr, bill.patient?.gender].filter(Boolean).join(" / ").toUpperCase();
  const created = bill.createdAt ? new Date(bill.createdAt) : new Date();
  const isCancelled = (bill.status ?? "") === "cancelled";
  const rawDoctorName = bill.order?.doctor?.name ?? "";

  /* ── Sizing tuned for A5 portrait (148 × 210 mm) ── */
  const isA5 = paperSize === "A5";
  const bodyPx = isA5 ? 15 : 13;
  const pageMargin = isA5 ? "3mm" : "6mm";
  const clinicNameSize = isA5 ? "26px" : "24px";
  const titleSize = isA5 ? "17px" : "15px";
  const patientNameSize = isA5 ? "19px" : "17px";
  const patientMetaSize = isA5 ? "15px" : "13px";
  const tablePx = isA5 ? 15 : 13;
  const payPx = isA5 ? 14 : 12;
  const totalPx = isA5 ? 15 : 13;
  const footerPx = isA5 ? 14 : 12;
  const tinyPx = isA5 ? 12 : 10;

  const colCount = 3 + (showCode ? 1 : 0) + (showCategory ? 1 : 0);

  /* ── Test rows ── */
  const testRows = tests.map((t, i) => {
    const code = t.test?.code ?? "";
    const name = t.test?.name ?? "";
    const cat = t.test?.category ?? "";
    const tdPad = isA5 ? "3px 5px" : "2px 4px";
    return `<tr>
      <td style="padding:${tdPad};border-bottom:1px solid #ddd">${i + 1}</td>
      ${showCode ? `<td style="padding:${tdPad};border-bottom:1px solid #ddd;font-family:monospace;font-size:${Math.round(tablePx * 0.92)}px">${escapeHtml(code)}</td>` : ""}
      <td style="padding:${tdPad};border-bottom:1px solid #ddd">${escapeHtml(name)}</td>
      ${showCategory ? `<td style="padding:${tdPad};border-bottom:1px solid #ddd">${escapeHtml(cat)}</td>` : ""}
      <td style="padding:${tdPad};border-bottom:1px solid #ddd;text-align:right;font-weight:600">₹${Number(t.price).toFixed(2)}</td>
    </tr>`;
  }).join("");

  const cancelledRows = cancelled.length === 0 ? "" : `
    <div style="margin-top:3px;font-size:${tablePx - 1}px;color:#999;text-transform:none">
      <em>Cancelled tests: ${cancelled.map((t) => escapeHtml(t.test?.name ?? "")).join(", ")}</em>
    </div>`;

  /* ── Payment rows for middle column (kept compact) ── */
  const payRows = (bill.payments ?? []).map((p) => {
    const ref = p.referenceNumber ? ` (${escapeHtml(p.referenceNumber)})` : "";
    return `<tr>
      <td style="padding:1px 0;text-transform:capitalize;font-size:${payPx}px">${escapeHtml(p.method)}${ref ? `<span style="color:#666;font-size:${Math.round(payPx * 0.85)}px">${ref}</span>` : ""}</td>
      <td style="padding:1px 0;text-align:right;white-space:nowrap;font-weight:600;font-size:${payPx}px">₹${Number(p.amount).toFixed(2)}</td>
    </tr>`;
  }).join("");

  /* ── Aggregated payment amounts by mode ── */
  const payByMode: Record<string, number> = {};
  for (const p of bill.payments ?? []) {
    const m = String(p.method).toLowerCase().trim();
    payByMode[m] = (payByMode[m] || 0) + Number(p.amount || 0);
  }
  const cashAmt = payByMode["cash"] || 0;
  const upiAmt = payByMode["upi"] || 0;
  const cardAmt = payByMode["card"] || 0;
  const hasMultiPay = Object.keys(payByMode).length > 1 || (bill.payments ?? []).length > 1;

  /* ── One receipt page ── */
  const onePage = (copyIdx: number) => `
    <section class="receipt" style="${copyIdx > 0 ? "page-break-before:always;" : ""}">
      ${reprintBy || reprintReason ? `<div style="text-align:center;font-size:${tinyPx}px;color:#a16207;border:1px dashed #d97706;padding:2px 4px;margin-bottom:5px;text-transform:uppercase">DUPLICATE / RE-PRINT${reprintBy ? ` · BY ${escapeHtml(reprintBy)}` : ""}${reprintReason ? ` · ${escapeHtml(reprintReason)}` : ""}</div>` : ""}

      <!-- HEADER: clinic name + logo centered, address below -->
      <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:4px">
        ${clinic?.logoDataUrl ? `<img src="${clinic.logoDataUrl}" alt="logo" style="max-height:${isA5 ? 48 : 52}px;max-width:${isA5 ? 120 : 140}px;object-fit:contain;margin-bottom:3px;display:block;margin-left:auto;margin-right:auto"/>` : ""}
        <div style="font-size:${clinicNameSize};font-weight:800;line-height:1.1">${escapeHtml(clinic?.name || "Diagnostic Centre")}</div>
        ${clinic?.tagline ? `<div style="font-size:${Math.round(bodyPx * 0.85)}px;color:#555;margin-top:2px;font-weight:600">${escapeHtml(clinic.tagline)}</div>` : ""}
        <div style="font-size:${tinyPx}px;color:#444;margin-top:3px;line-height:1.4">
          ${clinic?.address ? `<div>${escapeHtml(clinic.address.replace(/\s*\n\s*/g, ", ").trim())}</div>` : ""}
          <div>${[clinic?.phone && `Ph: ${clinic.phone}`, clinic?.email, clinic?.website].filter(Boolean).map((s) => escapeHtml(String(s))).join("  ·  ")}</div>
          ${clinic?.gstin ? `<div>GSTIN: ${escapeHtml(clinic.gstin)}</div>` : ""}
        </div>
      </div>

      <!-- TITLE -->
      <div style="text-align:right;font-size:${titleSize};font-weight:700;letter-spacing:1px;margin:0 0 4px;text-transform:uppercase">INVOICE / RECEIPT${isCancelled ? " — CANCELLED" : ""}</div>

      <!-- PATIENT BLOCK: compact bordered 2-liner -->
      <div style="border-top:1px solid #888;border-bottom:1px solid #888;padding:4px 0;margin-bottom:5px">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="vertical-align:top;padding:0">
              <div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:0 6px;line-height:1.2">
                <strong style="font-size:${patientNameSize};font-weight:900">${escapeHtml(`${bill.patient?.firstName ?? ""} ${bill.patient?.lastName ?? ""}`.trim())}</strong>
                ${ageGender ? `<strong style="font-size:${patientMetaSize};font-weight:800">· ${escapeHtml(ageGender)}</strong>` : ""}
              </div>
              <div style="font-size:${patientMetaSize};font-weight:700;margin-top:2px">
                REF: <strong>${rawDoctorName ? escapeHtml(rawDoctorName.match(/^\s*DR\.?\s*/i) ? rawDoctorName.trim().toUpperCase() : "DR. " + rawDoctorName.trim()) : "SELF / WALK-IN"}</strong>
              </div>
            </td>
            <td style="vertical-align:top;text-align:right;padding:0;font-size:${tinyPx + 1}px;line-height:1.45;white-space:nowrap">
              ${bill.patient?.phone ? `<div>PH: ${escapeHtml(bill.patient.phone)}</div>` : ""}
              <div>${created.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} ${created.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
              <div>ID: ${escapeHtml(bill.patient?.patientId ?? "")} · BILL: ${escapeHtml(billDigits)}</div>
            </td>
          </tr>
        </table>
      </div>

      <!-- TEST TABLE -->
      <table style="width:100%;border-collapse:collapse;font-size:${tablePx}px;margin-bottom:3px">
        <thead>
          <tr style="border-bottom:1px solid #888">
            <th style="padding:${isA5 ? "4px 5px" : "3px 4px"};text-align:left;font-weight:700">#</th>
            ${showCode ? `<th style="padding:${isA5 ? "4px 5px" : "3px 4px"};text-align:left;font-weight:700">Code</th>` : ""}
            <th style="padding:${isA5 ? "4px 5px" : "3px 4px"};text-align:left;font-weight:700">Test</th>
            ${showCategory ? `<th style="padding:${isA5 ? "4px 5px" : "3px 4px"};text-align:left;font-weight:700">Category</th>` : ""}
            <th style="padding:${isA5 ? "4px 5px" : "3px 4px"};text-align:right;font-weight:700">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${testRows || `<tr><td colspan="${colCount}" style="padding:6px;text-align:center;color:#999">No tests on this bill</td></tr>`}
        </tbody>
      </table>
      ${cancelledRows}

      <!--
        BOTTOM ROW — table-based 3-column layout.
        Left: QR  |  Middle: Payment details  |  Right: Totals
      -->
      <table style="width:100%;border-collapse:separate;border-spacing:0;margin-top:6px;table-layout:fixed">
        <colgroup>
          <col style="width:${qrEnabled && qrDataUrl ? "72px" : "0"}"/>
          <col/>
          <col style="width:${isA5 ? "170px" : "200px"}"/>
        </colgroup>
        <tbody>
          <tr>
            <td style="vertical-align:top;padding:0;overflow:hidden">
              ${qrEnabled && qrDataUrl ? `<img src="${qrDataUrl}" alt="Verify QR" style="width:${isA5 ? 54 : 56}px;height:${isA5 ? 54 : 56}px;display:block"/><div style="font-size:${tinyPx}px;color:#666;margin-top:1px;text-transform:none;white-space:nowrap">Scan to verify</div>` : ""}
            </td>
            <td style="vertical-align:top;padding:0 8px 0 0;font-size:${payPx}px;word-break:break-word">
              ${(bill.payments ?? []).length > 0 ? `<div style="font-weight:700;border-bottom:1px solid #999;padding-bottom:1px;margin-bottom:2px;font-size:${payPx + 1}px">PAYMENT DETAILS</div><table style="width:100%;border-collapse:collapse"><tbody>${payRows}</tbody></table>` : ""}
            </td>
            <td style="vertical-align:top;padding:0">
              <table style="width:100%;border-collapse:collapse;font-size:${totalPx}px;table-layout:fixed">
                <tbody>
                  <tr><td style="padding:1px 3px">Subtotal</td><td style="padding:1px 3px;text-align:right;white-space:nowrap">₹${Number(bill.subtotal).toFixed(2)}</td></tr>
                  ${Number(bill.discount) > 0 ? `<tr><td style="padding:1px 3px">Discount</td><td style="padding:1px 3px;text-align:right;white-space:nowrap;color:green">−₹${Number(bill.discount).toFixed(2)}</td></tr>` : ""}
                  <tr><td style="padding:2px 3px;border-top:2px solid #000;font-weight:800;font-size:${totalPx + 1}px">Grand Total</td><td style="padding:2px 3px;border-top:2px solid #000;text-align:right;font-weight:800;white-space:nowrap;font-size:${totalPx + 1}px">₹${Number(bill.totalAmount).toFixed(2)}</td></tr>
                  ${hasMultiPay ? `
                    ${cashAmt > 0 ? `<tr><td style="padding:1px 3px;color:#555">Cash</td><td style="padding:1px 3px;text-align:right;white-space:nowrap;color:#555">₹${cashAmt.toFixed(2)}</td></tr>` : ""}
                    ${upiAmt > 0 ? `<tr><td style="padding:1px 3px;color:#555">UPI</td><td style="padding:1px 3px;text-align:right;white-space:nowrap;color:#555">₹${upiAmt.toFixed(2)}</td></tr>` : ""}
                    ${cardAmt > 0 ? `<tr><td style="padding:1px 3px;color:#555">Card</td><td style="padding:1px 3px;text-align:right;white-space:nowrap;color:#555">₹${cardAmt.toFixed(2)}</td></tr>` : ""}
                  ` : ""}
                  <tr><td style="padding:2px 3px;border-top:1px solid #000;font-weight:700">Paid</td><td style="padding:2px 3px;border-top:1px solid #000;text-align:right;font-weight:700;white-space:nowrap;color:green">₹${Number(bill.paidAmount).toFixed(2)}</td></tr>
                  <tr><td style="padding:2px 3px;border-top:1px solid #000;font-weight:700">Balance</td><td style="padding:2px 3px;border-top:1px solid #000;text-align:right;font-weight:700;white-space:nowrap;color:${Number(bill.balanceAmount) > 0 ? "#c62828" : "green"}">₹${Number(bill.balanceAmount).toFixed(2)}${Number(bill.balanceAmount) === 0 ? " (PAID)" : ""}</td></tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- FOOTER: note + signature line -->
      <div style="margin-top:8px;border-top:1px solid #888;padding-top:5px;text-align:center;page-break-inside:avoid">
        <div style="font-size:${footerPx}px;font-weight:700;color:#000;margin-bottom:2px">${escapeHtml(clinic?.footerNote || bill.reportCollectionNote || "Please collect your report within 7 days.")}</div>
        <div style="font-size:${tinyPx + 1}px;color:#555;margin-bottom:6px">We wish you good health. · Computer-generated invoice — no signature required.</div>
        <!-- Signature line area (blank space + line) -->
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px;gap:16px">
          <div style="flex:1;text-align:left">
            <div style="border-bottom:1px solid #000;width:120px;margin-bottom:2px"></div>
            <div style="font-size:${tinyPx}px;color:#555">Authorised Signature</div>
          </div>
          <div style="flex:1;text-align:right;font-size:${tinyPx}px;color:#555">
            ${(() => {
              const n = (typeof window !== "undefined" && window.localStorage.getItem("erp_session")) ? JSON.parse(window.localStorage.getItem("erp_session") || "{}").user?.name : "";
              return n ? `<div>Billed by: ${escapeHtml(n)}</div>` : "";
            })()}
          </div>
        </div>
      </div>
    </section>`;

  const pages = Array.from({ length: copies }).map((_, i) => onePage(i)).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Bill ${escapeHtml(bill.billNumber)}</title>
<style>
  @page { size: ${paperSize} portrait; margin: ${pageMargin}; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 100%; }
  body { background: #fff; color: #000; font-family: Arial, sans-serif; font-size: ${bodyPx}px; ${isBW ? "filter: grayscale(1) contrast(1.35); -webkit-print-color-adjust: exact; print-color-adjust: exact;" : ""} }
  .receipt { width: 100%; padding: ${isA5 ? "4px 5px" : "4px 6px"}; }
  table { width: 100%; }
</style></head><body>${pages}</body></html>`;
}

// Print receipt HTML inside a hidden same-tab iframe. Use this when the
// caller is already in a tab that was opened specifically to print (e.g.
// BillDetail loaded with ?print=1 from a target="_blank" link). It avoids
// popup-blocker pitfalls entirely because no new window is opened.
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
    } catch {
      // ignore
    }
    setTimeout(() => {
      try { iframe.remove(); } catch { /* ignore */ }
    }, 1000);
  };
  iframe.onload = doPrint;
  setTimeout(doPrint, 350);
}

// Open a blank popup window SYNCHRONOUSLY inside a user-gesture handler.
// Returns null if the popup was blocked (caller should fall back gracefully).
// The window shows a small "Preparing receipt…" placeholder until
// `writeAndPrint` is called.
export function openBlankPrintWindow(): Window | null {
  const w = window.open("", "_blank", "width=520,height=720");
  if (!w) return null;
  try {
    w.document.open();
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>Preparing receipt…</title></head><body style="font-family:Arial,sans-serif;padding:24px;color:#555">Preparing receipt…</body></html>`,
    );
    w.document.close();
  } catch {
    // ignore — some browsers throw on cross-origin / about:blank, but the
    // window can still be written to later.
  }
  return w;
}

// Populate a previously-opened blank print window with the final HTML and
// trigger printing. Safe no-op when `win` is null (popup was blocked).
export function writeAndPrint(win: Window | null, html: string): void {
  if (!win) {
    // Popup was blocked. As a last-resort fallback try opening a fresh
    // window now (will likely also be blocked but worth surfacing the
    // browser's notification UI to the user).
    const w = window.open("", "_blank", "width=520,height=720");
    if (!w) {
      alert("Pop-up blocked. Please allow pop-ups for this site to print bills.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.onload = () => {
      w.focus();
      w.print();
      setTimeout(() => w.close(), 400);
    };
    return;
  }
  try {
    win.document.open();
    win.document.write(html);
    win.document.close();
  } catch {
    // ignore
  }
  // Some browsers fire onload synchronously after document.close, others
  // not at all for document.write content. Use both signals and a timeout
  // safety-net so print always runs.
  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    try {
      win.focus();
      win.print();
    } catch {
      // ignore
    }
    setTimeout(() => {
      try { win.close(); } catch { /* ignore */ }
    }, 500);
  };
  win.onload = doPrint;
  setTimeout(doPrint, 350);
}
