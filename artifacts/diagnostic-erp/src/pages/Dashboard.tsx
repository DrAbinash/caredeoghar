import {
  useGetDashboardStats,
  useGetRecentActivity,
  useGetRevenueReport,
  useGetPopularTests,
} from "@workspace/api-client-react";
import PageHeader from "@/components/PageHeader";
import {
  Users,
  ClipboardList,
  IndianRupee,
  Clock,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
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
import StatusBadge from "@/components/StatusBadge";

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-foreground">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-lg ${color}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

function activityIcon(type: string) {
  switch (type) {
    case "payment_received": return <CheckCircle2 size={14} className="text-green-500" />;
    case "order_completed": return <CheckCircle2 size={14} className="text-blue-500" />;
    case "order_created": return <ClipboardList size={14} className="text-primary" />;
    case "patient_registered": return <Users size={14} className="text-purple-500" />;
    default: return <AlertCircle size={14} className="text-muted-foreground" />;
  }
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: activity } = useGetRecentActivity();
  const { data: revenue } = useGetRevenueReport({ period: "monthly" });
  const { data: popular } = useGetPopularTests();

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  if (statsLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => <div key={i} className="h-24 bg-muted rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: "#EAB308",
    collected: "#3B82F6",
    processing: "#8B5CF6",
    completed: "#22C55E",
    cancelled: "#EF4444",
  };

  return (
    <div className="pb-8">
      <PageHeader title="Dashboard" subtitle="Diagnostic Center Overview" />

      <div className="px-6 space-y-6">
        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Total Patients" value={stats?.totalPatients ?? 0} color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
          <StatCard icon={ClipboardList} label="Today's Orders" value={stats?.todayOrders ?? 0} sub={`${stats?.pendingOrders ?? 0} pending`} color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" />
          <StatCard icon={IndianRupee} label="Today's Revenue" value={formatCurrency(stats?.todayRevenue ?? 0)} sub="Collected" color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" />
          <StatCard icon={IndianRupee} label="Month Revenue" value={formatCurrency(stats?.monthRevenue ?? 0)} sub={`${formatCurrency(stats?.pendingPayments ?? 0)} pending`} color="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" />
          <StatCard icon={CheckCircle2} label="Completed Tests" value={stats?.completedTests ?? 0} color="bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400" />
          <StatCard icon={Clock} label="Pending Orders" value={stats?.pendingOrders ?? 0} color="bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400" />
          <StatCard icon={AlertCircle} label="Pending Payments" value={formatCurrency(stats?.pendingPayments ?? 0)} color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" />
          <StatCard icon={TrendingUp} label="Order Status" value={stats?.ordersByStatus?.length ?? 0 + " types"} color="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400" />
        </div>

        {/* Order status breakdown */}
        {stats?.ordersByStatus && stats.ordersByStatus.length > 0 && (
          <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-4">Order Status Breakdown</h3>
            <div className="flex flex-wrap gap-3">
              {stats.ordersByStatus.map((s) => (
                <div key={s.status} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusColors[s.status] ?? "#6B7280" }} />
                  <span className="text-xs text-foreground capitalize">{s.status}</span>
                  <span className="text-xs font-bold text-foreground">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue chart */}
          <div className="lg:col-span-2 bg-card border border-card-border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-4">Monthly Revenue</h3>
            {revenue?.data && revenue.data.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenue.data} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: number) => [formatCurrency(v), "Revenue"]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No revenue data yet</div>
            )}
          </div>

          {/* Recent activity */}
          <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-4">Recent Activity</h3>
            <div className="space-y-3">
              {activity?.activities && activity.activities.length > 0 ? activity.activities.map((a) => (
                <div key={a.id} className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex-shrink-0">{activityIcon(a.type)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-foreground truncate">{a.description}</p>
                    <p className="text-xs text-muted-foreground">{a.patientName} · {timeAgo(a.createdAt)}</p>
                  </div>
                  {a.amount != null && (
                    <span className="text-xs font-medium text-foreground flex-shrink-0">₹{a.amount.toFixed(0)}</span>
                  )}
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">No recent activity</p>
              )}
            </div>
          </div>
        </div>

        {/* Popular tests */}
        {popular?.tests && popular.tests.length > 0 && (
          <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground mb-4">Most Ordered Tests</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="pb-2 font-medium">Test</th>
                    <th className="pb-2 font-medium">Category</th>
                    <th className="pb-2 font-medium text-right">Orders</th>
                    <th className="pb-2 font-medium text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {popular.tests.slice(0, 5).map((t) => (
                    <tr key={t.testId} className="border-b border-border/50 last:border-0">
                      <td className="py-2.5">
                        <div className="font-medium text-foreground">{t.testName}</div>
                        <div className="text-xs text-muted-foreground">{t.testCode}</div>
                      </td>
                      <td className="py-2.5 text-muted-foreground">{t.category}</td>
                      <td className="py-2.5 text-right font-medium">{t.orderCount}</td>
                      <td className="py-2.5 text-right font-medium text-green-600 dark:text-green-400">{formatCurrency(t.revenue)}</td>
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
