import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import { readStaffSession } from "@/lib/staffSession";
import PageHeader from "@/components/PageHeader";
import {
  TrendingUp,
  TrendingDown,
  Banknote,
  Smartphone,
  Globe,
  CreditCard,
  Receipt,
  ArrowDownCircle,
  Wallet,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { FULL_ACCESS_ROLES } from "@/lib/staffSession";

type DailySummaryData = {
  date: string;
  summary: {
    totalBilled: number;
    totalReceived: number;
    totalRefunded: number;
    netReceived: number;
    outstanding: number;
    totalOutstandingDues: number;
    billCount: number;
    orderCount: number;
  };
  byMethod: Record<string, number>;
  byRefundMethod: Record<string, number>;
  billsByStatus: Record<string, number>;
  byUser: Array<{
    userName: string;
    billCount: number;
    billed: number;
    received: number;
    methods: Record<string, number>;
  }>;
  totalExpense: number;
  grandTotal: number;
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
  payments: {
    id: number;
    billId: number;
    amount: number;
    method: string;
    referenceNumber: string | null;
    recordedByName: string | null;
    createdAt: string;
  }[];
  refunds: {
    id: number;
    billId: number;
    amount: number;
    method: string;
    notes: string | null;
    recordedByName: string | null;
    createdAt: string;
  }[];
  cancelledBillsDetail: {
    id: number;
    billNumber: string;
    patientName: string;
    totalAmount: number;
    paidAmount: number;
    createdByName: string;
  }[];
};

type StaffOption = { name: string; billCount: number };

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function inr(n: number) {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function methodIcon(method: string) {
  const m = method.toLowerCase();
  if (m === "cash")   return <Banknote   size={14} className="text-green-600" />;
  if (m === "upi")    return <Smartphone size={14} className="text-violet-600" />;
  if (m === "online") return <Globe      size={14} className="text-blue-600" />;
  if (m === "card")   return <CreditCard size={14} className="text-orange-500" />;
  return <Wallet size={14} className="text-muted-foreground" />;
}

function methodColor(method: string) {
  const m = method.toLowerCase();
  if (m === "cash")   return "bg-green-50  dark:bg-green-950/30  border-green-200  dark:border-green-800";
  if (m === "upi")    return "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800";
  if (m === "online") return "bg-blue-50   dark:bg-blue-950/30   border-blue-200   dark:border-blue-800";
  if (m === "card")   return "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800";
  return "bg-muted/30 border-card-border";
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  const cls =
    s === "paid"      ? "bg-green-100 text-green-700"  :
    s === "partial"   ? "bg-blue-100  text-blue-700"   :
    s === "pending"   ? "bg-amber-100 text-amber-700"  :
    s === "cancelled" ? "bg-red-100   text-red-700"    :
    "bg-gray-100 text-gray-600";
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${cls}`}>{status.toUpperCase()}</span>;
}

function SummaryCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className={cn("rounded-xl border p-4 flex flex-col gap-1", accent ?? "bg-card border-card-border")}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">{icon}{label}</div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="font-semibold flex items-center gap-2 text-sm">{children}</h3>;
}

export default function DailySummary() {
  const session = readStaffSession();
  const isAdmin = session ? FULL_ACCESS_ROLES.has(session.user.role) : false;
  const myName = session?.user.name ?? "";

  const [date, setDate] = useState(todayIST());
  const [staffFilter, setStaffFilter] = useState("all");
  const [showBills, setShowBills] = useState(true);
  const [showPayments, setShowPayments] = useState(true);
  const [showRefunds, setShowRefunds] = useState(true);

  const { data, isLoading, refetch, isFetching } = useQuery<DailySummaryData>({
    queryKey: ["daily-summary", date, staffFilter],
    queryFn: () =>
      api.get(`/api/daily-summary?date=${encodeURIComponent(date)}${staffFilter !== "all" ? `&staffName=${encodeURIComponent(staffFilter)}` : ""}`),
    staleTime: 30_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
  });

  const summary        = data?.summary ?? { totalBilled: 0, totalReceived: 0, totalRefunded: 0, netReceived: 0, outstanding: 0, totalOutstandingDues: 0, billCount: 0, orderCount: 0 };
  const incomeMethods  = Object.entries(data?.byMethod ?? {}).sort((a, b) => b[1] - a[1]);
  const refundMethods  = Object.entries(data?.byRefundMethod ?? {}).sort((a, b) => b[1] - a[1]);
  const expenseTotal   = data?.totalExpense ?? 0;
  const netCash        = data?.grandTotal ?? 0;
  const userRows       = data?.byUser ?? [];
  const detailedRows   = data?.payments ?? [];
  const refundRows     = data?.refunds ?? [];
  const billRows       = data?.bills ?? [];
  const cancelledRows  = data?.cancelledBillsDetail ?? [];
  const cancelledCount = data?.billsByStatus?.cancelled ?? 0;

  const staffOptions: StaffOption[] = [
    { name: "All Staff", billCount: summary.billCount },
    ...userRows.map((u) => ({ name: u.userName, billCount: u.billCount })),
  ];

  const consolidatedRows = [
    { label: "Gross Receipts", value: summary.totalReceived },
    ...(summary.totalRefunded > 0 ? [{ label: "Refunds Paid Out", value: -summary.totalRefunded }] : []),
    { label: "Net Received", value: summary.netReceived },
    { label: "Expenses", value: -expenseTotal },
    { label: "Net Cash in Hand", value: netCash },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Daily Summary"
        subtitle={`Collections & expenses for ${staffFilter === "all" ? "all staff" : staffFilter} on ${date}`}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Date</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-44" />
        </div>
        {isAdmin ? (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Staff name</label>
            <Select value={staffFilter} onValueChange={setStaffFilter}>
              <SelectTrigger className="h-9 w-52"><SelectValue placeholder="All Staff" /></SelectTrigger>
              <SelectContent>
                {staffOptions.map((s) => (
                  <SelectItem key={s.name} value={s.name === "All Staff" ? "all" : s.name}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Showing for</label>
            <div className="h-9 px-3 flex items-center border border-card-border rounded-md bg-muted/30 text-sm font-medium">{myName}</div>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-9">
          <RefreshCw size={13} className={cn("mr-1.5", isFetching && "animate-spin")} />Refresh
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setDate(todayIST())} className="h-9 text-xs">Today</Button>
      </div>

      {isLoading ? (
        <div className="h-40 flex items-center justify-center text-muted-foreground">Loading…</div>
      ) : (
        <>
          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <SummaryCard
              icon={<TrendingUp size={14} className="text-green-600" />}
              label="Gross Receipts"
              value={inr(summary.totalReceived)}
              sub={`${summary.billCount} bill${summary.billCount === 1 ? "" : "s"} · Net: ${inr(summary.netReceived)}`}
              accent="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
            />
            <SummaryCard
              icon={<Banknote size={14} className="text-green-700" />}
              label="Cash Collected"
              value={inr(data?.byMethod["cash"] ?? 0)}
              accent="bg-card border-card-border"
            />
            <SummaryCard
              icon={<Smartphone size={14} className="text-violet-600" />}
              label="UPI Collected"
              value={inr(data?.byMethod["upi"] ?? 0)}
              accent="bg-card border-card-border"
            />
            <SummaryCard
              icon={<TrendingDown size={14} className="text-red-500" />}
              label="Expenses"
              value={inr(expenseTotal)}
              accent="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
            />
            <SummaryCard
              icon={<Receipt size={14} className="text-amber-600" />}
              label="Today's Dues (unpaid)"
              value={inr(summary.outstanding)}
              sub={`All-time outstanding: ${inr(summary.totalOutstandingDues)}`}
              accent="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
            />
            <SummaryCard
              icon={<RotateCcw size={14} className="text-rose-600" />}
              label="Refunds Today"
              value={inr(summary.totalRefunded)}
              sub={refundRows.length > 0 ? `${refundRows.length} transaction${refundRows.length === 1 ? "" : "s"}` : "No refunds today"}
              accent="bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800"
            />
            <SummaryCard
              icon={<XCircle size={14} className="text-slate-600" />}
              label="Cancellations"
              value={String(cancelledCount)}
              sub={cancelledCount > 0 ? `${cancelledCount} cancelled bill${cancelledCount === 1 ? "" : "s"}` : "No cancellations today"}
              accent="bg-slate-50 dark:bg-slate-950/30 border-slate-200 dark:border-slate-800"
            />
          </div>

          {/* ── Net Cash in Hand ── */}
          <div className="rounded-xl border border-card-border bg-card p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
                <Wallet size={14} /> Net Cash in Hand
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Gross receipts ({inr(summary.totalReceived)}) − refunds ({inr(summary.totalRefunded)}) − expenses ({inr(expenseTotal)})
              </div>
              {summary.totalOutstandingDues > 0 && (
                <div className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium">
                  ⚠ All-time outstanding dues: {inr(summary.totalOutstandingDues)} (not yet collected)
                </div>
              )}
            </div>
            <div className={cn("text-3xl font-bold", netCash >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600")}>
              {inr(netCash)}
            </div>
          </div>

          {/* ── Bills Created Today + Payment Entries (above detailed collections) ── */}
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <button
              onClick={() => setShowBills((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/30 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Receipt size={14} className="text-primary" /> Bills Created Today
                <Badge variant="secondary" className="text-xs">{billRows.length}</Badge>
              </span>
              {showBills ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showBills && (
              <div className="overflow-x-auto border-t border-card-border">
                {billRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic p-4">No bills created for this date.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Time</th>
                        <th className="px-3 py-2 text-left font-semibold">Bill #</th>
                        <th className="px-3 py-2 text-left font-semibold">Patient</th>
                        <th className="px-3 py-2 text-right font-semibold">Amount</th>
                        <th className="px-3 py-2 text-right font-semibold">Paid</th>
                        <th className="px-3 py-2 text-right font-semibold">Balance</th>
                        <th className="px-3 py-2 text-left font-semibold">Status</th>
                        <th className="px-3 py-2 text-left font-semibold">By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border">
                      {billRows.map((b) => (
                        <tr key={b.id} className="hover:bg-muted/20">
                          <td className="px-3 py-1.5 text-muted-foreground">{new Date(b.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}</td>
                          <td className="px-3 py-1.5 font-mono font-semibold">{String(b.billNumber).replace(/^BILL-?/i, "").replace(/-/g, "")}</td>
                          <td className="px-3 py-1.5">{b.patientName}</td>
                          <td className="px-3 py-1.5 text-right">{inr(b.totalAmount)}</td>
                          <td className="px-3 py-1.5 text-right text-green-700">{inr(b.paidAmount)}</td>
                          <td className={cn("px-3 py-1.5 text-right font-semibold", b.balanceAmount > 0 ? "text-red-600" : "text-green-600")}>{inr(b.balanceAmount)}</td>
                          <td className="px-3 py-1.5">{statusBadge(b.status)}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{b.createdByName || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/30 border-t-2 border-card-border">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 font-semibold text-xs">Total ({billRows.filter(b => b.status !== "cancelled").length} active)</td>
                        <td className="px-3 py-2 text-right font-bold">{inr(billRows.filter(b => b.status !== "cancelled").reduce((s, b) => s + b.totalAmount, 0))}</td>
                        <td className="px-3 py-2 text-right font-bold text-green-700">{inr(billRows.filter(b => b.status !== "cancelled").reduce((s, b) => s + b.paidAmount, 0))}</td>
                        <td className="px-3 py-2 text-right font-bold text-red-600">{inr(summary.outstanding)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}
          </div>

          {/* ── Payment Entries ── */}
          {detailedRows.length > 0 && (
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              <button
                onClick={() => setShowPayments((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/30 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <CreditCard size={14} /> Payment Entries
                  <Badge variant="secondary" className="text-xs">{detailedRows.length}</Badge>
                </span>
                {showPayments ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showPayments && (
                <div className="overflow-x-auto border-t border-card-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-y border-card-border">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Time</th>
                        <th className="px-3 py-2 text-left font-semibold">Method</th>
                        <th className="px-3 py-2 text-right font-semibold">Amount</th>
                        <th className="px-3 py-2 text-left font-semibold">Ref #</th>
                        <th className="px-3 py-2 text-left font-semibold">Recorded By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border">
                      {detailedRows.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/20">
                          <td className="px-3 py-1.5 text-muted-foreground">{new Date(p.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}</td>
                          <td className="px-3 py-1.5"><span className="flex items-center gap-1 capitalize">{methodIcon(p.method)} {p.method.toUpperCase()}</span></td>
                          <td className="px-3 py-1.5 text-right font-semibold text-green-700">{inr(p.amount)}</td>
                          <td className="px-3 py-1.5 font-mono text-muted-foreground">{p.referenceNumber || "—"}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{p.recordedByName || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/30 border-t-2 border-card-border">
                      <tr>
                        <td colSpan={2} className="px-3 py-2 font-semibold text-xs">Total</td>
                        <td className="px-3 py-2 text-right font-bold text-green-700">{inr(summary.totalReceived)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Refunds & Cancellations ── */}
          {(refundRows.length > 0 || cancelledRows.length > 0) && (
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              <button
                onClick={() => setShowRefunds((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/30 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <RotateCcw size={14} className="text-rose-600" /> Refunds &amp; Cancellations
                  <Badge variant="secondary" className="text-xs">{refundRows.length + cancelledRows.length}</Badge>
                </span>
                {showRefunds ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showRefunds && (
                <div className="border-t border-card-border divide-y divide-card-border">
                  {refundRows.length > 0 && (
                    <div className="overflow-x-auto">
                      <div className="px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 dark:bg-rose-950/20">Refunds ({refundRows.length})</div>
                      <table className="w-full text-xs">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold">Time</th>
                            <th className="px-3 py-2 text-left font-semibold">Bill ID</th>
                            <th className="px-3 py-2 text-left font-semibold">Method</th>
                            <th className="px-3 py-2 text-right font-semibold">Refunded</th>
                            <th className="px-3 py-2 text-left font-semibold">Notes</th>
                            <th className="px-3 py-2 text-left font-semibold">By</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-card-border">
                          {refundRows.map((r) => (
                            <tr key={r.id} className="hover:bg-muted/20">
                              <td className="px-3 py-1.5 text-muted-foreground">{new Date(r.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}</td>
                              <td className="px-3 py-1.5 font-mono">#{r.billId}</td>
                              <td className="px-3 py-1.5 uppercase">{r.method}</td>
                              <td className="px-3 py-1.5 text-right font-semibold text-rose-600">−{inr(r.amount)}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{r.notes || "—"}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{r.recordedByName || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-muted/30 border-t-2 border-card-border">
                          <tr>
                            <td colSpan={3} className="px-3 py-2 font-semibold text-xs">Total Refunded</td>
                            <td className="px-3 py-2 text-right font-bold text-rose-600">−{inr(summary.totalRefunded)}</td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                  {cancelledRows.length > 0 && (
                    <div className="overflow-x-auto">
                      <div className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-50 dark:bg-slate-950/20">Cancelled Bills ({cancelledRows.length})</div>
                      <table className="w-full text-xs">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold">Bill #</th>
                            <th className="px-3 py-2 text-left font-semibold">Patient</th>
                            <th className="px-3 py-2 text-right font-semibold">Bill Amount</th>
                            <th className="px-3 py-2 text-right font-semibold">Paid Before Cancel</th>
                            <th className="px-3 py-2 text-left font-semibold">By</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-card-border">
                          {cancelledRows.map((b) => (
                            <tr key={b.id} className="hover:bg-muted/20">
                              <td className="px-3 py-1.5 font-mono font-semibold">{String(b.billNumber).replace(/^BILL-?/i, "").replace(/-/g, "")}</td>
                              <td className="px-3 py-1.5">{b.patientName}</td>
                              <td className="px-3 py-1.5 text-right">{inr(b.totalAmount)}</td>
                              <td className="px-3 py-1.5 text-right">{inr(b.paidAmount)}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{b.createdByName || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Consolidated Summary + User-wise (below bills/payments) ── */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
              <SectionTitle><TrendingUp size={14} className="text-green-600" /> Consolidated Summary</SectionTitle>
              <div className="space-y-2">
                {consolidatedRows.map((row) => (
                  <div key={row.label} className={cn(
                    "flex items-center justify-between rounded-lg border px-3 py-2",
                    row.label === "Net Cash in Hand" ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800" :
                    row.value < 0 ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800" :
                    "bg-muted/20 border-card-border"
                  )}>
                    <div className="text-sm font-medium">{row.label}</div>
                    <div className={cn("font-bold text-sm",
                      row.label === "Net Cash in Hand" ? "text-green-700 dark:text-green-400" :
                      row.value < 0 ? "text-red-600" : ""
                    )}>
                      {row.value < 0 ? `−${inr(Math.abs(row.value))}` : inr(row.value)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
              <SectionTitle><ArrowDownCircle size={14} className="text-red-500" /> User-wise Summary</SectionTitle>
              {userRows.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No staff activity recorded today.</p>
              ) : (
                <div className="space-y-2">
                  {userRows.map((row) => (
                    <div key={row.userName} className="rounded-lg border border-card-border bg-muted/20 px-3 py-2 space-y-1">
                      <div className="flex items-center justify-between text-sm font-medium">
                        <span>{row.userName}</span>
                        <span>{inr(row.received)}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs text-muted-foreground">
                        <span>Bills: {row.billCount}</span>
                        <span>Billed: {inr(row.billed)}</span>
                        <span>Cash: {inr(row.methods.cash ?? 0)}</span>
                        <span>UPI: {inr(row.methods.upi ?? 0)}</span>
                        <span>Dues: {inr(Math.max(0, row.billed - row.received))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Detailed Income by Mode ── */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
              <SectionTitle><TrendingUp size={14} className="text-green-600" /> Receipts by Mode</SectionTitle>
              {incomeMethods.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No payments recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {incomeMethods.map(([method, amount]) => (
                    <div key={method} className={cn("flex items-center justify-between rounded-lg border px-3 py-2", methodColor(method))}>
                      <div className="flex items-center gap-2 text-sm font-medium capitalize">{methodIcon(method)}{method.toUpperCase()}</div>
                      <div className="font-bold text-sm">{inr(amount)}</div>
                    </div>
                  ))}
                  {refundMethods.length > 0 && refundMethods.map(([method, amount]) => (
                    <div key={`ref-${method}`} className="flex items-center justify-between rounded-lg border px-3 py-2 bg-rose-50 border-rose-200 dark:bg-rose-950/20">
                      <div className="flex items-center gap-2 text-sm font-medium text-rose-700">{methodIcon(method)} Refund ({method.toUpperCase()})</div>
                      <div className="font-bold text-sm text-rose-700">−{inr(amount)}</div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-card-border pt-2 mt-1 text-sm font-bold">
                    <span>Net Received</span>
                    <span>{inr(summary.netReceived)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
              <SectionTitle><Wallet size={14} className="text-primary" /> Bill Status Summary</SectionTitle>
              <div className="space-y-2">
                {[
                  { label: "Paid", count: data?.billsByStatus?.paid ?? 0, color: "text-green-700" },
                  { label: "Partial", count: data?.billsByStatus?.partial ?? 0, color: "text-blue-700" },
                  { label: "Pending", count: data?.billsByStatus?.pending ?? 0, color: "text-amber-700" },
                  { label: "Cancelled", count: data?.billsByStatus?.cancelled ?? 0, color: "text-red-700" },
                ].map((s) => (
                  <div key={s.label} className="flex items-center justify-between rounded-lg border border-card-border bg-muted/20 px-3 py-2">
                    <span className="text-sm font-medium">{s.label}</span>
                    <span className={cn("font-bold text-sm", s.color)}>{s.count}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-card-border pt-2 text-sm font-bold">
                  <span>Total Billed (active)</span>
                  <span>{inr(summary.totalBilled)}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
