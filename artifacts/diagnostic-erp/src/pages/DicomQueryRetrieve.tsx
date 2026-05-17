import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "@/lib/fetchApi";
import { readStaffSession } from "@/lib/staffSession";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Search, RefreshCw, CalendarDays, MonitorPlay, Tv2, Copy,
  CheckCircle2, AlertCircle, Download, Shield, Server,
  WifiOff, Filter, XCircle, Activity, BookmarkPlus, Bookmark, Trash2, ChevronDown,
  Database, Radio, Info,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type DicomPresetFilters = {
  dateFrom: string;
  dateTo: string;
  modalities: string[];
  patientName: string;
  accessionNumber: string;
  referringDoctor: string;
  studyDescription: string;
  aeTitle: string;
};

type DicomPreset = {
  id: string;
  name: string;
  filters: DicomPresetFilters;
  createdAt: string;
};

function getPresetKey(userId?: number): string {
  return `dicom_qr_presets_${userId ?? "anon"}`;
}

function loadPresets(userId?: number): DicomPreset[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(getPresetKey(userId)) : null;
    if (!raw) return [];
    return JSON.parse(raw) as DicomPreset[];
  } catch {
    return [];
  }
}

function persistPresets(presets: DicomPreset[], userId?: number): void {
  try {
    window.localStorage.setItem(getPresetKey(userId), JSON.stringify(presets));
  } catch { /* ignore quota errors */ }
}

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
  source?: string;
};

type QueryResult = {
  studies: StudyRow[];
  total: number;
  limit: number;
  offset: number;
  source?: string;
  dcmtkHint?: string | null;
};

type SearchMode = "local-db" | "live-pacs";

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

  const session = readStaffSession();
  const userId  = session?.user.id;

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

  const [searchMode, setSearchMode] = useState<SearchMode>("local-db");

  const [page, setPage]           = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // ── Preset state ──────────────────────────────────────────────────────────────
  const [presets, setPresets]         = useState<DicomPreset[]>(() => loadPresets(userId));
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [savePresetName, setSavePresetName] = useState("");
  const [showSaveInput, setShowSaveInput]   = useState(false);
  const presetMenuRef = useRef<HTMLDivElement>(null);
  const saveInputRef  = useRef<HTMLInputElement>(null);

  // Close preset dropdown when clicking outside
  useEffect(() => {
    if (!showPresetMenu) return;
    function onClickOutside(e: MouseEvent) {
      if (presetMenuRef.current && !presetMenuRef.current.contains(e.target as Node)) {
        setShowPresetMenu(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showPresetMenu]);

  // Reload presets if the signed-in user changes (e.g. staff switches accounts
  // without unmounting this page)
  useEffect(() => {
    setPresets(loadPresets(userId));
  }, [userId]);

  // Focus save input when it appears
  useEffect(() => {
    if (showSaveInput) saveInputRef.current?.focus();
  }, [showSaveInput]);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data, isLoading, isFetching, refetch } = useQuery<QueryResult>({
    queryKey: ["dicom-query", applied, page, searchMode],
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
      if (applied.aeTitle && searchMode === "local-db")
                                        p.set("aeTitle",            applied.aeTitle);
      const endpoint = searchMode === "live-pacs"
        ? `/api/radiology/qr-cfind?${p}`
        : `/api/radiology/dicom-query?${p}`;
      return api.get<QueryResult>(endpoint);
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

  // ── Preset handlers ───────────────────────────────────────────────────────────

  const handleSavePreset = useCallback(() => {
    const name = savePresetName.trim();
    if (!name) return;
    const preset: DicomPreset = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      filters: {
        dateFrom, dateTo,
        modalities: Array.from(selMods),
        patientName, accessionNumber, referringDoctor, studyDescription, aeTitle,
      },
      createdAt: new Date().toISOString(),
    };
    const updated = [preset, ...presets.filter((p) => p.name !== name)];
    setPresets(updated);
    persistPresets(updated, userId);
    setSavePresetName("");
    setShowSaveInput(false);
    toast({ title: `Preset "${name}" saved` });
  }, [savePresetName, dateFrom, dateTo, selMods, patientName, accessionNumber, referringDoctor, studyDescription, aeTitle, presets, userId, toast]);

  const handleLoadPreset = useCallback((preset: DicomPreset) => {
    const f = preset.filters;
    setDateFrom(f.dateFrom);
    setDateTo(f.dateTo);
    setSelMods(new Set(f.modalities));
    setPatientName(f.patientName);
    setAccessionNumber(f.accessionNumber);
    setReferringDoctor(f.referringDoctor);
    setStudyDescription(f.studyDescription);
    setAeTitle(f.aeTitle);
    setApplied({
      dateFrom: f.dateFrom, dateTo: f.dateTo, modalities: f.modalities,
      patientName: f.patientName, accessionNumber: f.accessionNumber,
      referringDoctor: f.referringDoctor, studyDescription: f.studyDescription,
      aeTitle: f.aeTitle,
    });
    setPage(1);
    setSelectedIds(new Set());
    setShowPresetMenu(false);
    toast({ title: `Preset "${preset.name}" loaded` });
  }, [toast]);

  const handleDeletePreset = useCallback((id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = presets.filter((p) => p.id !== id);
    setPresets(updated);
    persistPresets(updated, userId);
    toast({ title: `Preset "${name}" deleted` });
  }, [presets, userId, toast]);

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

      {/* ── DCMTK / PACS hint banner ──────────────────────────────────────────── */}
      {searchMode === "live-pacs" && data?.dcmtkHint && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3 flex gap-3 text-sm">
          <Info size={16} className="shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-300 mb-0.5">Live PACS Search unavailable</p>
            <p className="text-amber-700 dark:text-amber-400 text-xs leading-relaxed">{data.dcmtkHint}</p>
          </div>
        </div>
      )}

      {/* ── Filter Panel ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="px-5 py-3 border-b flex items-center gap-2">
          <Filter size={14} className="text-muted-foreground" />
          <h2 className="text-sm font-bold">Search Criteria</h2>

          {/* Search mode toggle */}
          <div className="flex items-center gap-0.5 rounded-lg border bg-muted/50 p-0.5 ml-3">
            <button
              onClick={() => { setSearchMode("local-db"); setPage(1); setSelectedIds(new Set()); }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                searchMode === "local-db"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Query local RIS database"
            >
              <Database size={11} />
              Local DB
            </button>
            <button
              onClick={() => { setSearchMode("live-pacs"); setPage(1); setSelectedIds(new Set()); }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                searchMode === "live-pacs"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Send live C-FIND request to PACS (Orthanc REST or findscu)"
            >
              <Radio size={11} />
              Live PACS
            </button>
          </div>

          <div className="ml-auto relative" ref={presetMenuRef}>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={() => setShowPresetMenu((v) => !v)}
            >
              <Bookmark size={12} />
              Presets
              {presets.length > 0 && (
                <span className="bg-primary text-primary-foreground rounded-full text-[10px] px-1.5 py-0 font-bold leading-4">
                  {presets.length}
                </span>
              )}
              <ChevronDown size={11} className={`transition-transform ${showPresetMenu ? "rotate-180" : ""}`} />
            </Button>
            {showPresetMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-xl border bg-popover shadow-lg overflow-hidden">
                {presets.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                    <Bookmark size={20} className="mx-auto mb-2 opacity-30" />
                    No saved presets yet.
                    <br />Use "Save as preset" below to save your current filters.
                  </div>
                ) : (
                  <ul className="divide-y max-h-64 overflow-y-auto">
                    {presets.map((preset) => (
                      <li
                        key={preset.id}
                        className="flex items-center gap-2 px-4 py-2.5 hover:bg-muted/50 transition-colors group cursor-pointer"
                        role="button"
                        tabIndex={0}
                        onClick={() => handleLoadPreset(preset)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleLoadPreset(preset); } }}
                      >
                        <Bookmark size={13} className="shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{preset.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {preset.filters.modalities.length > 0
                              ? preset.filters.modalities.join(", ")
                              : "All modalities"}{" · "}
                            {preset.filters.dateFrom === preset.filters.dateTo
                              ? preset.filters.dateFrom
                              : `${preset.filters.dateFrom} → ${preset.filters.dateTo}`}
                          </p>
                        </div>
                        <button
                          onClick={(e) => handleDeletePreset(preset.id, preset.name, e)}
                          className="shrink-0 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete preset"
                          aria-label={`Delete preset ${preset.name}`}
                        >
                          <Trash2 size={11} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
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
              <label className={`text-xs font-medium ${searchMode === "live-pacs" ? "text-muted-foreground/50" : "text-muted-foreground"}`}>
                Station AE Title
                {searchMode === "live-pacs" && <span className="ml-1 text-[10px]">(Local DB only)</span>}
              </label>
              <Input
                value={aeTitle}
                onChange={(e) => setAeTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                placeholder="MRI_ROOM1…"
                className="h-8 text-xs font-mono"
                disabled={searchMode === "live-pacs"}
              />
            </div>
          </div>

          {/* Buttons + Save Preset */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" onClick={applyFilters} disabled={isFetching} className="gap-1.5">
              {searchMode === "live-pacs" ? <Radio size={13} /> : <Search size={13} />}
              {searchMode === "live-pacs" ? "C-FIND" : "Query"}
            </Button>
            <Button size="sm" variant="outline" onClick={clearAll} className="gap-1.5">
              <XCircle size={13} /> Clear
            </Button>
            <div className="flex items-center gap-1.5 ml-auto">
              {showSaveInput ? (
                <>
                  <Input
                    ref={saveInputRef}
                    value={savePresetName}
                    onChange={(e) => setSavePresetName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSavePreset();
                      if (e.key === "Escape") { setShowSaveInput(false); setSavePresetName(""); }
                    }}
                    placeholder="Preset name…"
                    className="h-7 text-xs w-44"
                    maxLength={48}
                  />
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={handleSavePreset}
                    disabled={!savePresetName.trim()}
                  >
                    <BookmarkPlus size={12} /> Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => { setShowSaveInput(false); setSavePresetName(""); }}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => setShowSaveInput(true)}
                >
                  <BookmarkPlus size={12} /> Save as preset
                </Button>
              )}
            </div>
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
            {searchMode === "live-pacs" && data?.source && data.source !== "NONE" && (
              <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                <Radio size={9} />
                {data.source === "ORTHANC_REST" ? "Orthanc REST" : "findscu"}
              </span>
            )}
          </h2>
          {isFetching && <RefreshCw size={13} className="animate-spin text-muted-foreground" />}
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            {searchMode === "live-pacs" ? "Sending C-FIND to PACS…" : "Querying studies…"}
          </div>
        ) : studies.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Search size={36} className="mx-auto opacity-20" />
            <p className="text-sm font-medium text-muted-foreground">No studies found.</p>
            {searchMode === "live-pacs"
              ? <p className="text-xs text-muted-foreground">The PACS returned no matches. Try a wider date range or fewer filters.</p>
              : <p className="text-xs text-muted-foreground">Try Today / Yesterday or adjust filters, then click Query.</p>
            }
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
