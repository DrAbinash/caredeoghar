import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import PageHeader from "@/components/PageHeader";
import VoiceDictationButton from "@/components/VoiceDictationButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { readStaffSession } from "@/lib/staffSession";
import { api } from "@/lib/fetchApi";
import {
  FileText,
  Save,
  Printer,
  Image,
  Trash2,
  CheckCircle2,
  Eye,
  Loader2,
  ArrowLeft,
  RefreshCw,
  User,
  ClipboardList,
  Upload,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReportTemplate {
  templateId: string;
  modality: string;
  studyName: string;
  technique: string;
  sections: string[];
}

interface KeyImage {
  id: number;
  imageUrl: string;
  thumbnailUrl: string | null;
  caption: string;
  sortOrder: number;
  includeInReport: boolean;
  sourceType: string;
}

interface StudyDemog {
  patientName: string;
  age: string;
  sex: string;
  uhid: string;
  referringDoctor: string;
  accessionNumber: string;
  studyDate: string;
  patientId: number | null;
  testId: number | null;
  orderId: number | null;
  billId: number | null;
  studyDescription: string | null;
}

const EMPTY_DEMOG: StudyDemog = {
  patientName: "",
  age: "",
  sex: "",
  uhid: "",
  referringDoctor: "",
  accessionNumber: "",
  studyDate: "",
  patientId: null,
  testId: null,
  orderId: null,
  billId: null,
  studyDescription: null,
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function RadiologyReportGenerator({ studyId }: { studyId?: number }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Templates
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [templateId, setTemplateId] = useState("MRI_BRAIN_PLAIN");
  const template = templates.find((t) => t.templateId === templateId) ?? templates[0] ?? null;

  // Demog (auto-filled from study or manual)
  const [demog, setDemog] = useState<StudyDemog>(EMPTY_DEMOG);
  const [studyLoading, setStudyLoading] = useState(false);

  // Report content
  const [clinicalHistory, setClinicalHistory] = useState("");
  const [findingsSections, setFindingsSections] = useState<Record<string, string>>({});
  const [impressionRaw, setImpressionRaw] = useState(""); // newline-separated
  const [recommendation, setRecommendation] = useState(
    "Please correlate with clinical findings.",
  );

  // Key images
  const [keyImages, setKeyImages] = useState<KeyImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Preview & draft
  const [previewHtml, setPreviewHtml] = useState("");
  const [draftId, setDraftId] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalSaving, setFinalSaving] = useState(false);

  // ── Effects ─────────────────────────────────────────────────────────────────

  // Load template list once
  useEffect(() => {
    void api
      .get<{ templates: ReportTemplate[] }>("/api/radiology/report-generator/templates")
      .then((d) => setTemplates(d.templates))
      .catch(() => undefined);
  }, []);

  // When studyId changes, load study data and existing draft
  useEffect(() => {
    if (!studyId) return;
    void loadStudyData(studyId);
    void loadExistingDraft(studyId);
  }, [studyId]);

  // When template changes, preserve existing section text, add/remove keys
  useEffect(() => {
    if (!template) return;
    setFindingsSections((prev) => {
      const next: Record<string, string> = {};
      for (const section of template.sections) {
        next[section] = prev[section] ?? "";
      }
      return next;
    });
  }, [templateId, template]);

  // ── Data loaders ─────────────────────────────────────────────────────────────

  async function loadStudyData(sid: number) {
    setStudyLoading(true);
    try {
      // Try internal worklist first, then radiology_studies
      const wl = await api
        .get<{
          success: boolean;
          items?: Array<{
            id: number;
            studyId?: number | null;
            patientId?: number | null;
            patientName: string;
            age?: string | null;
            sex?: string | null;
            modality: string;
            studyDescription?: string | null;
            studyDate?: string | null;
            accessionNumber: string;
            referringDoctor?: string | null;
          }>;
          entries?: Array<unknown>;
        }>(`/api/radiology/worklist?limit=1&studyId=${sid}`)
        .catch(() => null);

      // Fallback: try the internal study endpoint
      const study = await api
        .get<{
          success?: boolean;
          study?: {
            id: number;
            patientId: number;
            testId: number;
            orderId?: number | null;
            billId?: number | null;
            accessionNumber: string;
            modality: string;
            studyDescription?: string | null;
            referringDoctor?: string | null;
            clinicalHistory?: string | null;
            studyDate: string;
          };
          patient?: {
            id: number;
            name: string;
            age?: string | null;
            sex?: string | null;
            uhid?: string | null;
          };
        }>(`/api/radiology/${sid}`)
        .catch(() => null);

      if (study?.study) {
        const s = study.study;
        const p = study.patient;
        setDemog({
          patientName: p?.name ?? "",
          age: p?.age ?? "",
          sex: p?.sex ?? "",
          uhid: p?.uhid ?? "",
          referringDoctor: s.referringDoctor ?? "",
          accessionNumber: s.accessionNumber,
          studyDate: s.studyDate,
          patientId: s.patientId,
          testId: s.testId,
          orderId: s.orderId ?? null,
          billId: s.billId ?? null,
          studyDescription: s.studyDescription ?? null,
        });
        if (s.clinicalHistory) setClinicalHistory(s.clinicalHistory);
        // Auto-pick modality-matching template
        pickTemplateForModality(s.modality, s.studyDescription);
      } else if (wl?.items?.[0]) {
        const w = wl.items[0];
        setDemog({
          patientName: w.patientName,
          age: w.age ?? "",
          sex: w.sex ?? "",
          uhid: "",
          referringDoctor: w.referringDoctor ?? "",
          accessionNumber: w.accessionNumber,
          studyDate: w.studyDate ?? "",
          patientId: w.patientId ?? null,
          testId: null,
          orderId: null,
          billId: null,
          studyDescription: w.studyDescription ?? null,
        });
        pickTemplateForModality(w.modality, w.studyDescription);
      }
    } catch {
      // ignore
    } finally {
      setStudyLoading(false);
    }
  }

  async function loadExistingDraft(sid: number) {
    try {
      const d = await api.get<{ success: boolean; drafts: Array<{ id: number; templateId: string | null; clinicalHistory: string | null; rawFindings: string | null; findingsSections: string | null; impression: string | null; recommendation: string | null; formattedReportHtml: string | null }> }>(
        `/api/radiology/report-generator/drafts?studyId=${sid}`,
      );
      const latest = d.drafts[0];
      if (!latest) return;
      setDraftId(latest.id);
      if (latest.templateId) setTemplateId(latest.templateId);
      if (latest.clinicalHistory) setClinicalHistory(latest.clinicalHistory);
      if (latest.findingsSections) {
        try {
          setFindingsSections(JSON.parse(latest.findingsSections) as Record<string, string>);
        } catch { /* ignore */ }
      }
      if (latest.impression) {
        try {
          const arr = JSON.parse(latest.impression) as string[];
          setImpressionRaw(arr.join("\n"));
        } catch {
          setImpressionRaw(latest.impression);
        }
      }
      if (latest.recommendation) setRecommendation(latest.recommendation);
      if (latest.formattedReportHtml) setPreviewHtml(latest.formattedReportHtml);
      // Also load key images for this draft
      await loadKeyImages(latest.id, sid);
    } catch { /* ignore */ }
  }

  async function loadKeyImages(did?: number, sid?: number) {
    const params = did ? `draftId=${did}` : sid ? `studyId=${sid}` : null;
    if (!params) return;
    try {
      const r = await api.get<{ items: KeyImage[] }>(
        `/api/radiology/report-generator/key-images?${params}`,
      );
      setKeyImages(r.items);
    } catch { /* ignore */ }
  }

  // ── Template helpers ─────────────────────────────────────────────────────────

  function pickTemplateForModality(modality: string, description?: string | null) {
    const m = modality.toUpperCase();
    const desc = (description ?? "").toUpperCase();

    if (m === "MR" || m === "MRI") {
      if (desc.includes("LUMBO") || desc.includes("LS SPINE")) setTemplateId("MRI_LS_SPINE");
      else if (desc.includes("CERVICAL")) setTemplateId("MRI_CERVICAL_SPINE");
      else if (desc.includes("DORSAL") || desc.includes("THORACIC")) setTemplateId("MRI_DORSAL_SPINE");
      else if (desc.includes("STROKE")) setTemplateId("MRI_STROKE_PROTOCOL");
      else if (desc.includes("KNEE")) setTemplateId("MRI_KNEE");
      else if (desc.includes("CONTRAST")) setTemplateId("MRI_BRAIN_CONTRAST");
      else setTemplateId("MRI_BRAIN_PLAIN");
    } else if (m === "CT") {
      if (desc.includes("HRCT") || desc.includes("HIGH RESOLUTION")) setTemplateId("HRCT_THORAX");
      else if (desc.includes("CHEST")) setTemplateId("CT_CHEST");
      else if (desc.includes("ABDOMEN") || desc.includes("PELVIS")) setTemplateId("CT_ABDOMEN_PELVIS");
      else if (desc.includes("KUB")) setTemplateId("CT_KUB");
      else if (desc.includes("NECK")) setTemplateId("CT_NECK");
      else if (desc.includes("TRAUMA")) setTemplateId("CT_BRAIN_TRAUMA");
      else setTemplateId("CT_BRAIN");
    } else if (m === "US" || m === "USG") {
      if (desc.includes("PELVIS")) setTemplateId("USG_PELVIS");
      else if (desc.includes("KUB")) setTemplateId("USG_KUB");
      else if (desc.includes("OBSTETRIC") || desc.includes("OB")) setTemplateId("USG_OBSTETRIC");
      else if (desc.includes("SCROT")) setTemplateId("USG_SCROTUM");
      else if (desc.includes("THYROID") || desc.includes("NECK")) setTemplateId("USG_NECK_THYROID");
      else if (desc.includes("DOPPLER")) setTemplateId("DOPPLER_LOWER_LIMB");
      else setTemplateId("USG_ABDOMEN");
    } else if (m === "CR" || m === "DX" || m.includes("RAY") || m === "X-RAY") {
      if (desc.includes("CERVICAL")) setTemplateId("XRAY_CERVICAL_SPINE");
      else if (desc.includes("LS") || desc.includes("LUMBO")) setTemplateId("XRAY_LS_SPINE");
      else if (desc.includes("KNEE")) setTemplateId("XRAY_KNEE");
      else if (desc.includes("SHOULDER")) setTemplateId("XRAY_SHOULDER");
      else if (desc.includes("PNS") || desc.includes("SINUS")) setTemplateId("XRAY_PNS");
      else if (desc.includes("ABDOMEN")) setTemplateId("XRAY_ABDOMEN");
      else setTemplateId("XRAY_CHEST_PA");
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  function buildPayload() {
    return {
      templateId,
      patientName: demog.patientName,
      age: demog.age,
      sex: demog.sex,
      patientId: demog.uhid || demog.patientId,
      referringDoctor: demog.referringDoctor,
      accessionNumber: demog.accessionNumber,
      studyDate: demog.studyDate,
      clinicalHistory,
      findingsSections,
      impression: impressionRaw
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      recommendation,
      keyImages: keyImages.map((img) => ({
        imageUrl: img.imageUrl,
        caption: img.caption,
        includeInReport: img.includeInReport,
      })),
    };
  }

  async function generate() {
    setGenerating(true);
    try {
      const r = await api.post<{ success: boolean; formattedReportHtml: string }>(
        "/api/radiology/report-generator/generate",
        buildPayload(),
      );
      setPreviewHtml(r.formattedReportHtml);
    } catch (e) {
      toast({ variant: "destructive", title: "Generate failed", description: String(e) });
    } finally {
      setGenerating(false);
    }
  }

  async function saveDraft() {
    setSaving(true);
    try {
      const impression = impressionRaw
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const r = await api.post<{ success: boolean; draft: { id: number } }>(
        "/api/radiology/report-generator/save-draft",
        {
          id: draftId ?? undefined,
          studyId: studyId ?? undefined,
          patientId: demog.patientId ?? undefined,
          templateId,
          modality: template?.modality,
          studyName: template?.studyName,
          clinicalHistory,
          findingsSections,
          impression,
          recommendation,
          formattedReportHtml: previewHtml || undefined,
          formattedReportText: previewHtml
            ? previewHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
            : undefined,
        },
      );
      setDraftId(r.draft.id);
      toast({ title: "Draft saved" });
    } catch (e) {
      toast({ variant: "destructive", title: "Save failed", description: String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function saveFinal() {
    if (!demog.patientId) {
      toast({
        variant: "destructive",
        title: "Cannot save final report",
        description: "No patient linked. Open from a study in the PACS Worklist or Study Workflow to link a patient automatically.",
      });
      return;
    }
    if (!demog.testId) {
      toast({
        variant: "destructive",
        title: "Cannot save final report",
        description: "No test/order linked. Open this report generator from a study in the worklist.",
      });
      return;
    }

    // Generate latest HTML first if no preview
    let html = previewHtml;
    if (!html) {
      setGenerating(true);
      try {
        const r = await api.post<{ success: boolean; formattedReportHtml: string }>(
          "/api/radiology/report-generator/generate",
          buildPayload(),
        );
        html = r.formattedReportHtml;
        setPreviewHtml(html);
      } finally {
        setGenerating(false);
      }
    }

    setFinalSaving(true);
    try {
      // Save final draft record
      const impression = impressionRaw
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      await api.post("/api/radiology/report-generator/save-draft", {
        id: draftId ?? undefined,
        studyId: studyId ?? undefined,
        patientId: demog.patientId,
        templateId,
        modality: template?.modality,
        studyName: template?.studyName,
        clinicalHistory,
        findingsSections,
        impression,
        recommendation,
        formattedReportHtml: html,
        formattedReportText: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      });

      // Create official patient_report record
      const reportRes = await api.post<{ success: boolean; report?: { id: number } }>(
        "/api/patient-reports",
        {
          type: "radiology",
          patientId: demog.patientId,
          testId: demog.testId,
          orderId: demog.orderId ?? undefined,
          billId: demog.billId ?? undefined,
          studyId: studyId ?? undefined,
          title: template?.studyName ?? "Radiology Report",
          body: html,
          impression: impression.join("; "),
          status: "draft",
        },
      );

      toast({
        title: "Final report saved",
        description: `Report #${reportRes.report?.id ?? "—"} created. Sign it from the Reports module.`,
      });

      // Navigate to patient reports
      navigate("/reports");
    } catch (e) {
      toast({ variant: "destructive", title: "Final save failed", description: String(e) });
    } finally {
      setFinalSaving(false);
    }
  }

  async function uploadKeyImage(file: File) {
    setUploading(true);
    const session = readStaffSession();
    const fd = new FormData();
    fd.append("image", file);
    if (draftId) fd.append("draftId", String(draftId));
    if (studyId) fd.append("studyId", String(studyId));
    if (demog.patientId) fd.append("patientId", String(demog.patientId));
    if (demog.accessionNumber) fd.append("accessionNumber", demog.accessionNumber);

    try {
      const res = await fetch("/api/radiology/report-generator/key-images", {
        method: "POST",
        headers: session?.token ? { Authorization: `Bearer ${session.token}` } : {},
        body: fd,
      });
      const data = (await res.json()) as { success: boolean; item?: KeyImage };
      if (data.item) setKeyImages((prev) => [...prev, data.item!]);
    } catch (e) {
      toast({ variant: "destructive", title: "Upload failed", description: String(e) });
    } finally {
      setUploading(false);
    }
  }

  async function toggleInclude(img: KeyImage) {
    try {
      const r = await api.put<{ success: boolean; item: KeyImage }>(
        `/api/radiology/report-generator/key-images/${img.id}`,
        { includeInReport: !img.includeInReport },
      );
      setKeyImages((prev) => prev.map((i) => (i.id === img.id ? r.item : i)));
    } catch { /* ignore */ }
  }

  async function updateCaption(img: KeyImage, caption: string) {
    try {
      const r = await api.put<{ success: boolean; item: KeyImage }>(
        `/api/radiology/report-generator/key-images/${img.id}`,
        { caption },
      );
      setKeyImages((prev) => prev.map((i) => (i.id === img.id ? r.item : i)));
    } catch { /* ignore */ }
  }

  async function deleteKeyImage(id: number) {
    try {
      await api.delete(`/api/radiology/report-generator/key-images/${id}`);
      setKeyImages((prev) => prev.filter((i) => i.id !== id));
    } catch { /* ignore */ }
  }

  function handlePrint() {
    if (!previewHtml) {
      toast({ title: "Generate preview first before printing." });
      return;
    }
    window.print();
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const modalities = [...new Set(templates.map((t) => t.modality))];

  return (
    <div className="flex flex-col h-full">
      {/* Print-only style: only show preview panel */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .report-preview-content { font-size: 12px; }
        }
        .print-only { display: none; }
      `}</style>

      {/* Header */}
      <div className="no-print">
        <PageHeader
          title="Radiology Report Generator"
          subtitle={
            studyId
              ? `Study ${studyId}${demog.accessionNumber ? ` · ACC ${demog.accessionNumber}` : ""}`
              : "Manual Mode"
          }
          actions={
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => navigate("/radiology/worklist")}>
                <ArrowLeft size={14} className="mr-1" />
                Worklist
              </Button>
              <Button size="sm" variant="outline" onClick={() => void saveDraft()} disabled={saving}>
                {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />}
                Save Draft
              </Button>
              <Button size="sm" onClick={() => void generate()} disabled={generating}>
                {generating ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Eye size={14} className="mr-1" />}
                Generate Preview
              </Button>
              <Button size="sm" variant="outline" onClick={handlePrint}>
                <Printer size={14} className="mr-1" />
                Print
              </Button>
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => void saveFinal()}
                disabled={finalSaving || generating}
              >
                {finalSaving ? (
                  <Loader2 size={14} className="mr-1 animate-spin" />
                ) : (
                  <CheckCircle2 size={14} className="mr-1" />
                )}
                Save Final Report
              </Button>
            </div>
          }
        />
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="grid xl:grid-cols-2 gap-4 items-start">
          {/* ── LEFT: Form ── */}
          <div className="space-y-4 no-print">
            {/* Template Selector */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <ClipboardList size={15} />
                Study &amp; Template
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs mb-1 block">Modality</Label>
                  <Select
                    value={template?.modality ?? ""}
                    onValueChange={(m) => {
                      const first = templates.find((t) => t.modality === m);
                      if (first) setTemplateId(first.templateId);
                    }}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Modality" />
                    </SelectTrigger>
                    <SelectContent>
                      {modalities.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Template</Label>
                  <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates
                        .filter((t) => t.modality === (template?.modality ?? templates[0]?.modality))
                        .map((t) => (
                          <SelectItem key={t.templateId} value={t.templateId}>
                            {t.studyName}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {template && (
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                  {template.technique}
                </p>
              )}
            </div>

            {/* Patient Demographics */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <User size={15} />
                Patient Demographics
                {studyLoading && <Loader2 size={12} className="animate-spin" />}
                {studyId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs ml-auto"
                    onClick={() => void loadStudyData(studyId)}
                  >
                    <RefreshCw size={11} className="mr-1" />
                    Reload
                  </Button>
                )}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Label className="text-xs mb-1 block">Patient Name</Label>
                  <Input
                    className="h-8 text-sm"
                    value={demog.patientName}
                    onChange={(e) => setDemog((d) => ({ ...d, patientName: e.target.value }))}
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Age</Label>
                  <Input
                    className="h-8 text-sm"
                    value={demog.age}
                    onChange={(e) => setDemog((d) => ({ ...d, age: e.target.value }))}
                    placeholder="e.g. 45Y"
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Sex</Label>
                  <Select
                    value={demog.sex}
                    onValueChange={(v) => setDemog((d) => ({ ...d, sex: v }))}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Sex" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">Male</SelectItem>
                      <SelectItem value="F">Female</SelectItem>
                      <SelectItem value="O">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">UHID</Label>
                  <Input
                    className="h-8 text-sm"
                    value={demog.uhid}
                    onChange={(e) => setDemog((d) => ({ ...d, uhid: e.target.value }))}
                    placeholder="Patient ID"
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Accession No.</Label>
                  <Input
                    className="h-8 text-sm"
                    value={demog.accessionNumber}
                    onChange={(e) => setDemog((d) => ({ ...d, accessionNumber: e.target.value }))}
                    placeholder="ACC-..."
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Ref. Doctor</Label>
                  <Input
                    className="h-8 text-sm"
                    value={demog.referringDoctor}
                    onChange={(e) => setDemog((d) => ({ ...d, referringDoctor: e.target.value }))}
                    placeholder="Referring physician"
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Study Date</Label>
                  <Input
                    className="h-8 text-sm"
                    value={demog.studyDate}
                    onChange={(e) => setDemog((d) => ({ ...d, studyDate: e.target.value }))}
                    placeholder="YYYY-MM-DD"
                  />
                </div>
              </div>
              {demog.patientId && (
                <div className="flex gap-2 flex-wrap text-[11px]">
                  <Badge variant="outline" className="text-[11px]">PID: {demog.patientId}</Badge>
                  {demog.testId && <Badge variant="outline" className="text-[11px]">TestID: {demog.testId}</Badge>}
                  {!demog.testId && (
                    <Badge variant="destructive" className="text-[11px]">
                      No test linked — final save disabled
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Clinical History */}
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Clinical History</Label>
                <VoiceDictationButton
                  onInsert={(t) => setClinicalHistory((v) => v + t)}
                  draftId={draftId ?? undefined}
                  studyId={studyId}
                  targetField="clinicalHistory"
                />
              </div>
              <Textarea
                className="text-sm min-h-[70px] resize-y"
                value={clinicalHistory}
                onChange={(e) => setClinicalHistory(e.target.value)}
                placeholder="Enter clinical history, symptoms, and indication for the study..."
              />
            </div>

            {/* Findings sections (per template) */}
            {template && (
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <h3 className="font-semibold text-sm">Findings / Observation</h3>
                {template.sections.map((section) => (
                  <div key={section} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {section}
                      </Label>
                      <VoiceDictationButton
                        onInsert={(t) =>
                          setFindingsSections((prev) => ({
                            ...prev,
                            [section]: (prev[section] ?? "") + t,
                          }))
                        }
                        draftId={draftId ?? undefined}
                        studyId={studyId}
                        targetField={`section:${section}`}
                        className="h-6 px-2 text-[11px]"
                      />
                    </div>
                    <Textarea
                      className="text-sm min-h-[64px] resize-y"
                      value={findingsSections[section] ?? ""}
                      onChange={(e) =>
                        setFindingsSections((prev) => ({
                          ...prev,
                          [section]: e.target.value,
                        }))
                      }
                      placeholder={`Describe ${section.toLowerCase()}...`}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Key Images */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Image size={14} />
                  Key Images
                  {keyImages.length > 0 && (
                    <Badge variant="secondary" className="text-[11px]">
                      {keyImages.filter((i) => i.includeInReport).length}/{keyImages.length} included
                    </Badge>
                  )}
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 size={12} className="animate-spin mr-1" />
                  ) : (
                    <Upload size={12} className="mr-1" />
                  )}
                  Upload
                </Button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadKeyImage(f);
                    e.target.value = "";
                  }}
                />
              </div>

              <p className="text-[11px] text-muted-foreground">
                Upload JPG/PNG/WebP screenshots from DICOM viewer. Toggle to include/exclude in the report. Images appear between FINDINGS and IMPRESSION.
              </p>

              {keyImages.length === 0 && (
                <div className="flex items-center justify-center h-16 border border-dashed rounded-lg text-muted-foreground text-sm">
                  No key images yet
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {keyImages.map((img) => (
                  <div
                    key={img.id}
                    className={`relative rounded-lg border p-2 space-y-2 ${
                      img.includeInReport ? "border-border" : "border-dashed opacity-60"
                    }`}
                  >
                    <img
                      src={img.imageUrl}
                      alt={img.caption || "Key image"}
                      className="w-full h-28 object-contain rounded bg-muted"
                    />
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={img.includeInReport}
                        onCheckedChange={() => void toggleInclude(img)}
                        className="scale-75"
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {img.includeInReport ? "In report" : "Excluded"}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0 ml-auto text-destructive hover:text-destructive"
                        onClick={() => void deleteKeyImage(img.id)}
                      >
                        <Trash2 size={11} />
                      </Button>
                    </div>
                    <Input
                      className="h-7 text-xs"
                      placeholder="Caption..."
                      defaultValue={img.caption}
                      onBlur={(e) => {
                        if (e.target.value !== img.caption) {
                          void updateCaption(img, e.target.value);
                        }
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Impression */}
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-semibold">Impression</Label>
                  <p className="text-[11px] text-muted-foreground">One bullet point per line</p>
                </div>
                <VoiceDictationButton
                  onInsert={(t) => setImpressionRaw((v) => v + t)}
                  draftId={draftId ?? undefined}
                  studyId={studyId}
                  targetField="impression"
                />
              </div>
              <Textarea
                className="text-sm min-h-[80px] resize-y"
                value={impressionRaw}
                onChange={(e) => setImpressionRaw(e.target.value)}
                placeholder={"1. Finding one\n2. Finding two\n3. ..."}
              />
            </div>

            {/* Recommendation */}
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <Label className="text-sm font-semibold">Recommendation</Label>
              <Textarea
                className="text-sm min-h-[60px] resize-y"
                value={recommendation}
                onChange={(e) => setRecommendation(e.target.value)}
              />
            </div>

            {/* Safety note */}
            <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 p-3">
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                <strong>Draft only.</strong> Voice dictation and AI assistance create draft content. The final report must be explicitly saved and then signed by an authorized radiologist in the Reports module.
              </p>
            </div>
          </div>

          {/* ── RIGHT: Preview ── */}
          <div className="xl:sticky xl:top-4">
            <div className="rounded-lg border bg-white dark:bg-card shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 border-b no-print">
                <span className="text-sm font-semibold flex items-center gap-2">
                  <FileText size={14} />
                  Report Preview
                  {draftId && (
                    <Badge variant="outline" className="text-[11px]">
                      Draft #{draftId}
                    </Badge>
                  )}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => void generate()}
                  disabled={generating}
                >
                  {generating ? (
                    <Loader2 size={12} className="animate-spin mr-1" />
                  ) : (
                    <RefreshCw size={12} className="mr-1" />
                  )}
                  Refresh
                </Button>
              </div>
              <div className="p-4 min-h-[600px] report-preview-content">
                {previewHtml ? (
                  <div
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                    className="text-sm leading-relaxed"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-60 text-muted-foreground gap-3">
                    <FileText size={40} className="opacity-30" />
                    <p className="text-sm">Fill in the form and click "Generate Preview"</p>
                    <Button size="sm" onClick={() => void generate()} disabled={generating}>
                      {generating ? (
                        <Loader2 size={14} className="mr-1 animate-spin" />
                      ) : (
                        <Eye size={14} className="mr-1" />
                      )}
                      Generate Preview
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
