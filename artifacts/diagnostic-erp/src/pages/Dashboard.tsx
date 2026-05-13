import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "@/lib/fetchApi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import { readStaffSession, FULL_ACCESS_ROLES } from "@/lib/staffSession";
import { SummaryExportToolbar } from "@/components/SummaryExport";
import type { ExportConfig } from "@/components/SummaryExport";
import {
  Users, TrendingUp, TrendingDown, IndianRupee, FileText, AlertTriangle,
  Activity, Wallet, Banknote, Smartphone, RotateCcw, XCircle, FileEdit,
  ChevronDown, ChevronUp, ArrowRight, CheckCircle2, Clock, ShieldAlert,
  BarChart3, Calendar, RefreshCw,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from "recharts";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

type OverallSummary = {
  grossBilling: number;
  outstanding: number;
  refundsAndCancellations: number;
  refundAmount: number;
  cancelledAmount: number;
  totalReceived: number;
  digitalCollection: number;
  cashCollection: number;
  totalExpenses: number;
  discountsGiven: number;
  netCollection: number;
  physicalCashInHand: number;
  pendingReports: number;
};

type StaffComparisonRow = {
  staffName: string;
  billCount: number;
  totalBilling: number;
  totalReceived: number;
  cashCollection: number;
  digitalCollection: number;
  discountsGiven: number;
  refundAmount: number;
  cancellationCount: number;
  cancelledAmount: number;
  billEditCount: number;
  voucherEditCount: number;
  cashExpenses: number;
  netCashHandled: number;
};

type ModalityRow = {
  modality: string;
  testCount: number;
  grossBilling: number;
  completedReports: number;
  pendingReports: number;
};

type DashboardAlert = {
  type: string;
  message: string;
  severity: "warning" | "info" | "critical";
  staffName?: string;
};

type AdvancedSummary = {
  from: string;
  to: string;
  overallSummary: OverallSummary;
  staffComparison: StaffComparisonRow[];
  modalitySummary: ModalityRow[];
  alerts: DashboardAlert[];
};

type IncomeExpenseApiRow = {
  date: string;
  income: { total: number; cash: number; upi: number; card: number; bank: number; insurance: number; cheque: number };
  expense: { amount: number; count: number };
  net: number;
};
type IncomeExpensePayload = {
  rows: IncomeExpenseApiRow[];
  totals: { income: number; expense: number; net: number; cash: number; upi: number; card: number };
};

type DailySummaryBillEdit = {
  id: number;
  billId: number;
  billNumber: string;
  editedBy: string;
  reason: string;
  changeType: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
};

type DailySummaryData = {
  date: string;
  summary: {
    totalBilling: number;
    outstanding: number;
    refundsAndCancellations: number;
    expenses: number;
    netCollection: number;
    digitalCollection: number;
    physicalCashInHand: number;
    discountsGiven: number;
    billCount: number;
    orderCount: number;
  };
  byMethod: Record<string, number>;
  bills: {
    id: number;
    billNumber: string;
    patientName: string;
    totalAmount: number;
    paidAmount: number;
    balanceAmount: number;
    discount: number;
    status: string;
    createdAt: string;
    createdByName: string;
  }[];
  billEdits: DailySummaryBillEdit[];
  voucherEdits: { id: number; editedBy: string; reason: string; createdAt: string }[];
  refunds: { id: number; billId: number; amount: number; method: string; createdAt: string; recordedByName: string }[];
  cancelledBillsDetail: { id: number; billNumber: string; patientName: string; totalAmount: number; createdByName: string; cancelledAt: string }[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}
function fmtK(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}k`;
  return `₹${n.toFixed(0)}`;
}
function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }); }
  catch { return ""; }
}

const MODALITY_COLORS: Record<string, string> = {
  MRI: "#7c3aed", CT: "#2563eb", "X-Ray": "#0891b2", USG: "#0d9488",
  Pathology: "#16a34a", ECG: "#ca8a04", Mammography: "#db2777",
  Cardiology: "#dc2626", Endoscopy: "#9333ea", Other: "#64748b",
};
function modalityColor(m: string) { return MODALITY_COLORS[m] ?? "#64748b"; }

// ─── Small UI Components ──────────────────────────────────────────────────────

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-2">{children}</h3>
      {action}
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, sub, iconBg, accentBorder, highlight,
}: {
  icon: React.ElementType; label: string; value: string | number; sub?: string;
  iconBg: string; accentBorder?: string; highlight?: boolean;
}) {
  return (
    <div className={`bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border-l-4 ${accentBorder ?? "border-l-primary"} ${highlight ? "ring-2 ring-blue-200 dark:ring-blue-800" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-gray-900 dark:text-foreground leading-none">{value}</p>
          {sub && <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-xl flex-shrink-0 ${iconBg}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

function SpotlightCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color: string;
}) {
  return (
    <div className={`rounded-xl border p-3 ${color}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={13} className="opacity-70" />
        <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</span>
      </div>
      <p className="text-base font-bold leading-tight">{value}</p>
      {sub && <p className="text-xs opacity-70 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

// ─── Financial Reconciliation ─────────────────────────────────────────────────

function RecRow({ label, value, type, note }: {
  label: string; value: number; type: "start" | "deduct" | "result" | "final"; note?: string;
}) {
  const isDeduct = type === "deduct";
  const isResult = type === "result" || type === "final";
  return (
    <div className={`flex items-center justify-between py-1.5 ${isResult ? "font-bold" : ""}`}>
      <span className={`text-sm ${isDeduct ? "text-red-600 dark:text-red-400 pl-4" : isResult ? "text-gray-900 dark:text-foreground" : "text-gray-800 dark:text-gray-200"}`}>
        {label}
        {note && <span className="text-xs font-normal text-gray-400 ml-1">({note})</span>}
      </span>
      <span className={`tabular-nums text-sm ${isDeduct ? "text-red-600 dark:text-red-400" : isResult ? type === "final" ? "text-blue-700 dark:text-blue-300 text-base" : "text-green-700 dark:text-green-400" : "text-gray-800 dark:text-gray-200"}`}>
        {isDeduct ? `−\u2009${fmt(value)}` : fmt(value)}
      </span>
    </div>
  );
}

function ReconciliationFlow({ s }: { s: OverallSummary }) {
  return (
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-card-border bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
        <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
          <BarChart3 size={14} className="text-blue-600" /> Daily Financial Reconciliation
        </h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Step-by-step cash flow verification</p>
      </div>
      <div className="p-4 space-y-0">
        <RecRow label="Gross Billing" value={s.grossBilling} type="start" />
        <RecRow label="− Outstanding / Dues" value={s.outstanding} type="deduct" />
        <RecRow label="− Refunds & Cancellations" value={s.refundsAndCancellations} type="deduct"
          note={`₹${s.refundAmount.toFixed(0)} refunds + ₹${s.cancelledAmount.toFixed(0)} cancelled`} />
        <RecRow label="− Cash Expenses" value={s.totalExpenses} type="deduct" />
        <div className="my-2 border-t-2 border-green-200 dark:border-green-800" />
        <RecRow label="= Net Collection" value={s.netCollection} type="result" />
        <div className="my-2 border-t border-dashed border-gray-200 dark:border-gray-700" />
        <RecRow label="− Digital Collection" value={s.digitalCollection} type="deduct" />
        <div className="my-2 border-t-2 border-blue-200 dark:border-blue-800" />
        <RecRow label="= Physical Cash in Hand" value={s.physicalCashInHand} type="final" />

        {/* Visual summary row */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 p-2.5 text-center">
            <p className="text-xs text-violet-700 dark:text-violet-400 font-semibold uppercase tracking-wide">Digital</p>
            <p className="text-base font-bold text-violet-800 dark:text-violet-200">{fmt(s.digitalCollection)}</p>
          </div>
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-2.5 text-center">
            <p className="text-xs text-blue-700 dark:text-blue-400 font-semibold uppercase tracking-wide">Physical Cash</p>
            <p className="text-base font-bold text-blue-800 dark:text-blue-200">{fmt(s.physicalCashInHand)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modality Section ─────────────────────────────────────────────────────────

function ModalitySection({ rows }: { rows: ModalityRow[] }) {
  const [showTable, setShowTable] = useState(false);
  if (rows.length === 0) {
    return (
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-6 text-center text-sm text-gray-500">
        No test data for this period.
      </div>
    );
  }
  const totalTests = rows.reduce((s, r) => s + r.testCount, 0);
  const totalBilling = rows.reduce((s, r) => s + r.grossBilling, 0);

  return (
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-card-border flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
          <Activity size={14} className="text-violet-600" /> Modality-wise Business Summary
        </h3>
        <span className="text-xs text-gray-600">{totalTests} tests · {fmt(totalBilling)}</span>
      </div>

      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {rows.map((r) => (
          <div key={r.modality} className="rounded-lg border border-gray-100 dark:border-card-border bg-gray-50 dark:bg-muted/20 p-3 hover:shadow-sm transition-shadow">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: modalityColor(r.modality) }} />
              <span className="text-xs font-bold text-gray-800 dark:text-foreground truncate">{r.modality}</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-foreground leading-none">{fmtK(r.grossBilling)}</p>
            <p className="text-xs text-gray-700 dark:text-gray-400 mt-1">{r.testCount} test{r.testCount === 1 ? "" : "s"}</p>
            <div className="mt-1.5 flex gap-2 text-[10px]">
              <span className="text-green-700 dark:text-green-400 font-semibold">✓ {r.completedReports}</span>
              {r.pendingReports > 0 && <span className="text-amber-600 dark:text-amber-400 font-semibold">⏳ {r.pendingReports}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 pb-4">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={rows} margin={{ top: 0, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="modality" tick={{ fontSize: 11, fill: "#374151", fontWeight: 600 }} />
            <YAxis tick={{ fontSize: 10, fill: "#374151" }} tickFormatter={fmtK} />
            <Tooltip
              formatter={(v: number, name: string) => [fmt(v), name === "grossBilling" ? "Billing" : "Tests"]}
              contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "12px", color: "#111827" }}
            />
            <Legend wrapperStyle={{ fontSize: "11px", color: "#374151" }} />
            <Bar dataKey="grossBilling" name="Billing" radius={[4, 4, 0, 0]}>
              {rows.map((r) => <Cell key={r.modality} fill={modalityColor(r.modality)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="border-t border-gray-100 dark:border-card-border">
        <button onClick={() => setShowTable((v) => !v)} className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:hover:bg-muted/30 transition-colors">
          <span>Detailed Table</span>
          {showTable ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        {showTable && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-muted/30">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-700 dark:text-gray-300">Modality</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-700 dark:text-gray-300">Tests</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-700 dark:text-gray-300">Gross Billing</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-700 dark:text-gray-300">Completed</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-700 dark:text-gray-300">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                {rows.map((r) => (
                  <tr key={r.modality} className="hover:bg-gray-50 dark:hover:bg-muted/20">
                    <td className="px-3 py-2 font-semibold text-gray-800 dark:text-foreground">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: modalityColor(r.modality) }} />
                        {r.modality}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{r.testCount}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-foreground tabular-nums">{fmt(r.grossBilling)}</td>
                    <td className="px-3 py-2 text-right text-green-700 dark:text-green-400 tabular-nums">{r.completedReports}</td>
                    <td className="px-3 py-2 text-right text-amber-600 dark:text-amber-400 tabular-nums">{r.pendingReports}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-muted/30 border-t-2 border-gray-200">
                <tr>
                  <td className="px-3 py-2 font-bold text-gray-800 dark:text-foreground">Total</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{totalTests}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{fmt(totalBilling)}</td>
                  <td className="px-3 py-2 text-right font-bold text-green-700 tabular-nums">{rows.reduce((s, r) => s + r.completedReports, 0)}</td>
                  <td className="px-3 py-2 text-right font-bold text-amber-600 tabular-nums">{rows.reduce((s, r) => s + r.pendingReports, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Staff Comparison Section ─────────────────────────────────────────────────

const SUSPICIOUS_DISCOUNT_PCT = 0.2;
const SUSPICIOUS_CANCELLATIONS = 3;
const SUSPICIOUS_EDITS = 4;

function StaffComparisonSection({ rows }: { rows: StaffComparisonRow[] }) {
  const [showAll, setShowAll] = useState(false);
  if (rows.length === 0) {
    return (
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-6 text-center text-sm text-gray-500">
        No staff activity for this period.
      </div>
    );
  }

  const topBilling = rows.reduce((best, r) => r.totalBilling > best.totalBilling ? r : best, rows[0]);
  const topCash = rows.reduce((best, r) => r.cashCollection > best.cashCollection ? r : best, rows[0]);
  const topDiscount = rows.reduce((best, r) => r.discountsGiven > best.discountsGiven ? r : best, rows[0]);
  const topCancels = rows.reduce((best, r) => r.cancellationCount > best.cancellationCount ? r : best, rows[0]);
  const topEdits = rows.reduce((best, r) =>
    (r.billEditCount + r.voucherEditCount) > (best.billEditCount + best.voucherEditCount) ? r : best, rows[0]);

  const visibleRows = showAll ? rows : rows.slice(0, 8);

  function rowFlags(r: StaffComparisonRow) {
    const flags: string[] = [];
    if (r.totalBilling > 0 && r.discountsGiven / r.totalBilling >= SUSPICIOUS_DISCOUNT_PCT) flags.push("high-discount");
    if (r.cancellationCount >= SUSPICIOUS_CANCELLATIONS) flags.push("cancellations");
    if (r.billEditCount + r.voucherEditCount >= SUSPICIOUS_EDITS) flags.push("edits");
    if (r.totalBilling > 1000 && r.totalReceived < r.totalBilling * 0.5) flags.push("low-collection");
    return flags;
  }

  function rowBg(flags: string[]) {
    if (flags.includes("high-discount") && flags.length >= 2) return "bg-orange-50 dark:bg-orange-950/20";
    if (flags.length > 0) return "bg-amber-50/50 dark:bg-amber-950/10";
    return "";
  }

  return (
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-card-border">
        <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
          <Users size={14} className="text-blue-600" /> Staff Collection Comparison
        </h3>
      </div>

      {/* Spotlight summary cards */}
      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <SpotlightCard label="Top Billing" value={topBilling.staffName} sub={fmt(topBilling.totalBilling)} icon={TrendingUp} color="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200" />
        <SpotlightCard label="Top Cash" value={topCash.staffName} sub={fmt(topCash.cashCollection)} icon={Banknote} color="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200" />
        <SpotlightCard label="Most Discounts" value={topDiscount.staffName} sub={`${fmt(topDiscount.discountsGiven)}${topDiscount.totalBilling > 0 ? ` (${((topDiscount.discountsGiven / topDiscount.totalBilling) * 100).toFixed(0)}%)` : ""}`} icon={TrendingDown} color="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200" />
        <SpotlightCard label="Most Cancellations" value={topCancels.cancellationCount > 0 ? topCancels.staffName : "—"} sub={topCancels.cancellationCount > 0 ? `${topCancels.cancellationCount} bill${topCancels.cancellationCount === 1 ? "" : "s"}` : "None"} icon={XCircle} color="bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200" />
        <SpotlightCard label="Most Edits" value={(topEdits.billEditCount + topEdits.voucherEditCount) > 0 ? topEdits.staffName : "—"} sub={(topEdits.billEditCount + topEdits.voucherEditCount) > 0 ? `${topEdits.billEditCount + topEdits.voucherEditCount} edit${topEdits.billEditCount + topEdits.voucherEditCount === 1 ? "" : "s"}` : "None"} icon={FileEdit} color="bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-200" />
      </div>

      {/* Staff table */}
      <div className="overflow-x-auto border-t border-gray-100 dark:border-card-border">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-muted/30 sticky top-0">
            <tr>
              {["Staff", "Bills", "Total Billing", "Total Received", "Cash", "Digital", "Discounts", "Refunds", "Cancels", "Edits", "Net Cash"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-right first:text-left font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-card-border">
            {visibleRows.map((r) => {
              const flags = rowFlags(r);
              const discountPct = r.totalBilling > 0 ? (r.discountsGiven / r.totalBilling) * 100 : 0;
              const totalEdits = r.billEditCount + r.voucherEditCount;
              return (
                <tr key={r.staffName} className={`hover:bg-gray-50 dark:hover:bg-muted/20 ${rowBg(flags)}`}>
                  <td className="px-3 py-2 font-semibold text-gray-800 dark:text-foreground whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {r.staffName}
                      {flags.length > 0 && <span title={flags.join(", ")}><AlertTriangle size={11} className="text-amber-500 flex-shrink-0" /></span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{r.billCount}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-foreground tabular-nums">{fmt(r.totalBilling)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-green-700 dark:text-green-400 tabular-nums">{fmt(r.totalReceived)}</td>
                  <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{fmt(r.cashCollection)}</td>
                  <td className="px-3 py-2 text-right text-violet-700 dark:text-violet-400 tabular-nums">{fmt(r.digitalCollection)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${flags.includes("high-discount") ? "font-bold text-orange-600" : "text-gray-700"}`}>
                    {fmt(r.discountsGiven)}{discountPct >= 10 && <span className="ml-1 text-[10px]">({discountPct.toFixed(0)}%)</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-rose-600 dark:text-rose-400 tabular-nums">{r.refundAmount > 0 ? fmt(r.refundAmount) : "—"}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${flags.includes("cancellations") ? "font-bold text-orange-600" : "text-gray-700"}`}>
                    {r.cancellationCount > 0 ? r.cancellationCount : "—"}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${flags.includes("edits") ? "font-bold text-orange-600" : "text-gray-700"}`}>
                    {totalEdits > 0 ? <span title={`${r.billEditCount} bill + ${r.voucherEditCount} voucher`}>{totalEdits}</span> : "—"}
                  </td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${r.netCashHandled < 0 ? "text-red-600" : "text-blue-700 dark:text-blue-300"}`}>
                    {fmt(r.netCashHandled)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-gray-50 dark:bg-muted/30 border-t-2 border-gray-200 dark:border-card-border">
              <tr>
                <td className="px-3 py-2 font-bold text-gray-800 dark:text-foreground">Total</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums">{rows.reduce((s, r) => s + r.billCount, 0)}</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums text-gray-900 dark:text-foreground">{fmt(rows.reduce((s, r) => s + r.totalBilling, 0))}</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums text-green-700">{fmt(rows.reduce((s, r) => s + r.totalReceived, 0))}</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums">{fmt(rows.reduce((s, r) => s + r.cashCollection, 0))}</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums text-violet-700">{fmt(rows.reduce((s, r) => s + r.digitalCollection, 0))}</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums">{fmt(rows.reduce((s, r) => s + r.discountsGiven, 0))}</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums text-rose-600">{fmt(rows.reduce((s, r) => s + r.refundAmount, 0))}</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums">{rows.reduce((s, r) => s + r.cancellationCount, 0) || "—"}</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums">{rows.reduce((s, r) => s + r.billEditCount + r.voucherEditCount, 0) || "—"}</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums text-blue-700">{fmt(rows.reduce((s, r) => s + r.netCashHandled, 0))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {rows.length > 8 && (
        <div className="border-t border-gray-100 dark:border-card-border px-4 py-2">
          <button onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold text-primary hover:underline">
            {showAll ? "Show less" : `Show all ${rows.length} staff members`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Alerts Strip ─────────────────────────────────────────────────────────────

function AlertsStrip({ alerts }: { alerts: DashboardAlert[] }) {
  const [expanded, setExpanded] = useState(false);
  if (alerts.length === 0) return null;
  const criticals = alerts.filter((a) => a.severity === "critical");
  const warnings = alerts.filter((a) => a.severity === "warning");
  const infos = alerts.filter((a) => a.severity === "info");
  const visible = expanded ? alerts : alerts.slice(0, 3);

  return (
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-card-border flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
          <ShieldAlert size={14} className="text-amber-600" /> Suspicious Activity Alerts
          <span className="ml-1 inline-flex items-center gap-1">
            {criticals.length > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">{criticals.length} critical</span>}
            {warnings.length > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">{warnings.length} warning</span>}
            {infos.length > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">{infos.length} info</span>}
          </span>
        </h3>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-card-border">
        {visible.map((a, i) => (
          <div key={i} className={`flex items-start gap-3 px-4 py-3 ${a.severity === "critical" ? "bg-red-50/50 dark:bg-red-950/10" : a.severity === "warning" ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}`}>
            <AlertTriangle size={14} className={`mt-0.5 flex-shrink-0 ${a.severity === "critical" ? "text-red-500" : a.severity === "warning" ? "text-amber-500" : "text-blue-500"}`} />
            <p className="text-xs text-gray-700 dark:text-gray-300">{a.message}</p>
          </div>
        ))}
      </div>
      {alerts.length > 3 && (
        <div className="border-t border-gray-100 dark:border-card-border px-4 py-2">
          <button onClick={() => setExpanded((v) => !v)} className="text-xs font-semibold text-primary hover:underline">
            {expanded ? "Show less" : `Show all ${alerts.length} alerts`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Control Logs ─────────────────────────────────────────────────────────────

type ControlLogTab = "bill-edits" | "cancellations" | "refunds";

function ControlLogs({ data }: { data: DailySummaryData | undefined }) {
  const [tab, setTab] = useState<ControlLogTab>("bill-edits");
  if (!data) return null;
  const billEdits = data.billEdits ?? [];
  const voucherEdits = data.voucherEdits ?? [];
  const allEdits = [...billEdits.map((e) => ({ ...e, source: "Bill" as const })), ...voucherEdits.map((e) => ({ id: e.id, billId: 0, billNumber: "—", editedBy: e.editedBy, reason: e.reason, changeType: "", oldValue: null, newValue: null, createdAt: e.createdAt, source: "Voucher" as const }))].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const cancellations = data.cancelledBillsDetail ?? [];
  const refunds = data.refunds ?? [];
  const totalLogs = allEdits.length + cancellations.length + refunds.length;

  if (totalLogs === 0) return null;

  const tabs: { id: ControlLogTab; label: string; count: number }[] = [
    { id: "bill-edits", label: "Bill & Voucher Edits", count: allEdits.length },
    { id: "cancellations", label: "Cancellations", count: cancellations.length },
    { id: "refunds", label: "Refunds", count: refunds.length },
  ];

  return (
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-card-border">
        <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
          <FileEdit size={14} className="text-purple-600" /> Control Logs
          <span className="text-xs font-normal text-gray-600 ml-1">— today's document activity</span>
        </h3>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 dark:border-card-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-foreground"}`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab === t.id ? "bg-primary/10 text-primary" : "bg-gray-100 dark:bg-muted text-gray-600 dark:text-gray-400"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="divide-y divide-gray-100 dark:divide-card-border max-h-72 overflow-y-auto">
        {tab === "bill-edits" && (
          allEdits.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">No edits today.</p>
          ) : (
            allEdits.map((e, i) => (
              <div key={i} className="px-4 py-2.5 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-muted/20">
                <FileEdit size={13} className="mt-0.5 text-purple-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${e.source === "Voucher" ? "bg-indigo-100 text-indigo-700" : "bg-purple-100 text-purple-700"}`}>{e.source}</span>
                    {e.billNumber && e.billNumber !== "—" && (
                      <Link href={`/billing/${e.billId}`} className="text-xs font-semibold text-primary hover:underline">{e.billNumber}</Link>
                    )}
                    <span className="text-xs text-gray-700 font-semibold">{e.editedBy}</span>
                    <span className="text-[10px] text-gray-500">{fmtTime(e.createdAt)}</span>
                  </div>
                  {e.reason && <p className="text-xs text-gray-600 mt-0.5 truncate">{e.reason}</p>}
                </div>
              </div>
            ))
          )
        )}

        {tab === "cancellations" && (
          cancellations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">No cancellations today.</p>
          ) : (
            cancellations.map((c, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-muted/20">
                <XCircle size={13} className="text-rose-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-800 dark:text-foreground">{c.patientName}</span>
                    <span className="text-xs text-gray-600">by {c.createdByName}</span>
                    <span className="text-[10px] text-gray-500">{fmtTime(c.cancelledAt)}</span>
                  </div>
                  <p className="text-xs text-rose-600 font-semibold">{fmt(c.totalAmount)}</p>
                </div>
              </div>
            ))
          )
        )}

        {tab === "refunds" && (
          refunds.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500 text-center">No refunds today.</p>
          ) : (
            refunds.map((r, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-muted/20">
                <RotateCcw size={13} className="text-amber-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/billing/${r.billId}`} className="text-xs font-semibold text-primary hover:underline">Bill #{r.billId}</Link>
                    <span className="text-xs text-gray-600">by {r.recordedByName}</span>
                    <span className="text-[10px] text-gray-500">{fmtTime(r.createdAt)}</span>
                  </div>
                  <p className="text-xs text-amber-700 font-semibold">{fmt(Math.abs(r.amount))} via {r.method}</p>
                </div>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}

// ─── Main Owner Dashboard ─────────────────────────────────────────────────────

export default function Dashboard() {
  const [, navigate] = useLocation();
  const session = readStaffSession();
  const isOwner = FULL_ACCESS_ROLES.has(session?.user.role ?? "");

  // Role guard — non-owners should not see this page
  useEffect(() => {
    if (session && !isOwner) {
      navigate("/my-daily-summary", { replace: true });
    }
  }, []);

  const today = todayISO();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  function setPreset(days: number) {
    setFrom(daysAgoISO(days - 1));
    setTo(today);
  }

  // 1. Advanced summary — for KPI cards, reconciliation, modality, staff, alerts
  const { data: advanced, isLoading: advLoading, refetch: refetchAdv } = useQuery<AdvancedSummary>({
    queryKey: ["adv-summary", from, to],
    queryFn: () => api.get(`/api/dashboard/advanced-summary?from=${from}&to=${to}`),
    staleTime: 2 * 60_000,
    enabled: isOwner,
  });

  // 2. Today's daily-summary — for control logs + recent transactions
  const { data: todayData, isLoading: todayLoading } = useQuery<DailySummaryData>({
    queryKey: ["daily-summary-today"],
    queryFn: () => api.get(`/api/daily-summary?date=${today}`),
    staleTime: 2 * 60_000,
    enabled: isOwner,
  });

  // 3. Income/Expense chart
  const { data: ieData } = useQuery<IncomeExpensePayload>({
    queryKey: ["income-expense", from, to],
    queryFn: () => api.get(`/api/reports/income-expense?from=${from}&to=${to}`),
    staleTime: 5 * 60_000,
    enabled: isOwner,
  });

  if (!isOwner) {
    return (
      <div className="p-8 text-center">
        <ShieldAlert size={40} className="text-amber-500 mx-auto mb-3" />
        <p className="font-semibold text-gray-700">You do not have permission to access Owner Dashboard.</p>
      </div>
    );
  }

  const s = advanced?.overallSummary;
  const loading = advLoading;

  // ── Export config ──────────────────────────────────────────────────────────
  const exportConfig = useMemo<ExportConfig | null>(() => {
    if (!s || !advanced) return null;
    const inr = (n: number) =>
      new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

    return {
      title: "Owner Dashboard — Financial Report",
      subtitle: from === to ? from : `${from} to ${to}`,
      sections: [
        {
          title: "Overall Financial Summary",
          metrics: [
            ["Gross Billing", inr(s.grossBilling)],
            ["Net Collection", inr(s.netCollection)],
            ["Total Received", inr(s.totalReceived)],
            ["Digital Collection (UPI / Card / Net)", inr(s.digitalCollection)],
            ["Physical Cash in Hand", inr(s.physicalCashInHand)],
            ["Outstanding / Dues", inr(s.outstanding)],
            ["Refunds & Cancellations", inr(s.refundsAndCancellations)],
            ["Cash Expenses", inr(s.totalExpenses)],
            ["Discounts Given", inr(s.discountsGiven)],
            ["Pending Reports", String(s.pendingReports)],
          ],
        },
      ],
      tables: [
        ...(advanced.staffComparison.length > 0
          ? [
              {
                title: "Staff Comparison",
                headers: ["Staff", "Bills", "Total Billing", "Received", "Cash", "Digital", "Discounts", "Cancels", "Net Cash"],
                rows: advanced.staffComparison.map((r) => [
                  r.staffName,
                  r.billCount,
                  inr(r.totalBilling),
                  inr(r.totalReceived),
                  inr(r.cashCollection),
                  inr(r.digitalCollection),
                  inr(r.discountsGiven),
                  r.cancellationCount,
                  inr(r.netCashHandled),
                ]),
              },
            ]
          : []),
        ...(advanced.modalitySummary.length > 0
          ? [
              {
                title: "Modality Summary",
                headers: ["Modality", "Tests", "Gross Billing", "Completed Reports", "Pending Reports"],
                rows: advanced.modalitySummary.map((r) => [
                  r.modality,
                  r.testCount,
                  inr(r.grossBilling),
                  r.completedReports,
                  r.pendingReports,
                ]),
              },
            ]
          : []),
        ...(todayData && todayData.bills.length > 0
          ? [
              {
                title: "Today's Transactions",
                headers: ["Bill #", "Patient", "By", "Total", "Paid", "Balance", "Status"],
                rows: todayData.bills.map((b) => [
                  b.billNumber,
                  b.patientName,
                  b.createdByName,
                  inr(b.totalAmount),
                  inr(b.paidAmount),
                  inr(b.balanceAmount),
                  b.status,
                ]),
              },
            ]
          : []),
      ],
    };
  }, [s, advanced, from, to, todayData]);

  const kpiCards = [
    { icon: IndianRupee, label: "Gross Billing", value: s ? fmt(s.grossBilling) : "—", sub: s ? `${advanced.staffComparison.reduce((n, r) => n + r.billCount, 0)} bills` : "", iconBg: "bg-emerald-100 text-emerald-700", accentBorder: "border-l-emerald-500" },
    { icon: TrendingUp, label: "Net Collection", value: s ? fmt(s.netCollection) : "—", sub: s ? `${fmt(s.totalReceived)} received` : "", iconBg: "bg-green-100 text-green-700", accentBorder: "border-l-green-500" },
    { icon: Banknote, label: "Physical Cash in Hand", value: s ? fmt(s.physicalCashInHand) : "—", sub: s ? `${fmt(s.cashCollection)} cash` : "", iconBg: "bg-blue-100 text-blue-700", accentBorder: "border-l-blue-500" },
    { icon: Smartphone, label: "Digital Collection", value: s ? fmt(s.digitalCollection) : "—", sub: "UPI / Card / Net Banking", iconBg: "bg-violet-100 text-violet-700", accentBorder: "border-l-violet-500" },
    { icon: Wallet, label: "Outstanding / Dues", value: s ? fmt(s.outstanding) : "—", sub: "Unpaid balance", iconBg: "bg-amber-100 text-amber-700", accentBorder: "border-l-amber-500" },
    { icon: RotateCcw, label: "Refunds & Cancellations", value: s ? fmt(s.refundsAndCancellations) : "—", sub: s ? `₹${s.refundAmount.toFixed(0)} refunds + ₹${s.cancelledAmount.toFixed(0)} cancelled` : "", iconBg: "bg-rose-100 text-rose-700", accentBorder: "border-l-rose-500" },
    { icon: TrendingDown, label: "Cash Expenses", value: s ? fmt(s.totalExpenses) : "—", sub: s ? `${fmt(s.discountsGiven)} discounts` : "", iconBg: "bg-orange-100 text-orange-700", accentBorder: "border-l-orange-500" },
    { icon: FileText, label: "Pending Reports", value: s ? String(s.pendingReports) : "—", sub: "Unverified results", iconBg: "bg-slate-100 text-slate-700", accentBorder: "border-l-slate-500" },
  ];

  const ieRows = ieData?.rows ?? [];
  const ieTotals = ieData?.totals;

  const billStatusColors: Record<string, string> = {
    paid: "#16a34a", partial: "#d97706", pending: "#dc2626", cancelled: "#94a3b8",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Owner Dashboard"
        subtitle={`Financial overview • ${from === to ? from : `${from} → ${to}`}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <SummaryExportToolbar
              config={exportConfig}
              emailEndpoint="/api/dashboard/my-daily-summary/send-email"
            />
            <button
              onClick={() => { void refetchAdv(); }}
              className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-primary transition-colors"
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        }
      />

      {/* ── Date Range Picker ── */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 flex-wrap flex-1">
            <Calendar size={14} className="text-gray-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Date Range:</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36 text-sm" />
            <span className="text-gray-500 text-sm">→</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36 text-sm" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {[{ label: "Today", days: 1 }, { label: "7 Days", days: 7 }, { label: "30 Days", days: 30 }, { label: "90 Days", days: 90 }].map((p) => (
              <Button key={p.label} variant="outline" size="sm" className="h-8 text-xs px-3"
                onClick={() => setPreset(p.days)}>
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 8 KPI Cards ── */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 dark:bg-muted/30 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-4 gap-4">
          {kpiCards.map((c) => (
            <KpiCard key={c.label} icon={c.icon} label={c.label} value={c.value} sub={c.sub} iconBg={c.iconBg} accentBorder={c.accentBorder} />
          ))}
        </div>
      )}

      {/* ── Financial Reconciliation ── */}
      {s && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ReconciliationFlow s={s} />

          {/* Collection method breakdown */}
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-card-border">
              <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
                <Wallet size={14} className="text-green-600" /> Collection Breakdown
              </h3>
            </div>
            <div className="p-4 space-y-2.5">
              {[
                { label: "Total Received", value: s.totalReceived, bar: 100, color: "bg-green-500" },
                { label: "Cash Collection", value: s.cashCollection, bar: s.totalReceived > 0 ? (s.cashCollection / s.totalReceived) * 100 : 0, color: "bg-blue-500" },
                { label: "Digital Collection", value: s.digitalCollection, bar: s.totalReceived > 0 ? (s.digitalCollection / s.totalReceived) * 100 : 0, color: "bg-violet-500" },
                { label: "Discounts Given", value: s.discountsGiven, bar: s.grossBilling > 0 ? (s.discountsGiven / s.grossBilling) * 100 : 0, color: "bg-amber-500" },
                { label: "Refunds Issued", value: s.refundAmount, bar: s.totalReceived > 0 ? (s.refundAmount / s.totalReceived) * 100 : 0, color: "bg-rose-500" },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{row.label}</span>
                    <span className="text-xs font-bold text-gray-900 dark:text-foreground tabular-nums">{fmt(row.value)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 dark:bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${row.color}`} style={{ width: `${Math.min(100, row.bar)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Income / Expense Chart ── */}
      {ieRows.length > 0 && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-card-border flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
              <BarChart3 size={14} className="text-blue-600" /> Income vs Expense — Period View
            </h3>
            {ieTotals && (
              <div className="flex gap-3 text-xs">
                <span className="text-green-700 dark:text-green-400 font-semibold">Income: {fmt(ieTotals.income)}</span>
                <span className="text-rose-600 dark:text-rose-400 font-semibold">Exp: {fmt(ieTotals.expense)}</span>
                <span className={`font-bold ${ieTotals.net >= 0 ? "text-blue-700" : "text-red-600"}`}>Net: {fmt(ieTotals.net)}</span>
              </div>
            )}
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ieRows} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#374151", fontWeight: 600 }} />
                <YAxis tick={{ fontSize: 10, fill: "#374151" }} tickFormatter={fmtK} />
                <Tooltip
                  formatter={(v: number, name: string) => [fmt(v), name === "income.total" ? "Income" : "Expense"]}
                  contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "12px", color: "#111827" }}
                  labelStyle={{ fontWeight: 700 }}
                />
                <Legend wrapperStyle={{ fontSize: "11px", color: "#374151" }} />
                <Bar dataKey="income.total" name="Income" fill="#16a34a" radius={[3, 3, 0, 0]} />
                <Bar dataKey="expense.amount" name="Expense" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Modality Summary ── */}
      {advanced && (
        <div>
          <SectionTitle><Activity size={14} className="text-violet-600" /> Modality-wise Summary</SectionTitle>
          <ModalitySection rows={advanced.modalitySummary} />
        </div>
      )}

      {/* ── Staff Comparison ── */}
      {advanced && (
        <div>
          <SectionTitle><Users size={14} className="text-blue-600" /> Staff Comparison</SectionTitle>
          <StaffComparisonSection rows={advanced.staffComparison} />
        </div>
      )}

      {/* ── Control Logs (today) ── */}
      {!todayLoading && todayData && (
        <div>
          <SectionTitle>
            <FileEdit size={14} className="text-purple-600" /> Control Logs
            <span className="text-xs font-normal text-gray-500 ml-1">— {today}</span>
          </SectionTitle>
          <ControlLogs data={todayData} />
        </div>
      )}

      {/* ── Alerts ── */}
      {advanced && advanced.alerts.length > 0 && (
        <AlertsStrip alerts={advanced.alerts} />
      )}

      {/* ── Recent Transactions (today) ── */}
      {todayData && todayData.bills.length > 0 && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-card-border flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
              <CheckCircle2 size={14} className="text-green-600" /> Recent Transactions — Today
            </h3>
            <Link href="/billing" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
              All bills <ArrowRight size={11} />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-muted/30">
                <tr>
                  {["Bill #", "Patient", "By", "Total", "Paid", "Balance", "Status", "Time"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                {todayData.bills.slice(0, 15).map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-muted/20">
                    <td className="px-3 py-2 font-semibold">
                      <Link href={`/billing/${b.id}`} className="text-primary hover:underline">{b.billNumber}</Link>
                    </td>
                    <td className="px-3 py-2 text-gray-800 dark:text-foreground font-semibold">{b.patientName}</td>
                    <td className="px-3 py-2 text-gray-600">{b.createdByName}</td>
                    <td className="px-3 py-2 font-semibold text-gray-900 dark:text-foreground tabular-nums">{fmt(b.totalAmount)}</td>
                    <td className="px-3 py-2 text-green-700 dark:text-green-400 tabular-nums">{fmt(b.paidAmount)}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: b.balanceAmount > 0 ? "#dc2626" : "#16a34a" }}>{fmt(b.balanceAmount)}</td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold capitalize" style={{ background: `${billStatusColors[b.status] ?? "#94a3b8"}22`, color: billStatusColors[b.status] ?? "#94a3b8" }}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                      <span className="flex items-center gap-1"><Clock size={10} /> {fmtTime(b.createdAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
