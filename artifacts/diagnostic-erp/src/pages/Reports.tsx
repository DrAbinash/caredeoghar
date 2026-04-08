import { useState } from "react";
import {
  useGetRevenueReport,
  useGetPopularTests,
  useGetDashboardStats,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TrendingUp, FlaskConical, IndianRupee, Users2, Sparkles, RefreshCw } from "lucide-react";

type CommissionReport = {
  doctorId: number;
  doctorName: string;
  specialization: string;
  totalOrders: number;
  totalBilled: number;
  commissionAmount: number;
  commissionType: string;
  commissionValue: number;
};

const TABS = [
  { id: "overview", label: "Overview", icon: TrendingUp },
  { id: "tests", label: "Test Analysis", icon: FlaskConical },
  { id: "commission", label: "Commission Report", icon: Users2 },
  { id: "ai", label: "AI Insights", icon: Sparkles },
];

export default function Reports() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: revenue } = useGetRevenueReport({ period });
  const { data: popular } = useGetPopularTests();
  const { data: stats } = useGetDashboardStats();
  const { data: commissionData, isLoading: loadingComm } = useQuery<CommissionReport[]>({
    queryKey: ["commission-report", dateFrom, dateTo],
    queryFn: () => api.get(`/api/commission/report?from=${dateFrom}&to=${dateTo}`),
    enabled: activeTab === "commission",
  });

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  const totalCommission = commissionData?.reduce((s, r) => s + r.commissionAmount, 0) ?? 0;

  return (
    <div className="pb-8">
      <PageHeader title="Reports & Analytics" subtitle="Financial and operational insights" />

      <div className="px-6">
        {/* Tab Nav */}
        <div className="flex gap-1 bg-muted p-1 rounded-xl mb-6 w-fit">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all
                  ${activeTab === tab.id ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Patients", value: stats?.totalPatients ?? 0, fmt: (n: number) => n.toLocaleString() },
                { label: "Completed Orders", value: stats?.completedTests ?? 0, fmt: (n: number) => n.toLocaleString() },
                { label: "Month Revenue", value: stats?.monthRevenue ?? 0, fmt: formatCurrency },
                { label: "Pending Payments", value: stats?.pendingPayments ?? 0, fmt: formatCurrency },
              ].map((card) => (
                <div key={card.label} className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{card.label}</p>
                  <p className="mt-1.5 text-xl font-bold text-foreground">{card.fmt(card.value)}</p>
                </div>
              ))}
            </div>

            <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Revenue Trend</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Total: {formatCurrency(revenue?.totalRevenue ?? 0)} · {revenue?.totalOrders ?? 0} transactions
                  </p>
                </div>
                <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {revenue?.data && revenue.data.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={revenue.data} margin={{ top: 5, right: 10, left: -5, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v: number, name: string) => [name === "revenue" ? formatCurrency(v) : v, name === "revenue" ? "Revenue" : "Orders"]}
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                    />
                    <Legend formatter={(v) => v === "revenue" ? "Revenue" : "Orders"} />
                    <Line type="monotone" dataKey="revenue" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">No revenue data for this period</div>
              )}
            </div>
          </div>
        )}

        {/* Test Analysis Tab */}
        {activeTab === "tests" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-4">Top Tests by Orders</h3>
              {popular?.tests && popular.tests.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={popular.tests.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis dataKey="testCode" type="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={60} />
                    <Tooltip
                      formatter={(v: number) => [v, "Orders"]}
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                    />
                    <Bar dataKey="orderCount" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">No test data yet</div>
              )}
            </div>

            <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-4">Test Revenue Breakdown</h3>
              {popular?.tests && popular.tests.length > 0 ? (
                <div className="overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b border-border">
                        <th className="pb-2 font-medium">Test</th>
                        <th className="pb-2 font-medium text-center">Orders</th>
                        <th className="pb-2 font-medium text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {popular.tests.map((t) => (
                        <tr key={t.testId} className="border-b border-border/50 last:border-0">
                          <td className="py-2.5">
                            <div className="font-medium text-foreground truncate max-w-[160px]">{t.testName}</div>
                            <div className="text-xs text-muted-foreground">{t.category}</div>
                          </td>
                          <td className="py-2.5 text-center font-medium">{t.orderCount}</td>
                          <td className="py-2.5 text-right font-semibold text-green-600 dark:text-green-400">{formatCurrency(t.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">No test data yet</div>
              )}
            </div>
          </div>
        )}

        {/* Commission Report Tab */}
        {activeTab === "commission" && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-3 items-end bg-card border border-card-border rounded-xl p-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">From</p>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">To</p>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
              </div>
            </div>

            {totalCommission > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-card border border-card-border rounded-xl p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Commission</p>
                  <p className="text-xl font-bold text-primary mt-1">{formatCurrency(totalCommission)}</p>
                </div>
                <div className="bg-card border border-card-border rounded-xl p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Active Doctors</p>
                  <p className="text-xl font-bold mt-1">{commissionData?.filter(d => d.commissionAmount > 0).length ?? 0}</p>
                </div>
                <div className="bg-card border border-card-border rounded-xl p-4 shadow-sm">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Referrals</p>
                  <p className="text-xl font-bold mt-1">{commissionData?.reduce((s, d) => s + d.totalOrders, 0) ?? 0}</p>
                </div>
              </div>
            )}

            <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
              {loadingComm ? (
                <div className="p-8 space-y-3">
                  {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
                </div>
              ) : !commissionData?.length ? (
                <div className="py-16 text-center text-muted-foreground text-sm">
                  <Users2 size={32} className="mx-auto mb-2 opacity-30" />
                  No commission data for this period
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-card-border">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Doctor</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Commission Rate</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Referrals</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Billed</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissionData.map(d => (
                      <tr key={d.doctorId} className="border-b border-card-border last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <p className="font-medium">{d.doctorName}</p>
                          <p className="text-xs text-muted-foreground">{d.specialization}</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {d.commissionType === "percentage"
                            ? `${d.commissionValue}%`
                            : d.commissionType === "fixed"
                            ? `₹${d.commissionValue} flat`
                            : `₹${d.commissionValue}/test`}
                        </td>
                        <td className="px-4 py-3 text-center font-medium">{d.totalOrders}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(d.totalBilled)}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">{formatCurrency(d.commissionAmount)}</td>
                      </tr>
                    ))}
                    <tr className="bg-muted/30 font-bold text-sm">
                      <td className="px-4 py-3" colSpan={2}>Total</td>
                      <td className="px-4 py-3 text-center">{commissionData.reduce((s, d) => s + d.totalOrders, 0)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(commissionData.reduce((s, d) => s + d.totalBilled, 0))}</td>
                      <td className="px-4 py-3 text-right text-green-600">{formatCurrency(totalCommission)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
        {/* AI Insights Tab */}
        {activeTab === "ai" && (
          <AIInsightsTab dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
        )}
      </div>
    </div>
  );
}

function AIInsightsTab({ dateFrom, dateTo, setDateFrom, setDateTo }: {
  dateFrom: string; dateTo: string;
  setDateFrom: (v: string) => void; setDateTo: (v: string) => void;
}) {
  const [insights, setInsights] = useState("");
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const generate = async () => {
    setLoading(true);
    setInsights("");
    try {
      const res = await fetch("/api/ai/billing-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: dateFrom, to: dateTo }),
      });
      const data = await res.json();
      setInsights(data.insights ?? "");
      setGenerated(true);
    } catch {
      setInsights("Failed to generate insights. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/20 dark:to-blue-950/20 border border-violet-200 dark:border-violet-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={18} className="text-violet-600" />
          <h3 className="font-semibold text-violet-800 dark:text-violet-300">AI Billing Insights</h3>
        </div>
        <p className="text-sm text-violet-700 dark:text-violet-400 mb-4">
          Powered by Gemini AI — analyzes your billing data and generates actionable business insights.
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <p className="text-xs text-muted-foreground mb-1">From</p>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">To</p>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" />
          </div>
          <Button onClick={generate} disabled={loading} className="bg-violet-600 hover:bg-violet-700">
            {loading ? <><RefreshCw size={14} className="mr-1.5 animate-spin" />Analyzing…</> : <><Sparkles size={14} className="mr-1.5" />Generate Insights</>}
          </Button>
        </div>
      </div>

      {loading && (
        <div className="bg-card border border-card-border rounded-xl p-6 space-y-3">
          <div className="animate-pulse space-y-2">
            {[100, 90, 80, 70, 85].map((w, i) => (
              <div key={i} className="h-4 bg-muted rounded" style={{ width: `${w}%` }} />
            ))}
          </div>
          <p className="text-xs text-center text-muted-foreground">Gemini AI is analyzing your billing data…</p>
        </div>
      )}

      {!loading && insights && (
        <div className="bg-card border border-card-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold flex items-center gap-2"><Sparkles size={15} className="text-violet-500" />AI Analysis Results</h4>
            <Button size="sm" variant="outline" onClick={generate}><RefreshCw size={13} className="mr-1.5" />Refresh</Button>
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{insights}</div>
        </div>
      )}

      {!loading && !generated && (
        <div className="bg-card border border-card-border rounded-xl p-12 text-center">
          <Sparkles size={36} className="text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="font-medium text-muted-foreground">Click "Generate Insights" to get AI-powered billing analysis</p>
          <p className="text-xs text-muted-foreground mt-1">Analysis includes collection rate, revenue trends, discount patterns, and recommendations</p>
        </div>
      )}
    </div>
  );
}
