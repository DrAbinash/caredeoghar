/**
 * Inventory stock-level export utilities.
 * Supports Excel (.xlsx), PDF (.pdf) and Word (.docx) downloads.
 *
 * All third-party libs (`exceljs`, `jspdf`, `jspdf-autotable`, `docx`,
 * `file-saver`) are dynamically imported so they don't bloat the initial
 * Inventory page bundle — they only load when the user actually clicks
 * "Download".
 */

// Lazy-load file-saver so it's not pulled into the initial Inventory bundle.
async function loadSaveAs() {
  const mod = await import("file-saver");
  return mod.saveAs;
}

/**
 * Sanitize a user-controlled string before writing it into a spreadsheet cell.
 * Cells whose first character is `=`, `+`, `-`, `@`, tab or carriage return
 * can be interpreted as formulas by Excel/Google Sheets/LibreOffice — a
 * classic CSV/spreadsheet injection vector. Prefix a single quote to neutralize.
 */
function safeText(input: unknown): string {
  const s = input == null ? "" : String(input);
  if (!s) return s;
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** Coerce a possibly-string numeric DB column to a finite number, defaulting to 0. */
function safeNum(input: unknown): number {
  const n = Number(input);
  return Number.isFinite(n) ? n : 0;
}

export type StockExportRow = {
  name: string;
  category: string;
  currentStock: number;
  unit: string;
  minStock: number;
  costPrice: number;
  isActive: boolean;
};

export type StockExportMeta = {
  /** Diagnostic center / business name shown in the export header */
  title?: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Filter description, e.g. "All categories" or "Filtered by: reagent" */
  filterLabel?: string;
  /** Generated-at timestamp string */
  generatedAt: string;
};

const fmtQty = (n: number) => safeNum(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const fmtMoney = (n: number) =>
  safeNum(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// IMPORTANT: the three states are mutually exclusive. An item is:
//   - Out of Stock if currentStock <= 0
//   - Low Stock   if 0 < currentStock <= minStock
//   - In Stock    otherwise
// `isLow` here only matches the "low" state — out-of-stock items are NOT low.
// This keeps filter / summary / status counts consistent everywhere.
const isOutOfStock = (r: StockExportRow) => safeNum(r.currentStock) <= 0;
const isLow = (r: StockExportRow) =>
  !isOutOfStock(r) && safeNum(r.currentStock) <= safeNum(r.minStock);
const stockStatus = (r: StockExportRow): "Out of Stock" | "Low Stock" | "In Stock" =>
  isOutOfStock(r) ? "Out of Stock" : isLow(r) ? "Low Stock" : "In Stock";

function defaultFilename(ext: string) {
  const d = new Date();
  const stamp =
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}` +
    `-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  return `Inventory-Stock-${stamp}.${ext}`;
}

function summarize(rows: StockExportRow[]) {
  const totalItems = rows.length;
  // lowStockCount excludes out-of-stock items so the two counts don't overlap.
  const lowStockCount = rows.filter(isLow).length;
  const outOfStockCount = rows.filter(isOutOfStock).length;
  const totalStockValue = rows.reduce(
    (acc, r) => acc + safeNum(r.currentStock) * safeNum(r.costPrice),
    0,
  );
  return { totalItems, lowStockCount, outOfStockCount, totalStockValue };
}

// ─── Excel (.xlsx) ───────────────────────────────────────────────────────────
export async function exportInventoryExcel(
  rows: StockExportRow[],
  meta: StockExportMeta,
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.title || "Diagnostic ERP";
  wb.created = new Date();

  const ws = wb.addWorksheet("Stock Levels", {
    views: [{ state: "frozen", ySplit: 5 }],
  });

  // ── Header rows (title / subtitle / meta)
  ws.mergeCells("A1:H1");
  const titleCell = ws.getCell("A1");
  titleCell.value = (meta.title || "Inventory Stock Report").toUpperCase();
  titleCell.font = { bold: true, size: 14, color: { argb: "FF1F2937" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 22;

  if (meta.subtitle) {
    ws.mergeCells("A2:H2");
    const sub = ws.getCell("A2");
    sub.value = meta.subtitle;
    sub.font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
    sub.alignment = { horizontal: "center" };
  }

  ws.mergeCells("A3:H3");
  const metaCell = ws.getCell("A3");
  metaCell.value = `${meta.filterLabel ?? "All items"}    Generated: ${meta.generatedAt}`;
  metaCell.font = { size: 9, color: { argb: "FF6B7280" } };
  metaCell.alignment = { horizontal: "center" };

  ws.addRow([]); // spacer (row 4)

  // ── Header row (row 5)
  const headers = [
    "#",
    "Item Name",
    "Category",
    "Current Stock",
    "Unit",
    "Min Stock",
    "Status",
    "Stock Value (₹)",
  ];
  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6366F1" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" }, bottom: { style: "thin" },
      left: { style: "thin" }, right: { style: "thin" },
    };
  });
  headerRow.height = 18;

  // ── Data rows
  rows.forEach((r, idx) => {
    const cur = safeNum(r.currentStock);
    const row = ws.addRow([
      idx + 1,
      // Free-text columns are funneled through safeText() to defuse spreadsheet
      // formula injection (cells starting with =, +, -, @, tab, CR).
      safeText(r.name),
      safeText(r.category),
      cur,
      safeText(r.unit),
      safeNum(r.minStock),
      stockStatus(r),
      cur * safeNum(r.costPrice),
    ]);
    row.getCell(3).alignment = { horizontal: "center" };
    row.getCell(4).alignment = { horizontal: "right" };
    row.getCell(6).alignment = { horizontal: "right" };
    row.getCell(7).alignment = { horizontal: "center" };
    row.getCell(8).alignment = { horizontal: "right" };
    row.getCell(8).numFmt = '#,##0.00';

    // Highlight low / out of stock
    const status = stockStatus(r);
    if (status === "Out of Stock") {
      row.getCell(7).font = { bold: true, color: { argb: "FFB91C1C" } };
      row.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
    } else if (status === "Low Stock") {
      row.getCell(7).font = { bold: true, color: { argb: "FFB45309" } };
      row.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
    } else {
      row.getCell(7).font = { color: { argb: "FF15803D" } };
    }

    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    });
  });

  // ── Totals row
  const totals = summarize(rows);
  const totalsRow = ws.addRow([
    "",
    `TOTAL (${totals.totalItems} items)`,
    "",
    "",
    "",
    "",
    `${totals.lowStockCount} low / ${totals.outOfStockCount} out`,
    totals.totalStockValue,
  ]);
  totalsRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    cell.border = { top: { style: "medium" } };
  });
  totalsRow.getCell(8).numFmt = '#,##0.00';
  totalsRow.getCell(8).alignment = { horizontal: "right" };

  // ── Column widths
  ws.columns = [
    { width: 6 },
    { width: 32 },
    { width: 14 },
    { width: 16 },
    { width: 8 },
    { width: 12 },
    { width: 14 },
    { width: 18 },
  ];

  const buf = await wb.xlsx.writeBuffer();
  const saveAs = await loadSaveAs();
  saveAs(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), defaultFilename("xlsx"));
}

// ─── PDF (.pdf) ──────────────────────────────────────────────────────────────
export async function exportInventoryPDF(
  rows: StockExportRow[],
  meta: StockExportMeta,
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 16;

  // Title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text((meta.title || "Inventory Stock Report").toUpperCase(), pageW / 2, y, { align: "center" });
  y += 6;

  if (meta.subtitle) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100);
    doc.text(meta.subtitle, pageW / 2, y, { align: "center" });
    y += 5;
  }

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110);
  doc.text(meta.filterLabel ?? "All items", 14, y);
  doc.text(`Generated: ${meta.generatedAt}`, pageW - 14, y, { align: "right" });
  y += 6;
  doc.setTextColor(0);

  // Summary box
  const totals = summarize(rows);
  doc.setFillColor(243, 244, 246);
  doc.setDrawColor(229, 231, 235);
  doc.roundedRect(14, y, pageW - 28, 14, 2, 2, "FD");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(`Total Items: ${totals.totalItems}`, 18, y + 5);
  doc.text(`Low Stock: ${totals.lowStockCount}`, 60, y + 5);
  doc.text(`Out of Stock: ${totals.outOfStockCount}`, 100, y + 5);
  doc.text(`Stock Value: Rs. ${fmtMoney(totals.totalStockValue)}`, pageW - 18, y + 5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(110);
  doc.text("Stock Value = sum of (current stock × cost price) across all items", 18, y + 10);
  doc.setTextColor(0);
  y += 18;

  // Table
  autoTable(doc, {
    startY: y,
    head: [["#", "Item Name", "Category", "Current", "Unit", "Min", "Status", "Value (Rs.)"]],
    body: rows.map((r, i) => [
      i + 1,
      r.name,
      r.category,
      fmtQty(r.currentStock),
      r.unit,
      fmtQty(r.minStock),
      stockStatus(r),
      fmtMoney(r.currentStock * r.costPrice),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: "bold", halign: "center" },
    columnStyles: {
      0: { halign: "center", cellWidth: 8 },
      2: { halign: "center" },
      3: { halign: "right" },
      4: { halign: "center" },
      5: { halign: "right" },
      6: { halign: "center" },
      7: { halign: "right" },
    },
    didParseCell: (data) => {
      // Highlight Status cell based on value
      if (data.section === "body" && data.column.index === 6) {
        const v = String(data.cell.raw);
        if (v === "Out of Stock") {
          data.cell.styles.fillColor = [254, 226, 226];
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fontStyle = "bold";
        } else if (v === "Low Stock") {
          data.cell.styles.fillColor = [254, 243, 199];
          data.cell.styles.textColor = [180, 83, 9];
          data.cell.styles.fontStyle = "bold";
        } else {
          data.cell.styles.textColor = [21, 128, 61];
        }
      }
    },
    didDrawPage: (data) => {
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(
        `Page ${doc.getNumberOfPages()}`,
        pageW - 14,
        doc.internal.pageSize.getHeight() - 6,
        { align: "right" },
      );
    },
  });

  doc.save(defaultFilename("pdf"));
}

// ─── Word (.docx) ────────────────────────────────────────────────────────────
export async function exportInventoryWord(
  rows: StockExportRow[],
  meta: StockExportMeta,
): Promise<void> {
  const docx = await import("docx");
  const {
    Document, Packer, Paragraph, Table, TableRow, TableCell,
    HeadingLevel, AlignmentType, TextRun, WidthType, BorderStyle, ShadingType,
  } = docx;

  const totals = summarize(rows);

  const headerCell = (text: string, width: number) =>
    new TableCell({
      width: { size: width, type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, color: "auto", fill: "6366F1" },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 18 })],
        }),
      ],
    });

  const bodyCell = (text: string, opts: { align?: typeof AlignmentType[keyof typeof AlignmentType]; bold?: boolean; color?: string; fill?: string } = {}) =>
    new TableCell({
      shading: opts.fill
        ? { type: ShadingType.CLEAR, color: "auto", fill: opts.fill }
        : undefined,
      children: [
        new Paragraph({
          alignment: opts.align ?? AlignmentType.LEFT,
          children: [new TextRun({ text, bold: opts.bold, color: opts.color, size: 18 })],
        }),
      ],
    });

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell("#", 5),
      headerCell("Item Name", 30),
      headerCell("Category", 12),
      headerCell("Current", 12),
      headerCell("Unit", 8),
      headerCell("Min", 10),
      headerCell("Status", 11),
      headerCell("Value (Rs.)", 12),
    ],
  });

  const bodyRows = rows.map((r, i) => {
    const status = stockStatus(r);
    const statusColor = status === "Out of Stock" ? "B91C1C" : status === "Low Stock" ? "B45309" : "15803D";
    const statusFill = status === "Out of Stock" ? "FEE2E2" : status === "Low Stock" ? "FEF3C7" : undefined;
    return new TableRow({
      children: [
        bodyCell(String(i + 1), { align: AlignmentType.CENTER }),
        bodyCell(r.name),
        bodyCell(r.category, { align: AlignmentType.CENTER }),
        bodyCell(fmtQty(r.currentStock), { align: AlignmentType.RIGHT }),
        bodyCell(r.unit, { align: AlignmentType.CENTER }),
        bodyCell(fmtQty(r.minStock), { align: AlignmentType.RIGHT }),
        bodyCell(status, { align: AlignmentType.CENTER, bold: true, color: statusColor, fill: statusFill }),
        bodyCell(fmtMoney(r.currentStock * r.costPrice), { align: AlignmentType.RIGHT }),
      ],
    });
  });

  const totalsRow = new TableRow({
    children: [
      bodyCell(""),
      bodyCell(`TOTAL (${totals.totalItems} items)`, { bold: true, fill: "F3F4F6" }),
      bodyCell("", { fill: "F3F4F6" }),
      bodyCell("", { fill: "F3F4F6" }),
      bodyCell("", { fill: "F3F4F6" }),
      bodyCell("", { fill: "F3F4F6" }),
      bodyCell(`${totals.lowStockCount} low / ${totals.outOfStockCount} out`, { align: AlignmentType.CENTER, bold: true, fill: "F3F4F6" }),
      bodyCell(fmtMoney(totals.totalStockValue), { align: AlignmentType.RIGHT, bold: true, fill: "F3F4F6" }),
    ],
  });

  const table = new Table({
    rows: [headerRow, ...bodyRows, totalsRow],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "E5E7EB" },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "E5E7EB" },
    },
  });

  const doc = new Document({
    creator: meta.title || "Diagnostic ERP",
    title: "Inventory Stock Report",
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: (meta.title || "Inventory Stock Report").toUpperCase(), bold: true })],
          }),
          ...(meta.subtitle
            ? [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: meta.subtitle, italics: true, size: 20, color: "6B7280" })],
              })]
            : []),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({
              text: `${meta.filterLabel ?? "All items"}    Generated: ${meta.generatedAt}`,
              size: 18, color: "6B7280",
            })],
          }),
          new Paragraph({ children: [new TextRun({ text: "" })] }),
          new Paragraph({
            children: [
              new TextRun({ text: "Summary: ", bold: true, size: 20 }),
              new TextRun({ text: `${totals.totalItems} items · `, size: 20 }),
              new TextRun({ text: `${totals.lowStockCount} low stock · `, size: 20, color: "B45309" }),
              new TextRun({ text: `${totals.outOfStockCount} out of stock · `, size: 20, color: "B91C1C" }),
              new TextRun({ text: `Total stock value Rs. ${fmtMoney(totals.totalStockValue)}`, size: 20, bold: true }),
            ],
          }),
          new Paragraph({ children: [new TextRun({ text: "" })] }),
          table,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const saveAs = await loadSaveAs();
  saveAs(blob, defaultFilename("docx"));
}
