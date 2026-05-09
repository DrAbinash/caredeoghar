import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronRight, IndianRupee, AlertCircle, FileText, Calendar, Phone } from "lucide-react";

type Bill = {
  id: number;
  billNumber: string;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: string;
  createdAt: string;
  dueDate: string | null;
  patient: { id: number; firstName: string; lastName: string; patientId: string; phone: string } | null;
  order: { orderNumber: string } | null;
};

type DuesResponse = {
  bills: Bill[];
  total: number;
  page: number;
  limit: number;
  totals: { totalAmount: number; paidAmount: number; balanceAmount: number };
};

const today = () => new Date().toISOString().slice(0, 10);

export default function Dues() {
  const [dateFrom, setDateFrom] = useState<string>(today());
  const [dateTo, setDateTo] = useState<string>(today());
  const [dateField, setDateField] = useState<"created" | "due">("created");
  const [page, setPage] = useState(1);
  const limit = 50;

  const queryParams = useMemo(() => {
    const p = new URLSearchParams({
      dueOnly: "1",
      dateField,
      page: String(page),
      limit: String(limit),
    });
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    return p.toString();
  }, [dateFrom, dateTo, dateField, page]);

  const { data, isLoading, isFetching, error } = useQuery<DuesResponse>({
    queryKey: ["dues", dateFrom, dateTo, dateField, page],
    queryFn: () => api.get(`/api/bills?${queryParams}`),
    placeholderData: (prev) => prev,
  });

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

  const setQuickRange = (kind: "today" | "week" | "month" | "all-time") => {
    const now = new Date();
    setPage(1);
    if (kind === "today") {
      const t = today();
      setDateFrom(t);
      setDateTo(t);
    } else if (kind === "week") {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      setDateFrom(start.toISOString().slice(0, 10));
      setDateTo(today());
    } else if (kind === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateFrom(start.toISOString().slice(0, 10));
      setDateTo(today());
    } else {
      setDateFrom("");
      setDateTo("");
    }
  };

  const bills = data?.bills ?? [];
  const totals = data?.totals;
  const totalCount = data?.total ?? 0;

  return (
    <div className="pb-8">
      <PageHeader
        title="Due Payments"
        subtitle="Outstanding dues with date-range filter"
      />

      <div className="px-6 space-y-5">
        {/* Filter bar */}
        <div className="bg-card border border-card-border rounded-xl shadow-sm p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">From Date</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="mt-1 w-40"
              />
            </div>
            <div>
              <Label className="text-xs">To Date</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="mt-1 w-40"
              />
            </div>
            <div>
              <Label className="text-xs">Date Type</Label>
              <div className="flex gap-1 mt-1 p-0.5 bg-muted rounded-md">
                <button
                  type="button"
                  onClick={() => { setDateField("created"); setPage(1); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
                    dateField === "created" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Bill Date
                </button>
                <button
                  type="button"
                  onClick={() => { setDateField("due"); setPage(1); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
                    dateField === "due" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Due Date
                </button>
              </div>
            </div>
            <div className="flex flex-col">
              <Label className="text-xs">Quick Ranges</Label>
              <div className="flex gap-1 mt-1">
                <Button size="sm" variant="outline" onClick={() => setQuickRange("today")}>Today</Button>
                <Button size="sm" variant="outline" onClick={() => setQuickRange("week")}>7 Days</Button>
                <Button size="sm" variant="outline" onClick={() => setQuickRange("month")}>This Month</Button>
                <Button size="sm" variant="outline" onClick={() => setQuickRange("all-time")}>All</Button>
              </div>
            </div>
            {isFetching && (
              <div className="text-xs text-muted-foreground self-end pb-2">Refreshing…</div>
            )}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryCard
            label="Bills with Dues"
            value={totalCount.toLocaleString("en-IN")}
            icon={<FileText size={20} />}
            tone="neutral"
          />
          <SummaryCard
            label="Total Billed"
            value={formatCurrency(totals?.totalAmount ?? 0)}
            icon={<IndianRupee size={20} />}
            tone="neutral"
          />
          <SummaryCard
            label="Total Outstanding"
            value={formatCurrency(totals?.balanceAmount ?? 0)}
            icon={<AlertCircle size={20} />}
            tone="danger"
          />
        </div>

        {/* Results */}
        <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/30">
                  <th className="px-4 py-3 font-medium">Bill No.</th>
                  <th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Bill Date</th>
                  <th className="px-4 py-3 font-medium">Due Date</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium text-right">Paid</th>
                  <th className="px-4 py-3 font-medium text-right">Balance</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {error ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-red-600">{(error as Error).message}</td></tr>
                ) : isLoading ? (
                  [...Array(6)].map((_, i) => (
                    <tr key={i} className="border-b border-border/50 animate-pulse">
                      {[...Array(9)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded w-20" /></td>)}
                    </tr>
                  ))
                ) : bills.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Calendar size={28} />
                      <p className="text-sm">No outstanding dues in this period</p>
                      <p className="text-xs">Try widening the date range or switching the date type.</p>
                    </div>
                  </td></tr>
                ) : (
                  bills.map((b) => {
                    const dueOverdue = b.dueDate && new Date(b.dueDate) < new Date(today());
                    const isCancelled = b.status === "cancelled";
                    const displayBalance = isCancelled ? 0 : b.balanceAmount;
                    return (
                      <tr key={b.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs font-medium text-primary">{b.billNumber}</td>
                        <td className="px-4 py-3">
                          {b.patient ? (
                            <div>
                              <div className="font-medium">{b.patient.firstName} {b.patient.lastName}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-2">
                                <span>{b.patient.patientId}</span>
                                {b.patient.phone && (
                                  <a href={`tel:${b.patient.phone}`} className="inline-flex items-center gap-0.5 hover:text-primary" title="Call">
                                    <Phone size={10} /> {b.patient.phone}
                                  </a>
                                )}
                              </div>
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-xs">
                          {b.dueDate ? (
                            <span className={dueOverdue ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}>
                              {new Date(b.dueDate).toLocaleDateString()}
                              {dueOverdue && <span className="ml-1 text-[10px] uppercase">overdue</span>}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">{formatCurrency(b.totalAmount)}</td>
                        <td className="px-4 py-3 text-right text-green-600 dark:text-green-400 font-medium">{formatCurrency(b.paidAmount)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-red-600 dark:text-red-400">{formatCurrency(displayBalance)}</td>
                        <td className="px-4 py-3">{isCancelled ? <span className="text-xs text-muted-foreground">—</span> : <StatusBadge status={b.status} />}</td>
                        <td className="px-4 py-3">
                          <Link href={`/billing/${b.id}`} className="text-muted-foreground hover:text-foreground inline-flex p-1 rounded hover:bg-muted" title="Open bill">
                            <ChevronRight size={16} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {bills.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30 font-semibold text-sm">
                    <td className="px-4 py-3" colSpan={4}>Page Subtotal ({bills.length} of {totalCount})</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(bills.reduce((s, b) => s + b.totalAmount, 0))}</td>
                    <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">{formatCurrency(bills.reduce((s, b) => s + b.paidAmount, 0))}</td>
                    <td className="px-4 py-3 text-right text-red-600 dark:text-red-400">{formatCurrency(bills.reduce((s, b) => s + (b.status === "cancelled" ? 0 : b.balanceAmount), 0))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {totalCount > limit && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, totalCount)} of {totalCount}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</Button>
                <Button variant="outline" size="sm" disabled={page * limit >= totalCount} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon, tone }: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "neutral" | "danger";
}) {
  const toneClasses = tone === "danger"
    ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300"
    : "bg-card border-card-border";
  return (
    <div className={`border rounded-xl p-5 shadow-sm ${toneClasses}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide font-medium opacity-70">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className="opacity-60">{icon}</div>
      </div>
    </div>
  );
}
