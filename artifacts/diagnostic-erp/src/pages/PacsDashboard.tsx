import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RefreshCw, Activity, CheckCircle2, Clock, AlertCircle, ScanSearch, Send,
  Layers, Wifi, WifiOff, RadioTower, Server, XCircle, RotateCcw, Trash2,
  TrendingUp, Database, HardDrive, Tv2, MonitorPlay,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorklistStats {
  total: number;
  byStatus: Record<string, number>;
  byModality: Record<string, number>;
  todayTotal: number;
  todayReported: number;
}

interface DashboardStats {
  worklist: WorklistStats;
  recentEvents: PacsEvent[];
}

interface PacsEvent {
  id: number;
  source: string | null;
  eventType: string | null;
  severity: string;
  message: string;
  accessionNumber: string | null;
  modality: string | null;
  studyInstanceUID: string | null;
  createdAt: string;
}

interface AgentStatus {
  agentId: string;
  status: string;
  lastHeartbeat: string | null;
}

interface ConquestStatus {
  configured: boolean;
  lastStudy?: string | null;
}

interface ExtDashboard {
  pulledToday: Record<string, number>;
  pendingRetries: number;
  activeRoutingRules: number;
  modalityHealth: ModalityHealth[];
  healthyModalities: number;
  totalActiveModalities: number;
  recentPulled: PulledStudy[];
  mwlStats: Record<string, number>;
}

interface ModalityHealth {
  id: number;
  name: string;
  aeTitle: string | null;
  modalityType: string;
  lastConnectionStatus: string | null;
  lastSeenAt: string | null;
  ipAddress: string | null;
  port: number | null;
  isActive: boolean;
}

interface PulledStudy {
  id: number;
  studyInstanceUID: string;
  accessionNumber: string | null;
  modality: string | null;
  patientName: string | null;
  status: string;
  pulledAt: string | null;
  createdAt: string;
}

interface FailedQueueItem {
  id: number;
  studyInstanceUID: string;
  accessionNumber: string | null;
  modality: string | null;
  failureType: string | null;
  errorMessage: string | null;
  retryCount: number;
  status: string;
  createdAt: string;
}

// ─── Meta / helpers ───────────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  info: "bg-blue-100 text-blue-800",
  warn: "bg-yellow-100 text-yellow-800",
  warning: "bg-yellow-100 text-yellow-800",
  error: "bg-red-100 text-red-800",
  success: "bg-green-100 text-green-800",
};

const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  STUDY_RECEIVED:      { label: "Received",       color: "bg-blue-100 text-blue-800",   icon: <ScanSearch size={11} /> },
  AI_DRAFT_READY:      { label: "AI Draft",        color: "bg-purple-100 text-purple-800", icon: <Activity size={11} /> },
  REPORT_IN_PROGRESS:  { label: "In Progress",     color: "bg-yellow-100 text-yellow-800", icon: <Clock size={11} /> },
  REPORT_FINAL:        { label: "Final",           color: "bg-green-100 text-green-800", icon: <CheckCircle2 size={11} /> },
  DELIVERED:           { label: "Delivered",       color: "bg-teal-100 text-teal-800",   icon: <Send size={11} /> },
  VERIFIED:            { label: "Verified",        color: "bg-emerald-100 text-emerald-800", icon: <CheckCircle2 size={11} /> },
  FILM_ISSUED:         { label: "Film Issued",     color: "bg-indigo-100 text-indigo-800", icon: <Layers size={11} /> },
};

const PIE_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#6366f1", "#ec4899"];

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

function StatCard({
  title, value, sub, icon, variant = "default",
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  variant?: "default" | "success" | "warn" | "danger";
}) {
  const variantCls = {
    default: "bg-card",
    success: "bg-green-50 dark:bg-green-950/20 border-green-200",
    warn:    "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200",
    danger:  "bg-red-50 dark:bg-red-950/20 border-red-200",
  }[variant];

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${variantCls}`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-muted-foreground font-medium">{title}</p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p className="text-2xl font-bold leading-none">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function ConquestBadge({ conquest }: { conquest: ConquestStatus | undefined }) {
  if (!conquest) return null;
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${conquest.configured ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}>
      {conquest.configured ? <Wifi size={12} /> : <WifiOff size={12} />}
      Conquest PACS {conquest.configured ? "configured" : "not configured"}
      {conquest.lastStudy && <span className="opacity-70">· last study {timeAgo(conquest.lastStudy)}</span>}
    </div>
  );
}

function AgentStatusBar({ agents }: { agents: AgentStatus[] }) {
  if (agents.length === 0) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-muted text-muted-foreground">
        <WifiOff size={12} /> No pull agents connected
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {agents.map((a) => {
        const alive = a.lastHeartbeat && Date.now() - new Date(a.lastHeartbeat).getTime() < 120_000;
        return (
          <div key={a.agentId} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${alive ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
            <RadioTower size={12} />
            {a.agentId} · {a.status} · {timeAgo(a.lastHeartbeat)}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PacsDashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const { data, isLoading, refetch, isFetching } = useQuery<DashboardStats>({
    queryKey: ["pacs-dashboard"],
    queryFn: () => api.get("/api/radiology/pacs-dashboard"),
    refetchInterval: 30_000,
  });

  const { data: conquest } = useQuery<ConquestStatus>({
    queryKey: ["conquest-status"],
    queryFn: () => api.get("/api/radiology/conquest-status"),
    refetchInterval: 60_000,
  });

  const { data: agentStatusData } = useQuery<{ agents: AgentStatus[] }>({
    queryKey: ["dicom-agent-status"],
    queryFn: () => api.get("/api/dicom-agent/status"),
    refetchInterval: 30_000,
  });

  const { data: ext } = useQuery<ExtDashboard>({
    queryKey: ["pacs-dashboard-ext"],
    queryFn: () => api.get("/api/radiology/pacs-dashboard-ext"),
    refetchInterval: 30_000,
  });

  const { data: failedQueue = [] } = useQuery<FailedQueueItem[]>({
    queryKey: ["failed-queue"],
    queryFn: () => api.get("/api/radiology/failed-queue"),
    refetchInterval: 60_000,
  });

  const retryMutation = useMutation({
    mutationFn: (id: number) => api.post(`/api/radiology/failed-queue/${id}/retry`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["failed-queue"] });
      toast({ title: "Retry queued" });
    },
  });

  const abandonMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/radiology/failed-queue/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["failed-queue"] });
      toast({ title: "Item abandoned" });
    },
  });

  const stats   = data?.worklist;
  const events  = data?.recentEvents ?? [];
  const agents  = agentStatusData?.agents ?? [];
  const pulled  = ext?.recentPulled ?? [];

  // Chart data — modality breakdown
  const modalityChartData = Object.entries(stats?.byModality ?? {})
    .map(([mod, count]) => ({ name: mod, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Pie chart — pulled studies status distribution (today)
  const pulledPieData = Object.entries(ext?.pulledToday ?? {})
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  // Summary: pulled today
  const pulledToday  = ext?.pulledToday ?? {};
  const pulledCount  = pulledToday["PULLED"] ?? 0;
  const pushedCount  = pulledToday["PUSHED_TO_PACS"] ?? 0;
  const dupSkipped   = pulledToday["DUPLICATE_SKIPPED"] ?? 0;
  const failedToday  = pulledToday["FAILED"] ?? 0;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="PACS Dashboard"
        subtitle="Live RIS/PACS status overview"
        actions={
          <Button variant="outline" size="sm" onClick={() => { void refetch(); }} disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
            Refresh
          </Button>
        }
      />

      {/* Integration status badges */}
      <div className="flex flex-wrap gap-2">
        <ConquestBadge conquest={conquest} />
        <AgentStatusBar agents={agents} />
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading dashboard…</div>
      ) : (
        <>
          {/* ── Row 1: Worklist stats ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard title="Today's Studies" value={stats?.todayTotal ?? 0} icon={<ScanSearch size={18} />} />
            <StatCard title="Reported Today"  value={stats?.todayReported ?? 0} icon={<CheckCircle2 size={18} />} variant="success" />
            <StatCard title="Total Worklist"  value={stats?.total ?? 0} icon={<Layers size={18} />} />
            <StatCard
              title="Pending Reports"
              value={(stats?.byStatus?.["STUDY_RECEIVED"] ?? 0) + (stats?.byStatus?.["AI_DRAFT_READY"] ?? 0) + (stats?.byStatus?.["REPORT_IN_PROGRESS"] ?? 0)}
              icon={<Clock size={18} />}
              variant={(stats?.byStatus?.["STUDY_RECEIVED"] ?? 0) > 5 ? "warn" : "default"}
            />
          </div>

          {/* ── Row 2: Pull agent stats ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard title="Active Modalities"    value={ext?.totalActiveModalities ?? 0} icon={<RadioTower size={16} />} />
            <StatCard title="C-ECHO Healthy"       value={ext?.healthyModalities ?? 0} icon={<Wifi size={16} />} variant={(ext?.totalActiveModalities ?? 0) > 0 && (ext?.healthyModalities ?? 0) === 0 ? "warn" : "default"} />
            <StatCard title="Pulled Today"         value={pulledCount} icon={<Database size={16} />} variant={pulledCount > 0 ? "success" : "default"} />
            <StatCard title="Pushed to PACS"       value={pushedCount} icon={<Send size={16} />} variant={pushedCount > 0 ? "success" : "default"} />
            <StatCard title="Duplicate Skipped"    value={dupSkipped} icon={<HardDrive size={16} />} sub="today" />
            <StatCard title="Failed Retrievals"    value={failedToday + (ext?.pendingRetries ?? 0)} icon={<AlertCircle size={16} />} variant={(failedToday + (ext?.pendingRetries ?? 0)) > 0 ? "danger" : "default"} sub={ext?.pendingRetries ? `${ext.pendingRetries} in retry queue` : undefined} />
          </div>

          {/* ── Charts row ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Modality bar chart */}
            <div className="rounded-xl border bg-card shadow-sm">
              <div className="px-5 py-3 border-b flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <TrendingUp size={14} /> Studies by Modality (all time)
                </h3>
              </div>
              <div className="p-4">
                {modalityChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={modalityChartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">No modality data yet.</p>
                )}
              </div>
            </div>

            {/* Pulled studies pie */}
            <div className="rounded-xl border bg-card shadow-sm">
              <div className="px-5 py-3 border-b">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Activity size={14} /> Pull Status Today
                </h3>
              </div>
              <div className="p-4">
                {pulledPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={pulledPieData} cx="40%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                        {pulledPieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    <Database size={24} className="mx-auto mb-2 opacity-40" />
                    No pulled studies today. Pull agent activity will appear here.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Worklist status breakdown + modality status ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Worklist status breakdown */}
            <div className="rounded-xl border bg-card shadow-sm">
              <div className="px-5 py-3 border-b">
                <h3 className="font-semibold text-sm">Worklist by Status</h3>
              </div>
              <div className="p-4 space-y-2">
                {Object.entries(STATUS_META).map(([key, meta]) => {
                  const count = stats?.byStatus?.[key] ?? 0;
                  const total = stats?.total ?? 1;
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <div className={`flex items-center gap-1.5 text-xs font-medium rounded-full px-2 py-0.5 w-40 shrink-0 ${meta.color}`}>
                        {meta.icon}{meta.label}
                      </div>
                      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                        <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-semibold w-8 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Online modality status */}
            <div className="rounded-xl border bg-card shadow-sm">
              <div className="px-5 py-3 border-b flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <RadioTower size={14} /> Modality Status
                </h3>
                <a href="/erp/radiology/modality-management" className="text-xs text-primary underline">Manage →</a>
              </div>
              <div className="divide-y max-h-72 overflow-y-auto">
                {(ext?.modalityHealth ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground p-5">No active modalities configured.</p>
                ) : (
                  (ext?.modalityHealth ?? []).map((m) => (
                    <div key={m.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${m.lastConnectionStatus === "ok" ? "bg-green-500" : "bg-gray-300"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{m.name}</p>
                        <p className="text-xs text-muted-foreground">{m.aeTitle ?? "—"} · {m.ipAddress}:{m.port}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge variant="outline" className="text-[10px] font-mono">{m.modalityType}</Badge>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(m.lastSeenAt)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* ── Failed retrieval queue ── */}
          {failedQueue.length > 0 && (
            <div className="rounded-xl border bg-card shadow-sm">
              <div className="px-5 py-3 border-b flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2 text-red-700">
                  <AlertCircle size={14} /> Failed Retrieval Queue ({failedQueue.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 text-xs text-muted-foreground border-b">
                      <th className="px-4 py-2 text-left">Study UID</th>
                      <th className="px-4 py-2 text-left">Accession</th>
                      <th className="px-4 py-2 text-left">Modality</th>
                      <th className="px-4 py-2 text-left">Error</th>
                      <th className="px-4 py-2 text-left">Retries</th>
                      <th className="px-4 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {failedQueue.slice(0, 10).map((item) => (
                      <tr key={item.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2 font-mono text-xs max-w-[160px] truncate">{item.studyInstanceUID}</td>
                        <td className="px-4 py-2 font-mono text-xs">{item.accessionNumber ?? "—"}</td>
                        <td className="px-4 py-2"><Badge variant="outline" className="font-mono text-xs">{item.modality ?? "?"}</Badge></td>
                        <td className="px-4 py-2 text-xs text-red-600 max-w-[200px] truncate">{item.errorMessage ?? item.failureType ?? "—"}</td>
                        <td className="px-4 py-2 text-center">{item.retryCount}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-6 text-xs gap-1"
                              disabled={retryMutation.isPending}
                              onClick={() => retryMutation.mutate(item.id)}>
                              <RotateCcw size={10} /> Retry
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground"
                              disabled={abandonMutation.isPending}
                              onClick={() => abandonMutation.mutate(item.id)}>
                              <Trash2 size={10} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Recent pulled studies ── */}
          {pulled.length > 0 && (
            <div className="rounded-xl border bg-card shadow-sm">
              <div className="px-5 py-3 border-b">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Database size={14} /> Recent Pulled Studies
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 text-xs text-muted-foreground border-b">
                      <th className="px-4 py-2 text-left">Patient</th>
                      <th className="px-4 py-2 text-left">Accession</th>
                      <th className="px-4 py-2 text-left">Modality</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Pulled</th>
                      <th className="px-4 py-2 text-left">View</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pulled.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2 font-medium truncate max-w-[140px]">{p.patientName ?? "—"}</td>
                        <td className="px-4 py-2 font-mono text-xs">{p.accessionNumber ?? "—"}</td>
                        <td className="px-4 py-2"><Badge variant="outline" className="font-mono text-xs">{p.modality ?? "?"}</Badge></td>
                        <td className="px-4 py-2">
                          <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                            p.status === "PUSHED_TO_PACS" ? "bg-green-100 text-green-800" :
                            p.status === "PULLED" ? "bg-blue-100 text-blue-800" :
                            p.status === "FAILED" ? "bg-red-100 text-red-800" :
                            p.status === "DUPLICATE_SKIPPED" ? "bg-gray-100 text-gray-600" :
                            "bg-muted text-muted-foreground"
                          }`}>{p.status}</span>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{timeAgo(p.pulledAt ?? p.createdAt)}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-0.5"
                              onClick={() => navigate(`/radiology/viewer/${p.studyInstanceUID}`)}>
                              <MonitorPlay size={10} /> OHIF
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-0.5"
                              onClick={() => window.open(`/api/radiology/studies/${p.studyInstanceUID}/weasis-launch-redirect`, "_blank")}>
                              <Tv2 size={10} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Recent PACS events ── */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="px-5 py-3 border-b">
              <h3 className="font-semibold text-sm">Recent PACS Events</h3>
            </div>
            <div className="divide-y">
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground p-5">No events logged yet.</p>
              ) : (
                events.slice(0, 20).map((ev) => (
                  <div key={ev.id} className="px-5 py-3 flex items-start gap-3 text-sm">
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium shrink-0 ${SEV_COLOR[ev.severity] ?? SEV_COLOR.info}`}>
                      {ev.severity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{ev.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {ev.source ? `${ev.source} · ` : ""}{ev.eventType ? `${ev.eventType} · ` : ""}{ev.accessionNumber ?? ""}
                        {ev.modality ? ` · ${ev.modality}` : ""}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {new Date(ev.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
