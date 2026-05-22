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
import { readStaffSession, FULL_ACCESS_ROLES } from "@/lib/staffSession";
import VoiceDictationButton from "@/components/VoiceDictationButton";
import {
  FileText, Plus, CheckCircle2, Clock, Archive, ArrowLeft,
  ChevronDown, ChevronUp, Sparkles, RefreshCw, ShieldCheck, History, AlertTriangle,
  Lock, FileWarning, ShieldBan, Loader2,
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
  verifiedBy: string | null;
  verifiedAt: string | null;
  amendedBy: string | null;
  amendedAt: string | null;
  priorVersionId: number | null;
  finalizedReportHash: string | null;
  amendmentReason: string | null;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
}

interface TemplateDescriptor {
  id: string;
  label: string;
  category: string;
  bodyPart?: string;
}

interface QualityCheckResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

const STATUS_STYLE: Record<string, string> = {
  draft:          "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300",
  pending_review: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300",
  verified:       "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300",
  finalized:      "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300",
  amended:        "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300",
  archived:       "bg-gray-100 text-gray-600 border-gray-200",
};

export default function UsgReporting() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const session = readStaffSession();
  const isAdmin = FULL_ACCESS_ROLES.has(session?.user.role ?? "");

  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [confirmFinalizeId, setConfirmFinalizeId] = useState<number | null>(null);
  const [showPriorFor, setShowPriorFor] = useState<{ id: number; patientId: number } | null>(null);
  const [showQualityCheck, setShowQualityCheck] = useState<{ draftId: number; result: QualityCheckResult } | null>(null);
  const [showAmendReason, setShowAmendReason] = useState<number | null>(null);
  const [amendReason, setAmendReason] = useState("");
  const [showForceFinalize, setShowForceFinalize] = useState<{ id: number; reason: string } | null>(null);
  const [newForm, setNewForm] = useState({
    studyInstanceUID: "",
    accessionNumber: "",
    worklistId: "",
    patientId: "",
    templateType: "WHOLE_ABDOMEN",
    draftContent: "",
  });

  const { data: templates = [] } = useQuery<TemplateDescriptor[]>({
    queryKey: ["usg-templates"],
    queryFn: () => fetchApi("/api/usg-reports/templates"),
    staleTime: 5 * 60_000,
  });

  const { data: drafts = [], isLoading } = useQuery<ReportDraft[]>({
    queryKey: ["usg-report-drafts"],
    queryFn: () => fetchApi("/api/usg-reports"),
    staleTime: 30_000,
  });

  const previewMutation = useMutation({
    mutationFn: (body: { templateId: string; studyInstanceUID?: string; worklistId?: number; autoSuggest?: boolean }) =>
      fetchApi("/api/usg-reports/auto-generate", { method: "POST", body: JSON.stringify(body) }) as Promise<{
        content: string; templateId: string; filledFieldCount: number; skippedLowConfidenceCount: number;
        hasApprovedMeasurements: boolean; approvedDopplerCount: number;
      }>,
    onSuccess: (out) => {
      setNewForm((f) => ({ ...f, draftContent: out.content, templateType: out.templateId }));
      toast({
        title: out.hasApprovedMeasurements ? "Template auto-filled" : "Template loaded (no approved measurements yet)",
        description: `${out.filledFieldCount} fields filled \u00b7 ${out.skippedLowConfidenceCount} low-confidence skipped`,
      });
    },
    onError: () => toast({ title: "Failed to auto-generate", variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof newForm) =>
      fetchApi("/api/usg-reports", { method: "POST", body: JSON.stringify({
        studyInstanceUID: body.studyInstanceUID || undefined,
        accessionNumber:  body.accessionNumber  || undefined,
        worklistId:       body.worklistId       ? Number(body.worklistId) : undefined,
        patientId:        body.patientId        ? Number(body.patientId)  : undefined,
        templateType:     body.templateType,
        draftContent:     body.draftContent,
        createdBy:        session?.user.name ?? "staff",
      }) }),
    onSuccess: () => {
      toast({ title: "Report draft created" });
      setShowCreate(false);
      setNewForm({ studyInstanceUID: "", accessionNumber: "", worklistId: "", patientId: "",
        templateType: "WHOLE_ABDOMEN", draftContent: "" });
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

  const regenerateMutation = useMutation({
    mutationFn: ({ id, templateType }: { id: number; templateType?: string }) =>
      fetchApi(`/api/usg-reports/${id}/regenerate`, { method: "POST",
        body: JSON.stringify(templateType ? { templateType } : {}) }),
    onSuccess: () => {
      toast({ title: "Report regenerated from latest measurements" });
      setEditContent({});
      void qc.invalidateQueries({ queryKey: ["usg-report-drafts"] });
    },
    onError: (err: unknown) => toast({
      title: "Cannot regenerate",
      description: err instanceof Error ? err.message : "Already finalized \u2014 use Amend instead.",
      variant: "destructive",
    }),
  });

  const verifyMutation = useMutation({
    mutationFn: (id: number) =>
      fetchApi(`/api/usg-reports/${id}/verify`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      toast({ title: "Report verified \u2014 ready for finalize" });
      void qc.invalidateQueries({ queryKey: ["usg-report-drafts"] });
    },
  });

  const qualityCheckMutation = useMutation({
    mutationFn: (id: number) =>
      fetchApi(`/api/usg-reports/${id}/quality-check`, { method: "POST", body: "{}" }) as Promise<QualityCheckResult & { draftId: number }>,
    onSuccess: (result) => {
      setShowQualityCheck({ draftId: result.draftId, result: { passed: result.passed, errors: result.errors, warnings: result.warnings } });
    },
    onError: () => toast({ title: "Quality check failed", variant: "destructive" }),
  });

  const finalizeMutation = useMutation({
    mutationFn: (id: number) =>
      fetchApi(`/api/usg-reports/${id}/finalize`, { method: "POST",
        body: JSON.stringify({ confirm: true, finalizedBy: session?.user.name ?? "staff" }) }),
    onSuccess: () => {
      setConfirmFinalizeId(null);
      toast({ title: "Report finalized" });
      void qc.invalidateQueries({ queryKey: ["usg-report-drafts"] });
      void qc.invalidateQueries({ queryKey: ["usg-stats"] });
    },
    onError: (err: unknown) => toast({
      title: "Finalize failed",
      description: err instanceof Error ? err.message : "Quality check may have failed or report not verified.",
      variant: "destructive",
    }),
  });

  const forceFinalizeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      fetchApi(`/api/usg-reports/${id}/finalize-force`, { method: "POST",
        body: JSON.stringify({ confirm: true, finalizedBy: session?.user.name ?? "staff", reason }) }),
    onSuccess: () => {
      setShowForceFinalize(null);
      setConfirmFinalizeId(null);
      toast({ title: "Report force-finalized (logged)" });
      void qc.invalidateQueries({ queryKey: ["usg-report-drafts"] });
      void qc.invalidateQueries({ queryKey: ["usg-stats"] });
    },
    onError: (err: unknown) => toast({
      title: "Force finalize failed",
      description: err instanceof Error ? err.message : "Not authorized or server error.",
      variant: "destructive",
    }),
  });

  const amendMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      fetchApi(`/api/usg-reports/${id}/amend`, { method: "POST", body: JSON.stringify({
        amendedBy: session?.user.name ?? "staff", amendmentReason: reason || undefined,
      }) }),
    onSuccess: () => {
      setShowAmendReason(null);
      setAmendReason("");
      toast({ title: "Amendment draft created" });
      void qc.invalidateQueries({ queryKey: ["usg-report-drafts"] });
    },
  });

  const [editContent, setEditContent] = useState<Record<number, string>>({});
  const templateLabel = (id: string) => templates.find((t) => t.id === id)?.label ?? id;

  const groupedTemplates = templates.reduce<Record<string, TemplateDescriptor[]>>((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {});

  const dirtyContentFor = (id: number, original: string) => editContent[id] ?? original;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="USG Reporting"
        subtitle="Draft, auto-generate, verify and finalize ultrasound reports \u2014 13 templates \u00b7 voice dictation \u00b7 quality gate \u00b7 audit trail"
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
            <CardDescription>Pick a template, attach a study, and auto-generate from approved measurements.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Study UID</Label>
                <Input placeholder="1.2.840\u2026" value={newForm.studyInstanceUID}
                  onChange={(e) => setNewForm((f) => ({ ...f, studyInstanceUID: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Worklist ID</Label>
                <Input placeholder="(optional)" value={newForm.worklistId}
                  onChange={(e) => setNewForm((f) => ({ ...f, worklistId: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Patient ID</Label>
                <Input placeholder="(optional)" value={newForm.patientId}
                  onChange={(e) => setNewForm((f) => ({ ...f, patientId: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Accession #</Label>
                <Input placeholder="ACC-2026-\u2026" value={newForm.accessionNumber}
                  onChange={(e) => setNewForm((f) => ({ ...f, accessionNumber: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Template ({templates.length} available)</Label>
              {Object.entries(groupedTemplates).map(([cat, list]) => (
                <div key={cat} className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{cat}</p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((t) => (
                      <button key={t.id}
                        onClick={() => setNewForm((f) => ({ ...f, templateType: t.id }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          newForm.templateType === t.id
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary" size="sm"
                onClick={() => previewMutation.mutate({
                  templateId:       newForm.templateType,
                  studyInstanceUID: newForm.studyInstanceUID || undefined,
                  worklistId:       newForm.worklistId ? Number(newForm.worklistId) : undefined,
                })}
                disabled={previewMutation.isPending}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                {previewMutation.isPending ? "Generating\u2026" : "Auto-Generate from Measurements"}
              </Button>
              {newForm.studyInstanceUID || newForm.worklistId ? (
                <Button variant="ghost" size="sm"
                  onClick={() => previewMutation.mutate({
                    templateId:       newForm.templateType,
                    studyInstanceUID: newForm.studyInstanceUID || undefined,
                    worklistId:       newForm.worklistId ? Number(newForm.worklistId) : undefined,
                    autoSuggest: true,
                  })}
                >
                  Suggest Template Automatically
                </Button>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label>Report Content</Label>
              <Textarea
                rows={12}
                placeholder="Click 'Auto-Generate' above to populate this with the chosen template + approved measurements."
                value={newForm.draftContent}
                onChange={(e) => setNewForm((f) => ({ ...f, draftContent: e.target.value }))}
                className="font-mono text-xs"
              />
              <div className="flex justify-end">
                <VoiceDictationButton
                  targetField="draftContent"
                  onInsert={(text) => setNewForm((f) => ({ ...f, draftContent: f.draftContent + (f.draftContent.endsWith("\n") ? "" : "\n") + text }))}
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button size="sm" onClick={() => createMutation.mutate(newForm)} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating\u2026" : "Create Draft"}
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
          const isFinalized = draft.status === "finalized";
          const content = dirtyContentFor(draft.id, draft.draftContent);

          return (
            <Card key={draft.id} className={isFinalized ? "opacity-95" : ""}>
              <CardContent className="p-0">
                <button
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors rounded-xl"
                  onClick={() => setExpandedId(isExpanded ? null : draft.id)}
                >
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    {isFinalized ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      : draft.status === "verified" ? <ShieldCheck className="h-4 w-4 text-violet-600" />
                      : draft.status === "archived" ? <Archive className="h-4 w-4 text-gray-500" />
                      : draft.status === "amended"  ? <History className="h-4 w-4 text-orange-600" />
                      : <Clock className="h-4 w-4 text-amber-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{templateLabel(draft.templateType)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${STATUS_STYLE[draft.status] ?? STATUS_STYLE.draft}`}>
                        {draft.status.toUpperCase()}
                      </span>
                      {isFinalized && (
                        <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                          <Lock className="h-3 w-3" />
                          HASH {draft.finalizedReportHash?.slice(0, 8)}
                        </Badge>
                      )}
                      {draft.amendmentReason && (
                        <Badge variant="outline" className="text-[10px]">
                          Reason: {draft.amendmentReason}
                        </Badge>
                      )}
                      {draft.priorVersionId && (
                        <Badge variant="outline" className="text-[10px]">amends #{draft.priorVersionId}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {draft.accessionNumber ?? draft.studyInstanceUID?.slice(0, 30) ?? "No study ID"}
                      {" \u00b7 "}
                      {new Date(draft.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                    <Textarea
                      rows={14}
                      className="font-mono text-xs resize-y"
                      value={content}
                      onChange={(e) => setEditContent((prev) => ({ ...prev, [draft.id]: e.target.value }))}
                      readOnly={isFinalized}
                    />

                    {!isFinalized && (
                      <div className="flex gap-2 flex-wrap items-center">
                        <VoiceDictationButton
                          draftId={draft.id}
                          patientId={draft.patientId ?? undefined}
                          targetField="draftContent"
                          onInsert={(text) => setEditContent((prev) => ({ ...prev, [draft.id]: (prev[draft.id] ?? draft.draftContent) + text }))}
                        />
                        <Button variant="outline" size="sm"
                          onClick={() => regenerateMutation.mutate({ id: draft.id })}
                          disabled={regenerateMutation.isPending}
                        >
                          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Regenerate
                        </Button>
                        {draft.patientId && (
                          <Button variant="ghost" size="sm"
                            onClick={() => setShowPriorFor({ id: draft.id, patientId: draft.patientId! })}
                          >
                            <History className="h-3.5 w-3.5 mr-1.5" /> Prior Studies
                          </Button>
                        )}
                        <Button variant="outline" size="sm"
                          onClick={() => qualityCheckMutation.mutate(draft.id)}
                          disabled={qualityCheckMutation.isPending}
                        >
                          <FileWarning className="h-3.5 w-3.5 mr-1.5" />
                          {qualityCheckMutation.isPending ? "Checking\u2026" : "Quality Check"}
                        </Button>
                        <div className="ml-auto flex gap-2">
                          <Button variant="outline" size="sm"
                            onClick={() => saveMutation.mutate({ id: draft.id, draftContent: content })}
                            disabled={saveMutation.isPending}
                          >
                            Save Draft
                          </Button>
                          {draft.status !== "verified" && (
                            <Button variant="secondary" size="sm"
                              onClick={() => verifyMutation.mutate(draft.id)}
                              disabled={verifyMutation.isPending}
                            >
                              <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Verify
                            </Button>
                          )}
                          <Button size="sm"
                            onClick={() => setConfirmFinalizeId(draft.id)}
                            className="bg-emerald-600 hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Finalize\u2026
                          </Button>
                        </div>
                      </div>
                    )}

                    {isFinalized && (
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => {
                          setShowAmendReason(draft.id);
                        }}>
                          <History className="h-3.5 w-3.5 mr-1.5" /> Amend
                        </Button>
                      </div>
                    )}

                    {draft.verifiedAt && (
                      <p className="text-xs text-muted-foreground text-right">
                        Verified by {draft.verifiedBy} on {new Date(draft.verifiedAt).toLocaleString()}
                      </p>
                    )}
                    {draft.finalizedAt && (
                      <p className="text-xs text-muted-foreground text-right">
                        Finalized by {draft.finalizedBy} on {new Date(draft.finalizedAt).toLocaleString()}
                        {draft.finalizedReportHash ? ` \u00b7 hash ${draft.finalizedReportHash}` : ""}
                      </p>
                    )}

                    {showPriorFor?.id === draft.id && (
                      <PriorStudiesPanel
                        patientId={showPriorFor.patientId}
                        currentDraftId={draft.id}
                        onClose={() => setShowPriorFor(null)}
                      />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Finalize confirm modal */}
      {confirmFinalizeId !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirmFinalizeId(null)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-5 w-5 text-amber-500" /> Confirm Finalize
              </CardTitle>
              <CardDescription>
                Finalizing locks this report. Subsequent changes require an Amendment. Reports are NEVER auto-finalized \u2014 your explicit click is required.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setConfirmFinalizeId(null)}>Cancel</Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => finalizeMutation.mutate(confirmFinalizeId)}
                disabled={finalizeMutation.isPending}
              >
                {finalizeMutation.isPending ? "Finalizing\u2026" : "Yes, Finalize Report"}
              </Button>
              {isAdmin && (
                <Button variant="destructive" size="sm"
                  onClick={() => setShowForceFinalize({ id: confirmFinalizeId, reason: "" })}
                  disabled={finalizeMutation.isPending}
                >
                  <ShieldBan className="h-3.5 w-3.5 mr-1.5" /> Force
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Force finalize modal */}
      {showForceFinalize && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowForceFinalize(null)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-red-600">
                <ShieldBan className="h-5 w-5" /> Force Finalize (Admin/Super-Admin)
              </CardTitle>
              <CardDescription>
                Bypasses quality check and verification requirements. This action is logged with a mandatory reason. Use only in exceptional circumstances.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-red-600">Reason *</Label>
                <Textarea rows={2} placeholder="Enter documented reason for force finalization"
                  value={showForceFinalize.reason}
                  onChange={(e) => setShowForceFinalize((prev) => prev ? { ...prev, reason: e.target.value } : null)}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowForceFinalize(null)}>Cancel</Button>
                <Button variant="destructive" size="sm"
                  onClick={() => forceFinalizeMutation.mutate({ id: showForceFinalize.id, reason: showForceFinalize.reason })}
                  disabled={!showForceFinalize.reason.trim() || forceFinalizeMutation.isPending}
                >
                  {forceFinalizeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <ShieldBan className="h-3.5 w-3.5 mr-1.5" />}
                  Force Finalize
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quality check result modal */}
      {showQualityCheck && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowQualityCheck(null)}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {showQualityCheck.result.passed ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                )}
                Quality Check: {showQualityCheck.result.passed ? "PASSED" : "FAILED"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {showQualityCheck.result.errors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-red-600">Errors (blocks finalize):</p>
                  <ul className="text-xs space-y-0.5 text-red-700">
                    {showQualityCheck.result.errors.map((e, i) => (
                      <li key={i} className="flex items-start gap-1"><AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" /> {e}</li>
                    ))}
                  </ul>
                </div>
              )}
              {showQualityCheck.result.warnings.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-amber-600">Warnings (informational):</p>
                  <ul className="text-xs space-y-0.5 text-amber-700">
                    {showQualityCheck.result.warnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-1"><AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" /> {w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {showQualityCheck.result.errors.length === 0 && showQualityCheck.result.warnings.length === 0 && (
                <p className="text-xs text-emerald-600">All checks passed cleanly.</p>
              )}
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowQualityCheck(null)}>Close</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Amendment reason modal */}
      {showAmendReason !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowAmendReason(null)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="text-base">Amendment Reason</CardTitle>
              <CardDescription>A documented reason helps the audit trail. Optional but strongly recommended.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea rows={2} placeholder="e.g. \u2018Added left kidney size after re-scan\u2019"
                value={amendReason}
                onChange={(e) => setAmendReason(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowAmendReason(null)}>Cancel</Button>
                <Button size="sm"
                  onClick={() => amendMutation.mutate({ id: showAmendReason, reason: amendReason })}
                  disabled={amendMutation.isPending}
                >
                  {amendMutation.isPending ? "Creating\u2026" : "Amend Report"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Prior studies sub-panel ─────────────────────────────────────────────────

function PriorStudiesPanel({ patientId, currentDraftId, onClose }: {
  patientId: number; currentDraftId: number; onClose: () => void;
}) {
  const { data: prior = [], isLoading } = useQuery<Array<{
    id: number; templateType: string; status: string; finalizedAt: string | null;
    accessionNumber: string | null; studyInstanceUID: string | null;
  }>>({
    queryKey: ["usg-prior", patientId],
    queryFn: () => fetchApi(`/api/usg-reports/prior/by-patient/${patientId}`),
  });

  const others = prior.filter((p) => p.id !== currentDraftId);

  return (
    <Card className="border-violet-200/60 bg-violet-50/30 dark:bg-violet-950/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2"><History className="h-4 w-4" /> Prior Finalized USG Reports</span>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-xs">
        {isLoading && <p className="text-muted-foreground">Loading\u2026</p>}
        {!isLoading && others.length === 0 && (
          <p className="text-muted-foreground">No prior finalized USG reports for this patient.</p>
        )}
        {others.map((p) => (
          <div key={p.id} className="flex items-center justify-between border-b border-border/40 py-1.5 last:border-0">
            <div>
              <span className="font-semibold">#{p.id}</span> \u00b7 {p.templateType}
              {p.accessionNumber ? ` \u00b7 ${p.accessionNumber}` : ""}
            </div>
            <span className="text-muted-foreground">
              {p.finalizedAt ? new Date(p.finalizedAt).toLocaleDateString() : "\u2014"}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
