import { useState } from "react";
import {
  useGetRevenueReport,
  useGetPopularTests,
  useGetDashboardStats,
} from "@workspace/api-client-react";
import PageHeader from "@/components/PageHeader";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Reports() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("monthly");
  const { data: revenue } = useGetRevenueReport({ period });
  const { data: popular } = useGetPopularTests();
  const { data: stats } = useGetDashboardStats();

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="pb-8">
      <PageHeader title="Reports & Analytics" subtitle="Financial and operational insights" />

      <div className="px-6 space-y-6">
        {/* Summary cards */}
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

        {/* Revenue chart */}
        <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Revenue Trend</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Total: {formatCurrency(revenue?.totalRevenue ?? 0)} · {revenue?.totalOrders ?? 0} transactions
              </p>
            </div>
            <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Popular tests chart */}
          <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-4">Top Tests by Orders</h3>
            {popular?.tests && popular.tests.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
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
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No test data yet</div>
            )}
          </div>

          {/* Popular tests table */}
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
      </div>
    </div>
  );
}
