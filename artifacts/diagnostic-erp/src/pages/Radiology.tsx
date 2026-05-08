import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import { readStaffSession } from "@/lib/staffSession";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Radio, Search, RefreshCw, UserCircle2, FileText, Disc, Printer, Image,
  CheckCircle2, PlayCircle, Hourglass, Camera, ClipboardEdit, Send,
  Mic, MicOff, Sparkles, Link2, Hand, X, Copy as CopyIcon,
} from "lucide-react";

type Study = {
  id: number;
  accessionNumber: string;
  modality: string;
  department: string;
  roomNumber: string;
  status: string;
  scheduledAt: string;
  startedAt: string | null;
  acquiredAt: string | null;
  deliveredAt: string | null;
  numImages: number;
  technicianId: number | null;
  technicianName: string | null;
  assignedRadiologistId: number | null;
  assignedRadiologistName: string | null;
  claimedAt: string | null;
  studyDate: string;
  prelimReportedAt: string | null;
  finalReportedAt: string | null;
  hasPrelim: boolean;
  hasFinal: boolean;
  patientId: number;
  patientCode: string | null;
  patientName: string;
  patientPhone: string | null;
  patientGender: string | null;
  testId: number;
  testCode: string | null;
  testName: string | null;
  billId: number | null;
  billNumber: string | null;
};

type StudyDetail = Study & {
  prelimReport: string | null;
  finalReport: string | null;
  prelimReportedBy: string | null;
  finalReportedBy: string | null;
  notes: string | null;
  studyInstanceUid: string | null;
  templateId: number | null;
  clinicalHistory: string | null;
};

// Built-in fallback templates for the most common neuro/spine cases. These
// load instantly when no test-specific report template exists, so radiologists
// always have a structured starting point to dictate over.
const MODALITY_PRESETS: Array<{ key: string; label: string; modality: string; body: string }> = [
  {
    key: "mri-brain", modality: "MR", label: "MRI Brain (routine)",
    body: `TECHNIQUE: Multiplanar, multisequence MRI of the brain (T1, T2, FLAIR, DWI, GRE/SWI, T1 post-contrast as indicated).

FINDINGS:
- Cerebral hemispheres: Grey-white matter differentiation is preserved. No acute infarct, mass, or abnormal signal.
- Ventricles & sulci: Normal in size and configuration.
- Posterior fossa: Cerebellum and brainstem appear normal.
- Cerebellopontine angles: No mass.
- Sella & pituitary: Normal.
- Vascular flow voids: Preserved in the visualised intracranial vessels.
- Paranasal sinuses, mastoids, and orbits: Clear.

IMPRESSION:
1. No acute intracranial abnormality.`,
  },
  {
    key: "mri-spine", modality: "MR", label: "MRI Spine (lumbar)",
    body: `TECHNIQUE: Sagittal T1 and T2, axial T2 of the lumbar spine.

FINDINGS:
- Vertebral alignment: Maintained. No listhesis or compression fracture.
- Marrow signal: Normal.
- Conus medullaris: Terminates at L1. Normal in signal.
- Disc levels:
   • L1-L2: Normal disc height/signal. No herniation. Canal & foramina patent.
   • L2-L3: Normal disc height/signal. No herniation. Canal & foramina patent.
   • L3-L4: Normal disc height/signal. No herniation. Canal & foramina patent.
   • L4-L5: Normal disc height/signal. No herniation. Canal & foramina patent.
   • L5-S1: Normal disc height/signal. No herniation. Canal & foramina patent.
- Paraspinal soft tissues: Unremarkable.

IMPRESSION:
1. No significant disc herniation, canal or foraminal stenosis at the levels imaged.`,
  },
  {
    key: "ct-trauma", modality: "CT", label: "CT Brain (trauma)",
    body: `TECHNIQUE: Non-contrast axial CT of the brain with multiplanar reformats and bone-window reconstruction.

FINDINGS:
- Extra-axial space: No epidural, subdural, or subarachnoid haemorrhage.
- Brain parenchyma: No focal hypodensity to suggest infarct. No intra-axial haemorrhage or contusion. Grey-white differentiation is preserved.
- Ventricles & midline: Ventricles symmetric. No midline shift. Basal cisterns are patent.
- Calvarium & skull base: No fracture identified on bone windows.
- Visualised paranasal sinuses, mastoids, soft tissues: Unremarkable.

IMPRESSION:
1. No acute intracranial haemorrhage, mass effect, or skull fracture.`,
  },
  {
    key: "ct-stroke", modality: "CT", label: "CT Brain (stroke protocol)",
    body: `TECHNIQUE: Non-contrast CT of the brain. (CT angiography / perfusion as separately indicated.)

FINDINGS:
- No intracranial haemorrhage.
- No established hypoattenuating cortical or deep grey-matter territory of acute infarct (ASPECTS = 10).
- Hyperdense vessel sign: not identified.
- Grey-white differentiation: Preserved bilaterally.
- Ventricles, midline structures, and basal cisterns: Within normal limits.
- Skull and extra-cranial soft tissues: Unremarkable.

IMPRESSION:
1. No CT evidence of acute infarct or haemorrhage. If clinical suspicion remains high, MRI / CTA recommended for further evaluation.`,
  },
];

type Technician = { id: number; name: string; role: string | null; department: string | null; isRadiology: boolean };
type Template = { id: number; testId: number; name: string; format: string; content: string; isDefault: boolean; modality: string | null };
type FilmIssue = { id: number; studyId: number; issueType: string; quantity: number; issuedBy: string | null; receivedBy: string | null; notes: string | null; issuedAt: string };
type RadOptions = { modalities: Array<{ department: string; code: string }>; statuses: string[] };

const STATUS_META: Record<string, { label: string; color: string }> = {
  scheduled:            { label: "Scheduled",   color: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700" },
  in_progress:          { label: "In Progress", color: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700" },
  acquired:             { label: "Acquired",    color: "bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-700" },
  reported_preliminary: { label: "Prelim",      color: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-700" },
  reported_final:       { label: "Final",       color: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700" },
  delivered:            { label: "Delivered",   color: "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/40 dark:text-teal-200 dark:border-teal-700" },
  cancelled:            { label: "Cancelled",   color: "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800/60 dark:text-zinc-300 dark:border-zinc-700" },
};

function StatusPill({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.scheduled;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${meta.color}`}>
      {meta.label}
    </span>
  );
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Radiology() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [modality, setModality] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  // assignment filter chip — drives ?assigned= on the worklist call.
  // "all"=no filter, "unclaimed"=studies with no radiologist yet, "mine"=studies
  // claimed by the current staff member (via /api/users/me).
  const [assigned, setAssigned] = useState<"all" | "unclaimed" | "mine">("all");
  const [tab, setTab] = useState<"worklist" | "reporting" | "films">("worklist");

  const [studyModalId, setStudyModalId] = useState<number | null>(null);
  const [reportModalId, setReportModalId] = useState<number | null>(null);
  const [filmModalId, setFilmModalId] = useState<number | null>(null);

  const { data: options } = useQuery<RadOptions>({
    queryKey: ["radiology-options"],
    queryFn: () => api.get("/api/radiology/options"),
  });

  const { data: technicians = [] } = useQuery<Technician[]>({
    queryKey: ["radiology-technicians"],
    queryFn: () => api.get("/api/radiology/technicians"),
  });

  // Current signed-in staff (from the staff session in localStorage). Used to
  // drive the "Mine" filter and to attribute claim/unclaim actions.
  const me = useMemo(() => {
    const s = readStaffSession();
    return s?.user ? { id: s.user.id, name: s.user.name } : null;
  }, []);

  const { data: studies = [], isFetching, refetch } = useQuery<Study[]>({
    queryKey: ["radiology-worklist", date, modality, status, search, assigned, me?.id ?? 0],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("date", date);
      if (modality !== "all") p.set("modality", modality);
      if (status !== "all") p.set("status", status);
      if (search.trim()) p.set("search", search.trim());
      if (assigned === "unclaimed") p.set("assigned", "unclaimed");
      else if (assigned === "mine" && me?.id) {
        p.set("assigned", "mine"); p.set("staffId", String(me.id));
      }
      return api.get(`/api/radiology/worklist?${p.toString()}`);
    },
    refetchInterval: 8_000,
  });

  // Claim/unclaim use the authenticated staff identity on the server — no need
  // to send staffId from the client.
  const claim = useMutation({
    mutationFn: ({ id }: { id: number }) => api.post(`/api/radiology/${id}/claim`, {}),
    onSuccess: () => {
      toast({ title: "Study claimed" });
      qc.invalidateQueries({ queryKey: ["radiology-worklist"] });
    },
    onError: (e: Error) => toast({ title: "Could not claim", description: e.message, variant: "destructive" }),
  });
  const unclaim = useMutation({
    mutationFn: ({ id }: { id: number }) => api.post(`/api/radiology/${id}/unclaim`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["radiology-worklist"] }),
    onError: (e: Error) => toast({ title: "Could not release", description: e.message, variant: "destructive" }),
  });

  const reportingQueue = useMemo(
    () => studies.filter((s) => ["acquired", "reported_preliminary"].includes(s.status)),
    [studies],
  );
  const allFilmEligible = useMemo(
    () => studies.filter((s) => ["reported_final", "delivered"].includes(s.status)),
    [studies],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { scheduled: 0, in_progress: 0, acquired: 0, reported_preliminary: 0, reported_final: 0, delivered: 0 };
    for (const s of studies) c[s.status] = (c[s.status] ?? 0) + 1;
    return c;
  }, [studies]);

  const setStudyStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.patch(`/api/radiology/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["radiology-worklist"] }),
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const assignTech = useMutation({
    mutationFn: ({ id, technicianId }: { id: number; technicianId: number | null }) =>
      api.patch(`/api/radiology/${id}`, { technicianId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["radiology-worklist"] }),
    onError: (e: Error) => toast({ title: "Could not assign technician", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Radiology"
        subtitle="Modality worklist, technician assignment, reporting & film/CD tracking"
      />

      {/* Today's snapshot */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {(["scheduled","in_progress","acquired","reported_preliminary","reported_final","delivered"] as const).map((s) => (
          <div key={s} className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">{STATUS_META[s].label}</div>
            <div className="text-2xl font-semibold">{counts[s] ?? 0}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Patient, accession, test…" className="pl-8 w-64" />
        </div>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        <Select value={modality} onValueChange={setModality}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Modality" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modalities</SelectItem>
            {(options?.modalities ?? []).map((m) => (
              <SelectItem key={m.code} value={m.code}>{m.department} ({m.code})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {(options?.statuses ?? []).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_META[s]?.label ?? s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          <span className="ml-1">Refresh</span>
        </Button>
        {/* Assignment chips — tele-radiology workflow */}
        <div className="ml-auto inline-flex rounded-md border bg-background overflow-hidden">
          {(["all","unclaimed","mine"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setAssigned(k)}
              disabled={k === "mine" && !me?.id}
              className={`px-3 py-1 text-xs ${assigned === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {k === "all" ? "All" : k === "unclaimed" ? "Unclaimed" : "Mine"}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="worklist">Worklist <span className="ml-1 text-xs opacity-70">({studies.length})</span></TabsTrigger>
          <TabsTrigger value="reporting">Reporting Queue <span className="ml-1 text-xs opacity-70">({reportingQueue.length})</span></TabsTrigger>
          <TabsTrigger value="films">Films & CDs <span className="ml-1 text-xs opacity-70">({allFilmEligible.length})</span></TabsTrigger>
        </TabsList>

        <TabsContent value="worklist" className="mt-3">
          <WorklistTable
            rows={studies}
            technicians={technicians}
            meId={me?.id ?? null}
            onOpen={(id) => setStudyModalId(id)}
            onReport={(id) => setReportModalId(id)}
            onFilm={(id) => setFilmModalId(id)}
            onStatus={(id, s) => setStudyStatus.mutate({ id, status: s })}
            onAssign={(id, techId) => assignTech.mutate({ id, technicianId: techId })}
            onClaim={(id) => claim.mutate({ id })}
            onUnclaim={(id) => unclaim.mutate({ id })}
          />
        </TabsContent>

        <TabsContent value="reporting" className="mt-3">
          <WorklistTable
            rows={reportingQueue}
            technicians={technicians}
            meId={me?.id ?? null}
            onOpen={(id) => setStudyModalId(id)}
            onReport={(id) => setReportModalId(id)}
            onFilm={(id) => setFilmModalId(id)}
            onStatus={(id, s) => setStudyStatus.mutate({ id, status: s })}
            onAssign={(id, techId) => assignTech.mutate({ id, technicianId: techId })}
            onClaim={(id) => claim.mutate({ id })}
            onUnclaim={(id) => unclaim.mutate({ id })}
            emptyMsg="No acquired studies waiting for a report. Mark a study as Acquired from the Worklist tab to queue it here."
          />
        </TabsContent>

        <TabsContent value="films" className="mt-3">
          <WorklistTable
            rows={allFilmEligible}
            technicians={technicians}
            meId={me?.id ?? null}
            onOpen={(id) => setStudyModalId(id)}
            onReport={(id) => setReportModalId(id)}
            onFilm={(id) => setFilmModalId(id)}
            onStatus={(id, s) => setStudyStatus.mutate({ id, status: s })}
            onAssign={(id, techId) => assignTech.mutate({ id, technicianId: techId })}
            onClaim={(id) => claim.mutate({ id })}
            onUnclaim={(id) => unclaim.mutate({ id })}
            emptyMsg="No final reports ready for film/CD/print issuance yet."
          />
        </TabsContent>
      </Tabs>

      {studyModalId !== null && (
        <StudyDetailModal id={studyModalId} onClose={() => setStudyModalId(null)} />
      )}
      {reportModalId !== null && (
        <ReportModal id={reportModalId} onClose={() => setReportModalId(null)} />
      )}
      {filmModalId !== null && (
        <FilmIssueModal id={filmModalId} onClose={() => setFilmModalId(null)} />
      )}
    </div>
  );
}

function WorklistTable(props: {
  rows: Study[];
  technicians: Technician[];
  meId: number | null;
  onOpen: (id: number) => void;
  onReport: (id: number) => void;
  onFilm: (id: number) => void;
  onStatus: (id: number, status: string) => void;
  onAssign: (id: number, techId: number | null) => void;
  onClaim: (id: number) => void;
  onUnclaim: (id: number) => void;
  emptyMsg?: string;
}) {
  const { rows, technicians, meId, onOpen, onReport, onFilm, onStatus, onAssign, onClaim, onUnclaim, emptyMsg } = props;
  if (rows.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-sm text-muted-foreground">
        {emptyMsg ?? "No studies match your filters."}
      </div>
    );
  }
  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase">
          <tr>
            <th className="text-left p-2">Accession</th>
            <th className="text-left p-2">Patient</th>
            <th className="text-left p-2">Test</th>
            <th className="text-left p-2">Modality</th>
            <th className="text-left p-2">Room</th>
            <th className="text-left p-2">Tech</th>
            <th className="text-left p-2">Status</th>
            <th className="text-left p-2">Radiologist</th>
            <th className="text-left p-2">Images</th>
            <th className="text-left p-2">Reported</th>
            <th className="text-right p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-t hover:bg-muted/30">
              <td className="p-2 font-mono text-xs">
                <button className="underline-offset-2 hover:underline text-left" onClick={() => onOpen(s.id)}>
                  {s.accessionNumber}
                </button>
                <div className="text-[10px] text-muted-foreground">{fmtTime(s.scheduledAt)}</div>
              </td>
              <td className="p-2">
                <div className="font-medium">{s.patientName}</div>
                <div className="text-xs text-muted-foreground">{s.patientCode ?? "—"} · {s.patientGender ?? "?"}</div>
              </td>
              <td className="p-2">
                <div className="font-medium">{s.testName ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{s.testCode ?? ""}{s.billNumber ? ` · ${s.billNumber}` : ""}</div>
              </td>
              <td className="p-2">
                <span className="px-2 py-0.5 text-xs rounded border bg-background">{s.modality}</span>
                <div className="text-[10px] text-muted-foreground">{s.department}</div>
              </td>
              <td className="p-2">{s.roomNumber || "—"}</td>
              <td className="p-2 min-w-[140px]">
                <Select
                  value={s.technicianId ? String(s.technicianId) : "none"}
                  onValueChange={(v) => onAssign(s.id, v === "none" ? null : Number(v))}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Assign…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Unassigned —</SelectItem>
                    {technicians.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.isRadiology ? "★ " : ""}{t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>
              <td className="p-2"><StatusPill status={s.status} /></td>
              <td className="p-2 text-xs">
                {s.assignedRadiologistName ? (
                  <div className="inline-flex items-center gap-1">
                    <span className="font-medium">{s.assignedRadiologistName}</span>
                    {s.assignedRadiologistId === meId && (
                      <button
                        title="Release claim"
                        onClick={() => onUnclaim(s.id)}
                        className="text-muted-foreground hover:text-destructive"
                      ><X size={11} /></button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onClaim(s.id)}
                    disabled={!meId}
                    className="inline-flex items-center gap-1 text-primary hover:underline disabled:text-muted-foreground"
                  >
                    <Hand size={11} /> Claim
                  </button>
                )}
              </td>
              <td className="p-2 text-center">
                <div className="inline-flex items-center gap-1">
                  <Image size={12} className="text-muted-foreground" />
                  <span className="font-mono">{s.numImages}</span>
                </div>
              </td>
              <td className="p-2 text-xs">
                {s.hasFinal ? (
                  <span className="text-emerald-700 dark:text-emerald-400">Final {fmtTime(s.finalReportedAt)}</span>
                ) : s.hasPrelim ? (
                  <span className="text-purple-700 dark:text-purple-400">Prelim {fmtTime(s.prelimReportedAt)}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="p-2 text-right whitespace-nowrap">
                {s.status === "scheduled" && (
                  <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => onStatus(s.id, "in_progress")}>
                    <PlayCircle size={12} className="mr-1" />Start
                  </Button>
                )}
                {s.status === "in_progress" && (
                  <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => onStatus(s.id, "acquired")}>
                    <Camera size={12} className="mr-1" />Acquired
                  </Button>
                )}
                {(s.status === "acquired" || s.status === "reported_preliminary" || s.status === "reported_final") && (
                  <Button size="sm" variant="outline" className="h-7 px-2 ml-1" onClick={() => onReport(s.id)}>
                    <ClipboardEdit size={12} className="mr-1" />Report
                  </Button>
                )}
                {(s.status === "reported_final" || s.status === "delivered") && (
                  <Button size="sm" variant="outline" className="h-7 px-2 ml-1" onClick={() => onFilm(s.id)}>
                    <Disc size={12} className="mr-1" />Issue
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Study Detail / quick edit ──────────────────────────────────────────────
function StudyDetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: study, isLoading } = useQuery<StudyDetail>({
    queryKey: ["radiology-study", id],
    queryFn: () => api.get(`/api/radiology/studies/${id}`),
  });

  const [numImages, setNumImages] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [studyInstanceUid, setStudyInstanceUid] = useState("");

  useEffect(() => {
    if (study) {
      setNumImages(study.numImages ?? 0);
      setNotes(study.notes ?? "");
      setStudyInstanceUid(study.studyInstanceUid ?? "");
    }
  }, [study]);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/api/radiology/${id}`, { numImages, notes, studyInstanceUid }),
    onSuccess: () => {
      toast({ title: "Study updated" });
      qc.invalidateQueries({ queryKey: ["radiology-worklist"] });
      qc.invalidateQueries({ queryKey: ["radiology-study", id] });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Study Details</DialogTitle>
          <DialogDescription>{study?.accessionNumber ?? "Loading…"}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : study ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div><div className="text-xs text-muted-foreground">Modality</div><div className="font-mono">{study.modality}</div></div>
              <div><div className="text-xs text-muted-foreground">Status</div><StatusPill status={study.status} /></div>
              <div><div className="text-xs text-muted-foreground">Technician</div><div>{study.technicianName ?? "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Room</div><div>{study.roomNumber || "—"}</div></div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Number of images acquired</label>
              <Input type="number" min={0} value={numImages} onChange={(e) => setNumImages(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">DICOM Study Instance UID (optional)</label>
              <Input value={studyInstanceUid} onChange={(e) => setStudyInstanceUid(e.target.value)} placeholder="1.2.840.113619…" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notes</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Patient prep, contrast, clinical notes…" />
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reporting modal — voice dictation, AI findings/impression, modality presets
// and tele-radiology share-link generation. Patient-side delivery is handled
// upstream when the report is verified (Settings → WhatsApp → Auto-send).
function ReportModal({ id, onClose }: { id: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: study } = useQuery<StudyDetail>({
    queryKey: ["radiology-study", id],
    queryFn: () => api.get(`/api/radiology/studies/${id}`),
  });
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["radiology-templates", study?.testId],
    enabled: !!study?.testId,
    queryFn: () => api.get(`/api/radiology/templates/${study!.testId}`),
  });

  const [body, setBody] = useState("");
  const [bodyTouched, setBodyTouched] = useState(false);
  const [reportedBy, setReportedBy] = useState("");
  const [stage, setStage] = useState<"preliminary" | "final">("preliminary");
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [clinicalHistory, setClinicalHistory] = useState("");
  const [shareLink, setShareLink] = useState<string | null>(null);

  // Load existing prelim/final + clinical history when the study loads.
  useEffect(() => {
    if (!study) return;
    if (bodyTouched) return;
    if (stage === "final") setBody(study.finalReport ?? study.prelimReport ?? "");
    else setBody(study.prelimReport ?? "");
  }, [study, stage, bodyTouched]);
  useEffect(() => {
    if (study) setClinicalHistory(study.clinicalHistory ?? "");
  }, [study]);

  const save = useMutation({
    mutationFn: async () => {
      // Persist clinical history alongside the report so subsequent AI calls
      // (and the radiologist viewer) keep their context.
      if (clinicalHistory !== (study?.clinicalHistory ?? "")) {
        await api.patch(`/api/radiology/${id}`, { clinicalHistory });
      }
      return api.post(`/api/radiology/${id}/report`, {
        stage, body,
        reportedBy: reportedBy || undefined,
        templateId: templateId ?? undefined,
      });
    },
    onSuccess: () => {
      toast({ title: stage === "final" ? "Final report saved" : "Preliminary report saved" });
      qc.invalidateQueries({ queryKey: ["radiology-worklist"] });
      qc.invalidateQueries({ queryKey: ["radiology-study", id] });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  function applyTemplate(tplId: string) {
    const tpl = templates.find((t) => String(t.id) === tplId);
    if (!tpl) return;
    setTemplateId(tpl.id);
    setBody((prev) => (prev?.trim() ? prev : tpl.content));
    setBodyTouched(true);
  }

  function applyPreset(key: string) {
    const p = MODALITY_PRESETS.find((m) => m.key === key);
    if (!p) return;
    setBody((prev) => (prev?.trim() ? `${prev}\n\n${p.body}` : p.body));
    setBodyTouched(true);
  }

  // ── Voice dictation (Web Speech API, on-device when supported) ───────────
  // Falls back gracefully when SpeechRecognition is unavailable. The voice
  // feature is opt-in and never auto-starts. We hold the live recognition
  // handle in a ref so we can tear it down on unmount.
  type SR = {
    start: () => void; stop: () => void; abort?: () => void;
    onresult: (e: { results: { isFinal: boolean; 0: { transcript: string } }[] }) => void;
    onerror: (e: { error: string }) => void;
    onend: () => void;
  };
  const recognitionRef = useRef<{ rec: SR | null }>({ rec: null });
  const [listening, setListening] = useState(false);
  // Stop any active recognition when the modal closes — leaving it running
  // would keep the microphone hot in some browsers.
  useEffect(() => {
    return () => {
      try { recognitionRef.current.rec?.abort?.(); } catch { /* ignore */ }
      try { recognitionRef.current.rec?.stop(); } catch { /* ignore */ }
      recognitionRef.current.rec = null;
    };
  }, []);
  const speechSupported = typeof window !== "undefined" && (
    "SpeechRecognition" in window || "webkitSpeechRecognition" in window
  );

  const toggleMic = () => {
    if (!speechSupported) {
      toast({ title: "Voice dictation unavailable", description: "This browser does not support live transcription.", variant: "destructive" });
      return;
    }
    if (listening) {
      recognitionRef.current.rec?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor() as SR & { continuous: boolean; interimResults: boolean; lang: string };
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-IN";
    rec.onresult = (e) => {
      const results = e.results as unknown as Array<{ isFinal: boolean; 0: { transcript: string } }>;
      const last = results[results.length - 1];
      if (last?.isFinal) {
        const text = last[0].transcript.trim();
        if (text) {
          setBody((prev) => prev + (prev && !prev.endsWith("\n") ? " " : "") + text);
          setBodyTouched(true);
        }
      }
    };
    rec.onerror = (e) => { toast({ title: "Mic error", description: e.error, variant: "destructive" }); setListening(false); };
    rec.onend = () => setListening(false);
    recognitionRef.current.rec = rec;
    rec.start();
    setListening(true);
  };

  // ── AI helpers ────────────────────────────────────────────────────────────
  const aiFindings = useMutation({
    mutationFn: () =>
      api.post<{ findings: string }>("/api/ai/radiology-findings", {
        modality: study?.modality,
        testName: study?.testName ?? undefined,
        clinicalHistory,
        dictation: body,
      }),
    onSuccess: (res) => {
      if (!res?.findings) return;
      setBody((prev) => (prev?.trim() ? `${prev}\n\n${res.findings}` : res.findings));
      setBodyTouched(true);
      toast({ title: "AI findings generated" });
    },
    onError: (e: Error) => toast({ title: "AI findings failed", description: e.message, variant: "destructive" }),
  });

  const aiImpression = useMutation({
    mutationFn: () =>
      api.post<{ impression: string }>("/api/ai/radiology-impression", {
        findings: body,
        modality: study?.modality,
        testName: study?.testName ?? undefined,
      }),
    onSuccess: (res) => {
      if (!res?.impression) return;
      const sep = body.toUpperCase().includes("IMPRESSION")
        ? "\n\n— AI suggested impression —\n"
        : "\n\nIMPRESSION:\n";
      setBody((prev) => prev + sep + res.impression);
      setBodyTouched(true);
      toast({ title: "Impression suggested" });
    },
    onError: (e: Error) => toast({ title: "AI impression failed", description: e.message, variant: "destructive" }),
  });

  // ── Tele-radiology share link (radiologist audience) ─────────────────────
  const makeShare = useMutation({
    mutationFn: () => api.post<{ url: string }>(`/api/radiology/${id}/share-link`, { audience: "radiologist", expiresInHours: 24 }),
    onSuccess: (res) => {
      if (!res?.url) return;
      setShareLink(res.url);
      navigator.clipboard?.writeText(res.url).catch(() => undefined);
      toast({ title: "Tele-radiology link copied", description: "Valid for 24 hours" });
    },
    onError: (e: Error) => toast({ title: "Share-link failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText size={16} />
            Report — {study?.accessionNumber ?? ""}
          </DialogTitle>
          <DialogDescription>
            {study?.testName ?? ""} · {study?.patientName ?? ""} · {study?.modality}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={stage} onValueChange={(v) => setStage(v as typeof stage)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="preliminary">Preliminary</SelectItem>
                <SelectItem value="final">Final</SelectItem>
              </SelectContent>
            </Select>

            <Select value={templateId ? String(templateId) : ""} onValueChange={applyTemplate}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder={templates.length ? "Test template…" : "No saved template"} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.isDefault ? "★ " : ""}{t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value="" onValueChange={applyPreset}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Modality preset…" />
              </SelectTrigger>
              <SelectContent>
                {MODALITY_PRESETS
                  .filter((p) => !study?.modality || p.modality === study.modality)
                  .map((p) => (
                    <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                  ))}
              </SelectContent>
            </Select>

            <Input
              value={reportedBy}
              onChange={(e) => setReportedBy(e.target.value)}
              placeholder="Reported by (radiologist)"
              className="w-56"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Clinical history (used by AI for context)</label>
            <Textarea
              value={clinicalHistory}
              onChange={(e) => setClinicalHistory(e.target.value)}
              rows={2}
              placeholder="e.g. 45F, headache 3 days, no trauma, on antihypertensives. Rule out SAH."
              className="text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button" size="sm"
              variant={listening ? "destructive" : "outline"}
              onClick={toggleMic}
              title={speechSupported ? "Toggle voice dictation" : "Voice dictation not supported in this browser"}
            >
              {listening ? <MicOff size={14} className="mr-1" /> : <Mic size={14} className="mr-1" />}
              {listening ? "Stop" : "Dictate"}
            </Button>
            <Button
              type="button" size="sm" variant="outline"
              onClick={() => aiFindings.mutate()}
              disabled={aiFindings.isPending || !study}
            >
              <Sparkles size={14} className="mr-1" />
              {aiFindings.isPending ? "Drafting…" : "AI Suggest Findings"}
            </Button>
            <Button
              type="button" size="sm" variant="outline"
              onClick={() => aiImpression.mutate()}
              disabled={aiImpression.isPending || !body.trim()}
            >
              <Sparkles size={14} className="mr-1" />
              {aiImpression.isPending ? "Thinking…" : "AI Suggest Impression"}
            </Button>
            <div className="ml-auto inline-flex items-center gap-2">
              <Button
                type="button" size="sm" variant="outline"
                onClick={() => makeShare.mutate()}
                disabled={makeShare.isPending}
                title="Generate a 24-hour tele-radiology link to read this study from anywhere"
              >
                <Link2 size={14} className="mr-1" />
                Tele-radiology link
              </Button>
              {shareLink && (
                <button
                  type="button"
                  onClick={() => { navigator.clipboard?.writeText(shareLink); toast({ title: "Copied" }); }}
                  className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                >
                  <CopyIcon size={11} /> Copy again
                </button>
              )}
            </div>
          </div>

          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={16}
            className="font-mono text-sm"
            placeholder="Dictate, type, or use the AI / preset buttons above."
          />

          {listening && (
            <div className="text-xs text-emerald-600 inline-flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Listening — finalised phrases will be appended to the report.
            </div>
          )}

          {study?.hasFinal && stage === "preliminary" && (
            <div className="text-xs text-amber-700 dark:text-amber-400">
              A final report is already on file. Saving a preliminary will keep the existing final intact and won&rsquo;t change the study status.
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            AI suggestions are drafts only. The radiologist remains responsible for the final report content and sign-off.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !body.trim()}>
            <Send size={14} className="mr-1" />
            Save {stage === "final" ? "Final" : "Preliminary"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Film / CD / Print issuance ─────────────────────────────────────────────
function FilmIssueModal({ id, onClose }: { id: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: study } = useQuery<StudyDetail>({
    queryKey: ["radiology-study", id],
    queryFn: () => api.get(`/api/radiology/studies/${id}`),
  });
  const { data: issues = [], refetch } = useQuery<FilmIssue[]>({
    queryKey: ["radiology-issues", id],
    queryFn: () => api.get(`/api/radiology/${id}/issues`),
  });

  const [issueType, setIssueType] = useState<"film" | "cd" | "print">("film");
  const [quantity, setQuantity] = useState(1);
  const [issuedBy, setIssuedBy] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: () => api.post(`/api/radiology/${id}/issues`, { issueType, quantity, issuedBy: issuedBy || undefined, receivedBy: receivedBy || undefined, notes: notes || undefined }),
    onSuccess: () => {
      toast({ title: `${issueType.toUpperCase()} issued` });
      setQuantity(1); setIssuedBy(""); setReceivedBy(""); setNotes("");
      refetch();
      qc.invalidateQueries({ queryKey: ["radiology-worklist"] });
    },
    onError: (e: Error) => toast({ title: "Could not record issuance", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Disc size={16} />
            Film / CD / Print Issue — {study?.accessionNumber ?? ""}
          </DialogTitle>
          <DialogDescription>
            {study?.testName ?? ""} · {study?.patientName ?? ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Type</label>
              <Select value={issueType} onValueChange={(v) => setIssueType(v as typeof issueType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="film"><span className="inline-flex items-center gap-2"><Image size={12} />Film sheet</span></SelectItem>
                  <SelectItem value="cd"><span className="inline-flex items-center gap-2"><Disc size={12} />CD / DVD</span></SelectItem>
                  <SelectItem value="print"><span className="inline-flex items-center gap-2"><Printer size={12} />Paper print</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Quantity</label>
              <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Issued by (staff)</label>
              <Input value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} placeholder="Reception / Tech" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Received by</label>
              <Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Patient / attendant name" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notes</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            <Button onClick={() => create.mutate()} disabled={create.isPending} className="w-full">
              Record Issue
            </Button>
          </div>

          <div className="border rounded-md p-2 text-sm overflow-y-auto max-h-80">
            <div className="text-xs uppercase text-muted-foreground mb-2">History ({issues.length})</div>
            {issues.length === 0 ? (
              <div className="text-xs text-muted-foreground">Nothing issued yet.</div>
            ) : (
              <ul className="space-y-2">
                {issues.map((i) => (
                  <li key={i.id} className="border-b last:border-0 pb-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium uppercase text-xs">{i.issueType}</span>
                      <span className="text-xs text-muted-foreground">{new Date(i.issuedAt).toLocaleString()}</span>
                    </div>
                    <div className="text-xs">Qty: {i.quantity}</div>
                    {(i.issuedBy || i.receivedBy) && (
                      <div className="text-xs text-muted-foreground">
                        {i.issuedBy ? `By ${i.issuedBy}` : ""}{i.issuedBy && i.receivedBy ? " → " : ""}{i.receivedBy ? `to ${i.receivedBy}` : ""}
                      </div>
                    )}
                    {i.notes && <div className="text-xs italic">{i.notes}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// keep tree-shake friendly imports happy
void UserCircle2; void Hourglass; void CheckCircle2;
