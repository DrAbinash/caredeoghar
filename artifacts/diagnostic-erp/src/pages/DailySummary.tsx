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
    outstanding: number;
    billCount: number;
    orderCount: number;
  };
  byMethod: Record<string, number>;
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
  payments: {
    id: number;
    billId: number;
    amount: number;
    method: string;
    referenceNumber: string | null;
    recordedByName: string | null;
    createdAt: string;
  }[];
};

type StaffOption = {
  name: string;
  billCount: number;
};

type ReportRow = {
  label: string;
  value: number;
};

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function inr(n: number) {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function methodIcon(method: string) {
  const m = method.toLowerCase();
  if (m === "cash") return <Banknote size={14} className="text-green-600" />;
  if (m === "upi") return <Smartphone size={14} className="text-violet-600" />;
  if (m === "online") return <Globe size={14} className="text-blue-600" />;
  if (m === "card") return <CreditCard size={14} className="text-orange-500" />;
  return <Wallet size={14} className="text-muted-foreground" />;
}

function methodColor(method: string) {
  const m = method.toLowerCase();
  if (m === "cash") return "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800";
  if (m === "upi") return "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800";
  if (m === "online") return "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800";
  if (m === "card") return "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800";
  return "bg-muted/30 border-card-border";
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className={cn("rounded-xl border p-4 flex flex-col gap-1", accent ?? "bg-card border-card-border")}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
        {icon}
        {label}
      </div>
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
  const [showPayments, setShowPayments] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery<DailySummaryData>({
    queryKey: ["daily-summary", date, staffFilter],
    queryFn: () =>
      api.get(
        `/api/daily-summary?date=${encodeURIComponent(date)}${staffFilter !== "all" ? `&staffName=${encodeURIComponent(staffFilter)}` : ""}`
      ),
    staleTime: 30_000,
  });

  const summary = data?.summary ?? { totalBilled: 0, totalReceived: 0, outstanding: 0, billCount: 0, orderCount: 0 };
  const incomeMethods = Object.entries(data?.byMethod ?? {}).sort((a, b) => b[1] - a[1]);
  const expenseTotal = data?.totalExpense ?? 0;
  const netCash = data?.grandTotal ?? 0;
  const userRows = data?.byUser ?? [];
  const detailedRows = data?.payments ?? [];
  const staffOptions: StaffOption[] = [
    { name: "All Staff", billCount: data?.summary.billCount ?? 0 },
    ...userRows.map((u) => ({ name: u.userName, billCount: u.billCount })),
  ];
  const consolidatedRows: ReportRow[] = [
    { label: "Cash", value: data?.byMethod?.cash ?? 0 },
    { label: "UPI", value: data?.byMethod?.upi ?? 0 },
    { label: "Card", value: data?.byMethod?.card ?? 0 },
    { label: "Online", value: data?.byMethod?.online ?? 0 },
    { label: "Expenses", value: expenseTotal },
    { label: "Grand Total", value: netCash },
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
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-44"
          />
        </div>
        {isAdmin ? (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Staff name</label>
            <Select value={staffFilter} onValueChange={setStaffFilter}>
              <SelectTrigger className="h-9 w-52">
                <SelectValue placeholder="All Staff" />
              </SelectTrigger>
              <SelectContent>
                {staffOptions.map((s) => (
                  <SelectItem key={s.name} value={s.name === "All Staff" ? "all" : s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Showing for</label>
            <div className="h-9 px-3 flex items-center border border-card-border rounded-md bg-muted/30 text-sm font-medium">
              {myName}
            </div>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-9"
        >
          <RefreshCw size={13} className={cn("mr-1.5", isFetching && "animate-spin")} />
          Refresh
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDate(todayIST())}
          className="h-9 text-xs"
        >
          Today
        </Button>
      </div>

      {isLoading ? (
        <div className="h-40 flex items-center justify-center text-muted-foreground">Loading…</div>
      ) : (
        <>
          {/* Top summary cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <SummaryCard
              icon={<TrendingUp size={14} className="text-green-600" />}
              label="Total Income"
              value={inr(summary.totalReceived)}
              sub={`${summary.billCount} bill${summary.billCount === 1 ? "" : "s"} created`}
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
          </div>

          {/* Net cash */}
          <div className="rounded-xl border border-card-border bg-card p-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
                <Wallet size={14} /> Net Cash in Hand
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Total received minus expenses</div>
            </div>
            <div className={cn("text-3xl font-bold", netCash >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600")}>
              {inr(netCash)}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
              <SectionTitle>
                <TrendingUp size={14} className="text-green-600" /> Consolidated Summary
              </SectionTitle>
              <div className="space-y-2">
                {consolidatedRows.map((row) => (
                  <div key={row.label} className={cn("flex items-center justify-between rounded-lg border px-3 py-2", row.label === "Grand Total" ? "bg-amber-50 border-amber-200" : "bg-muted/20 border-card-border")}>
                    <div className="text-sm font-medium">{row.label}</div>
                    <div className={cn("font-bold text-sm", row.label === "Expenses" ? "text-red-600" : row.label === "Grand Total" ? "text-green-700" : "")}>
                      {inr(row.value)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
              <SectionTitle>
                <ArrowDownCircle size={14} className="text-red-500" /> User-wise Summary
              </SectionTitle>
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
                        <span>Dues & Expense: {inr(Math.max(0, row.billed - row.received))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
              <SectionTitle>
                <TrendingUp size={14} className="text-green-600" /> Detailed Income by Mode
              </SectionTitle>
              {incomeMethods.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No payments recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {incomeMethods.map(([method, amount]) => (
                    <div key={method} className={cn("flex items-center justify-between rounded-lg border px-3 py-2", methodColor(method))}>
                      <div className="flex items-center gap-2 text-sm font-medium capitalize">
                        {methodIcon(method)}
                        {method.toUpperCase()}
                      </div>
                      <div className="font-bold text-sm">{inr(amount)}</div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-card-border pt-2 mt-1 text-sm font-bold">
                    <span>Total</span>
                    <span>{inr(summary.totalReceived)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-card border border-card-border rounded-xl p-4 space-y-3">
              <SectionTitle>
                <Wallet size={14} className="text-primary" /> Detailed Collections
              </SectionTitle>
              {detailedRows.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No payment entries found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-2 py-2 text-left">Time</th>
                        <th className="px-2 py-2 text-left">Patient</th>
                        <th className="px-2 py-2 text-left">Mode</th>
                        <th className="px-2 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border">
                      {detailedRows.map((p) => (
                        <tr key={p.id}>
                          <td className="px-2 py-2">{new Date(p.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}</td>
                          <td className="px-2 py-2">{p.referenceNumber || `Bill #${p.billId}`}</td>
                          <td className="px-2 py-2 uppercase">{p.method}</td>
                          <td className="px-2 py-2 text-right font-semibold">{inr(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Bills summary */}
          <div className="bg-card border border-card-border rounded-xl p-4">
            <h3 className="font-semibold flex items-center gap-2 text-sm mb-3">
              <Receipt size={14} className="text-primary" /> Bills Created Today
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{summary.billCount}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Bills</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{inr(summary.totalBilled)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Billed Amount</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{inr(summary.totalReceived)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Paid</div>
              </div>
            </div>
          </div>

          {/* Itemized payments */}
          {data && data.payments.length > 0 && (
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              <button
                onClick={() => setShowPayments((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/30 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <CreditCard size={14} /> Payment Entries
                  <Badge variant="secondary" className="text-xs">{data.payments.length}</Badge>
                </span>
                {showPayments ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showPayments && (
                <div className="overflow-x-auto">
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
                      {data.payments.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/20">
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {new Date(p.createdAt).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                            })}
                          </td>
                          <td className="px-3 py-1.5">
                            <span className="flex items-center gap-1 capitalize">
                              {methodIcon(p.method)} {p.method.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold">{inr(p.amount)}</td>
                          <td className="px-3 py-1.5 font-mono text-muted-foreground">{p.referenceNumber || "—"}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{p.recordedByName || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
