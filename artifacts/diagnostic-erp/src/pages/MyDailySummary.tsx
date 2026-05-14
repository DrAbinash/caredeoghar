import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import { readStaffSession, FULL_ACCESS_ROLES } from "@/lib/staffSession";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  IndianRupee, Wallet, Banknote, Smartphone, TrendingDown, RotateCcw,
  XCircle, FileEdit, Clock, Calendar, RefreshCw, Tag, CheckCircle2,
  ArrowRight, Users,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type AppUser = { id: number; name: string; role: string; isActive: boolean };

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
  const isFinal = type === "final";
  const isResult = type === "result";
  return (
    <div className={`flex items-center justify-between ${isFinal ? "py-3" : isResult ? "py-2.5" : "py-2"}`}>
      <span className={
        isFinal ? "text-base font-extrabold text-gray-900 dark:text-foreground" :
        isResult ? "text-sm font-bold text-gray-900 dark:text-foreground" :
        isDeduct ? "text-sm font-medium text-red-600 dark:text-red-400 pl-5" :
        "text-sm font-medium text-gray-700 dark:text-gray-300"
      }>
        {label}
        {note && <span className="text-[11px] font-normal text-gray-400 ml-1.5">({note})</span>}
      </span>
      <span className={`tabular-nums font-bold ${
        isFinal ? "text-2xl text-blue-700 dark:text-blue-300" :
        isResult ? "text-lg text-green-700 dark:text-green-400" :
        isDeduct ? "text-sm text-red-600 dark:text-red-400" :
        "text-sm text-gray-800 dark:text-gray-200"
      }`}>
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

  const { data: allUsers = [] } = useQuery<AppUser[]>({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users"),
    enabled: isOwner,
    staleTime: 5 * 60_000,
  });
  const activeStaff = allUsers.filter((u) => u.isActive).sort((a, b) => a.name.localeCompare(b.name));

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
          <button onClick={() => { void refetch(); }} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-primary transition-colors">
            <RefreshCw size={13} /> Refresh
          </button>
        }
      />

      {/* ── Date Range Picker ── */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4 shadow-sm space-y-3">
        {/* Date inputs + presets */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <Calendar size={14} className="text-gray-500 flex-shrink-0" />
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36 text-sm" />
            <span className="text-gray-500 text-sm">→</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36 text-sm" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {[{ label: "Today", days: 1 }, { label: "7 Days", days: 7 }, { label: "30 Days", days: 30 }].map((p) => (
              <Button key={p.label} variant="outline" size="sm" className="h-8 text-xs px-3" onClick={() => setPreset(p.days)}>
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Admin-only staff quick-tabs */}
        {isOwner && activeStaff.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
              <Users size={12} /> Staff
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {/* All Staff chip */}
              <button
                type="button"
                onClick={() => setStaffFilter("")}
                className={`flex-shrink-0 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all whitespace-nowrap ${
                  staffFilter === ""
                    ? "bg-primary border-primary text-white shadow-sm"
                    : "border-gray-300 dark:border-card-border bg-white dark:bg-card text-gray-700 dark:text-gray-300 hover:border-primary hover:text-primary"
                }`}
              >
                All Staff / Total
              </button>

              {/* One chip per active staff member */}
              {activeStaff.map((u) => {
                const isSelected = staffFilter === u.name;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setStaffFilter(isSelected ? "" : u.name)}
                    className={`flex-shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-all whitespace-nowrap ${
                      isSelected
                        ? "bg-primary border-primary text-white shadow-sm"
                        : "border-gray-300 dark:border-card-border bg-white dark:bg-card text-gray-700 dark:text-gray-300 hover:border-primary hover:text-primary"
                    }`}
                  >
                    {u.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {data?.isFiltered && (
          <p className="text-xs text-blue-600 font-semibold">
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

          {/* ── Financial Reconciliation + Bill Edits ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Reconciliation flow — bold, stand-out design */}
            <div className="bg-white dark:bg-card border-2 border-emerald-300 dark:border-emerald-700 rounded-xl shadow-md overflow-hidden">
              <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 to-green-600">
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <IndianRupee size={16} /> My Cash Reconciliation
                </h3>
                <p className="text-xs text-emerald-100 mt-0.5">Step-by-step balance verification</p>
              </div>
              <div className="px-5 py-2">
                <RecRow label="Gross Billing" value={s.grossBilling} type="start" />
                <RecRow label="− Outstanding / Dues" value={s.outstanding} type="deduct" />
                <RecRow label="− Refunds & Cancellations" value={s.refundsAndCancellations} type="deduct"
                  note={`₹${s.refundAmount.toFixed(0)} refunds + ${s.cancellationCount} cancelled`} />
                <div className="my-3 border-t-4 border-green-300 dark:border-green-700" />
                <RecRow label="= Total Received" value={s.totalReceived} type="result" />
                <div className="my-2 border-t-2 border-dashed border-gray-300 dark:border-gray-600" />
                <RecRow label="− Digital Collection" value={s.digitalCollection} type="deduct" />
                <div className="my-2 border-t-2 border-dashed border-gray-300 dark:border-gray-600" />
                <RecRow label="= Cash Collected" value={s.cashCollection} type="result" />
                <RecRow label="− Cash Expenses" value={s.cashExpenses} type="deduct" note="approved by you" />
                <div className="my-3 border-t-4 border-blue-300 dark:border-blue-700" />
                <RecRow label="= Physical Cash in Hand" value={s.physicalCashInHand} type="final" />
                <div className="pb-2" />
              </div>
            </div>

            {/* Bill Edits — moved up, detailed table */}
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-sm overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-card-border flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-2">
                  <FileEdit size={14} className="text-purple-600" /> Bill Edits by Me
                  {data.billEdits.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                      {data.billEdits.length}
                    </span>
                  )}
                </h3>
              </div>
              {data.billEdits.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-10">
                  <div className="text-center">
                    <FileEdit size={28} className="text-gray-200 dark:text-gray-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No bill edits in this period</p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto overflow-y-auto max-h-80">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-muted/30 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">Bill #</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">Type</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">Old → New</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">Reason</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                      {data.billEdits.map((e) => (
                        <tr key={e.id} className="hover:bg-purple-50/50 dark:hover:bg-muted/20">
                          <td className="px-3 py-2 font-semibold whitespace-nowrap">
                            <Link href={`/billing/${e.billId}`} className="text-primary hover:underline">{e.billNumber}</Link>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {e.changeType ? (
                              <span className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-semibold text-[10px]">
                                {e.changeType}
                              </span>
                            ) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400 max-w-[140px]">
                            {(e.oldValue || e.newValue) ? (
                              <span className="flex items-center gap-1 flex-wrap">
                                {e.oldValue && <span className="line-through text-red-500">{e.oldValue}</span>}
                                {e.oldValue && e.newValue && <ArrowRight size={9} className="text-gray-400 flex-shrink-0" />}
                                {e.newValue && <span className="text-green-700 dark:text-green-400 font-semibold">{e.newValue}</span>}
                              </span>
                            ) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400 max-w-[140px] truncate">{e.reason || "—"}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                            <span className="flex items-center gap-1"><Clock size={10} />{fmtTime(e.createdAt)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ── Collection by Method — compact strip ── */}
          {Object.entries(data.byMethod).length > 0 && (
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-sm p-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-foreground flex items-center gap-2 mb-3">
                <Wallet size={14} className="text-green-600" /> Collection by Method
              </h3>
              <div className="flex flex-wrap gap-3">
                {Object.entries(data.byMethod)
                  .sort((a, b) => b[1] - a[1])
                  .map(([method, amount]) => (
                    <div key={method} className="flex-1 min-w-[120px] rounded-lg bg-gray-50 dark:bg-muted/30 border border-gray-200 dark:border-card-border px-3 py-2">
                      <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        {methodLabels[method.toLowerCase()] ?? method}
                      </p>
                      <p className="text-base font-bold text-gray-900 dark:text-foreground tabular-nums mt-0.5">{fmt(amount)}</p>
                      {s.totalReceived > 0 && (
                        <p className="text-[10px] text-gray-400 mt-0.5">{((amount / s.totalReceived) * 100).toFixed(0)}%</p>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
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
