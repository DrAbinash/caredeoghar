import { useEffect, useRef, useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ScanLine, AlertTriangle, PackageCheck, FlaskConical,
  CheckCircle2, XCircle, ArrowRight, RefreshCcw, Printer, Trash2
} from "lucide-react";
import SampleLabel, { printLabels } from "@/components/SampleLabel";
import { readStaffSession } from "@/lib/staffSession";

type Patient = {
  id: number; firstName: string; lastName: string; patientId: string;
  phone: string; gender: string; dateOfBirth: string;
  ageValue?: number | null; ageUnit?: string | null;
};

type SampleTest = {
  orderTestId: number; testId: number; testCode: string;
  testName: string; category: string; resultStatus: string | null;
};

type Sample = {
  id: number; barcode: string; orderId: number; patientId: number;
  sampleType: string; containerType: string; volume: string; status: string;
  collectedByName: string; collectedAt: string; collectionSite: string;
  receivedAt: string | null; processingStartedAt: string | null;
  completedAt: string | null; reportedAt: string | null;
  rejectedAt: string | null; rejectionReason: string | null;
  isOutsourced: boolean; outsourceLab: string | null;
  notes: string;
  patient: Patient | null;
  order: { id: number; orderNumber: string } | null;
  tests: SampleTest[];
};

const STATUS_ORDER = [
  "pending", "collected", "received", "in_processing", "completed", "reported", "rejected",
];

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", collected: "Collected", received: "Received",
  in_processing: "In Processing", completed: "Completed", reported: "Reported", rejected: "Rejected",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  collected: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  received: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  in_processing: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  reported: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

const NEXT_ACTIONS: Record<string, Array<{ next: string; label: string; icon: React.ComponentType<{size?:number;className?:string}> }>> = {
  pending:        [{ next: "collected",       label: "Mark Collected",      icon: FlaskConical }],
  collected:      [{ next: "received",        label: "Receive at Lab",      icon: PackageCheck }],
  received:       [{ next: "in_processing",   label: "Start Processing",    icon: FlaskConical }],
  in_processing:  [{ next: "completed",       label: "Mark Completed",      icon: CheckCircle2 }],
  completed:      [{ next: "reported",        label: "Mark Reported",       icon: CheckCircle2 }],
  reported:       [],
  rejected:       [],
};

const REJECT_REASONS = [
  "Hemolysis", "Clotted", "Insufficient quantity", "Wrong container",
  "Lipemic", "Icteric", "Patient not present", "Wrong patient",
  "Expired sample", "Transport delay", "Other",
];

export default function ScanStation() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [buffer, setBuffer] = useState("");
  const [lastKeyTime, setLastKeyTime] = useState(0);
  const [sample, setSample] = useState<Sample | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");

  const session = readStaffSession();
  const staffName = session?.user?.name ?? "";

  // Always keep the hidden input focused so scanner output goes there.
  useEffect(() => {
    const focusInput = () => inputRef.current?.focus();
    focusInput();
    window.addEventListener("click", focusInput);
    window.addEventListener("touchstart", focusInput);
    return () => {
      window.removeEventListener("click", focusInput);
      window.removeEventListener("touchstart", focusInput);
    };
  }, []);

  // Global keyboard capture: any printable key goes into the hidden input.
  // The scanner sends a rapid burst of characters followed by Enter.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in a visible input/textarea/select.
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (["input", "textarea", "select"].includes(tag) && e.target !== inputRef.current) return;

      // Prevent default navigation for keys that would leave the page.
      if (e.key === "Enter" && inputRef.current === document.activeElement) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Helper: detect if the scanned input is a bill-verification QR URL.
  function extractBillNumber(raw: string): string | null {
    // Accept both full URLs and paths: .../api/verify/bill/<billNumber>
    const m = raw.match(/\/api\/verify\/bill\/([A-Za-z0-9\-]+)/);
    return m ? m[1] : null;
  }

  const lookupBarcode = useCallback(async (barcode: string) => {
    const trimmed = barcode.trim();
    if (!trimmed) return;

    // If the scanner read a QR code from a printed bill, it will emit a full
    // URL like https://<host>/api/verify/bill/<billNumber>. Detect this
    // and open the bill verification page directly so the user can verify it.
    const billNo = extractBillNumber(trimmed);
    if (billNo) {
      setLoading(false);
      setBuffer("");
      if (inputRef.current) inputRef.current.value = "";
      setError(null);
      // Open the public bill verification page in a new tab.
      const verifyUrl = `${window.location.origin}/api/verify/bill/${encodeURIComponent(billNo)}`;
      window.open(verifyUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }

    setLoading(true);
    setError(null);
    setSample(null);
    setRejecting(false);
    setRejectReason("");
    try {
      const s = await api.get<Sample>(`/api/samples/scan/${encodeURIComponent(trimmed)}`);
      setSample(s);
    } catch (err: any) {
      setError(err?.message || "Sample not found");
    } finally {
      setLoading(false);
      // Clear and refocus for next scan.
      setBuffer("");
      if (inputRef.current) inputRef.current.value = "";
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, []);

  // When Enter is pressed in the hidden input, fire lookup.
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      lookupBarcode(e.currentTarget.value);
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBuffer(e.target.value);
  };

  const statusMut = useMutation({
    mutationFn: ({ id, status, reason }: { id: number; status: string; reason?: string }) =>
      api.post<Sample>(`/api/samples/${id}/status`, {
        status, rejectionReason: reason, actorName: staffName,
      }),
    onSuccess: (s) => {
      setSample(s);
      setRejecting(false);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["samples"] });
    },
    onError: (err) => setError((err as Error).message),
  });

  const handleStatus = (nextStatus: string) => {
    if (!sample) return;
    if (nextStatus === "rejected") {
      setRejecting(true);
      return;
    }
    statusMut.mutate({ id: sample.id, status: nextStatus });
  };

  const confirmReject = () => {
    if (!sample || !rejectReason.trim()) return;
    statusMut.mutate({ id: sample.id, status: "rejected", reason: rejectReason.trim() });
  };

  const labelRef = useRef<HTMLDivElement | null>(null);

  const printSampleLabel = () => {
    if (!labelRef.current) return;
    printLabels([labelRef.current]);
  };

  const statusIndex = sample ? STATUS_ORDER.indexOf(sample.status) : -1;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <PageHeader
        title="Scan Station"
        subtitle="Barcode scan workflow — no page refresh, no blank tabs"
        actions={<ScanLine size={18} className="text-primary" />}
      />

      {/* Hidden input that always captures scanner keyboard output */}
      <input
        ref={inputRef}
        type="text"
        autoFocus
        autoComplete="off"
        aria-hidden="true"
        className="fixed top-0 left-0 w-1 h-1 opacity-0 pointer-events-none"
        onChange={onInputChange}
        onKeyDown={onInputKeyDown}
      />

      {/* Visual status */}
      <div className="flex items-center justify-between bg-card border rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${loading ? "bg-amber-400 animate-pulse" : "bg-emerald-500"}`} />
          <div>
            <p className="text-sm font-medium">{loading ? "Scanning…" : "Ready to scan"}</p>
            <p className="text-xs text-muted-foreground">
              {buffer ? `Buffer: ${buffer}` : "Point scanner at barcode and press trigger"}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => { setBuffer(""); inputRef.current && (inputRef.current.value = ""); inputRef.current?.focus(); }}>
          <RefreshCcw size={14} className="mr-1" /> Reset
        </Button>
      </div>

      {/* Manual barcode fallback */}
      <div className="flex gap-2">
        <Input
          placeholder="Or type barcode manually & press Enter"
          value={manualBarcode}
          onChange={(e) => setManualBarcode(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { lookupBarcode(manualBarcode); setManualBarcode(""); } }}
          className="flex-1"
        />
        <Button onClick={() => { lookupBarcode(manualBarcode); setManualBarcode(""); }}>Lookup</Button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-300">{error}</p>
            <p className="text-xs text-muted-foreground mt-1">Scanner buffer cleared — ready for next scan.</p>
          </div>
        </div>
      )}

      {sample && (
        <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold font-mono">{sample.barcode}</h2>
                <Badge className={STATUS_COLOR[sample.status] ?? "bg-gray-100 text-gray-800"}>
                  {STATUS_LABEL[sample.status] ?? sample.status}
                </Badge>
                {sample.isOutsourced && (
                  <Badge variant="outline" className="text-orange-600 border-orange-300">Outsourced{sample.outsourceLab ? `: ${sample.outsourceLab}` : ""}</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Order #{sample.order?.orderNumber ?? sample.orderId} · {sample.sampleType} · {sample.containerType} · {sample.volume || "—"}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={printSampleLabel}>
                <Printer size={14} className="mr-1" /> Label
              </Button>
            </div>
          </div>

          {/* Patient */}
          {sample.patient && (
            <div className="p-4 border-b bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                  {sample.patient.firstName[0]}{sample.patient.lastName[0]}
                </div>
                <div>
                  <p className="font-semibold">{sample.patient.firstName} {sample.patient.lastName}</p>
                  <p className="text-xs text-muted-foreground">
                    PID: {sample.patient.patientId} · {sample.patient.gender} ·
                    {sample.patient.ageValue ? ` ${sample.patient.ageValue}${sample.patient.ageUnit ?? "y"}` : ""} · {sample.patient.phone}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tests */}
          <div className="p-4 border-b">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Tests</p>
            <div className="flex flex-wrap gap-1.5">
              {sample.tests.map((t) => (
                <Badge key={t.orderTestId} variant="secondary" className="text-xs">
                  {t.testName} <span className="text-muted-foreground ml-1">({t.testCode})</span>
                </Badge>
              ))}
            </div>
          </div>

          {/* Workflow progress */}
          <div className="p-4 border-b">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Workflow Progress</p>
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {STATUS_ORDER.filter((s) => s !== "rejected").map((s, i) => {
                const done = statusIndex >= i && sample.status !== "rejected";
                const current = sample.status === s;
                return (
                  <div key={s} className="flex items-center gap-1 shrink-0">
                    <div className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap ${done ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {STATUS_LABEL[s]}
                    </div>
                    {i < STATUS_ORDER.length - 2 && <ArrowRight size={12} className="text-muted-foreground shrink-0" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="p-4">
            {sample.status === "rejected" ? (
              <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <XCircle size={16} /> Rejected: {sample.rejectionReason || "No reason recorded"}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(NEXT_ACTIONS[sample.status] ?? []).map((a) => {
                    const Icon = a.icon;
                    return (
                      <Button
                        key={a.next}
                        size="sm"
                        onClick={() => handleStatus(a.next)}
                        disabled={statusMut.isPending}
                        className="gap-1"
                      >
                        <Icon size={14} /> {a.label}
                        {statusMut.isPending && <span className="animate-pulse">…</span>}
                      </Button>
                    );
                  })}
                  {sample.status !== "rejected" && (
                    <Button variant="destructive" size="sm" onClick={() => setRejecting(true)} disabled={statusMut.isPending}>
                      <Trash2 size={14} className="mr-1" /> Reject
                    </Button>
                  )}
                </div>

                {rejecting && (
                  <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3 space-y-2">
                    <Label className="text-xs text-red-700 dark:text-red-300">Rejection reason</Label>
                    <Select value={rejectReason} onValueChange={setRejectReason}>
                      <SelectTrigger className="h-8 text-xs bg-white dark:bg-background">
                        <SelectValue placeholder="Select reason…" />
                      </SelectTrigger>
                      <SelectContent>
                        {REJECT_REASONS.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" onClick={confirmReject} disabled={!rejectReason.trim() || statusMut.isPending}>
                        Confirm Reject
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setRejecting(false); setRejectReason(""); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
