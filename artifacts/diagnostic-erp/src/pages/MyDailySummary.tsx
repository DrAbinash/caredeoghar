import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import { readStaffSession, FULL_ACCESS_ROLES } from "@/lib/staffSession";
import PageHeader from "@/components/PageHeader";
import { SummaryExportToolbar } from "@/components/SummaryExport";
import type { ExportConfig } from "@/components/SummaryExport";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  IndianRupee, Wallet, Banknote, Smartphone, TrendingDown, RotateCcw,
  XCircle, FileEdit, Clock, Calendar, RefreshCw, Tag, CheckCircle2,
  ArrowRight, User,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type MyDailySummarySummary = {
  grossBilling: number;
  outstanding: number;
  refundsAndCancellations: number;
  refundAmount: number;
  cancelledAmount: number;
  cashExpenses: number;
  totalReceived: number;
  digitalCollection: number;
  cashCollection: number;
  physicalCashInHand: number;
  discountsGiven: number;
  cancellationCount: number;
  billCount: number;
  closingCashBalance: number;
  cancelledByOthersCount: number;
  cancelledBySelfCount: number;
};

type MyDailySummaryData = {
  staffName: string;
  isFiltered: boolean;
  from: string;
  to: string;
  summary: MyDailySummarySummary;
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
  }[];
  payments: {
    id: number;
    billId: number;
    amount: number;
    method: string;
    createdAt: string;
  }[];
  billEdits: {
    id: number;
    billId: number;
    billNumber: string;
    editedBy: string;
    reason: string;
    changeType: string;
    oldValue: string | null;
    newValue: string | null;
    createdAt: string;
  }[];
  cancelledByMe: {
    id: number;
    billNumber: string;
    totalAmount: number;
    originalCreator: string;
  }[];
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
function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }); }
  catch { return ""; }
}

// ─── Small Components ─────────────────────────────────────────────────────────

function MiniKpi({ icon: Icon, label, value, sub, iconBg, border }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string;
  iconBg: string; border: string;
}) {
  return (
    <div className={`bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4 shadow-sm border-l-4 ${border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider leading-tight">{label}</p>
          <p className="mt-1.5 text-xl font-bold text-gray-900 dark:text-foreground leading-none">{value}</p>
          {sub && <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg flex-shrink-0 ${iconBg}`}>
          <Icon size={15} />
        </div>
      </div>
    </div>
  );
}

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

// ─── My Daily Summary Page ────────────────────────────────────────────────────

export default function MyDailySummary() {
  const session = readStaffSession();
  const isOwner = FULL_ACCESS_ROLES.has(session?.user.role ?? "");

  const today = todayISO();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [staffFilter, setStaffFilter] = useState("");

  function setPreset(days: number) {
    setFrom(daysAgoISO(days - 1));
    setTo(today);
  }

  const queryParams = new URLSearchParams({ from, to });
  if (isOwner && staffFilter.trim()) queryParams.set("staffName", staffFilter.trim());

  const { data, isLoading, refetch } = useQuery<MyDailySummaryData>({
    queryKey: ["my-daily-summary", from, to, staffFilter],
    queryFn: () => api.get(`/api/dashboard/my-daily-summary?${queryParams}`),
    staleTime: 2 * 60_000,
  });

  const s = data?.summary;

  // ── Export config (memoised so PDF/Excel/Print never re-compute unless data changes) ──
  const exportConfig = useMemo<ExportConfig | null>(() => {
    if (!data || !s) return null;
    const inr = (n: number) =>
      new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

    return {
      title: `My Daily Summary — ${data.staffName}`,
      subtitle: data.from === data.to ? data.from : `${data.from} to ${data.to}`,
      sections: [
        {
          title: "Financial Summary",
          metrics: [
            ["Bills Created", String(s.billCount)],
            ["Gross Billing", inr(s.grossBilling)],
            ["Outstanding / Dues", inr(s.outstanding)],
            ["Total Received", inr(s.totalReceived)],
            ["Digital Collection (UPI / Card / Net)", inr(s.digitalCollection)],
            ["Cash Collection", inr(s.cashCollection)],
            ["Cash Expenses (approved by me)", inr(s.cashExpenses)],
            ["Physical Cash in Hand", inr(s.physicalCashInHand)],
            ["Discounts Given", inr(s.discountsGiven)],
            ["Refunds & Cancellations", inr(s.refundsAndCancellations)],
            ["Cancellation Count", String(s.cancellationCount)],
          ],
        },
        ...(Object.keys(data.byMethod).length > 0
          ? [
              {
                title: "Collection by Payment Method",
                metrics: Object.entries(data.byMethod)
                  .sort((a, b) => b[1] - a[1])
                  .map(([m, v]) => [m.charAt(0).toUpperCase() + m.slice(1), inr(v)] as [string, string]),
              },
            ]
          : []),
      ],
      tables: [
        ...(data.bills.length > 0
          ? [
              {
                title: "Bills",
                headers: ["Bill #", "Patient", "Total", "Paid", "Balance", "Discount", "Status"],
                rows: data.bills.map((b) => [
                  b.billNumber,
                  b.patientName,
                  inr(b.totalAmount),
                  inr(b.paidAmount),
                  inr(b.balanceAmount),
                  b.discount > 0 ? inr(b.discount) : "—",
                  b.status,
                ]),
              },
            ]
          : []),
        ...(data.payments.length > 0
          ? [
              {
                title: "Payments Collected",
                headers: ["Bill ID", "Amount", "Method"],
                rows: data.payments.map((p) => [`#${p.billId}`, inr(p.amount), p.method]),
              },
            ]
          : []),
        ...(data.billEdits.length > 0
          ? [
              {
                title: "Bill Edits",
                headers: ["Bill #", "Change Type", "Reason"],
                rows: data.billEdits.map((e) => [e.billNumber, e.changeType ?? "—", e.reason ?? "—"]),
              },
            ]
          : []),
      ],
    };
  }, [data, s]);

  const statusColors: Record<string, string> = {
    paid: "#16a34a", partial: "#d97706", pending: "#dc2626", cancelled: "#94a3b8",
  };

  const methodLabels: Record<string, string> = {
    cash: "Cash", upi: "UPI", card: "Card", bank: "Bank Transfer",
    cheque: "Cheque", neft: "NEFT/RTGS", online: "Online",
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Daily Summary"
        subtitle={data ? `${data.staffName} • ${from === to ? from : `${from} → ${to}`}` : "Personal financial summary"}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <SummaryExportToolbar
              config={exportConfig}
              emailEndpoint="/api/dashboard/my-daily-summary/send-email"
            />
            <button
              onClick={() => { void refetch(); }}
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
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36 text-sm" />
            <span className="text-gray-500 text-sm">→</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36 text-sm" />
            {/* Admin-only staff filter */}
            {isOwner && (
              <div className="flex items-center gap-1.5">
                <User size={13} className="text-gray-400" />
                <Input
                  placeholder="Filter by staff name…"
                  value={staffFilter}
                  onChange={(e) => setStaffFilter(e.target.value)}
                  className="h-8 w-44 text-sm"
                />
              </div>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {[{ label: "Today", days: 1 }, { label: "7 Days", days: 7 }, { label: "30 Days", days: 30 }].map((p) => (
              <Button key={p.label} variant="outline" size="sm" className="h-8 text-xs px-3" onClick={() => setPreset(p.days)}>
                {p.label}
              </Button>
            ))}
          </div>
        </div>
        {data?.isFiltered && (
          <p className="mt-2 text-xs text-blue-600 font-semibold">
            Showing data for: <span className="font-bold">{data.staffName}</span>
          </p>
        )}
      </div>

      {/* ── Loading State ── */}
      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 dark:bg-muted/30 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* ── KPI Cards ── */}
      {s && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            <MiniKpi icon={IndianRupee} label="Gross Billing" value={fmt(s.grossBilling)} sub={`${s.billCount} bills`} iconBg="bg-emerald-100 text-emerald-700" border="border-l-emerald-500" />
            <MiniKpi icon={Wallet} label="Outstanding / Dues" value={fmt(s.outstanding)} sub="Unpaid balance" iconBg="bg-amber-100 text-amber-700" border="border-l-amber-500" />
            <MiniKpi icon={RotateCcw} label="Refunds & Cancellations" value={fmt(s.refundsAndCancellations)} sub={`₹${s.refundAmount.toFixed(0)} refunds + ${s.cancellationCount} cancelled`} iconBg="bg-rose-100 text-rose-700" border="border-l-rose-500" />
            <MiniKpi icon={TrendingDown} label="Cash Expenses" value={fmt(s.cashExpenses)} sub="Approved by you" iconBg="bg-orange-100 text-orange-700" border="border-l-orange-500" />
            <MiniKpi icon={CheckCircle2} label="Total Received" value={fmt(s.totalReceived)} sub="All payments collected" iconBg="bg-green-100 text-green-700" border="border-l-green-500" />
            <MiniKpi icon={Smartphone} label="Digital Collection" value={fmt(s.digitalCollection)} sub="UPI / Card / Net Banking" iconBg="bg-violet-100 text-violet-700" border="border-l-violet-500" />
            <MiniKpi icon={Banknote} label="Physical Cash in Hand" value={fmt(s.physicalCashInHand)} sub={`Cash ${fmt(s.cashCollection)} − Exp ${fmt(s.cashExpenses)}`} iconBg="bg-blue-100 text-blue-700" border="border-l-blue-500" />
            <MiniKpi icon={Tag} label="Discounts Given" value={fmt(s.discountsGiven)} sub={s.grossBilling > 0 ? `${((s.discountsGiven / s.grossBilling) * 100).toFixed(1)}% of billing` : ""} iconBg="bg-slate-100 text-slate-700" border="border-l-slate-400" />
            <MiniKpi icon={XCircle} label="Cancellation Count" value={String(s.cancellationCount)} sub={s.cancellationCount > 0 ? `₹${s.cancelledAmount.toFixed(0)} written off` : "None"} iconBg="bg-gray-100 text-gray-700" border="border-l-gray-400" />
          </div>

          {/* ── Financial Reconciliation ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Reconciliation flow */}
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-card-border bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20">
                <h3 className="text-sm font-bold text-gray-900 dark:text-foreground">My Cash Reconciliation</h3>
                <p className="text-xs text-gray-600 mt-0.5">How my collections balance out</p>
              </div>
              <div className="p-4 space-y-0">
                <RecRow label="Gross Billing" value={s.grossBilling} type="start" />
                <RecRow label="− Outstanding / Dues" value={s.outstanding} type="deduct" />
                <RecRow label="− Refunds & Cancellations" value={s.refundsAndCancellations} type="deduct"
                  note={`${s.refundAmount.toFixed(0)} refunds + ${s.cancellationCount} cancelled`} />
                <div className="my-2 border-t-2 border-green-200 dark:border-green-800" />
                <RecRow label="= Total Received" value={s.totalReceived} type="result" />
                <div className="my-2 border-t border-dashed border-gray-200 dark:border-gray-700" />
                <RecRow label="− Digital Collection" value={s.digitalCollection} type="deduct" />
                <div className="my-2 border-t border-dashed border-gray-200 dark:border-gray-700" />
                <RecRow label="= Cash Collected" value={s.cashCollection} type="result" />
                <RecRow label="− Cash Expenses" value={s.cashExpenses} type="deduct" note="approved by you" />
                <div className="my-2 border-t-2 border-blue-200 dark:border-blue-800" />
                <RecRow label="= Physical Cash in Hand" value={s.physicalCashInHand} type="final" />
              </div>
            </div>

            {/* Payment method breakdown */}
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-card-border">
                <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
                  <Wallet size={14} className="text-green-600" /> Collection by Method
                </h3>
              </div>
              <div className="p-4 space-y-2.5">
                {Object.entries(data.byMethod).length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No collections in this period.</p>
                ) : (
                  Object.entries(data.byMethod)
                    .sort((a, b) => b[1] - a[1])
                    .map(([method, amount]) => (
                      <div key={method}>
                        <div className="flex justify-between mb-1">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 capitalize">
                            {methodLabels[method.toLowerCase()] ?? method}
                          </span>
                          <span className="text-xs font-bold text-gray-900 dark:text-foreground tabular-nums">{fmt(amount)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 dark:bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${s.totalReceived > 0 ? Math.min(100, (amount / s.totalReceived) * 100) : 0}%` }}
                          />
                        </div>
                      </div>
                    ))
                )}

                {/* Bottom line summary */}
                {s.totalReceived > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-100 dark:border-card-border grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200 p-2.5 text-center">
                      <p className="text-xs text-violet-700 font-semibold">Digital</p>
                      <p className="text-sm font-bold text-violet-800">{fmt(s.digitalCollection)}</p>
                      <p className="text-[10px] text-violet-600">{s.totalReceived > 0 ? `${((s.digitalCollection / s.totalReceived) * 100).toFixed(0)}%` : "—"}</p>
                    </div>
                    <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 p-2.5 text-center">
                      <p className="text-xs text-blue-700 font-semibold">Cash in Hand</p>
                      <p className="text-sm font-bold text-blue-800">{fmt(s.physicalCashInHand)}</p>
                      <p className="text-[10px] text-blue-600">{s.totalReceived > 0 ? `${((s.cashCollection / s.totalReceived) * 100).toFixed(0)}% of received` : "—"}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Recent Bills ── */}
      {data && data.bills.length > 0 && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-card-border flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
              <IndianRupee size={14} className="text-emerald-600" /> Bills Created by Me
            </h3>
            <Link href="/billing" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
              All bills <ArrowRight size={11} />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-muted/30">
                <tr>
                  {["Bill #", "Patient", "Total", "Paid", "Balance", "Discount", "Status", "Time"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                {data.bills.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-muted/20">
                    <td className="px-3 py-2 font-semibold">
                      <Link href={`/billing/${b.id}`} className="text-primary hover:underline">{b.billNumber}</Link>
                    </td>
                    <td className="px-3 py-2 text-gray-800 dark:text-foreground font-semibold">{b.patientName}</td>
                    <td className="px-3 py-2 font-semibold text-gray-900 dark:text-foreground tabular-nums">{fmt(b.totalAmount)}</td>
                    <td className="px-3 py-2 text-green-700 dark:text-green-400 tabular-nums">{fmt(b.paidAmount)}</td>
                    <td className="px-3 py-2 tabular-nums" style={{ color: b.balanceAmount > 0 ? "#dc2626" : "#16a34a" }}>{fmt(b.balanceAmount)}</td>
                    <td className="px-3 py-2 text-amber-600 tabular-nums">{b.discount > 0 ? fmt(b.discount) : "—"}</td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold capitalize"
                        style={{ background: `${statusColors[b.status] ?? "#94a3b8"}22`, color: statusColors[b.status] ?? "#94a3b8" }}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                      <span className="flex items-center gap-1"><Clock size={10} /> {fmtTime(b.createdAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-muted/30 border-t-2 border-gray-200 dark:border-card-border">
                <tr>
                  <td className="px-3 py-2 font-bold text-gray-800 dark:text-foreground" colSpan={2}>Total ({data.bills.length} bills)</td>
                  <td className="px-3 py-2 font-bold tabular-nums text-gray-900 dark:text-foreground">{fmt(data.bills.reduce((s, b) => s + b.totalAmount, 0))}</td>
                  <td className="px-3 py-2 font-bold tabular-nums text-green-700">{fmt(data.bills.reduce((s, b) => s + b.paidAmount, 0))}</td>
                  <td className="px-3 py-2 font-bold tabular-nums text-red-600">{fmt(data.bills.reduce((s, b) => s + b.balanceAmount, 0))}</td>
                  <td className="px-3 py-2 font-bold tabular-nums text-amber-600">{fmt(data.bills.reduce((s, b) => s + b.discount, 0))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Recent Payments ── */}
      {data && data.payments.length > 0 && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-card-border">
            <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
              <Wallet size={14} className="text-green-600" /> Payments Collected by Me
            </h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-card-border max-h-64 overflow-y-auto">
            {data.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-muted/20">
                <div className="flex items-center gap-3">
                  <Banknote size={13} className="text-green-500 flex-shrink-0" />
                  <div>
                    <Link href={`/billing/${p.billId}`} className="text-xs font-semibold text-primary hover:underline">Bill #{p.billId}</Link>
                    <p className="text-[10px] text-gray-500">{fmtTime(p.createdAt)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-green-700 dark:text-green-400 tabular-nums">{fmt(p.amount)}</p>
                  <p className="text-[10px] text-gray-500 capitalize">{p.method}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Bill Edits ── */}
      {data && data.billEdits.length > 0 && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-card-border">
            <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
              <FileEdit size={14} className="text-purple-600" /> Bill Edits by Me
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700">{data.billEdits.length}</span>
            </h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-card-border max-h-56 overflow-y-auto">
            {data.billEdits.map((e) => (
              <div key={e.id} className="px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-muted/20">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/billing/${e.billId}`} className="text-xs font-semibold text-primary hover:underline">{e.billNumber}</Link>
                  {e.changeType && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-muted text-gray-600 dark:text-gray-400">{e.changeType}</span>}
                  <span className="text-[10px] text-gray-500">{fmtTime(e.createdAt)}</span>
                </div>
                {e.reason && <p className="text-xs text-gray-600 mt-0.5 truncate">{e.reason}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Cancelled by Me ── */}
      {data && data.cancelledByMe && data.cancelledByMe.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-red-200 dark:border-red-900/50">
            <h3 className="text-sm font-bold text-red-800 dark:text-red-300 flex items-center gap-2">
              <XCircle size={14} className="text-red-600" /> Bills Cancelled by Me
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                {data.cancelledByMe.length}
              </span>
            </h3>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              Cancellation liability belongs to the person who cancelled — not the original creator.
              The refund amount is counted in your Refunds &amp; Cancellations total.
            </p>
          </div>
          <div className="divide-y divide-red-100 dark:divide-red-900/30 max-h-48 overflow-y-auto">
            {data.cancelledByMe.map((b) => (
              <div key={b.id} className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-red-100/40 dark:hover:bg-red-900/10">
                <div className="flex items-center gap-2 min-w-0">
                  <Link href={`/billing/${b.id}`} className="text-xs font-semibold text-red-700 dark:text-red-400 hover:underline font-mono">
                    {b.billNumber}
                  </Link>
                  <span className="text-[10px] text-red-500 dark:text-red-400">
                    originally by {b.originalCreator}
                  </span>
                </div>
                <span className="text-xs font-bold text-red-700 dark:text-red-300 whitespace-nowrap">
                  −{fmt(b.totalAmount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && data && data.bills.length === 0 && data.payments.length === 0 && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-10 text-center">
          <IndianRupee size={36} className="text-gray-300 mx-auto mb-3" />
          <p className="font-semibold text-gray-700 dark:text-gray-300">No activity found</p>
          <p className="text-sm text-gray-500 mt-1">No bills or payments for {data.staffName} in this period.</p>
        </div>
      )}
    </div>
  );
}
