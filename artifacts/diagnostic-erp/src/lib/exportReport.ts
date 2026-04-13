/**
 * Report export utilities — PDF, Excel, Word
 * Supports the Referral Commission Report format (per-doctor test tables).
 */

import { saveAs } from "file-saver";

// ─── Shared Types ─────────────────────────────────────────────────────────────
export type ExportTestRow = {
  testName: string;
  count: number;
  rateLabel: string; // e.g. "10%" or "₹50.00"
  commission: number;
};

export type ExportDoctorSection = {
  label: string;        // "a)", "b)"…
  doctorName: string;
  specialization: string;
  orderCount: number;
  testCount: number;
  effectiveRate: number;
  totalRevenue: number;
  totalCommission: number;
  rows: ExportTestRow[];
};

export type ReportMeta = {
  title: string;
  subtitle?: string;
  from: string;
  to: string;
  doctorFilter: string; // "All Doctors" or specific name
  generatedAt: string;
  grandTotal?: {
    doctors: number;
    orders: number;
    revenue: number;
    commission: number;
  };
};

const INR = (n: number) =>
  "Rs." + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── PDF Export ──────────────────────────────────────────────────────────────
export async function exportPDF(
  sections: ExportDoctorSection[],
  meta: ReportMeta,
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 18;

  // Header
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(meta.title.toUpperCase(), pageW / 2, y, { align: "center" });
  y += 7;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Date Range: ${meta.from}  to  ${meta.to}`, 14, y);
  doc.text(`Doctor: ${meta.doctorFilter}`, pageW / 2, y, { align: "center" });
  doc.text(`Generated: ${meta.generatedAt}`, pageW - 14, y, { align: "right" });
  y += 10;
  doc.setTextColor(0);

  // Grand summary row
  if (meta.grandTotal) {
    const g = meta.grandTotal;
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(217, 119, 6);
    doc.roundedRect(14, y, pageW - 28, 10, 2, 2, "FD");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    const summaryText = `Doctors: ${g.doctors}   Orders: ${g.orders}   Revenue: ${INR(g.revenue)}   Commission: ${INR(g.commission)}`;
    doc.text(summaryText, pageW / 2, y + 6.5, { align: "center" });
    y += 14;
  }

  // Per-doctor sections
  for (const section of sections) {
    // Section header
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`${section.label} ${section.doctorName}`, 14, y);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(
      `${section.specialization}  ·  ${section.orderCount} orders  ·  ${section.testCount} tests  ·  Eff. Rate: ${section.effectiveRate}%`,
      14, y + 5,
    );
    doc.setTextColor(0);
    y += 9;

    // Table
    autoTable(doc, {
      startY: y,
      head: [["Test Name", "No of Tests", "% / Fixed", "Total Amount"]],
      body: [
        ...section.rows.map(r => [r.testName, String(r.count), r.rateLabel, INR(r.commission)]),
        ["", "", "Total →", INR(section.totalCommission)],
      ],
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [243, 244, 246], textColor: [80, 80, 80], fontStyle: "bold", fontSize: 8 },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { halign: "center", cellWidth: 28 },
        2: { halign: "center", cellWidth: 28 },
        3: { halign: "right", cellWidth: 36 },
      },
      bodyStyles: { textColor: [30, 30, 30] },
      didDrawRow: (data) => {
        if (data.row.index === section.rows.length) {
          // Total row styling
          doc.setFillColor(255, 251, 235);
        }
      },
      willDrawCell: (data) => {
        if (data.row.index === section.rows.length) {
          doc.setFillColor(255, 251, 235);
          doc.setFont("helvetica", "bold");
          if (data.column.index === 3) doc.setTextColor(180, 83, 9);
        }
      },
      margin: { left: 14, right: 14 },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

    if (y > 260) { doc.addPage(); y = 20; }
  }

  doc.save(`${meta.title.replace(/\s+/g, "_")}_${meta.from}_to_${meta.to}.pdf`);
}

// ─── Excel Export ─────────────────────────────────────────────────────────────
export async function exportExcel(
  sections: ExportDoctorSection[],
  meta: ReportMeta,
): Promise<void> {
  const XLSX = await import("xlsx");

  const wb = XLSX.utils.book_new();

  // ── Summary sheet ──
  const summaryRows: (string | number)[][] = [
    [meta.title],
    [`Date Range: ${meta.from} to ${meta.to}`],
    [`Doctor: ${meta.doctorFilter}`],
    [`Generated: ${meta.generatedAt}`],
    [],
  ];

  if (meta.grandTotal) {
    const g = meta.grandTotal;
    summaryRows.push(["Doctors with Referrals", "Total Orders", "Total Revenue", "Commission Payable"]);
    summaryRows.push([g.doctors, g.orders, g.revenue, g.commission]);
    summaryRows.push([]);
  }

  summaryRows.push(["Doctor", "Specialization", "Orders", "Tests", "Total Revenue", "Total Commission", "Eff. Rate %"]);
  for (const s of sections) {
    summaryRows.push([
      s.doctorName, s.specialization, s.orderCount, s.testCount,
      s.totalRevenue, s.totalCommission, s.effectiveRate,
    ]);
  }

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
  summaryWs["!cols"] = [{ wch: 28 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 18 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

  // ── Per-doctor detail sheet ──
  const detailRows: (string | number)[][] = [
    [meta.title],
    [`Date Range: ${meta.from} to ${meta.to}`, "", "", `Doctor: ${meta.doctorFilter}`],
    [],
  ];

  for (const s of sections) {
    detailRows.push([`${s.label} ${s.doctorName}`, s.specialization, `${s.orderCount} orders`, `Eff. Rate: ${s.effectiveRate}%`]);
    detailRows.push(["Test Name", "No of Tests", "% / Fixed", "Total Amount (₹)"]);
    for (const r of s.rows) {
      detailRows.push([r.testName, r.count, r.rateLabel, r.commission]);
    }
    detailRows.push(["", "", "Total →", s.totalCommission]);
    detailRows.push([]);
  }

  const detailWs = XLSX.utils.aoa_to_sheet(detailRows);
  detailWs["!cols"] = [{ wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, detailWs, "Detailed Report");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  saveAs(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${meta.title.replace(/\s+/g, "_")}_${meta.from}_to_${meta.to}.xlsx`,
  );
}

// ─── Word Export ──────────────────────────────────────────────────────────────
export async function exportWord(
  sections: ExportDoctorSection[],
  meta: ReportMeta,
): Promise<void> {
  const {
    Document, Packer, Paragraph, Table, TableRow, TableCell,
    TextRun, HeadingLevel, AlignmentType, WidthType, BorderStyle,
    ShadingType,
  } = await import("docx");

  const AMBER_BG = "FEF3C7";
  const HEADER_BG = "F3F4F6";

  const cellBorder = {
    top: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
    left: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
    right: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
  };

  const makeCell = (text: string, opts: { bold?: boolean; bg?: string; align?: typeof AlignmentType[keyof typeof AlignmentType]; color?: string } = {}) =>
    new TableCell({
      shading: opts.bg ? { type: ShadingType.CLEAR, fill: opts.bg } : undefined,
      borders: cellBorder,
      children: [new Paragraph({
        alignment: opts.align ?? AlignmentType.LEFT,
        children: [new TextRun({ text, bold: opts.bold, color: opts.color ?? "1A1A1A", size: 20 })],
      })],
    });

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      text: meta.title.toUpperCase(),
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Date Range: ${meta.from}  to  ${meta.to}`, size: 18, color: "555555" }),
        new TextRun({ text: `   |   Doctor: ${meta.doctorFilter}`, size: 18, color: "555555" }),
      ],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [new TextRun({ text: `Generated: ${meta.generatedAt}`, size: 16, color: "888888", italics: true })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ text: "" }),
  ];

  // Grand total summary table
  if (meta.grandTotal) {
    const g = meta.grandTotal;
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              makeCell("Doctors with Referrals", { bold: true, bg: AMBER_BG }),
              makeCell("Total Orders", { bold: true, bg: AMBER_BG }),
              makeCell("Total Revenue", { bold: true, bg: AMBER_BG }),
              makeCell("Commission Payable", { bold: true, bg: AMBER_BG }),
            ],
          }),
          new TableRow({
            children: [
              makeCell(String(g.doctors), { align: AlignmentType.CENTER }),
              makeCell(String(g.orders), { align: AlignmentType.CENTER }),
              makeCell(INR(g.revenue), { align: AlignmentType.RIGHT }),
              makeCell(INR(g.commission), { bold: true, color: "B45309", align: AlignmentType.RIGHT }),
            ],
          }),
        ],
      }),
      new Paragraph({ text: "" }),
    );
  }

  // Per-doctor sections
  for (const section of sections) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${section.label} ${section.doctorName}`, bold: true, size: 24 }),
          new TextRun({ text: `  —  ${section.specialization}  ·  ${section.orderCount} orders  ·  Eff. Rate: ${section.effectiveRate}%`, size: 18, color: "666666" }),
        ],
        spacing: { before: 200 },
      }),
    );

    const tableRows = [
      // Header
      new TableRow({
        tableHeader: true,
        children: [
          makeCell("Test Name",    { bold: true, bg: HEADER_BG }),
          makeCell("No of Tests",  { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
          makeCell("% / Fixed",    { bold: true, bg: HEADER_BG, align: AlignmentType.CENTER }),
          makeCell("Total Amount", { bold: true, bg: HEADER_BG, align: AlignmentType.RIGHT }),
        ],
      }),
      // Data rows
      ...section.rows.map(r =>
        new TableRow({
          children: [
            makeCell(r.testName),
            makeCell(String(r.count), { align: AlignmentType.CENTER }),
            makeCell(r.rateLabel, { align: AlignmentType.CENTER }),
            makeCell(INR(r.commission), { align: AlignmentType.RIGHT }),
          ],
        }),
      ),
      // Total row
      new TableRow({
        children: [
          makeCell("", { bg: AMBER_BG }),
          makeCell("", { bg: AMBER_BG }),
          makeCell("Total →", { bold: true, bg: AMBER_BG, align: AlignmentType.RIGHT }),
          makeCell(INR(section.totalCommission), { bold: true, bg: AMBER_BG, color: "B45309", align: AlignmentType.RIGHT }),
        ],
      }),
    ];

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: tableRows,
      }),
      new Paragraph({ text: "" }),
    );
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${meta.title.replace(/\s+/g, "_")}_${meta.from}_to_${meta.to}.docx`);
}
