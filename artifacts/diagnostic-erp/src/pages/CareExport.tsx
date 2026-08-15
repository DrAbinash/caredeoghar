import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { api, fetchApi } from "@/lib/fetchApi";
import {
  ArrowLeft, Upload, CheckCircle2, AlertCircle, Download,
  FileJson, FileText, FileSpreadsheet, RefreshCw, Calendar,
} from "lucide-react";
import { useLocation } from "wouter";

// ── Helpers ────────────────────────────────────────────────────────────────────
function istToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Calcutta" });
}
function istFirstOfMonth() {
  const d = new Date(); d.setDate(1);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Calcutta" });
}
function istFirstOfPrevMonth() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Calcutta" });
}
function istLastOfPrevMonth() {
  const d = new Date(); d.setDate(0);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Calcutta" });
}
function istNDaysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n + 1);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Calcutta" });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsText(file, "utf-8");
  });
}

function downloadText(content: string, filename: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Types ─────────────────────────────────────────────────────────────────────
interface MasterStatus {
  doctors: { rows: number; uploadedAt: string | null };
  tests:   { rows: number; uploadedAt: string | null };
}
interface PreviewData {
  bills: number; tests: number;
  subtotal: number; discount: number; total: number;
  paid: number; balance: number; withDoctor: number;
  from: string; to: string;
}
interface ExportPackage {
  json: string;
  docMappingCsv: string;
  testMappingCsv: string;
  totalsTxt: string;
  csvTwin: string | null;
  errorsCsv: string | null;
  stats: { exported: number; skipped: number; from: string; to: string };
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function CareExport() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [from, setFrom] = useState(istFirstOfMonth);
  const [to,   setTo]   = useState(istToday);
  const [includeCSV, setIncludeCSV] = useState(false);

  const [preview,        setPreview]        = useState<PreviewData | null>(null);
  const [exportPkg,      setExportPkg]      = useState<ExportPackage | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [exportLoading,  setExportLoading]  = useState(false);

  const docInputRef  = useRef<HTMLInputElement>(null);
  const testInputRef = useRef<HTMLInputElement>(null);

  // Master status
  const { data: masterStatus, refetch: refetchStatus } = useQuery<MasterStatus>({
    queryKey: ["care-master-status"],
    queryFn:  () => api.get<MasterStatus>("/api/care-export/master-status"),
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ type, csv }: { type: "doctors" | "tests"; csv: string }) =>
      fetchApi<{ ok: boolean; rows: number }>(`/api/care-export/upload-${type}`, {
        method: "POST",
        body: JSON.stringify({ csv }),
      }),
    onSuccess: (data, variables) => {
      toast({ title: `CARE ${variables.type} uploaded`, description: `${data.rows} rows imported` });
      refetchStatus();
    },
    onError: (err: Error) => toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  async function handleFileUpload(type: "doctors" | "tests", file: File | null | undefined) {
    if (!file) return;
    try {
      const csv = await readFileAsText(file);
      uploadMutation.mutate({ type, csv });
    } catch {
      toast({ title: "Cannot read file", variant: "destructive" });
    }
  }

  async function handlePreview() {
    if (!from || !to) { toast({ title: "Select date range", variant: "destructive" }); return; }
    setPreviewLoading(true); setPreview(null); setExportPkg(null);
    try {
      const data = await api.get<PreviewData>(`/api/care-export/preview?from=${from}&to=${to}`);
      setPreview(data);
    } catch (err: unknown) {
      toast({ title: "Preview failed", description: (err as Error).message, variant: "destructive" });
    } finally { setPreviewLoading(false); }
  }

  async function handleGenerate() {
    if (!from || !to) { toast({ title: "Select date range", variant: "destructive" }); return; }
    if (!mastersReady) { toast({ title: "Upload master data first", variant: "destructive" }); return; }
    setExportLoading(true); setExportPkg(null);
    try {
      const pkg = await api.get<ExportPackage>(
        `/api/care-export/generate?from=${from}&to=${to}&includeCSV=${includeCSV}`
      );
      setExportPkg(pkg);
      toast({ title: "Export ready", description: `${pkg.stats.exported} bills exported, ${pkg.stats.skipped} skipped` });
    } catch (err: unknown) {
      toast({ title: "Export failed", description: (err as Error).message, variant: "destructive" });
    } finally { setExportLoading(false); }
  }

  function downloadAll() {
    if (!exportPkg) return;
    const slug = `${from.replace(/-/g, "")}-${to.replace(/-/g, "")}`;
    downloadText(exportPkg.json,           `replit-care-emergency-${slug}.json`, "application/json;charset=utf-8");
    downloadText(exportPkg.docMappingCsv,  `mapping-report-doctors-${slug}.csv`, "text/csv;charset=utf-8");
    downloadText(exportPkg.testMappingCsv, `mapping-report-tests-${slug}.csv`,   "text/csv;charset=utf-8");
    downloadText(exportPkg.totalsTxt,      `totals-${slug}.txt`);
    if (exportPkg.csvTwin)   downloadText(exportPkg.csvTwin,   `replit-care-emergency-${slug}.csv`, "text/csv;charset=utf-8");
    if (exportPkg.errorsCsv) downloadText(exportPkg.errorsCsv, `errors-${slug}.csv`,               "text/csv;charset=utf-8");
  }

  const mastersReady = (masterStatus?.doctors.rows ?? 0) > 0 && (masterStatus?.tests.rows ?? 0) > 0;
  const fmtUpload = (d: string | null) =>
    d ? new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Calcutta", dateStyle: "short", timeStyle: "short" }) : "Never";

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/settings")} className="shrink-0">
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">CARE Emergency Billing Export</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Generates CARE_EMERGENCY_BILLING_JSON_V1 for import via Settings → Emergency Billing
          </p>
        </div>
      </div>

      {/* ── Step A: Master Data ──────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">A</span>
          <h2 className="font-semibold text-sm">CARE Master Data</h2>
          {mastersReady && <CheckCircle2 size={15} className="text-green-500 ml-auto" />}
        </div>

        {!mastersReady && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            Upload CARE doctors.csv and tests.csv first — export is blocked until both are present.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Doctors */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">doctors.csv</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Columns: id, name, specialization</p>
              </div>
              {(masterStatus?.doctors.rows ?? 0) > 0
                ? <CheckCircle2 size={16} className="text-green-500" />
                : <AlertCircle size={16} className="text-amber-500" />}
            </div>
            {masterStatus && (
              <p className="text-xs text-muted-foreground">
                {masterStatus.doctors.rows} rows · Last upload: {fmtUpload(masterStatus.doctors.uploadedAt)}
              </p>
            )}
            <input ref={docInputRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={e => handleFileUpload("doctors", e.target.files?.[0])} />
            <Button variant="outline" size="sm" className="w-full gap-1.5" disabled={uploadMutation.isPending}
              onClick={() => { if (docInputRef.current) { docInputRef.current.value = ""; docInputRef.current.click(); } }}>
              <Upload size={13} />
              {(masterStatus?.doctors.rows ?? 0) > 0 ? "Replace doctors.csv" : "Upload doctors.csv"}
            </Button>
          </div>

          {/* Tests */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">tests.csv</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Columns: id, code, name, category, price, is_active</p>
              </div>
              {(masterStatus?.tests.rows ?? 0) > 0
                ? <CheckCircle2 size={16} className="text-green-500" />
                : <AlertCircle size={16} className="text-amber-500" />}
            </div>
            {masterStatus && (
              <p className="text-xs text-muted-foreground">
                {masterStatus.tests.rows} rows · Last upload: {fmtUpload(masterStatus.tests.uploadedAt)}
              </p>
            )}
            <input ref={testInputRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={e => handleFileUpload("tests", e.target.files?.[0])} />
            <Button variant="outline" size="sm" className="w-full gap-1.5" disabled={uploadMutation.isPending}
              onClick={() => { if (testInputRef.current) { testInputRef.current.value = ""; testInputRef.current.click(); } }}>
              <Upload size={13} />
              {(masterStatus?.tests.rows ?? 0) > 0 ? "Replace tests.csv" : "Upload tests.csv"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Step B: Date Range ──────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">B</span>
          <h2 className="font-semibold text-sm">Date Range (IST)</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          {([
            ["Last 7 days",    () => { setFrom(istNDaysAgo(7));       setTo(istToday()); }],
            ["This month",     () => { setFrom(istFirstOfMonth());     setTo(istToday()); }],
            ["Previous month", () => { setFrom(istFirstOfPrevMonth()); setTo(istLastOfPrevMonth()); }],
          ] as [string, () => void][]).map(([label, fn]) => (
            <button key={label} onClick={() => { fn(); setPreview(null); setExportPkg(null); }}
              className="px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted text-muted-foreground transition-colors flex items-center gap-1">
              <Calendar size={11} />{label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={e => { setFrom(e.target.value); setPreview(null); setExportPkg(null); }} className="mt-1 w-38" />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={e => { setTo(e.target.value); setPreview(null); setExportPkg(null); }} className="mt-1 w-38" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
            <input type="checkbox" checked={includeCSV} onChange={e => setIncludeCSV(e.target.checked)} className="rounded" />
            Also generate CSV twin (CARE_EMERGENCY_BILLING_V1)
          </label>
        </div>

        <Button variant="outline" size="sm" onClick={handlePreview}
          disabled={previewLoading || !from || !to} className="gap-1.5">
          {previewLoading ? <RefreshCw size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Preview Totals
        </Button>
      </div>

      {/* ── Preview totals ──────────────────────────────────────────────── */}
      {preview && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">C</span>
            <h2 className="font-semibold text-sm">Preview — {preview.from} → {preview.to}</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              ["Bills",       preview.bills],
              ["Tests",       preview.tests],
              ["With Doctor", preview.withDoctor],
              ["Gross",       inr(preview.subtotal)],
              ["Discount",    inr(preview.discount)],
              ["Net",         inr(preview.total)],
              ["Collected",   inr(preview.paid)],
              ["Due",         inr(preview.balance)],
            ] as [string, string | number][]).map(([label, value]) => (
              <div key={label} className="bg-muted/30 rounded-lg px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="font-bold text-sm mt-0.5 tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          {!mastersReady && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertCircle size={13} />Upload CARE master data (Step A) before generating.
            </p>
          )}

          <Button onClick={handleGenerate} disabled={exportLoading || !mastersReady} className="gap-1.5">
            {exportLoading ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
            {exportLoading ? "Generating…" : "Generate Export Package"}
          </Button>
        </div>
      )}

      {/* ── Step D: Download ────────────────────────────────────────────── */}
      {exportPkg && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center shrink-0">D</span>
            <h2 className="font-semibold text-sm">Export Package Ready</h2>
          </div>

          <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                {exportPkg.stats.exported} bills exported
                {exportPkg.stats.skipped > 0 && ` · ${exportPkg.stats.skipped} skipped`}
              </p>
              <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                {exportPkg.stats.from} → {exportPkg.stats.to}
              </p>
            </div>
            <CheckCircle2 size={22} className="text-green-500" />
          </div>

          {exportPkg.stats.skipped > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              {exportPkg.stats.skipped} bill(s) excluded — unmapped doctors or tests. Download errors.csv for details.
            </div>
          )}

          <div className="space-y-2">
            {[
              { label: "JSON (CARE_EMERGENCY_BILLING_JSON_V1)", icon: FileJson,        key: "json",           filename: `replit-care-emergency-${from.replace(/-/g,"")}-${to.replace(/-/g,"")}.json`, mime: "application/json;charset=utf-8" },
              { label: "Doctor mapping report",                 icon: FileText,        key: "docMappingCsv",  filename: `mapping-report-doctors-${from.replace(/-/g,"")}-${to.replace(/-/g,"")}.csv`,  mime: "text/csv;charset=utf-8" },
              { label: "Test mapping report",                   icon: FileText,        key: "testMappingCsv", filename: `mapping-report-tests-${from.replace(/-/g,"")}-${to.replace(/-/g,"")}.csv`,    mime: "text/csv;charset=utf-8" },
              { label: "Totals summary",                        icon: FileText,        key: "totalsTxt",      filename: `totals-${from.replace(/-/g,"")}-${to.replace(/-/g,"")}.txt`,                  mime: "text/plain;charset=utf-8" },
              ...(exportPkg.csvTwin   ? [{ label: "CSV twin (CARE_EMERGENCY_BILLING_V1)", icon: FileSpreadsheet, key: "csvTwin",   filename: `replit-care-emergency-${from.replace(/-/g,"")}-${to.replace(/-/g,"")}.csv`, mime: "text/csv;charset=utf-8" }] : []),
              ...(exportPkg.errorsCsv ? [{ label: "Errors log",                           icon: AlertCircle,     key: "errorsCsv", filename: `errors-${from.replace(/-/g,"")}-${to.replace(/-/g,"")}.csv`,               mime: "text/csv;charset=utf-8" }] : []),
            ].map(({ label, icon: Icon, key, filename, mime }) => (
              <div key={key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Icon size={15} className="text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium">{label}</span>
                </div>
                <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs gap-1.5"
                  onClick={() => downloadText((exportPkg as Record<string, string>)[key]!, filename, mime)}>
                  <Download size={12} /> Download
                </Button>
              </div>
            ))}
          </div>

          <Button onClick={downloadAll} className="w-full gap-1.5">
            <Download size={14} /> Download All Files
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Import the JSON into CARE via Settings → Emergency Billing. Do not upload from here.
          </p>
        </div>
      )}
    </div>
  );
}
