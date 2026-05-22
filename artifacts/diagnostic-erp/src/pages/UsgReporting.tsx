import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { fetchApi } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { readStaffSession } from "@/lib/staffSession";
import {
  FileText, Plus, CheckCircle2, Clock, Archive, ArrowLeft,
  ChevronDown, ChevronUp, Trash2, Download,
} from "lucide-react";

interface ReportDraft {
  id: number;
  worklistId: number | null;
  studyInstanceUID: string | null;
  patientId: number | null;
  accessionNumber: string | null;
  templateType: string;
  draftContent: string;
  status: string;
  autoFilledFromMeasurementId: number | null;
  createdBy: string | null;
  finalizedBy: string | null;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
}

const TEMPLATE_TYPES = [
  { value: "OBSTETRIC",    label: "Obstetric (OB)" },
  { value: "PELVIS",       label: "Pelvis" },
  { value: "ABDOMEN",      label: "Abdomen" },
  { value: "WHOLE_ABDOMEN",label: "Whole Abdomen" },
  { value: "KUB",          label: "KUB (Kidney-Ureter-Bladder)" },
  { value: "THYROID",      label: "Thyroid / Neck" },
  { value: "SCROTUM",      label: "Scrotum" },
  { value: "DOPPLER",      label: "Doppler" },
  { value: "CUSTOM",       label: "Custom" },
];

const STATUS_STYLE: Record<string, string> = {
  draft:     "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300",
  finalized: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300",
  archived:  "bg-gray-100 text-gray-600 border-gray-200",
};

const TEMPLATE_PLACEHOLDERS: Record<string, string> = {
  OBSTETRIC: `USG OBSTETRIC REPORT
-------------------
Patient Name: [NAME]  Age: [AGE]  LMP: ____

FETAL BIOMETRY:
  BPD: ___  mm       HC: ___  mm
  AC: ___   mm       FL: ___  mm
  EFW: ___  grams

GESTATIONAL AGE:
  By LMP: ___ weeks ___ days
  By USG: ___ weeks ___ days  (±___ days)
  EDD: ___

FETAL WELL-BEING:
  FHR: ___ bpm   Rhythm: Regular
  Fetal movements: Present / Not seen
  Presentation: Cephalic / Breech / Transverse

PLACENTA & LIQUOR:
  Placenta: Posterior / Anterior  Grade: ___
  AFI: ___ cm  (Normal: 8–18 cm)

IMPRESSION:
Single / Twin live intrauterine pregnancy of ___ weeks ___ days gestation.
Biometry corresponds to ___`,

  WHOLE_ABDOMEN: `USG WHOLE ABDOMEN
-----------------
LIVER:   Size: ___  cm  Echotexture: Homogeneous / Heterogeneous
         Parenchyma: Normal  Portal vein: ___  mm
GALLBLADDER: Size: ___×___  mm  Wall thickness: ___ mm  Calculi: Nil
CBD: ___  mm
SPLEEN:  Size: ___  cm  Echotexture: Normal
PANCREAS: Head: ___ mm  Body: ___ mm  Tail: ___ mm  Duct: Normal
RIGHT KIDNEY: Size: ___×___  cm  Cortical thickness: ___ mm
LEFT KIDNEY:  Size: ___×___  cm  Cortical thickness: ___ mm
URINARY BLADDER: Adequately filled  Wall: Normal  No calculi
AORTA & IVC: Normal calibre
IMPRESSION:
`,

  PELVIS: `USG PELVIS (TV/TA)
------------------
UTERUS: Size ___×___×___ cm  Position: Anteverted / Retroverted
        Myometrium: Homogeneous  Endometrium: ___ mm
RIGHT OVARY: ___×___×___ cm  Follicles: ___
LEFT OVARY:  ___×___×___ cm  Follicles: ___
POD: Free / Fluid
IMPRESSION:
`,

  KUB: `USG KUB
--------
RIGHT KIDNEY: ___×___ cm  Cortex: ___mm  Calculi: Nil / Present
LEFT KIDNEY:  ___×___ cm  Cortex: ___mm  Calculi: Nil / Present
URETERS: Not dilated / Dilated at ___
URINARY BLADDER: Capacity ___ ml  Wall: Normal  Post-void residue: ___ ml
PROSTATE (if applicable): ___×___×___ cm  Volume: ___ ml
IMPRESSION:
`,
};

function getPlaceholder(templateType: string): string {
  return TEMPLATE_PLACEHOLDERS[templateType] ?? "Enter report content…";
}

export default function UsgReporting() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const session = readStaffSession();

  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [newForm, setNewForm] = useState({
    studyInstanceUID: "",
    accessionNumber: "",
    templateType: "WHOLE_ABDOMEN",
    draftContent: "",
  });

  const { data: drafts = [], isLoading } = useQuery<ReportDraft[]>({
    queryKey: ["usg-report-drafts"],
    queryFn: () => fetchApi("/api/usg-reports"),
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof newForm) =>
      fetchApi("/api/usg-reports", { method: "POST", body: JSON.stringify({
        ...body,
        createdBy: session?.user.name ?? "staff",
        draftContent: body.draftContent || getPlaceholder(body.templateType),
      }) }),
    onSuccess: () => {
      toast({ title: "Report draft created" });
      setShowCreate(false);
      setNewForm({ studyInstanceUID: "", accessionNumber: "", templateType: "WHOLE_ABDOMEN", draftContent: "" });
      void qc.invalidateQueries({ queryKey: ["usg-report-drafts"] });
      void qc.invalidateQueries({ queryKey: ["usg-stats"] });
    },
    onError: () => toast({ title: "Failed to create draft", variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, draftContent }: { id: number; draftContent: string }) =>
      fetchApi(`/api/usg-reports/${id}`, { method: "PATCH", body: JSON.stringify({ draftContent }) }),
    onSuccess: () => {
      toast({ title: "Draft saved" });
      void qc.invalidateQueries({ queryKey: ["usg-report-drafts"] });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: (id: number) =>
      fetchApi(`/api/usg-reports/${id}/finalize`, { method: "POST", body: JSON.stringify({ finalizedBy: session?.user.name ?? "staff" }) }),
    onSuccess: () => {
      toast({ title: "Report finalized" });
      void qc.invalidateQueries({ queryKey: ["usg-report-drafts"] });
      void qc.invalidateQueries({ queryKey: ["usg-stats"] });
    },
  });

  const [editContent, setEditContent] = useState<Record<number, string>>({});

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="USG Reporting"
        subtitle="Draft and finalize ultrasound reports with auto-fill from approved measurements"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/usg")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" /> New Report
            </Button>
          </div>
        }
      />

      {/* Create form */}
      {showCreate && (
        <Card className="border-primary/30 bg-primary/[0.02]">
          <CardHeader>
            <CardTitle className="text-base">New Report Draft</CardTitle>
            <CardDescription>Create a new USG report draft. You can auto-fill from approved measurements.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Study Instance UID (optional)</Label>
                <Input
                  placeholder="1.2.840..."
                  value={newForm.studyInstanceUID}
                  onChange={(e) => setNewForm((f) => ({ ...f, studyInstanceUID: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Accession Number (optional)</Label>
                <Input
                  placeholder="ACC-2026-001"
                  value={newForm.accessionNumber}
                  onChange={(e) => setNewForm((f) => ({ ...f, accessionNumber: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Report Template</Label>
              <div className="flex flex-wrap gap-2">
                {TEMPLATE_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setNewForm((f) => ({ ...f, templateType: t.value }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      newForm.templateType === t.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Initial Content (leave blank to use template)</Label>
              <Textarea
                rows={6}
                placeholder={getPlaceholder(newForm.templateType)}
                value={newForm.draftContent}
                onChange={(e) => setNewForm((f) => ({ ...f, draftContent: e.target.value }))}
                className="font-mono text-xs"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button size="sm" onClick={() => createMutation.mutate(newForm)} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create Draft"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
      )}

      {!isLoading && drafts.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground font-medium">No report drafts yet</p>
            <p className="text-xs text-muted-foreground mt-1">Click "New Report" to create your first USG report draft.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {drafts.map((draft) => {
          const isExpanded = expandedId === draft.id;
          const content = editContent[draft.id] ?? draft.draftContent;

          return (
            <Card key={draft.id} className={draft.status === "finalized" ? "opacity-80" : ""}>
              <CardContent className="p-0">
                <button
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors rounded-xl"
                  onClick={() => setExpandedId(isExpanded ? null : draft.id)}
                >
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    {draft.status === "finalized"
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      : draft.status === "archived"
                        ? <Archive className="h-4 w-4 text-gray-500" />
                        : <Clock className="h-4 w-4 text-amber-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">
                        {TEMPLATE_TYPES.find((t) => t.value === draft.templateType)?.label ?? draft.templateType}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${STATUS_STYLE[draft.status] ?? STATUS_STYLE.draft}`}>
                        {draft.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {draft.accessionNumber ?? draft.studyInstanceUID?.slice(0, 30) ?? "No study ID"}
                      {" · "}
                      {new Date(draft.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                    <Textarea
                      rows={12}
                      className="font-mono text-xs resize-y"
                      value={content}
                      onChange={(e) =>
                        setEditContent((prev) => ({ ...prev, [draft.id]: e.target.value }))
                      }
                      readOnly={draft.status === "finalized"}
                    />
                    {draft.status !== "finalized" && (
                      <div className="flex gap-2 flex-wrap justify-end">
                        <Button
                          variant="outline" size="sm"
                          onClick={() => saveMutation.mutate({ id: draft.id, draftContent: content })}
                          disabled={saveMutation.isPending}
                        >
                          <Download className="h-3.5 w-3.5 mr-1.5" />
                          Save Draft
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => finalizeMutation.mutate(draft.id)}
                          disabled={finalizeMutation.isPending}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                          Finalize Report
                        </Button>
                      </div>
                    )}
                    {draft.finalizedAt && (
                      <p className="text-xs text-muted-foreground text-right">
                        Finalized by {draft.finalizedBy} on {new Date(draft.finalizedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
