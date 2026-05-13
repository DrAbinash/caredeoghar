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
  // Optional queue token printed at the bottom (BillingDesk sets this when
  // the bill creates a per-test token).
  tokenNo?: number | null;
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

function calcAgeYrs(dob?: string | null): string {
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
  const ageStr = calcAgeYrs(bill.patient?.dateOfBirth);
  const ageGender = [ageStr, bill.patient?.gender].filter(Boolean).join(" / ").toUpperCase();
  const created = bill.createdAt ? new Date(bill.createdAt) : new Date();
  const isCancelled = (bill.status ?? "") === "cancelled";

  const fontPx = paperSize === "A5" ? 10 : 12;
  const pageMargin = paperSize === "A5" ? "3mm" : "6mm";
  const headerNameSize = paperSize === "A5" ? "15px" : "20px";
  const colCount = 3 + (showCode ? 1 : 0) + (showCategory ? 1 : 0);

  const testRows = tests.map((t, i) => {
    const code = t.test?.code ?? "";
    const name = t.test?.name ?? "";
    const cat = t.test?.category ?? "";
    return `<tr>
      <td style="padding:2px 4px;border-bottom:1px solid #eee">${i + 1}</td>
      ${showCode ? `<td style="padding:2px 4px;border-bottom:1px solid #eee;font-family:monospace">${escapeHtml(code)}</td>` : ""}
      <td style="padding:2px 4px;border-bottom:1px solid #eee">${escapeHtml(name)}</td>
      ${showCategory ? `<td style="padding:2px 4px;border-bottom:1px solid #eee">${escapeHtml(cat)}</td>` : ""}
      <td style="padding:2px 4px;border-bottom:1px solid #eee;text-align:right">₹${Number(t.price).toFixed(2)}</td>
    </tr>`;
  }).join("");

  const cancelledRows = cancelled.length === 0 ? "" : `
    <div style="margin-top:4px;font-size:${fontPx - 1}px;color:#999;text-transform:none">
      <em>Cancelled tests: ${cancelled.map((t) => escapeHtml(t.test?.name ?? "")).join(", ")}</em>
    </div>`;

  const payRows = (bill.payments ?? []).map((p) => `
    <tr>
      <td style="padding:1px 4px;text-transform:capitalize">${escapeHtml(p.method)}</td>
      <td style="padding:1px 4px;color:#666">${escapeHtml(p.referenceNumber ?? "")}</td>
      <td style="padding:1px 4px;text-align:right">₹${Number(p.amount).toFixed(2)}</td>
    </tr>`).join("");

  const onePage = (copyIdx: number) => `
    <section class="receipt" style="${copyIdx > 0 ? "page-break-before:always;" : ""}">
      ${reprintBy || reprintReason ? `<div style="text-align:center;font-size:${fontPx - 1}px;color:#a16207;border:1px dashed #d97706;padding:2px 4px;margin-bottom:6px;text-transform:uppercase">DUPLICATE / RE-PRINT${reprintBy ? ` · BY ${escapeHtml(reprintBy)}` : ""}${reprintReason ? ` · ${escapeHtml(reprintReason)}` : ""}</div>` : ""}
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;border-bottom:2px solid #1e40af;padding-bottom:8px;margin-bottom:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:${headerNameSize};font-weight:800;color:#1e40af;line-height:1.15">${escapeHtml(clinic?.name || "Diagnostic Centre")}</div>
          ${clinic?.tagline ? `<div style="font-size:${fontPx - 1}px;color:#666;margin-top:1px;text-transform:none">${escapeHtml(clinic.tagline)}</div>` : ""}
          ${clinic?.address ? `<div style="font-size:${fontPx - 1}px;color:#444;margin-top:2px;text-transform:none">${escapeHtml(clinic.address.replace(/\s*\n\s*/g, ", ").trim())}</div>` : ""}
          <div style="font-size:${fontPx - 1}px;color:#444;margin-top:1px;text-transform:none">${[clinic?.phone && `Ph: ${clinic.phone}`, clinic?.email, clinic?.website].filter(Boolean).map((s) => escapeHtml(String(s))).join("  •  ")}</div>
          ${clinic?.gstin ? `<div style="font-size:${fontPx - 2}px;color:#666;margin-top:1px;text-transform:none">GSTIN: ${escapeHtml(clinic.gstin)}</div>` : ""}
        </div>
        ${clinic?.logoDataUrl ? `<img src="${clinic.logoDataUrl}" alt="logo" style="max-height:${paperSize === "A5" ? 48 : 64}px;max-width:${paperSize === "A5" ? 110 : 150}px;object-fit:contain;flex-shrink:0"/>` : ""}
      </div>

      <div style="text-align:center;font-size:${fontPx + 1}px;font-weight:700;letter-spacing:1px;margin:0 0 6px">INVOICE / RECEIPT${isCancelled ? " — CANCELLED" : ""}</div>

      <div style="font-size:${fontPx}px;border-top:1px solid #ccc;border-bottom:1px solid #ccc;padding:3px 0;margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;gap:8px">
          <div><strong>${escapeHtml(`${bill.patient?.firstName ?? ""} ${bill.patient?.lastName ?? ""}`.trim())}</strong>${ageGender ? ` · ${escapeHtml(ageGender)}` : ""}</div>
          <div>PH: ${escapeHtml(bill.patient?.phone ?? "")}</div>
        </div>
        <div style="display:flex;justify-content:space-between;gap:8px;margin-top:1px">
          <div>ID: ${escapeHtml(bill.patient?.patientId ?? "")}</div>
          <div>BILL: ${escapeHtml(billDigits)}</div>
          <div>${created.toLocaleDateString("en-IN")} ${created.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
        <div style="margin-top:1px">REF: ${bill.order?.doctor?.name ? escapeHtml("DR. " + bill.order.doctor.name) : "SELF / WALK-IN"}</div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:${fontPx}px">
        <thead>
          <tr style="background:#f4f4f4">
            <th style="padding:3px 4px;text-align:left;border-bottom:1px solid #ccc">#</th>
            ${showCode ? `<th style="padding:3px 4px;text-align:left;border-bottom:1px solid #ccc">Code</th>` : ""}
            <th style="padding:3px 4px;text-align:left;border-bottom:1px solid #ccc">Test</th>
            ${showCategory ? `<th style="padding:3px 4px;text-align:left;border-bottom:1px solid #ccc">Category</th>` : ""}
            <th style="padding:3px 4px;text-align:right;border-bottom:1px solid #ccc">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${testRows || `<tr><td colspan="${colCount}" style="padding:6px;text-align:center;color:#999">No tests on this bill</td></tr>`}
        </tbody>
      </table>
      ${cancelledRows}

      <div style="display:flex;gap:8px;margin-top:8px;align-items:flex-start">
        ${qrEnabled && qrDataUrl ? `<div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-start"><img src="${qrDataUrl}" alt="Verify QR" style="width:56px;height:56px;display:block"/><div style="font-size:${fontPx - 3}px;color:#666;margin-top:1px;text-transform:none;white-space:nowrap">Scan to verify bill</div></div>` : ""}
        <div style="flex:1;font-size:${fontPx - 1}px;min-width:0">
          ${(bill.payments ?? []).length > 0 ? `<div style="font-weight:700;border-bottom:1px solid #ccc;padding-bottom:1px;margin-bottom:2px">PAYMENT DETAILS</div>
          <table style="width:100%;border-collapse:collapse;font-size:${fontPx - 1}px"><tbody>${payRows}</tbody></table>` : ""}
        </div>
        <table style="min-width:160px;font-size:${fontPx}px;border-collapse:collapse;flex-shrink:0">
          <tbody>
            <tr><td style="padding:1px 4px">Subtotal</td><td style="padding:1px 4px;text-align:right">₹${Number(bill.subtotal).toFixed(2)}</td></tr>
            ${Number(bill.discount) > 0 ? `<tr><td style="padding:1px 4px">Discount</td><td style="padding:1px 4px;text-align:right;color:green">−₹${Number(bill.discount).toFixed(2)}</td></tr>` : ""}
            ${Number(bill.taxAmount ?? 0) > 0 ? `<tr><td style="padding:1px 4px">Tax</td><td style="padding:1px 4px;text-align:right">₹${Number(bill.taxAmount).toFixed(2)}</td></tr>` : ""}
            <tr><td style="padding:2px 4px;border-top:1px solid #000;font-weight:700">Total</td><td style="padding:2px 4px;border-top:1px solid #000;text-align:right;font-weight:700">₹${Number(bill.totalAmount).toFixed(2)}</td></tr>
            <tr><td style="padding:1px 4px">Paid</td><td style="padding:1px 4px;text-align:right;color:green">₹${Number(bill.paidAmount).toFixed(2)}</td></tr>
            <tr><td style="padding:2px 4px;border-top:1px solid #000;font-weight:700">Balance</td><td style="padding:2px 4px;border-top:1px solid #000;text-align:right;font-weight:700;color:${Number(bill.balanceAmount) > 0 ? "#c62828" : "green"}">₹${Number(bill.balanceAmount).toFixed(2)}${Number(bill.balanceAmount) === 0 ? " (PAID)" : ""}</td></tr>
          </tbody>
        </table>
      </div>

      ${bill.tokenNo != null ? `<div style="margin-top:6px;padding:3px;border:1px dashed #000;text-align:center;font-weight:700;font-size:${fontPx + 1}px">QUEUE TOKEN&nbsp;#${String(bill.tokenNo).padStart(3, "0")}</div>` : ""}
      ${clinic?.footerNote ? `<div style="margin-top:8px;padding-top:4px;border-top:1px dashed #999;font-size:${fontPx - 2}px;color:#555;text-transform:none;text-align:center">${escapeHtml(clinic.footerNote)}</div>` : ""}
    </section>`;

  const pages = Array.from({ length: copies }).map((_, i) => onePage(i)).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Bill ${escapeHtml(bill.billNumber)}</title>
<style>
  @page { size: ${paperSize} portrait; margin: ${pageMargin}; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 100%; }
  body { background: #fff; color: #000; font-family: Arial, sans-serif; font-size: ${fontPx}px; text-transform: uppercase; ${isBW ? "filter: grayscale(1) contrast(1.35); -webkit-print-color-adjust: exact; print-color-adjust: exact;" : ""} }
  .receipt { width: 100%; padding: 4px 6px; }
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
