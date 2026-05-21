import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "@/lib/fetchApi";
import { readStaffSession } from "@/lib/staffSession";
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
  ClipboardList, CalendarDays,
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

export default function RadiologyWorklist() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalityFilter, setModalityFilter] = useState("all");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const staffRole = readStaffSession()?.user?.role ?? "unknown";

  const { data: entries = [], isLoading, refetch } = useQuery<WorklistEntry[]>({
    queryKey: ["radiology-pacs-worklist", statusFilter, modalityFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (modalityFilter !== "all") params.set("modality", modalityFilter);
      const url = `/api/radiology/pacs-worklist?${params.toString()}`;
      console.log("[PACS-WORKLIST] Fetching:", url);
      try {
        const result = await api.get<WorklistEntry[]>(url);
        console.log("[PACS-WORKLIST] Response count:", result.length);
        if (result.length > 0) {
          console.log("[PACS-WORKLIST] Sample entry:", JSON.stringify(result[0]).slice(0, 300));
        } else {
          console.warn("[PACS-WORKLIST] Zero results returned from API.");
        }
        return result;
      } catch (err) {
        console.error("[PACS-WORKLIST] Auth/fetch error:", err);
        throw err;
      }
    },
    staleTime: 0,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!isLoading) setLastRefresh(new Date());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

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

  function openWeasis(entry: WorklistEntry) {
    const url = entry.weasisUrl;
    if (!url) {
      toast({ title: "Weasis URL not available", description: "No Weasis URL recorded for this study.", variant: "destructive" });
      return;
    }
    window.open(url, "_blank");
  }

  const trulyEmpty = entries.length === 0 && !isLoading;
  const filteredEmpty = entries.length > 0 && filtered.length === 0;

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
            {/* ── DEBUG BANNER ── */}
            <div className="rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700 p-3 font-mono text-xs space-y-0.5">
              <div className="text-blue-800 dark:text-blue-300 font-semibold text-sm mb-1">PACS Worklist — Diagnostic Info</div>
              <div><span className="text-blue-600 dark:text-blue-400 select-none">API endpoint : </span>GET /api/radiology/pacs-worklist</div>
              <div><span className="text-blue-600 dark:text-blue-400 select-none">Staff role   : </span>{staffRole}</div>
              <div><span className="text-blue-600 dark:text-blue-400 select-none">Studies      : </span>{isLoading ? "loading…" : `${entries.length} returned`}</div>
              <div><span className="text-blue-600 dark:text-blue-400 select-none">Last refresh : </span>{lastRefresh ? lastRefresh.toLocaleTimeString() : "pending…"}</div>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                <RefreshCw className="h-4 w-4 mr-1" /> Refresh PACS Studies
              </Button>
            </div>

          {/* Debug counter */}
      <div className="flex items-center justify-between bg-slate-100 dark:bg-muted/40 border border-slate-200 dark:border-card-border rounded-lg px-4 py-2">
        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
          Total PACS Studies: <span className="text-lg text-slate-900 dark:text-foreground tabular-nums">{entries.length}</span>
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {isLoading ? "Loading..." : filtered.length === entries.length ? "All visible" : `${filtered.length} filtered`}
        </span>
      </div>

      {/* Filters */}
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
      </div>

      {/* Status summary chips */}
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
      ) : trulyEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <ScanSearch className="h-12 w-12" />
          <p className="text-base font-semibold">No PACS studies found</p>
          <p className="text-sm max-w-md text-center">
            The radiology_worklist table is empty. Ensure your DICOM puller / Conquest PACS is sending studies to the ingestion endpoint.
          </p>
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
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Patient Name</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Patient ID</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Modality</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Study Description</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Accession No</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Study Date</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Source AE</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Created At</th>
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Status</th>
                <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Open Viewer</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((entry) => (
                <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
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
                        disabled={!entry.weasisUrl}
                      >
                        <Tv2 className="h-3 w-3 mr-1" />
                        Weasis
                      </Button>

                      {entry.studyInstanceUID && (
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

                      {entry.status !== "REPORT_FINAL" && entry.status !== "DELIVERED" && (
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

                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => navigate(`/radiology/reporting-workspace/${entry.id}`)}
                        title="Open Reporting Workspace"
                      >
                        <FileEdit className="h-3 w-3 mr-1" />
                        Workspace
                      </Button>

                      {(entry.status === "REPORT_IN_PROGRESS" || entry.status === "AI_DRAFT_READY") && (
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

      <div className="text-xs text-muted-foreground text-right">
        {filtered.length} of {entries.length} entries
        {entries.length > 0 && <span> &middot; Auto-refreshes every 30s</span>}
      </div>

      {/* Safety notice */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div>
          <span className="font-semibold">Safety: </span>
          AI drafts are never automatically marked as final. A radiologist must review and explicitly save the final report.
          Automated email delivery is not enabled \u2014 status is set to READY_TO_SEND only.
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
