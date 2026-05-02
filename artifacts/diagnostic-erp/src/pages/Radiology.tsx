import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
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
};

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

  const { data: studies = [], isFetching, refetch } = useQuery<Study[]>({
    queryKey: ["radiology-worklist", date, modality, status, search],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("date", date);
      if (modality !== "all") p.set("modality", modality);
      if (status !== "all") p.set("status", status);
      if (search.trim()) p.set("search", search.trim());
      return api.get(`/api/radiology/worklist?${p.toString()}`);
    },
    refetchInterval: 8_000,
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
        description="Modality worklist, technician assignment, reporting & film/CD tracking"
        icon={Radio}
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
            onOpen={(id) => setStudyModalId(id)}
            onReport={(id) => setReportModalId(id)}
            onFilm={(id) => setFilmModalId(id)}
            onStatus={(id, s) => setStudyStatus.mutate({ id, status: s })}
            onAssign={(id, techId) => assignTech.mutate({ id, technicianId: techId })}
          />
        </TabsContent>

        <TabsContent value="reporting" className="mt-3">
          <WorklistTable
            rows={reportingQueue}
            technicians={technicians}
            onOpen={(id) => setStudyModalId(id)}
            onReport={(id) => setReportModalId(id)}
            onFilm={(id) => setFilmModalId(id)}
            onStatus={(id, s) => setStudyStatus.mutate({ id, status: s })}
            onAssign={(id, techId) => assignTech.mutate({ id, technicianId: techId })}
            emptyMsg="No acquired studies waiting for a report. Mark a study as Acquired from the Worklist tab to queue it here."
          />
        </TabsContent>

        <TabsContent value="films" className="mt-3">
          <WorklistTable
            rows={allFilmEligible}
            technicians={technicians}
            onOpen={(id) => setStudyModalId(id)}
            onReport={(id) => setReportModalId(id)}
            onFilm={(id) => setFilmModalId(id)}
            onStatus={(id, s) => setStudyStatus.mutate({ id, status: s })}
            onAssign={(id, techId) => assignTech.mutate({ id, technicianId: techId })}
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
  onOpen: (id: number) => void;
  onReport: (id: number) => void;
  onFilm: (id: number) => void;
  onStatus: (id: number, status: string) => void;
  onAssign: (id: number, techId: number | null) => void;
  emptyMsg?: string;
}) {
  const { rows, technicians, onOpen, onReport, onFilm, onStatus, onAssign, emptyMsg } = props;
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

// ── Reporting modal — pulls test-wise templates and saves prelim/final ─────
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
  const [reportedBy, setReportedBy] = useState("");
  const [stage, setStage] = useState<"preliminary" | "final">("preliminary");
  const [templateId, setTemplateId] = useState<number | null>(null);

  // Load existing prelim/final if present, otherwise blank for the chosen stage.
  useEffect(() => {
    if (!study) return;
    if (stage === "final") setBody(study.finalReport ?? study.prelimReport ?? "");
    else setBody(study.prelimReport ?? "");
  }, [study, stage]);

  const save = useMutation({
    mutationFn: () =>
      api.post(`/api/radiology/${id}/report`, { stage, body, reportedBy: reportedBy || undefined, templateId: templateId ?? undefined }),
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
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText size={16} />
            Report — {study?.accessionNumber ?? ""}
          </DialogTitle>
          <DialogDescription>
            {study?.testName ?? ""} · {study?.patientName ?? ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={stage} onValueChange={(v) => setStage(v as typeof stage)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="preliminary">Preliminary</SelectItem>
                <SelectItem value="final">Final</SelectItem>
              </SelectContent>
            </Select>

            <Select value={templateId ? String(templateId) : ""} onValueChange={applyTemplate}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder={templates.length ? "Insert template…" : "No templates for this test"} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.isDefault ? "★ " : ""}{t.name}
                  </SelectItem>
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

          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            className="font-mono text-sm"
            placeholder="Type the report here, or insert a test-wise template above."
          />

          {study?.hasFinal && stage === "preliminary" && (
            <div className="text-xs text-amber-700 dark:text-amber-400">
              A final report is already on file. Saving a preliminary will keep the existing final intact and won&rsquo;t change the study status.
            </div>
          )}
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
