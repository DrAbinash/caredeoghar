import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Activity, CheckCircle2, Clock, AlertCircle, ScanSearch, Send, Layers, Wifi, WifiOff, RadioTower, Server } from "lucide-react";

type DashboardStats = {
  worklist: {
    total: number;
    byStatus: Record<string, number>;
    byModality: Record<string, number>;
    todayTotal: number;
    todayReported: number;
  };
  recentEvents: Array<{
    id: number;
    message: string;
    severity: string;
    source: string | null;
    eventType: string | null;
    accessionNumber: string | null;
    modality: string | null;
    createdAt: string;
  }>;
};

type ConquestStatus = {
  configured: boolean;
  status: "ready" | "not-configured" | "no-activity";
  lastStudyReceived: string | null;
  lastAccessionNumber: string | null;
};

type AgentStatus = {
  id: number;
  agentName: string;
  agentHost: string;
  lastHeartbeatAt: string | null;
  lastSuccessfulPullAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  isOnline: boolean;
  studiesFoundToday: number;
  studiesPulledToday: number;
  failedToday: number;
};

const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  STUDY_RECEIVED:       { label: "Study Received",      color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",    icon: <ScanSearch size={14} /> },
  AI_DRAFT_READY:       { label: "AI Draft Ready",      color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300", icon: <Activity size={14} /> },
  REPORT_IN_PROGRESS:   { label: "In Progress",         color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300", icon: <Clock size={14} /> },
  REPORT_FINAL:         { label: "Report Final",        color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",  icon: <CheckCircle2 size={14} /> },
  DELIVERED:            { label: "Delivered",           color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",        icon: <Send size={14} /> },
};

const SEV_COLOR: Record<string, string> = {
  info:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  warning: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  error:   "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatCard({ title, value, sub, icon }: { title: string; value: string | number; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5 flex items-start gap-4 shadow-sm">
      {icon && <div className="mt-0.5 text-muted-foreground">{icon}</div>}
      <div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-3xl font-bold mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function ConquestBadge({ conquest }: { conquest: ConquestStatus | undefined }) {
  if (!conquest) return null;

  if (conquest.status === "ready") {
    const ago = conquest.lastStudyReceived
      ? new Date(conquest.lastStudyReceived).toLocaleString()
      : null;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 px-3 py-2 text-sm">
        <Wifi size={15} className="text-green-600 dark:text-green-400 shrink-0" />
        <span className="font-medium text-green-700 dark:text-green-300">CONQUEST Integration: Ready</span>
        {ago && (
          <span className="text-green-600/70 dark:text-green-400/70 text-xs ml-1">
            · Last study {ago}
            {conquest.lastAccessionNumber ? ` (${conquest.lastAccessionNumber})` : ""}
          </span>
        )}
      </div>
    );
  }

  if (conquest.status === "no-activity") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800 px-3 py-2 text-sm">
        <RadioTower size={15} className="text-yellow-600 dark:text-yellow-400 shrink-0" />
        <span className="font-medium text-yellow-700 dark:text-yellow-300">CONQUEST Integration: Configured — no studies received yet</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 dark:bg-gray-800/40 dark:border-gray-700 px-3 py-2 text-sm">
      <WifiOff size={15} className="text-gray-500 shrink-0" />
      <span className="font-medium text-gray-600 dark:text-gray-300">CONQUEST Integration: Not configured</span>
      <span className="text-gray-500 text-xs ml-1">— add host/AE title in PACS Settings</span>
    </div>
  );
}

function AgentStatusBar({ agents }: { agents: AgentStatus[] }) {
  if (agents.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 px-3 py-2 text-sm text-muted-foreground">
        <Server size={15} className="shrink-0" />
        <span>No DICOM Pull Agents connected — start the agent on your Windows server.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {agents.map((agent) => {
        const heartbeatAge = agent.lastHeartbeatAt
          ? Date.now() - new Date(agent.lastHeartbeatAt).getTime()
          : Infinity;
        const stale = heartbeatAge > 5 * 60 * 1000;
        const online = agent.isOnline && !stale;

        return (
          <div key={agent.id}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${online
              ? "border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800"
              : "border-gray-200 bg-gray-50 dark:bg-gray-800/40 dark:border-gray-700"}`}>
            {online
              ? <Wifi size={14} className="text-green-600 dark:text-green-400 shrink-0" />
              : <WifiOff size={14} className="text-gray-500 shrink-0" />}
            <span className={`font-semibold ${online ? "text-green-700 dark:text-green-300" : "text-gray-600 dark:text-gray-300"}`}>
              {agent.agentName}
            </span>
            <span className="text-xs text-muted-foreground font-mono">{agent.agentHost}</span>
            {online && (
              <span className="text-xs text-green-600/70 dark:text-green-400/70">
                · ↑{agent.studiesPulledToday} pulled
                {agent.failedToday > 0 && <span className="text-red-500 ml-1">✗{agent.failedToday} failed</span>}
              </span>
            )}
            <span className="text-xs text-muted-foreground ml-0.5">· {timeAgo(agent.lastHeartbeatAt)}</span>
            {agent.lastErrorAt && !online && (
              <AlertCircle size={13} className="text-red-500" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function PacsDashboard() {
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

  const stats  = data?.worklist;
  const events = data?.recentEvents ?? [];
  const agents = agentStatusData?.agents ?? [];

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
      <div className="space-y-2">
        <ConquestBadge conquest={conquest} />
        <AgentStatusBar agents={agents} />
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading dashboard…</div>
      ) : (
        <>
          {/* Top stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard title="Today's Studies" value={stats?.todayTotal ?? 0} icon={<ScanSearch size={20} />} />
            <StatCard title="Reported Today" value={stats?.todayReported ?? 0} icon={<CheckCircle2 size={20} />} />
            <StatCard title="Total in Worklist" value={stats?.total ?? 0} icon={<Layers size={20} />} />
            <StatCard
              title="Pending Reports"
              value={(stats?.byStatus?.["STUDY_RECEIVED"] ?? 0) + (stats?.byStatus?.["AI_DRAFT_READY"] ?? 0) + (stats?.byStatus?.["REPORT_IN_PROGRESS"] ?? 0)}
              icon={<Clock size={20} />}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status breakdown */}
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
                        {meta.icon}
                        {meta.label}
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

            {/* Modality breakdown */}
            <div className="rounded-xl border bg-card shadow-sm">
              <div className="px-5 py-3 border-b">
                <h3 className="font-semibold text-sm">Studies by Modality</h3>
              </div>
              <div className="p-4">
                {stats?.byModality && Object.keys(stats.byModality).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(stats.byModality).sort((a, b) => b[1] - a[1]).map(([mod, count]) => (
                      <div key={mod} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm">
                        <span className="font-bold">{mod}</span>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No data yet.</p>
                )}
              </div>
            </div>
          </div>

          {/* Recent PACS events */}
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
