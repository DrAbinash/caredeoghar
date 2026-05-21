import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "@/lib/fetchApi";
import { readStaffSession, ERP_SESSION_KEY } from "@/lib/staffSession";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ScanSearch, RefreshCw, ExternalLink, Sparkles, FileEdit, CheckCircle2,
  Search, Filter, Clock, CheckCheck, AlertCircle, MonitorPlay, Tv2,
  ClipboardList, CalendarDays, ShieldCheck, ShieldOff, Database,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MwlPanel } from "@/pages/MwlDashboard";

type WorklistEntry = {
  id: number;
  studyId: number | null;
  patientId: number | null;
  dicomPatientId: string | null;
  patientName: string;
  age: string | null;
  sex: string | null;
  modality: string;
  studyDescription: string | null;
  studyDate: string | null;
  accessionNumber: string;
  studyInstanceUID: string | null;
  aeTitle: string | null;
  ipAddress: string | null;
  port: number | null;
  referringDoctor: string | null;
  weasisUrl: string | null;
  sourceAeTitle: string | null;
  status: string;
  assignedRadiologist: string | null;
  aiDraftStatus: string;
  reportId: number | null;
  deliveryStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  STUDY_RECEIVED: { label: "Received", color: "bg-blue-100 text-blue-800 border-blue-200", icon: <Clock className="h-3 w-3" /> },
  AI_DRAFT_READY: { label: "AI Draft Ready", color: "bg-purple-100 text-purple-800 border-purple-200", icon: <Sparkles className="h-3 w-3" /> },
  REPORT_IN_PROGRESS: { label: "In Progress", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: <FileEdit className="h-3 w-3" /> },
  REPORT_FINAL: { label: "Final", color: "bg-green-100 text-green-800 border-green-200", icon: <CheckCircle2 className="h-3 w-3" /> },
  DELIVERED: { label: "Delivered", color: "bg-gray-100 text-gray-700 border-gray-200", icon: <CheckCheck className="h-3 w-3" /> },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "bg-gray-100 text-gray-700 border-gray-200", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

const MODALITY_OPTIONS = ["all", "CR", "MR", "CT", "US", "MG", "BMD", "OT"];
const STATUS_OPTIONS = ["all", "STUDY_RECEIVED", "AI_DRAFT_READY", "REPORT_IN_PROGRESS", "REPORT_FINAL", "DELIVERED"];

function fmtDate(iso: string | null): string {
  if (!iso) return "\u2014";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function StudyQueuePanel() {
  const { data: studies = [], isLoading, refetch, isFetching } = useQuery<{
    id: number; patientName: string; modality: string; status: string;
    createdAt: string; assignedRadiologist: string | null;
  }[]>({
    queryKey: ["study-queue-brief"],
    queryFn: () => api.get("/api/radiology/worklist"),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{studies.length} studies in queue</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw size={14} className={isFetching ? "animate-spin mr-1.5" : "mr-1.5"} /> Refresh
        </Button>
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-10 text-center">Loading…</div>
      ) : studies.length === 0 ? (
        <div className="text-sm text-muted-foreground py-10 text-center">No studies in queue</div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                <th className="px-3 py-2 text-left">Patient</th>
                <th className="px-3 py-2 text-left">Modality</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Radiologist</th>
                <th className="px-3 py-2 text-left">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {studies.slice(0, 100).map((s) => (
                <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 font-medium">{s.patientName}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-xs font-medium">{s.modality}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded bg-muted text-xs">{s.status}</span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{s.assignedRadiologist ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Live Debug Panel ─────────────────────────────────────────────────────────
function PacsDebugPanel({
  entries,
  filtered,
  isLoading,
  isError,
  error,
  lastRefresh,
  statusFilter,
  modalityFilter,
  search,
  dbTotalRows,
  onForceRefresh,
  onClearCache,
  showSentinel,
  onToggleSentinel,
}: {
  entries: WorklistEntry[];
  filtered: WorklistEntry[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  lastRefresh: Date | null;
  statusFilter: string;
  modalityFilter: string;
  search: string;
  dbTotalRows: number | null;
  onForceRefresh: () => void;
  onClearCache: () => void;
  showSentinel: boolean;
  onToggleSentinel: () => void;
}) {
  const session = readStaffSession();
  const hasToken = !!session?.token;
  const tokenSnippet = session?.token
    ? session.token.slice(0, 12) + "…"
    : "none";

  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-lg border-2 border-blue-400 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-600 overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-2 bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 dark:hover:bg-blue-900/70 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 font-mono text-xs font-bold text-blue-900 dark:text-blue-200">
          <Database className="h-3.5 w-3.5" />
          PACS WORKLIST — LIVE DIAGNOSTIC PANEL
          {isLoading && <span className="ml-2 text-blue-500 animate-pulse">● fetching…</span>}
          {isError && <span className="ml-2 text-red-600">⚠ ERROR</span>}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-blue-600" /> : <ChevronDown className="h-4 w-4 text-blue-600" />}
      </button>

      {expanded && (
        <div className="p-3 font-mono text-xs grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          {/* Auth */}
          <div className="col-span-full flex items-center gap-2 mb-1">
            {hasToken
              ? <><ShieldCheck className="h-3.5 w-3.5 text-green-600" /><span className="text-green-700 dark:text-green-400 font-semibold">AUTH: ACTIVE</span></>
              : <><ShieldOff className="h-3.5 w-3.5 text-red-600" /><span className="text-red-700 font-semibold">AUTH: NO TOKEN — will get 401</span></>
            }
          </div>

          <div><span className="text-blue-500 select-none">Username      : </span>{session?.user?.name ?? "—"}</div>
          <div><span className="text-blue-500 select-none">Email         : </span>{session?.user?.email ?? "—"}</div>
          <div><span className="text-blue-500 select-none">Role          : </span><span className="font-bold">{session?.user?.role ?? "—"}</span></div>
          <div><span className="text-blue-500 select-none">Token prefix  : </span>{tokenSnippet}</div>
          <div><span className="text-blue-500 select-none">Permissions   : </span>{session?.user?.permissions?.join(", ") || "none"}</div>

          <div className="col-span-full border-t border-blue-200 dark:border-blue-700 my-1" />

          <div><span className="text-blue-500 select-none">API endpoint  : </span>GET /api/radiology/pacs-worklist</div>
          <div><span className="text-blue-500 select-none">Active status : </span>{statusFilter === "all" ? "ALL (no filter)" : statusFilter}</div>
          <div><span className="text-blue-500 select-none">Active modality: </span>{modalityFilter === "all" ? "ALL (no filter)" : modalityFilter}</div>
          <div><span className="text-blue-500 select-none">Search text   : </span>{search || "(empty)"}</div>

          <div className="col-span-full border-t border-blue-200 dark:border-blue-700 my-1" />

          <div>
            <span className="text-blue-500 select-none">DB total rows : </span>
            {dbTotalRows === null
              ? <span className="text-blue-400">loading…</span>
              : <span className={dbTotalRows === 0 ? "text-red-600 font-bold" : "text-green-700 dark:text-green-400 font-bold"}>{dbTotalRows} rows in radiology_worklist</span>
            }
          </div>
          <div>
            <span className="text-blue-500 select-none">API returned  : </span>
            <span className={entries.length === 0 && !isLoading ? "text-orange-600 font-bold" : "font-bold"}>{isLoading ? "…" : `${entries.length} rows`}</span>
          </div>
          <div><span className="text-blue-500 select-none">After filter  : </span>{isLoading ? "…" : `${filtered.length} rows visible`}</div>
          <div><span className="text-blue-500 select-none">Last refresh  : </span>{lastRefresh ? lastRefresh.toLocaleTimeString() : "pending…"}</div>

          {isError && (
            <div className="col-span-full text-red-700 font-semibold">
              Error: {error?.message ?? "unknown"}
            </div>
          )}

          <div className="col-span-full border-t border-blue-200 dark:border-blue-700 my-1" />

          <div className="col-span-full flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs border-blue-400 text-blue-700 hover:bg-blue-100" onClick={onForceRefresh}>
              <RefreshCw className="h-3 w-3 mr-1" /> Force Refetch
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs border-blue-400 text-blue-700 hover:bg-blue-100" onClick={onClearCache}>
              Clear RQ Cache + Refetch
            </Button>
            <Button
              size="sm"
              variant={showSentinel ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={onToggleSentinel}
              title="Inject a fake hardcoded row to confirm the table renders correctly"
            >
              {showSentinel ? "Hide" : "Show"} Sentinel Row
            </Button>
          </div>
          <div className="col-span-full text-blue-400 mt-1">
            Check browser Console → filter "[PACS" for request/response logs.
          </div>
        </div>
      )}
    </div>
  );
}

// Hardcoded sentinel row — proves the table renders when shown
const SENTINEL_ROW: WorklistEntry = {
  id: -1,
  studyId: null,
  patientId: null,
  dicomPatientId: "TEST-001",
  patientName: "SENTINEL TEST PATIENT",
  age: "40Y",
  sex: "M",
  modality: "CT",
  studyDescription: "HARDCODED SENTINEL — table render test",
  studyDate: new Date().toISOString().slice(0, 10),
  accessionNumber: "ACC-SENTINEL-001",
  studyInstanceUID: null,
  aeTitle: "SENTINEL_AE",
  ipAddress: null,
  port: null,
  referringDoctor: "Debug Doctor",
  weasisUrl: null,
  sourceAeTitle: "SENTINEL_AE",
  status: "STUDY_RECEIVED",
  assignedRadiologist: null,
  aiDraftStatus: "NONE",
  reportId: null,
  deliveryStatus: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export default function RadiologyWorklist() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalityFilter, setModalityFilter] = useState("all");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [showSentinel, setShowSentinel] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const prevEntriesLen = useRef(-1);

  const { data: entries = [], isLoading, isError, error, refetch } = useQuery<WorklistEntry[]>({
    queryKey: ["radiology-pacs-worklist", statusFilter, modalityFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (modalityFilter !== "all") params.set("modality", modalityFilter);
      const url = `/api/radiology/pacs-worklist?${params.toString()}`;
      console.log("[PACS-WORKLIST] Fetching:", url);
      const session = readStaffSession();
      console.log("[PACS-WORKLIST] Auth token present:", !!session?.token, "| role:", session?.user?.role);
      try {
        const result = await api.get<WorklistEntry[]>(url);
        console.log("PACS API RESPONSE", result);
        console.log("[PACS-WORKLIST] Rows returned:", result.length);
        if (result.length > 0) {
          console.log("[PACS-WORKLIST] First row:", JSON.stringify(result[0]).slice(0, 400));
        } else {
          console.warn("[PACS-WORKLIST] API returned 0 rows. Check radiology_worklist table in DB.");
        }
        return result;
      } catch (err) {
        console.error("[PACS-WORKLIST] Fetch/auth error:", err);
        throw err;
      }
    },
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 30_000,
  });

  // DB total count — separate query, no filters, for debug panel
  const { data: countData } = useQuery<{ totalRows: number }>({
    queryKey: ["radiology-pacs-worklist-count"],
    queryFn: async () => {
      const result = await api.get<{ totalRows: number }>("/api/radiology/pacs-worklist/count");
      console.log("[PACS-WORKLIST] DB total rows:", result.totalRows);
      return result;
    },
    staleTime: 0,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!isLoading && prevEntriesLen.current !== entries.length) {
      setLastRefresh(new Date());
      prevEntriesLen.current = entries.length;
      // Auto-show raw JSON if API returned rows but table is likely empty (first load)
      if (entries.length > 0) setShowRawJson(false);
    }
  }, [entries, isLoading]);

  const aiDraftMutation = useMutation({
    mutationFn: (entry: WorklistEntry) =>
      api.post("/api/internal/radiology/ai-draft", {
        studyId: entry.id,
        modality: entry.modality,
        studyDescription: entry.studyDescription ?? entry.modality,
        patientName: entry.patientName,
        age: entry.age ?? "",
        sex: entry.sex ?? "",
        accessionNumber: entry.accessionNumber,
        studyDate: entry.studyDate ?? "",
      }),
    onSuccess: (_data, entry) => {
      toast({ title: "AI Draft Ready", description: `Draft generated for ${entry.patientName}` });
      void qc.invalidateQueries({ queryKey: ["radiology-pacs-worklist"] });
    },
    onError: (err) => {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to generate draft", variant: "destructive" });
    },
  });

  const markFinalMutation = useMutation({
    mutationFn: (entry: WorklistEntry) =>
      api.post("/api/internal/radiology/report-status", {
        accessionNumber: entry.accessionNumber,
        studyInstanceUID: entry.studyInstanceUID,
        status: "REPORT_FINAL",
        actor: "staff",
      }),
    onSuccess: (_data, entry) => {
      toast({ title: "Marked Final", description: `Study ${entry.accessionNumber} marked as final` });
      void qc.invalidateQueries({ queryKey: ["radiology-pacs-worklist"] });
    },
    onError: (err) => {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Update failed", variant: "destructive" });
    },
  });

  const filtered = entries.filter((e) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      e.patientName.toLowerCase().includes(s) ||
      e.accessionNumber.toLowerCase().includes(s) ||
      (e.studyDescription ?? "").toLowerCase().includes(s) ||
      (e.referringDoctor ?? "").toLowerCase().includes(s)
    );
  });

  // Rows to render in table — real rows + optional sentinel
  const tableRows = [
    ...(showSentinel ? [SENTINEL_ROW] : []),
    ...filtered,
  ];

  function openWeasis(entry: WorklistEntry) {
    const url = entry.weasisUrl;
    if (!url) {
      toast({ title: "Weasis URL not available", description: "No Weasis URL recorded for this study.", variant: "destructive" });
      return;
    }
    window.open(url, "_blank");
  }

  function handleClearCache() {
    void qc.resetQueries({ queryKey: ["radiology-pacs-worklist"] });
    void qc.resetQueries({ queryKey: ["radiology-pacs-worklist-count"] });
    window.localStorage.removeItem("pacs_worklist_cache");
    console.log("[PACS-WORKLIST] React Query cache cleared, re-fetching…");
    setTimeout(() => void refetch(), 100);
  }

  const trulyEmpty = entries.length === 0 && !isLoading;
  const filteredEmpty = entries.length > 0 && tableRows.length === 0;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader title="Worklist Hub" subtitle="Study queue, PACS worklist, and modality worklist in one place" />

      <Tabs defaultValue="pacs-worklist" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="study-queue"><ClipboardList size={14} className="mr-1.5" />Study Queue</TabsTrigger>
          <TabsTrigger value="pacs-worklist"><ScanSearch size={14} className="mr-1.5" />PACS Worklist</TabsTrigger>
          <TabsTrigger value="mwl"><CalendarDays size={14} className="mr-1.5" />MWL</TabsTrigger>
        </TabsList>

        <TabsContent value="study-queue">
          <StudyQueuePanel />
        </TabsContent>

        <TabsContent value="pacs-worklist">
          <div className="flex flex-col gap-4">

            {/* ── LIVE DEBUG PANEL ── */}
            <PacsDebugPanel
              entries={entries}
              filtered={filtered}
              isLoading={isLoading}
              isError={isError}
              error={error as Error | null}
              lastRefresh={lastRefresh}
              statusFilter={statusFilter}
              modalityFilter={modalityFilter}
              search={search}
              dbTotalRows={countData?.totalRows ?? null}
              onForceRefresh={() => void refetch()}
              onClearCache={handleClearCache}
              showSentinel={showSentinel}
              onToggleSentinel={() => setShowSentinel((v) => !v)}
            />

            {/* Summary bar */}
            <div className="flex items-center justify-between bg-slate-100 dark:bg-muted/40 border border-slate-200 dark:border-card-border rounded-lg px-4 py-2">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Total PACS Studies: <span className="text-lg text-slate-900 dark:text-foreground tabular-nums">{entries.length}</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {isLoading ? "Loading..." : filtered.length === entries.length ? "All visible" : `${filtered.length} filtered`}
                </span>
                <Button variant="outline" size="sm" onClick={() => void refetch()}>
                  <RefreshCw className="h-4 w-4 mr-1" /> Refresh
                </Button>
              </div>
            </div>

            {/* Filters — all default to ALL */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search patient, accession..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <Filter className="h-4 w-4 mr-1 text-muted-foreground" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s === "all" ? "All Statuses" : (STATUS_CONFIG[s]?.label ?? s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={modalityFilter} onValueChange={setModalityFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Modality" />
                </SelectTrigger>
                <SelectContent>
                  {MODALITY_OPTIONS.map((m) => (
                    <SelectItem key={m} value={m}>{m === "all" ? "All Modalities" : m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(statusFilter !== "all" || modalityFilter !== "all" || search) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => { setSearch(""); setStatusFilter("all"); setModalityFilter("all"); }}
                >
                  Clear filters
                </Button>
              )}
            </div>

            {/* Status chips */}
            <div className="flex gap-2 flex-wrap">
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                const count = entries.filter((e) => e.status === key).length;
                if (count === 0) return null;
                return (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer transition-opacity ${cfg.color} ${statusFilter === key ? "opacity-100 ring-2 ring-offset-1 ring-current" : "opacity-80 hover:opacity-100"}`}
                  >
                    {cfg.icon} {cfg.label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Table */}
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : trulyEmpty && !showSentinel ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <ScanSearch className="h-12 w-12" />
                <p className="text-base font-semibold">No PACS studies found</p>
                <p className="text-sm max-w-md text-center">
                  {(countData?.totalRows ?? 0) === 0
                    ? "The radiology_worklist table is empty. Push a study via your DICOM agent / Conquest PACS to see entries here."
                    : `DB has ${countData?.totalRows} rows but API returned 0. Check auth token / filters above.`
                  }
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSentinel(true)}
                  className="mt-1"
                >
                  Show sentinel row (render test)
                </Button>
              </div>
            ) : filteredEmpty ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                <ScanSearch className="h-10 w-10" />
                <p className="text-sm font-semibold">No studies match your filters</p>
                <p className="text-xs">{entries.length} total in database. Try clearing search or changing filters.</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => { setSearch(""); setStatusFilter("all"); setModalityFilter("all"); }}>
                  Clear All Filters
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-left">
                      {showSentinel && <th className="px-3 py-2.5 font-medium whitespace-nowrap text-orange-600">⚠ Debug</th>}
                      <th className="px-3 py-2.5 font-medium whitespace-nowrap">Patient Name</th>
                      <th className="px-3 py-2.5 font-medium whitespace-nowrap">Patient ID</th>
                      <th className="px-3 py-2.5 font-medium whitespace-nowrap">Modality</th>
                      <th className="px-3 py-2.5 font-medium whitespace-nowrap">Study Description</th>
                      <th className="px-3 py-2.5 font-medium whitespace-nowrap">Accession No</th>
                      <th className="px-3 py-2.5 font-medium whitespace-nowrap">Study Date</th>
                      <th className="px-3 py-2.5 font-medium whitespace-nowrap">Source AE</th>
                      <th className="px-3 py-2.5 font-medium whitespace-nowrap">Created At</th>
                      <th className="px-3 py-2.5 font-medium whitespace-nowrap">Status</th>
                      <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {tableRows.map((entry) => (
                      <tr
                        key={entry.id}
                        className={`hover:bg-muted/30 transition-colors ${entry.id === -1 ? "bg-orange-50 dark:bg-orange-950/20" : ""}`}
                      >
                        {showSentinel && (
                          <td className="px-3 py-2.5 text-xs text-orange-600 font-mono">
                            {entry.id === -1 ? "SENTINEL" : "real"}
                          </td>
                        )}
                        <td className="px-3 py-2.5 font-medium whitespace-nowrap">{entry.patientName}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {entry.dicomPatientId ?? entry.patientId ?? "\u2014"}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <Badge variant="outline" className="font-mono text-xs">{entry.modality}</Badge>
                        </td>
                        <td className="px-3 py-2.5 max-w-[200px] truncate" title={entry.studyDescription ?? ""}>
                          {entry.studyDescription || "\u2014"}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">{entry.accessionNumber}</td>
                        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                          {entry.studyDate ?? "\u2014"}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                          {entry.sourceAeTitle ?? entry.aeTitle ?? "\u2014"}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                          {fmtDate(entry.createdAt)}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <StatusBadge status={entry.status} />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => openWeasis(entry)}
                              title="Open in Weasis"
                              disabled={!entry.weasisUrl || entry.id === -1}
                            >
                              <Tv2 className="h-3 w-3 mr-1" />
                              Weasis
                            </Button>

                            {entry.studyInstanceUID && entry.id !== -1 && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs text-blue-700 border-blue-300 hover:bg-blue-50"
                                onClick={() => navigate(`/radiology/viewer/${entry.studyInstanceUID}`)}
                                title="Open in OHIF / DICOM Viewer"
                              >
                                <MonitorPlay className="h-3 w-3 mr-1" />
                                OHIF
                              </Button>
                            )}

                            {entry.status !== "REPORT_FINAL" && entry.status !== "DELIVERED" && entry.id !== -1 && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                onClick={() => aiDraftMutation.mutate(entry)}
                                disabled={aiDraftMutation.isPending}
                                title="Generate AI Draft"
                              >
                                <Sparkles className="h-3 w-3 mr-1" />
                                AI
                              </Button>
                            )}

                            {entry.id !== -1 && (
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => navigate(`/radiology/reporting-workspace/${entry.id}`)}
                                title="Open Reporting Workspace"
                              >
                                <FileEdit className="h-3 w-3 mr-1" />
                                Workspace
                              </Button>
                            )}

                            {(entry.status === "REPORT_IN_PROGRESS" || entry.status === "AI_DRAFT_READY") && entry.id !== -1 && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs border-green-500 text-green-700 hover:bg-green-50"
                                onClick={() => {
                                  if (confirm(`Mark study ${entry.accessionNumber} as FINAL?`)) {
                                    markFinalMutation.mutate(entry);
                                  }
                                }}
                                disabled={markFinalMutation.isPending}
                                title="Mark Final"
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Final
                              </Button>
                            )}

                            {entry.status === "REPORT_FINAL" && (
                              <span className="text-xs text-green-700 font-medium flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Finalized
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Emergency fallback: raw JSON cards ── */}
            {entries.length > 0 && (
              <div>
                <button
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                  onClick={() => setShowRawJson((v) => !v)}
                >
                  {showRawJson ? "Hide" : "Show"} raw API response ({entries.length} rows) — use if table appears blank
                </button>
                {showRawJson && (
                  <div className="mt-2 space-y-2 max-h-96 overflow-y-auto">
                    {entries.map((entry, idx) => (
                      <pre
                        key={entry.id ?? idx}
                        className="rounded border bg-slate-50 dark:bg-muted/40 p-2 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all"
                      >
                        {JSON.stringify(entry, null, 2)}
                      </pre>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="text-xs text-muted-foreground text-right">
              {filtered.length} of {entries.length} entries
              {entries.length > 0 && <span> &middot; Auto-refreshes every 30s</span>}
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold">Safety: </span>
                AI drafts are never automatically marked as final. A radiologist must review and explicitly save the final report.
                Automated email delivery is not enabled — status is set to READY_TO_SEND only.
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="mwl">
          <MwlPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
