import { useNavigate } from "wouter";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import {
  useGetDashboardStats,
  useGetRevenueReport,
  useGetPopularTests,
} from "@workspace/api-client-react";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import {
  Users,
  ClipboardList,
  IndianRupee,
  FileText,
  UserCheck,
  AlertTriangle,
  TrendingUp,
  Plus,
  BarChart3,
  Package,
  ChevronRight,
  Stethoscope,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Link } from "wouter";

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  iconBg,
  trend,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  iconBg: string;
  trend?: { label: string; positive: boolean };
}) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="mt-2 text-2xl font-bold text-foreground leading-none">{value}</p>
          {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
          {trend && (
            <p className={`mt-1.5 text-xs font-medium ${trend.positive ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
              {trend.positive ? "↑" : "↓"} {trend.label}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-xl flex-shrink-0 ${iconBg}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function QuickActionCard({
  icon: Icon,
  label,
  description,
  href,
  color,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  href: string;
  color: string;
}) {
  return (
    <Link href={href} className="group block">
      <div className="bg-card border border-card-border rounded-xl p-4 shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg ${color} group-hover:scale-105 transition-transform`}>
            <Icon size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
          </div>
          <ChevronRight size={14} className="text-muted-foreground ml-auto flex-shrink-0 group-hover:text-primary transition-colors" />
        </div>
      </div>
    </Link>
  );
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Backend payload shape from /api/reports/income-expense — `income`/`expense`
// are nested objects, not flat numbers. We flatten them in `chartRows` below.
type IncomeExpenseApiRow = {
  date: string;
  income: { total: number; cash: number; upi: number; card: number; bank: number; insurance: number; cheque: number };
  expense: { amount: number; count: number };
  net: number;
};
type IncomeExpensePayload = {
  rows: IncomeExpenseApiRow[];
  totals: { income: number; expense: number; net: number; cash: number; upi: number; card: number; bank: number; insurance: number; cheque: number };
};

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: revenue } = useGetRevenueReport({ period: "monthly" });
  const { data: popular } = useGetPopularTests();

  // Filterable revenue/expense band — supplements the always-on KPI cards
  // above with an arbitrary date window the user can tune.
  const [from, setFrom] = useState<string>(daysAgoISO(7));
  const [to, setTo] = useState<string>(todayISO());

  const { data: rangeData, isFetching: rangeLoading } = useQuery<IncomeExpensePayload>({
    queryKey: ["dashboard-income-expense", from, to],
    queryFn: () => api.get(`/api/reports/income-expense?from=${from}&to=${to}`),
  });

  const rangeTotals = useMemo(() => {
    if (!rangeData) return { income: 0, expense: 0, net: 0, days: 0 };
    const t = rangeData.totals ?? { income: 0, expense: 0, net: 0 };
    return {
      income: t.income ?? 0,
      expense: t.expense ?? 0,
      net: t.net ?? (t.income - t.expense),
      days: rangeData.rows?.length ?? 0,
    };
  }, [rangeData]);

  // Recharts needs flat numeric props — derive them from the nested API rows.
  const chartRows = useMemo(
    () =>
      (rangeData?.rows ?? []).map((r) => ({
        date: r.date,
        income: r.income?.total ?? 0,
        expense: r.expense?.amount ?? 0,
      })),
    [rangeData],
  );

  const setPreset = (days: number) => {
    setFrom(daysAgoISO(days - 1));
    setTo(todayISO());
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  const billStatusColor: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    partial: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    paid: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    cancelled: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  };

  if (statsLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-5">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-muted rounded-xl" />)}
          </div>
          <div className="h-64 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  const recentBills = (stats as any)?.recentBills ?? [];
  const overdueAlerts = (stats as any)?.overdueAlerts ?? [];
  const totalBills = (stats as any)?.totalBills ?? 0;
  const referralPayouts = (stats as any)?.referralPayouts ?? 0;
  const pendingReports = (stats as any)?.pendingReports ?? 0;

  return (
    <div className="pb-10">
      <PageHeader title="Dashboard" subtitle="Diagnostic Center Overview" />

      <div className="px-6 space-y-6">

        {/* ── KPI Row ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={IndianRupee}
            label="Today's Revenue"
            value={fmt(stats?.todayRevenue ?? 0)}
            sub={`Month: ${fmt(stats?.monthRevenue ?? 0)}`}
            iconBg="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
          />
          <KpiCard
            icon={FileText}
            label="Total Bills"
            value={totalBills}
            sub={`${fmt(stats?.pendingPayments ?? 0)} outstanding`}
            iconBg="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
          />
          <KpiCard
            icon={Stethoscope}
            label="Referral Payouts"
            value={fmt(referralPayouts)}
            sub="Revenue via referrals"
            iconBg="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
          />
          <KpiCard
            icon={ClipboardList}
            label="Pending Reports"
            value={pendingReports}
            sub="Orders awaiting completion"
            iconBg="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
          />
        </div>

        {/* ── Date Range Snapshot ── */}
        <div className="bg-card border border-card-border rounded-xl p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2 mr-2">
              <Calendar size={16} className="text-primary" />
              <h3 className="font-semibold text-base">Custom Date Range</h3>
            </div>
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-9 w-44" />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-9 w-44" />
            </div>
            <div className="flex gap-1 ml-auto">
              <Button size="sm" variant="outline" onClick={() => setPreset(1)}>Today</Button>
              <Button size="sm" variant="outline" onClick={() => setPreset(7)}>7 days</Button>
              <Button size="sm" variant="outline" onClick={() => setPreset(30)}>30 days</Button>
              <Button size="sm" variant="outline" onClick={() => setPreset(90)}>90 days</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <div className="text-[11px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300 font-semibold">Income</div>
              <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-200">{fmt(rangeTotals.income)}</div>
            </div>
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
              <div className="text-[11px] uppercase tracking-wider text-rose-700 dark:text-rose-300 font-semibold">Expenses</div>
              <div className="text-2xl font-bold text-rose-700 dark:text-rose-200">{fmt(rangeTotals.expense)}</div>
            </div>
            <div className={`p-3 rounded-lg border ${rangeTotals.net >= 0 ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800" : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"}`}>
              <div className={`text-[11px] uppercase tracking-wider font-semibold ${rangeTotals.net >= 0 ? "text-blue-700 dark:text-blue-300" : "text-amber-700 dark:text-amber-300"}`}>Net</div>
              <div className={`text-2xl font-bold ${rangeTotals.net >= 0 ? "text-blue-700 dark:text-blue-200" : "text-amber-700 dark:text-amber-200"}`}>{fmt(rangeTotals.net)}</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/40 border border-card-border">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Days</div>
              <div className="text-2xl font-bold">{rangeTotals.days}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{rangeLoading ? "Loading…" : `${from} → ${to}`}</div>
            </div>
          </div>
          {chartRows.length > 0 && (
            <div className="h-48 -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="income" fill="#10b981" name="Income" />
                  <Bar dataKey="expense" fill="#f43f5e" name="Expense" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ── Secondary KPIs ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Patients", value: stats?.totalPatients ?? 0, icon: Users, color: "text-blue-500" },
            { label: "Today's Orders", value: stats?.todayOrders ?? 0, icon: ClipboardList, color: "text-purple-500" },
            { label: "Completed Tests", value: stats?.completedTests ?? 0, icon: TrendingUp, color: "text-green-500" },
            { label: "Pending Orders", value: stats?.pendingOrders ?? 0, icon: AlertTriangle, color: "text-yellow-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-card border border-card-border rounded-lg px-4 py-3 flex items-center gap-3 shadow-sm">
              <Icon size={16} className={color} />
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-base font-bold text-foreground">{value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Quick Actions ── */}
          <div className="lg:col-span-1 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Quick Actions</h3>
            <QuickActionCard
              icon={Plus}
              label="New Bill"
              description="Generate a bill for a completed order"
              href="/billing"
              color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
            />
            <QuickActionCard
              icon={Users}
              label="Register Patient"
              description="Add a new patient to the system"
              href="/patients"
              color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
            />
            <QuickActionCard
              icon={BarChart3}
              label="Generate Reports"
              description="View revenue and analytics reports"
              href="/reports"
              color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
            />
            <QuickActionCard
              icon={Package}
              label="Test Catalog"
              description="Manage diagnostic test inventory"
              href="/tests"
              color="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
            />

            {/* ── Alerts ── */}
            {overdueAlerts.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={14} className="text-yellow-500" />
                  <h3 className="text-sm font-semibold text-foreground">Alerts</h3>
                  <span className="ml-auto px-2 py-0.5 bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-full text-xs font-bold">
                    {overdueAlerts.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {overdueAlerts.map((alert: { billNumber: string; balanceAmount: number; dueDate: string | null }) => (
                    <div key={alert.billNumber} className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800/40 rounded-lg px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-300 truncate">{alert.billNumber}</p>
                          <p className="text-xs text-yellow-700 dark:text-yellow-400">Balance outstanding</p>
                        </div>
                        <span className="text-xs font-bold text-red-600 dark:text-red-400 flex-shrink-0">{fmt(alert.balanceAmount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {overdueAlerts.length === 0 && (
              <div className="mt-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/40 rounded-lg px-4 py-3 flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                <p className="text-xs text-green-700 dark:text-green-400 font-medium">No outstanding balance alerts</p>
              </div>
            )}
          </div>

          {/* ── Revenue Chart ── */}
          <div className="lg:col-span-2 bg-card border border-card-border rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Monthly Revenue</h3>
              {revenue && (
                <span className="text-xs text-muted-foreground">{fmt(revenue.totalRevenue ?? 0)} total</span>
              )}
            </div>
            {revenue?.data && revenue.data.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenue.data} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: number) => [fmt(v), "Revenue"]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No revenue data yet</div>
            )}
          </div>
        </div>

        {/* ── Recent Transactions ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Recent Transactions</h3>
            <Link href="/billing" className="text-xs text-primary hover:underline">View all bills →</Link>
          </div>
          <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/30">
                    <th className="px-4 py-3 font-medium">Bill ID</th>
                    <th className="px-4 py-3 font-medium">Patient Name</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                    <th className="px-4 py-3 font-medium text-right">Paid</th>
                    <th className="px-4 py-3 font-medium text-right">Balance</th>
                    <th className="px-4 py-3 font-medium">Payment Status</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {recentBills.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground text-sm">
                        No bills generated yet
                      </td>
                    </tr>
                  ) : (
                    recentBills.map((bill: {
                      id: number;
                      billNumber: string;
                      patientName: string;
                      patientCode: string;
                      totalAmount: number;
                      paidAmount: number;
                      balanceAmount: number;
                      status: string;
                      createdAt: string;
                    }) => (
                      <tr key={bill.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{bill.billNumber}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{bill.patientName}</div>
                          <div className="text-xs text-muted-foreground">{bill.patientCode}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">{fmt(bill.totalAmount)}</td>
                        <td className="px-4 py-3 text-right font-medium text-green-600 dark:text-green-400">{fmt(bill.paidAmount)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={bill.balanceAmount > 0 ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground"}>
                            {fmt(bill.balanceAmount)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${billStatusColor[bill.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {bill.status.charAt(0).toUpperCase() + bill.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(bill.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/billing/${bill.id}`} className="text-muted-foreground hover:text-primary transition-colors inline-flex">
                            <ChevronRight size={15} />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Popular Tests ── */}
        {popular?.tests && popular.tests.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Most Ordered Tests</h3>
            <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="pb-2.5 font-medium">Test</th>
                    <th className="pb-2.5 font-medium">Category</th>
                    <th className="pb-2.5 font-medium text-right">Orders</th>
                    <th className="pb-2.5 font-medium text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {popular.tests.slice(0, 5).map((t) => (
                    <tr key={t.testId} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                      <td className="py-2.5">
                        <div className="font-medium text-foreground">{t.testName}</div>
                        <div className="text-xs text-muted-foreground">{t.testCode}</div>
                      </td>
                      <td className="py-2.5 text-muted-foreground">{t.category}</td>
                      <td className="py-2.5 text-right font-medium">{t.orderCount}</td>
                      <td className="py-2.5 text-right font-semibold text-green-600 dark:text-green-400">{fmt(t.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
