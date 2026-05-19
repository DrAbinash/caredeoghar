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

export function buildBillPrintHtml(opts: BuildPrintHtmlOpts): string {
  const { bill, clinic, paperSize, isBW, qrDataUrl, reprintBy, reprintReason } = opts;
  const copies = Math.max(1, Math.min(2, Number(clinic?.billPrintCopies ?? 1) || 1));
  const showCode = clinic?.billShowCode !== false;
  const showCategory = clinic?.billShowCategory !== false;
  const qrEnabled = clinic?.qrOnBillEnabled !== false;

  const tests = (bill.order?.tests ?? []).filter((t) => (t.status ?? "active") !== "cancelled");
  const cancelled = (bill.order?.tests ?? []).filter((t) => (t.status ?? "active") === "cancelled");
  // Strip legacy "BILL-YYYYMM-####" prefix/dashes for display; new format
  // is already pure-numeric (see replit.md "Bill Number Format").
  const billDigits = String(bill.billNumber).replace(/^BILL-?/i, "").replace(/-/g, "");
  const ageStr = calcAgeYrs(bill.patient?.dateOfBirth, bill.patient?.ageValue, bill.patient?.ageUnit);
  const ageGender = [ageStr, bill.patient?.gender].filter(Boolean).join(" / ").toUpperCase();
  const created = bill.createdAt ? new Date(bill.createdAt) : new Date();
  const isCancelled = (bill.status ?? "") === "cancelled";
  const rawDoctorName = bill.order?.doctor?.name ?? "";

  const fontPx = paperSize === "A5" ? 14 : 12;
  const pageMargin = paperSize === "A5" ? "3mm" : "6mm";
  const headerNameSize = paperSize === "A5" ? "20px" : "20px";
  const colCount = 3 + (showCode ? 1 : 0) + (showCategory ? 1 : 0);

  const testRows = tests.map((t, i) => {
    const code = t.test?.code ?? "";
    const name = t.test?.name ?? "";
    const cat = t.test?.category ?? "";
    const tdPad = paperSize === "A5" ? "4px 5px" : "2px 4px";
    return `<tr>
      <td style="padding:${tdPad};border-bottom:1px solid #eee">${i + 1}</td>
      ${showCode ? `<td style="padding:${tdPad};border-bottom:1px solid #eee;font-family:monospace">${escapeHtml(code)}</td>` : ""}
      <td style="padding:${tdPad};border-bottom:1px solid #eee">${escapeHtml(name)}</td>
      ${showCategory ? `<td style="padding:${tdPad};border-bottom:1px solid #eee">${escapeHtml(cat)}</td>` : ""}
      <td style="padding:${tdPad};border-bottom:1px solid #eee;text-align:right">₹${Number(t.price).toFixed(2)}</td>
    </tr>`;
  }).join("");

  const cancelledRows = cancelled.length === 0 ? "" : `
    <div style="margin-top:4px;font-size:${fontPx - 1}px;color:#999;text-transform:none">
      <em>Cancelled tests: ${cancelled.map((t) => escapeHtml(t.test?.name ?? "")).join(", ")}</em>
    </div>`;

  const payRows = (bill.payments ?? []).map((p) => {
    const ref = p.referenceNumber ? ` (${escapeHtml(p.referenceNumber)})` : "";
    return `<tr>
      <td style="padding:1px 0;text-transform:capitalize">${escapeHtml(p.method)}${ref ? `<span style="color:#666;font-size:${Math.round(fontPx * 0.78)}px">${ref}</span>` : ""}</td>
      <td style="padding:1px 0;text-align:right;white-space:nowrap;font-weight:600">₹${Number(p.amount).toFixed(2)}</td>
    </tr>`;
  }).join("");

  const onePage = (copyIdx: number) => `
    <section class="receipt" style="${copyIdx > 0 ? "page-break-before:always;" : ""}">
      ${reprintBy || reprintReason ? `<div style="text-align:center;font-size:${fontPx - 1}px;color:#a16207;border:1px dashed #d97706;padding:2px 4px;margin-bottom:6px;text-transform:uppercase">DUPLICATE / RE-PRINT${reprintBy ? ` · BY ${escapeHtml(reprintBy)}` : ""}${reprintReason ? ` · ${escapeHtml(reprintReason)}` : ""}</div>` : ""}
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;border-bottom:2px solid #1e40af;padding-bottom:8px;margin-bottom:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:${headerNameSize};font-weight:800;color:#1e40af;line-height:1.15">${escapeHtml(clinic?.name || "Diagnostic Centre")}</div>
          ${clinic?.tagline ? `<div style="font-size:${Math.round(fontPx * 0.75)}px;color:#666;margin-top:1px;text-transform:none">${escapeHtml(clinic.tagline)}</div>` : ""}
          ${clinic?.address ? `<div style="font-size:${Math.round(fontPx * 0.75)}px;color:#444;margin-top:2px;text-transform:none">${escapeHtml(clinic.address.replace(/\s*\n\s*/g, ", ").trim())}</div>` : ""}
          <div style="font-size:${Math.round(fontPx * 0.75)}px;color:#444;margin-top:1px;text-transform:none">${[clinic?.phone && `Ph: ${clinic.phone}`, clinic?.email, clinic?.website].filter(Boolean).map((s) => escapeHtml(String(s))).join("  •  ")}</div>
          ${clinic?.gstin ? `<div style="font-size:${Math.round(fontPx * 0.65)}px;color:#666;margin-top:1px;text-transform:none">GSTIN: ${escapeHtml(clinic.gstin)}</div>` : ""}
        </div>
        ${clinic?.logoDataUrl ? `<img src="${clinic.logoDataUrl}" alt="logo" style="max-height:${paperSize === "A5" ? 56 : 64}px;max-width:${paperSize === "A5" ? 120 : 150}px;object-fit:contain;flex-shrink:0"/>` : ""}
      </div>

      <div style="text-align:center;font-size:${fontPx + 1}px;font-weight:700;letter-spacing:1px;margin:0 0 6px">INVOICE / RECEIPT${isCancelled ? " — CANCELLED" : ""}</div>

      <div style="border-top:1px solid #ccc;border-bottom:1px solid #ccc;padding:5px 0;margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div style="line-height:1.25">
            <div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:0 5px">
              <strong style="font-size:${paperSize === "A5" ? 18 : 17}px;font-weight:900;line-height:1.05">${escapeHtml(`${bill.patient?.firstName ?? ""} ${bill.patient?.lastName ?? ""}`.trim())}</strong>
              ${ageGender ? `<strong style="font-size:${paperSize === "A5" ? 14 : 14}px;font-weight:800">&middot; ${escapeHtml(ageGender)}</strong>` : ""}
            </div>
            <div style="font-size:${paperSize === "A5" ? 13 : 13}px;font-weight:700;margin-top:3px">REF: <strong>${rawDoctorName ? escapeHtml(rawDoctorName.match(/^\s*DR\.?\s*/i) ? rawDoctorName.trim().toUpperCase() : "DR. " + rawDoctorName.trim()) : "SELF / WALK-IN"}</strong></div>
          </div>
          <div style="text-align:right;font-size:${Math.round(fontPx * 0.85)}px;line-height:1.5;flex-shrink:0">
            ${bill.patient?.phone ? `<div>PH: ${escapeHtml(bill.patient.phone)}</div>` : ""}
            <div>${created.toLocaleDateString("en-IN")} ${created.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
            <div>ID: ${escapeHtml(bill.patient?.patientId ?? "")} &middot; BILL: ${escapeHtml(billDigits)}</div>
          </div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:${fontPx}px">
        <thead>
          <tr style="background:#f4f4f4">
            <th style="padding:${paperSize === "A5" ? "5px 5px" : "3px 4px"};text-align:left;border-bottom:1px solid #ccc">#</th>
            ${showCode ? `<th style="padding:${paperSize === "A5" ? "5px 5px" : "3px 4px"};text-align:left;border-bottom:1px solid #ccc">Code</th>` : ""}
            <th style="padding:${paperSize === "A5" ? "5px 5px" : "3px 4px"};text-align:left;border-bottom:1px solid #ccc">Test</th>
            ${showCategory ? `<th style="padding:${paperSize === "A5" ? "5px 5px" : "3px 4px"};text-align:left;border-bottom:1px solid #ccc">Category</th>` : ""}
            <th style="padding:${paperSize === "A5" ? "5px 5px" : "3px 4px"};text-align:right;border-bottom:1px solid #ccc">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${testRows || `<tr><td colspan="${colCount}" style="padding:6px;text-align:center;color:#999">No tests on this bill</td></tr>`}
        </tbody>
      </table>
      ${cancelledRows}

      <!--
        BOTTOM SECTION — table-based 3-column layout (NOT flexbox).
        Tables with table-layout:fixed render predictably in every print
        engine; flexbox columns can collapse/overlap on physical printers
        especially on A4 where there's lots of horizontal space. The
        explicit pixel widths on the QR + Totals columns guarantee the
        middle column gets the remaining space without crowding either side.
      -->
      <table style="width:100%;border-collapse:separate;border-spacing:0;margin-top:8px;table-layout:fixed">
        <colgroup>
          <col style="width:${qrEnabled && qrDataUrl ? "70px" : "0"}"/>
          <col/>
          <col style="width:${paperSize === "A4" ? "210px" : "175px"}"/>
        </colgroup>
        <tbody>
          <tr>
            <td style="vertical-align:top;padding:0;overflow:hidden">
              ${qrEnabled && qrDataUrl ? `<img src="${qrDataUrl}" alt="Verify QR" style="width:${paperSize === "A5" ? 56 : 56}px;height:${paperSize === "A5" ? 56 : 56}px;display:block"/><div style="font-size:${Math.round(fontPx * 0.7)}px;color:#666;margin-top:1px;text-transform:none;white-space:nowrap">Scan to verify</div>` : ""}
            </td>
            <td style="vertical-align:top;padding:0 8px 0 0;font-size:${Math.round(fontPx * 0.95)}px;word-break:break-word">
              ${(bill.payments ?? []).length > 0 ? `<div style="font-weight:700;border-bottom:1px solid #ccc;padding-bottom:1px;margin-bottom:3px">PAYMENT DETAILS</div><table style="width:100%;border-collapse:collapse"><tbody>${payRows}</tbody></table>` : ""}
            </td>
            <td style="vertical-align:top;padding:0">
              <table style="width:100%;border-collapse:collapse;font-size:${fontPx}px;table-layout:fixed">
                <tbody>
                  <tr><td style="padding:1px 4px">Subtotal</td><td style="padding:1px 4px;text-align:right;white-space:nowrap">₹${Number(bill.subtotal).toFixed(2)}</td></tr>
                  ${Number(bill.discount) > 0 ? `<tr><td style="padding:1px 4px">Discount</td><td style="padding:1px 4px;text-align:right;color:green;white-space:nowrap">−₹${Number(bill.discount).toFixed(2)}</td></tr>` : ""}
                  ${Number(bill.taxAmount ?? 0) > 0 ? `<tr><td style="padding:1px 4px">Tax</td><td style="padding:1px 4px;text-align:right;white-space:nowrap">₹${Number(bill.taxAmount).toFixed(2)}</td></tr>` : ""}
                  <tr><td style="padding:2px 4px;border-top:1px solid #000;font-weight:700">Total</td><td style="padding:2px 4px;border-top:1px solid #000;text-align:right;font-weight:700;white-space:nowrap">₹${Number(bill.totalAmount).toFixed(2)}</td></tr>
                  <tr><td style="padding:1px 4px">Paid</td><td style="padding:1px 4px;text-align:right;color:green;white-space:nowrap">₹${Number(bill.paidAmount).toFixed(2)}</td></tr>
                  <tr><td style="padding:2px 4px;border-top:1px solid #000;font-weight:700">Balance</td><td style="padding:2px 4px;border-top:1px solid #000;text-align:right;font-weight:700;white-space:nowrap;color:${Number(bill.balanceAmount) > 0 ? "#c62828" : "green"}">₹${Number(bill.balanceAmount).toFixed(2)}${Number(bill.balanceAmount) === 0 ? " (PAID)" : ""}</td></tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <!--
        FOOTER BLOCK — single combined section so there is only ONE
        page-break-inside:avoid target. Having two separate avoid-blocks
        caused browsers to push both onto a new page when they didn't fit
        together after the totals, producing a blank page 2 (and page 4
        for the second copy). Merged into one block; footerNote is the
        primary message since the clinic configures it.
      -->
      <div style="margin-top:8px;border:1px solid #1e40af;border-radius:6px;padding:${paperSize === "A5" ? "8px 14px" : "6px 12px"};background:#f0f6ff;text-align:center;text-transform:none;page-break-inside:avoid">
        <div style="font-size:${fontPx + 1}px;font-weight:800;color:#1e40af;letter-spacing:0.5px">${escapeHtml(clinic?.footerNote || bill.reportCollectionNote || "Please collect your report within 7 days.")}</div>
        <div style="font-size:${Math.round(fontPx * 0.8)}px;color:#666;margin-top:3px">We wish you good health.  &middot;  Computer-generated invoice — no signature required.</div>
      </div>
    </section>`;

  const pages = Array.from({ length: copies }).map((_, i) => onePage(i)).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Bill ${escapeHtml(bill.billNumber)}</title>
<style>
  @page { size: ${paperSize} portrait; margin: ${pageMargin}; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 100%; }
  body { background: #fff; color: #000; font-family: Arial, sans-serif; font-size: ${fontPx}px; text-transform: uppercase; ${isBW ? "filter: grayscale(1) contrast(1.35); -webkit-print-color-adjust: exact; print-color-adjust: exact;" : ""} }
  .receipt { width: 100%; padding: ${paperSize === "A5" ? "5px 7px" : "4px 6px"}; }
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
