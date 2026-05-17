import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Search, RefreshCw, CalendarDays, MonitorPlay, Tv2, Copy,
  CheckCircle2, AlertCircle, Download, Shield, Server,
  WifiOff, Filter, XCircle, Activity,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type StudyRow = {
  id: number;
  accessionNumber: string;
  studyInstanceUID: string | null;
  modality: string;
  studyDate: string;
  studyDescription: string | null;
  referringDoctor: string | null;
  status: string;
  scheduledStationAETitle: string | null;
  patientId: number;
  patientName: string;
  pullStatus: string | null;
  pulledAt: string | null;
};

type QueryResult = {
  studies: StudyRow[];
  total: number;
  limit: number;
  offset: number;
};

type Doctor = { id: number; name: string };

type PacsHealth = {
  pendingRetries: number;
  totalActiveModalities: number;
  healthyModalities: number;
  pulledToday: Record<string, number>;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function localDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const parts = s.split("-");
  if (parts.length !== 3) return s;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parts[2]} ${months[Number(parts[1]) - 1]} ${parts[0]}`;
}

const MODALITIES = ["MR", "CT", "CR", "DX", "US", "MG", "XA", "NM", "PT", "OT"];

const PULL_STATUS: Record<string, { label: string; cls: string }> = {
  RETRIEVE_REQUESTED: { label: "QUEUED",     cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  NEW:                { label: "QUEUED",     cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  PULLED:             { label: "PULLED",     cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  PUSHED_TO_PACS:     { label: "IN PACS",    cls: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  FAILED:             { label: "FAILED",     cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  DUPLICATE_SKIPPED:  { label: "DUPLICATE",  cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
};

const MOD_COLORS: Record<string, string> = {
  MR: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  CT: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  CR: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  DX: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  US: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  MG: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  XA: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  NM: "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300",
  PT: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
};

const LIMIT = 50;

// ── Main Component ─────────────────────────────────────────────────────────────

export default function DicomQueryRetrieve() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [dateFrom, setDateFrom]     = useState(localDate());
  const [dateTo, setDateTo]         = useState(localDate());
  const [selMods, setSelMods]       = useState<Set<string>>(new Set());
  const [patientName, setPatientName]         = useState("");
  const [accessionNumber, setAccessionNumber] = useState("");
  const [referringDoctor, setReferringDoctor] = useState("");
  const [studyDescription, setStudyDescription] = useState("");
  const [aeTitle, setAeTitle]       = useState("");

  const [applied, setApplied] = useState<{
    dateFrom: string; dateTo: string; modalities: string[];
    patientName: string; accessionNumber: string; referringDoctor: string;
    studyDescription: string; aeTitle: string;
  }>({
    dateFrom: localDate(), dateTo: localDate(), modalities: [],
    patientName: "", accessionNumber: "", referringDoctor: "",
    studyDescription: "", aeTitle: "",
  });

  const [page, setPage]           = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data, isLoading, isFetching, refetch } = useQuery<QueryResult>({
    queryKey: ["dicom-query", applied, page],
    queryFn: () => {
      const p = new URLSearchParams({
        dateFrom: applied.dateFrom,
        dateTo: applied.dateTo,
        limit: String(LIMIT),
        offset: String((page - 1) * LIMIT),
      });
      if (applied.modalities.length)    p.set("modality",          applied.modalities.join(","));
      if (applied.patientName)          p.set("patientName",        applied.patientName);
      if (applied.accessionNumber)      p.set("accessionNumber",    applied.accessionNumber);
      if (applied.referringDoctor)      p.set("referringDoctor",    applied.referringDoctor);
      if (applied.studyDescription)     p.set("studyDescription",   applied.studyDescription);
      if (applied.aeTitle)              p.set("aeTitle",            applied.aeTitle);
      return api.get<QueryResult>(`/api/radiology/dicom-query?${p}`);
    },
  });

  const { data: doctors } = useQuery<Doctor[]>({
    queryKey: ["doctors-list"],
    queryFn:  () => api.get<Doctor[]>("/api/doctors"),
  });

  const { data: health } = useQuery<PacsHealth>({
    queryKey: ["pacs-health-qr"],
    queryFn:  () => api.get("/api/radiology/pacs-dashboard-ext"),
    refetchInterval: 30_000,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const retrieveMut = useMutation({
    mutationFn: (studies: StudyRow[]) =>
      api.post<{ count: number }>("/api/radiology/dicom-retrieve/bulk", {
        studies: studies.map((s) => ({
          studyInstanceUID: s.studyInstanceUID ?? undefined,
          accessionNumber:  s.accessionNumber,
          modality:         s.modality,
          patientName:      s.patientName,
          patientId:        String(s.patientId),
          studyDate:        s.studyDate,
        })),
      }),
    onSuccess: (res) => {
      toast({ title: `Queued ${res.count} studies for retrieval`, description: "The pull agent picks them up on its next cycle." });
      void refetch();
      setSelectedIds(new Set());
    },
    onError: () => toast({ title: "Retrieve request failed", variant: "destructive" }),
  });

  // ── Derived ───────────────────────────────────────────────────────────────────

  const studies    = data?.studies ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);
  const selectedStudies = studies.filter((s) => selectedIds.has(s.id));

  const healthyMods = health?.healthyModalities ?? 0;
  const totalMods   = health?.totalActiveModalities ?? 0;
  const failedQueue = health?.pendingRetries ?? 0;

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const applyFilters = useCallback(() => {
    setApplied({
      dateFrom, dateTo, modalities: Array.from(selMods),
      patientName, accessionNumber, referringDoctor, studyDescription, aeTitle,
    });
    setPage(1);
    setSelectedIds(new Set());
  }, [dateFrom, dateTo, selMods, patientName, accessionNumber, referringDoctor, studyDescription, aeTitle]);

  const applyQuickDate = useCallback((offset: number) => {
    const d = localDate(offset);
    setDateFrom(d);
    setDateTo(d);
    setApplied((prev) => ({ ...prev, dateFrom: d, dateTo: d }));
    setPage(1);
    setSelectedIds(new Set());
  }, []);

  const clearAll = useCallback(() => {
    const d = localDate();
    setDateFrom(d); setDateTo(d);
    setSelMods(new Set());
    setPatientName(""); setAccessionNumber("");
    setReferringDoctor(""); setStudyDescription(""); setAeTitle("");
    setApplied({
      dateFrom: d, dateTo: d, modalities: [],
      patientName: "", accessionNumber: "", referringDoctor: "",
      studyDescription: "", aeTitle: "",
    });
    setPage(1);
    setSelectedIds(new Set());
  }, []);

  const toggleMod = (m: string) =>
    setSelMods((prev) => { const n = new Set(prev); n.has(m) ? n.delete(m) : n.add(m); return n; });

  const toggleAll = () =>
    setSelectedIds(selectedIds.size === studies.length ? new Set() : new Set(studies.map((s) => s.id)));

  const toggleRow = (id: number) =>
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function copyText(text: string, key: string) {
    navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
    toast({ title: "Copied to clipboard" });
  }

  function openAllSelectedOhif() {
    for (const s of selectedStudies) {
      if (s.studyInstanceUID) window.open(`/erp/radiology/viewer/${s.studyInstanceUID}`, "_blank");
    }
  }

  function openAllSelectedWeasis() {
    for (const s of selectedStudies) {
      if (s.studyInstanceUID) window.open(`/api/radiology/studies/${s.studyInstanceUID}/weasis-launch-redirect`, "_blank");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-5">
      <PageHeader
        title="DICOM Query / Retrieve"
        subtitle="Search radiology studies by date, modality, patient, or referring doctor — then open or retrieve"
        actions={
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
            Refresh
          </Button>
        }
      />

      {/* ── System Health Bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 text-xs">
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium border ${
          totalMods === 0 ? "bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700"
          : healthyMods === totalMods ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300"
          : "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300"
        }`}>
          {totalMods === 0 ? <WifiOff size={11} /> : healthyMods === totalMods ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
          {totalMods === 0 ? "No modalities configured" : `${healthyMods}/${totalMods} modalities OK`}
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium border ${
          failedQueue === 0 ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300"
          : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300"
        }`}>
          {failedQueue === 0 ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
          {failedQueue === 0 ? "No failed retrievals" : `${failedQueue} failed in queue`}
        </div>
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium border bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300">
          <Server size={11} /> {total > 0 ? `${total} studies found` : "Ready to query"}
        </span>
        <a
          href="/erp/radiology/pacs-settings"
          className="flex items-center gap-1 px-2.5 py-1 rounded-full font-medium border bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700"
        >
          <Shield size={11} /> Viewer URLs
        </a>
      </div>

      {/* ── Filter Panel ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="px-5 py-3 border-b flex items-center gap-2">
          <Filter size={14} className="text-muted-foreground" />
          <h2 className="text-sm font-bold">Search Criteria</h2>
        </div>
        <div className="p-4 space-y-4">

          {/* Quick Dates */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold text-muted-foreground">Quick Date:</span>
            {([
              { label: "Today",      offset: 0 },
              { label: "Yesterday",  offset: 1 },
              { label: "Day Before", offset: 2 },
            ] as const).map(({ label, offset }) => {
              const d = localDate(offset);
              const active = applied.dateFrom === d && applied.dateTo === d;
              return (
                <Button
                  key={label}
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className="h-7 text-xs gap-1"
                  onClick={() => applyQuickDate(offset)}
                >
                  <CalendarDays size={11} />
                  {label}
                  <span className="text-[10px] opacity-70 font-mono hidden sm:inline">{d}</span>
                </Button>
              );
            })}
          </div>

          {/* Date range + patient name + accession */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">From Date</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">To Date</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Patient Name</label>
              <Input
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                placeholder="Search…"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Accession #</label>
              <Input
                value={accessionNumber}
                onChange={(e) => setAccessionNumber(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                placeholder="ACC-…"
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          {/* Modality chips */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Modality</label>
            <div className="flex flex-wrap gap-1.5">
              {MODALITIES.map((m) => (
                <button
                  key={m}
                  onClick={() => toggleMod(m)}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-all ${
                    selMods.has(m)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:border-primary/50 text-foreground"
                  }`}
                >
                  {m}
                </button>
              ))}
              {selMods.size > 0 && (
                <button
                  onClick={() => setSelMods(new Set())}
                  className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  × clear
                </button>
              )}
            </div>
          </div>

          {/* Referring Doctor + Study Description + AE Title */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Referring Doctor</label>
              <select
                value={referringDoctor}
                onChange={(e) => setReferringDoctor(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">All doctors</option>
                {(doctors ?? []).map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Study Description</label>
              <Input
                value={studyDescription}
                onChange={(e) => setStudyDescription(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                placeholder="Brain MRI, Chest X-Ray…"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Station AE Title</label>
              <Input
                value={aeTitle}
                onChange={(e) => setAeTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                placeholder="MRI_ROOM1…"
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={applyFilters} disabled={isFetching} className="gap-1.5">
              <Search size={13} /> Query
            </Button>
            <Button size="sm" variant="outline" onClick={clearAll} className="gap-1.5">
              <XCircle size={13} /> Clear
            </Button>
          </div>
        </div>
      </div>

      {/* ── Bulk Action Toolbar ────────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="sticky top-14 z-10 rounded-xl border border-primary/30 bg-primary/5 shadow-lg px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-primary">{selectedIds.size} selected</span>
          <div className="flex flex-wrap gap-2 ml-auto">
            <Button
              size="sm"
              onClick={() => retrieveMut.mutate(selectedStudies)}
              disabled={retrieveMut.isPending}
              className="h-7 text-xs gap-1"
            >
              <Download size={12} />
              {retrieveMut.isPending ? "Queueing…" : `Retrieve (${selectedIds.size})`}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openAllSelectedOhif}>
              <MonitorPlay size={12} /> OHIF ({selectedIds.size})
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openAllSelectedWeasis}>
              <Tv2 size={12} /> Weasis ({selectedIds.size})
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
              × Clear
            </Button>
          </div>
        </div>
      )}

      {/* ── Results Table ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <Activity size={14} />
            Results
            {total > 0 && <span className="text-xs font-normal text-muted-foreground">({total.toLocaleString()} studies found)</span>}
          </h2>
          {isFetching && <RefreshCw size={13} className="animate-spin text-muted-foreground" />}
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Querying studies…</div>
        ) : studies.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Search size={36} className="mx-auto opacity-20" />
            <p className="text-sm font-medium text-muted-foreground">No studies found.</p>
            <p className="text-xs text-muted-foreground">Try Today / Yesterday or adjust filters, then click Query.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="px-3 py-2.5 w-8">
                    <input
                      type="checkbox"
                      checked={studies.length > 0 && selectedIds.size === studies.length}
                      onChange={toggleAll}
                      className="accent-primary"
                    />
                  </th>
                  {["Accession #", "Patient", "Mod", "Date", "Description", "Ref. Doctor", "Study UID", "Pull Status", "Actions"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {studies.map((s) => {
                  const pullMeta = s.pullStatus ? (PULL_STATUS[s.pullStatus] ?? null) : null;
                  const sel = selectedIds.has(s.id);
                  return (
                    <tr key={s.id} className={`hover:bg-muted/20 transition-colors ${sel ? "bg-primary/5" : ""}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={sel} onChange={() => toggleRow(s.id)} className="accent-primary" />
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold whitespace-nowrap">{s.accessionNumber}</td>
                      <td className="px-3 py-2 max-w-[140px]">
                        <p className="font-semibold truncate">{s.patientName || "—"}</p>
                        <p className="text-muted-foreground text-[10px]">ID: {s.patientId}</p>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${MOD_COLORS[s.modality] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                          {s.modality}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(s.studyDate)}</td>
                      <td className="px-3 py-2 max-w-[160px] truncate" title={s.studyDescription ?? ""}>{s.studyDescription ?? "—"}</td>
                      <td className="px-3 py-2 max-w-[120px] truncate" title={s.referringDoctor ?? ""}>
                        {s.referringDoctor ? `Dr. ${s.referringDoctor}` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {s.studyInstanceUID ? (
                          <div className="flex items-center gap-1">
                            <span
                              className="font-mono text-[10px] text-muted-foreground truncate max-w-[88px]"
                              title={s.studyInstanceUID}
                            >
                              {s.studyInstanceUID}
                            </span>
                            <button
                              onClick={() => copyText(s.studyInstanceUID!, `uid-${s.id}`)}
                              className="shrink-0 p-0.5 rounded hover:bg-muted"
                              title="Copy Study UID"
                            >
                              <Copy size={9} className={copiedKey === `uid-${s.id}` ? "text-green-600" : "text-muted-foreground"} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">No UID yet</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {pullMeta ? (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${pullMeta.cls}`}>{pullMeta.label}</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">NOT PULLED</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 flex-wrap">
                          <button
                            onClick={() => copyText(s.accessionNumber, `acc-${s.id}`)}
                            className="inline-flex items-center gap-0.5 text-[10px] rounded px-1.5 py-0.5 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 font-medium"
                            title="Copy Accession #"
                          >
                            <Copy size={9} className={copiedKey === `acc-${s.id}` ? "text-green-600" : ""} />
                            ACC
                          </button>
                          {s.studyInstanceUID && (
                            <>
                              <button
                                onClick={() => { void navigate(`/radiology/viewer/${s.studyInstanceUID}`); }}
                                className="inline-flex items-center gap-0.5 text-[10px] rounded px-1.5 py-0.5 bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 font-medium"
                                title="Open in OHIF"
                              >
                                <MonitorPlay size={9} /> OHIF
                              </button>
                              <button
                                onClick={() => window.open(`/api/radiology/studies/${s.studyInstanceUID}/weasis-launch-redirect`, "_blank")}
                                className="inline-flex items-center gap-0.5 text-[10px] rounded px-1.5 py-0.5 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 font-medium"
                                title="Open in Weasis"
                              >
                                <Tv2 size={9} />
                              </button>
                            </>
                          )}
                          {!s.pullStatus && (
                            <button
                              onClick={() => retrieveMut.mutate([s])}
                              disabled={retrieveMut.isPending}
                              className="inline-flex items-center gap-0.5 text-[10px] rounded px-1.5 py-0.5 bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 font-medium disabled:opacity-50"
                              title="Queue for retrieval"
                            >
                              <Download size={9} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t flex items-center justify-between text-xs text-muted-foreground">
            <span>Page {page} of {totalPages} · {total} total studies</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</Button>
            </div>
          </div>
        )}
      </div>

      {/* ── QA / Test Sequence ────────────────────────────────────────────────── */}
      <div className="rounded-xl border p-5 bg-muted/30 space-y-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Shield size={15} /> System Health &amp; Test Sequence
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-background p-3 text-center">
            <p className={`text-xl font-bold ${totalMods > 0 && healthyMods === totalMods ? "text-green-600" : "text-amber-600"}`}>{healthyMods}/{totalMods}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mt-0.5">Modalities OK</p>
          </div>
          <div className="rounded-lg border bg-background p-3 text-center">
            <p className={`text-xl font-bold ${failedQueue === 0 ? "text-green-600" : "text-red-600"}`}>{failedQueue}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mt-0.5">Failed Queue</p>
          </div>
          <div className="rounded-lg border bg-background p-3 text-center">
            <p className="text-xl font-bold text-blue-600">{total}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mt-0.5">Studies Found</p>
          </div>
          <div className="rounded-lg border bg-background p-3 text-center">
            <p className={`text-xl font-bold ${(health?.pulledToday?.PULLED ?? 0) > 0 ? "text-purple-600" : "text-gray-400"}`}>
              {health?.pulledToday?.PULLED ?? 0}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mt-0.5">Pulled Today</p>
          </div>
        </div>

        <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
          <li>Confirm <strong>WADO Base URL</strong>, <strong>Orthanc Base URL</strong>, and <strong>OHIF Base URL</strong> are filled in at <a href="/erp/radiology/pacs-settings" className="underline text-primary">PACS Settings → Viewer Settings</a>.</li>
          <li>Go to <a href="/erp/radiology/modality-management" className="underline text-primary">Modality Management</a> and run <strong>C-ECHO</strong> on each device — green = reachable on the network.</li>
          <li>Click <strong>Today</strong> above and then <strong>Query</strong> — radiology orders for today appear here.</li>
          <li>Tick a study that has a Study UID and click <strong>OHIF</strong> — viewer opens if Orthanc already has that study.</li>
          <li>Click <strong>Weasis</strong> (TV icon) — browser should prompt to launch Weasis (requires Weasis installed on this workstation).</li>
          <li>For <span className="font-mono">NOT PULLED</span> studies, click the amber ↓ button or select multiple and click <strong>Retrieve</strong> — the pull agent will C-MOVE them on its next cycle.</li>
          <li>After ~1–2 minutes check <a href="/erp/radiology/dicom-agent-dashboard" className="underline text-primary">Agent Monitor</a> — successful pulls show <span className="font-mono">PULLED / IN PACS</span> here.</li>
        </ol>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {[
            { title: "MRI Test Values",   mod: "MR",    ae: "MRI_SCANNER",  desc: "BRAIN MRI W/WO CONTRAST" },
            { title: "CT Test Values",    mod: "CT",    ae: "CT_SCANNER",   desc: "CHEST CT WITH CONTRAST" },
            { title: "X-Ray Test Values", mod: "CR/DX", ae: "XRAY_ROOM1",   desc: "CHEST PA VIEW" },
          ].map(({ title, mod, ae, desc }) => (
            <div key={title} className="rounded-lg border bg-background p-3 space-y-1">
              <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">{title}</p>
              <p>Modality: <span className="font-mono font-bold">{mod}</span></p>
              <p>AE Title: <span className="font-mono">{ae}</span></p>
              <p>Description: <span className="font-mono">{desc}</span></p>
            </div>
          ))}
        </div>

        <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
          <p className="font-semibold text-foreground text-sm">Manual hospital-side configuration required:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>AE Title, IP, and Port of each modality (MRI / CT / X-Ray) must be entered in <strong>Modality Management</strong>.</li>
            <li>Each modality must have this ERP's AE Title added as a known C-STORE destination.</li>
            <li>Orthanc or Conquest PACS must be installed and configured (AE Title + port).</li>
            <li>OHIF Viewer must be running at the configured OHIF Base URL.</li>
            <li>Weasis must be installed on each radiologist workstation.</li>
            <li>Windows Pull Agent must be running with DCMTK on a Windows PC on the same LAN as the modalities.</li>
            <li>Firewall rules must allow DICOM ports (104, 4242, 11112 as applicable).</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
