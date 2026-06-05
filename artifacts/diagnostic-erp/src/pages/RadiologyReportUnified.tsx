import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { api } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { readStaffSession, isFeatureEnabled } from "@/lib/staffSession";
import {
  generateReportPDF, loadPrintSettings, savePrintSettings, type PrintSettings,
} from "@/lib/reportPdfGenerator";
import ReportPrintSettingsDialog from "@/components/ReportPrintSettingsDialog";
import {
  ArrowLeft, ExternalLink, MonitorPlay, Save, CheckCircle2, AlertTriangle,
  RefreshCw, FileText, Sparkles, ChevronDown, ChevronUp, Download, Settings2,
  ClipboardPaste, RotateCcw, X, ThumbsUp, ThumbsDown,
  Zap, Star, History, Plus,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface WorklistEntry {
  id: number;
  studyId: number | null;
  patientId: number | null;
  patientName: string;
  age: string | null;
  sex: string | null;
  modality: string;
  studyDescription: string | null;
  studyDate: string | null;
  accessionNumber: string;
  studyInstanceUID: string | null;
  referringDoctor: string | null;
  status: string;
  aiDraftStatus: string;
  aiDraftJson: string | null;
  reportId: number | null;
  deliveryStatus: string | null;
}

interface ViewerLaunchData {
  studyInstanceUID: string;
  patientName?: string | null;
  accessionNumber?: string | null;
  ohifUrl?: string | null;
  dicomWebBaseUrl?: string | null;
  pacsType?: string;
  error?: string;
}

interface ReportTemplate {
  id: string;
  label: string;
  category: string;
  modality: string;
  bodyPart?: string;
  normalText: string;
}

interface DicomMeasurement {
  id: number;
  source: string;
  overallConfidence: string;
  status: string;
  // Fetal
  bpd?: string | null; bpdConfidence?: string | null;
  hc?: string | null; hcConfidence?: string | null;
  ac?: string | null; acConfidence?: string | null;
  fl?: string | null; flConfidence?: string | null;
  crl?: string | null; crlConfidence?: string | null;
  efw?: string | null; efwConfidence?: string | null;
  ga?: string | null; gaConfidence?: string | null;
  edd?: string | null; eddConfidence?: string | null;
  fhr?: string | null; fhrConfidence?: string | null;
  placentaPosition?: string | null;
  liquorAfi?: string | null;
  fetalPresentation?: string | null;
  // Pelvic
  uterusSize?: string | null; uterusSizeConfidence?: string | null;
  endometrium?: string | null; endometriumConfidence?: string | null;
  rightOvary?: string | null; rightOvaryConfidence?: string | null;
  leftOvary?: string | null; leftOvaryConfidence?: string | null;
  follicles?: string | null;
  adnexalLesion?: string | null;
  // Abdominal
  liverSize?: string | null; liverSizeConfidence?: string | null;
  spleenSize?: string | null; spleenSizeConfidence?: string | null;
  rightKidney?: string | null; rightKidneyConfidence?: string | null;
  leftKidney?: string | null; leftKidneyConfidence?: string | null;
  cbd?: string | null; cbdConfidence?: string | null;
  gbWall?: string | null; gbWallConfidence?: string | null;
  prostateVolume?: string | null; prostateVolumeConfidence?: string | null;
}

function measurementRows(m: DicomMeasurement): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (m.bpd) rows.push({ label: "BPD", value: m.bpd });
  if (m.hc) rows.push({ label: "HC", value: m.hc });
  if (m.ac) rows.push({ label: "AC", value: m.ac });
  if (m.fl) rows.push({ label: "FL", value: m.fl });
  if (m.crl) rows.push({ label: "CRL", value: m.crl });
  if (m.efw) rows.push({ label: "EFW", value: m.efw });
  if (m.ga) rows.push({ label: "GA", value: m.ga });
  if (m.edd) rows.push({ label: "EDD", value: m.edd });
  if (m.fhr) rows.push({ label: "FHR", value: m.fhr });
  if (m.placentaPosition) rows.push({ label: "Placenta", value: m.placentaPosition });
  if (m.liquorAfi) rows.push({ label: "Liquor AFI", value: m.liquorAfi });
  if (m.fetalPresentation) rows.push({ label: "Presentation", value: m.fetalPresentation });
  if (m.uterusSize) rows.push({ label: "Uterus size", value: m.uterusSize });
  if (m.endometrium) rows.push({ label: "Endometrium", value: m.endometrium });
  if (m.rightOvary) rows.push({ label: "Right ovary", value: m.rightOvary });
  if (m.leftOvary) rows.push({ label: "Left ovary", value: m.leftOvary });
  if (m.follicles) rows.push({ label: "Follicles", value: m.follicles });
  if (m.adnexalLesion) rows.push({ label: "Adnexal lesion", value: m.adnexalLesion });
  if (m.liverSize) rows.push({ label: "Liver size", value: m.liverSize });
  if (m.spleenSize) rows.push({ label: "Spleen size", value: m.spleenSize });
  if (m.rightKidney) rows.push({ label: "Right kidney", value: m.rightKidney });
  if (m.leftKidney) rows.push({ label: "Left kidney", value: m.leftKidney });
  if (m.cbd) rows.push({ label: "CBD", value: m.cbd });
  if (m.gbWall) rows.push({ label: "GB wall", value: m.gbWall });
  if (m.prostateVolume) rows.push({ label: "Prostate volume", value: m.prostateVolume });
  return rows;
}

interface NormalTemplate {
  id: string;
  label: string;
  body: string;
}

// ─── Modality mapping ───────────────────────────────────────────────────────

const MODALITY_LABELS: Record<string, string> = {
  US: "USG", USG: "USG", "US+D": "USG Doppler", "US D": "USG Doppler",
  MR: "MRI", MRI: "MRI", CT: "CT Scan", CR: "X-Ray", DX: "X-Ray",
  MG: "Mammography", BMD: "DEXA", OT: "Other",
  "EC": "Echo", "ECHO": "Echo", "FE": "Fetal Echo", "FETAL": "Fetal USG",
};

function modalityLabel(m: string): string {
  return MODALITY_LABELS[m] || m;
}

// ─── Status helpers ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  STUDY_RECEIVED: "Received", AI_DRAFT_READY: "AI Draft",
  REPORT_IN_PROGRESS: "In Progress", REPORT_FINAL: "Final",
  DELIVERED: "Delivered",
};

function statusColor(s: string): string {
  switch (s) {
    case "STUDY_RECEIVED": return "bg-blue-100 text-blue-700 border-blue-200";
    case "AI_DRAFT_READY": return "bg-purple-100 text-purple-700 border-purple-200";
    case "REPORT_IN_PROGRESS": return "bg-amber-100 text-amber-700 border-amber-200";
    case "REPORT_FINAL": return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "DELIVERED": return "bg-gray-100 text-gray-600 border-gray-200";
    default: return "bg-gray-100 text-gray-600";
  }
}

// ─── Normal templates (built-in) ────────────────────────────────────────────

const NORMAL_TEMPLATES: Record<string, NormalTemplate[]> = {
  US: [
    { id: "usg-abdomen", label: "Abdomen – Normal", body: "LIVER: Normal in size, shape, and echotexture. No focal lesion.\nGALLBLADDER: Normal wall thickness. No calculus.\nPANCREAS: Normal.\nSPLEEN: Normal size.\nKIDNEYS: Both normal size. No hydronephrosis / calculus.\nBLADDER: Normal wall.\nPROSTATE (if male): Normal size.\nUTERUS / OVARIES (if female): Normal size. No mass.\nFree fluid: Not seen.\nIMPRESSION: Normal ultrasound study of abdomen." },
    { id: "usg-kub", label: "KUB – Normal", body: "RIGHT KIDNEY: Normal size and echotexture. No hydronephrosis / calculus.\nLEFT KIDNEY: Normal size and echotexture. No hydronephrosis / calculus.\nURINARY BLADDER: Normal wall thickness. No calculus.\nPROSTATE: Normal size.\nIMPRESSION: Normal study of KUB." },
    { id: "usg-pelvis", label: "Pelvis – Normal", body: "UTERUS: Normal size, shape, and echotexture. Endometrial thickness normal.\nRIGHT OVARY: Normal size. No cyst / mass.\nLEFT OVARY: Normal size. No cyst / mass.\nFree fluid: Not seen.\nIMPRESSION: Normal pelvic ultrasound." },
    { id: "usg-obstetric", label: "Obstetric – Normal", body: "Singleton intrauterine pregnancy seen.\nFetal cardiac activity present.\nCrown-rump length corresponds to gestational age.\nAmniotic fluid: Adequate.\nPlacenta: Anterior/fundal, grade appropriate.\nNo obvious structural anomaly seen.\nIMPRESSION: Normal early pregnancy." },
  ],
  "US+D": [
    { id: "doppler-abd", label: "Doppler Abd – Normal", body: "ABDOMINAL AORTA: Normal caliber, no aneurysm.\nIVC: Patent, no thrombus.\nPORTAL VEIN: Normal flow direction and velocity.\nHEPATIC ARTERY: Normal waveform.\nRENAL ARTERIES: Normal flow bilaterally. RI normal.\nIMPRESSION: Normal abdominal Doppler study." },
  ],
  MR: [
    { id: "mri-brain", label: "Brain – Normal", body: "BRAIN PARENCHYMA: Normal signal intensity on all sequences.\nNo evidence of mass lesion, hemorrhage, or infarct.\nVENTRICLES: Normal size and configuration.\nMIDLINE: No shift.\nEXTRACRANIAL SOFT TISSUES: Normal.\nIMPRESSION: Normal MRI brain study." },
  ],
  CT: [
    { id: "ct-brain", label: "Brain – Normal", body: "BRAIN PARENCHYMA: Normal attenuation. No focal lesion.\nVENTRICLES: Normal size.\nMIDLINE: Not shifted.\nBONE WINDOW: Normal calvarium. No fracture.\nIMPRESSION: Normal CT brain." },
  ],
  CR: [
    { id: "xray-chest", label: "Chest – Normal", body: "LUNG FIELDS: Clear bilaterally.\nCARDIAC SILHOUETTE: Normal size.\nMEDIASTINUM: Normal width.\nCOSTOPHRENIC ANGLES: Sharp bilaterally.\nBONY THORAX: No fracture.\nIMPRESSION: Normal chest X-ray." },
  ],
};

function getNormalTemplates(modality: string): NormalTemplate[] {
  return NORMAL_TEMPLATES[modality] || NORMAL_TEMPLATES["US"] || [];
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function RadiologyReportUnified() {
  const { worklistId } = useParams<{ worklistId: string }>();
  const id = Number(worklistId);
  const { toast } = useToast();
  const qc = useQueryClient();
  const session = readStaffSession();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [reportBody, setReportBody] = useState("");
  const [impression, setImpression] = useState("");
  const [reportTitle, setReportTitle] = useState("");
  const [showNormalPicker, setShowNormalPicker] = useState(false);
  const [showMeasurements, setShowMeasurements] = useState(true);
  const [showViewer, setShowViewer] = useState(true);
  const [showAiDraft, setShowAiDraft] = useState(false);
  const [rawFindings, setRawFindings] = useState("");
  const [clinicalHistory, setClinicalHistory] = useState("");
  const [isCritical, setIsCritical] = useState(false);
  const [criticalNote, setCriticalNote] = useState("");
  const [printSettings, setPrintSettings] = useState<PrintSettings>(loadPrintSettings);
  const [printSettingsOpen, setPrintSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // ── Feature flags ──
  const ffMeasurementPanel = isFeatureEnabled("showMeasurementPanel");
  const ffAiDraftPanel = isFeatureEnabled("showAiDraftPanel");
  const ffQuickAdd = isFeatureEnabled("showQuickAddButtons");
  const ffMacros = isFeatureEnabled("showRadiologyMacros");
  const ffPreviousReport = isFeatureEnabled("showPreviousReportPanel");
  const ffFavorites = isFeatureEnabled("showFavoritesLibrary");

  // ── Panel visibility (local toggles, independent of flags) ──
  const [showQuickAddPanel, setShowQuickAddPanel] = useState(false);
  const [showMacroPanel, setShowMacroPanel] = useState(false);
  const [showPrevReportPanel, setShowPrevReportPanel] = useState(false);
  const [showFavPanel, setShowFavPanel] = useState(false);

  // ── Queries ──
  const { data: entry, isLoading: entryLoading } = useQuery<WorklistEntry>({
    queryKey: ["worklist-entry", id],
    queryFn: () => api.get<WorklistEntry>(`/api/internal/radiology/worklist/${id}`),
    enabled: !!id,
  });

  const { data: ohifData, isLoading: ohifLoading } = useQuery<ViewerLaunchData>({
    queryKey: ["ohif-launch", entry?.studyInstanceUID],
    queryFn: () => api.get(`/api/radiology/studies/${entry!.studyInstanceUID}/ohif-launch`),
    enabled: !!entry?.studyInstanceUID,
    staleTime: 60_000,
  });

  const { data: measurements = [] } = useQuery<DicomMeasurement[]>({
    queryKey: ["usg-extraction", entry?.studyInstanceUID],
    queryFn: () => api.get(`/api/usg-extraction/study/${entry!.studyInstanceUID}`),
    enabled: !!entry?.studyInstanceUID,
  });

  const { data: clinicSettings } = useQuery<{ name?: string; tagline?: string; address?: string; phone?: string; email?: string; website?: string; logoDataUrl?: string | null }>({
    queryKey: ["clinic-settings"],
    queryFn: () => api.get("/api/clinic-settings/branding"),
    staleTime: 5 * 60_000,
  });

  // ── Auto-populate from AI draft when entry loads ──
  useEffect(() => {
    if (!entry) return;
    const title = entry.studyDescription
      ? `${entry.studyDescription} — Report`
      : "Radiology Report";
    setReportTitle(title);
    if (entry.aiDraftJson) {
      try {
        const draft = JSON.parse(entry.aiDraftJson) as {
          formattedReportText?: string; impression?: string; title?: string;
        };
        if (draft.formattedReportText) setReportBody(draft.formattedReportText);
        if (draft.impression) setImpression(draft.impression);
        if (draft.title) setReportTitle(draft.title);
      } catch { /* ignore */ }
    }
  }, [entry]);

  // ── Mutations ──
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!entry) throw new Error("No entry");
      setSaving(true);
      const res = await api.post("/api/internal/radiology/report-draft", {
        worklistId: entry.id,
        patientId: entry.patientId,
        studyInstanceUID: entry.studyInstanceUID,
        accessionNumber: entry.accessionNumber,
        title: reportTitle,
        body: reportBody,
        impression,
        rawFindings,
        clinicalHistory,
        isCritical,
        criticalNote,
        modality: entry.modality,
        studyDescription: entry.studyDescription,
        createdBy: session?.user.name ?? "staff",
      });
      setSaving(false);
      return res;
    },
    onSuccess: () => {
      toast({ title: "Draft saved" });
      void qc.invalidateQueries({ queryKey: ["worklist-entry", id] });
      void qc.invalidateQueries({ queryKey: ["radiology-worklist"] });
    },
    onError: () => {
      setSaving(false);
      toast({ title: "Save failed", variant: "destructive" });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!entry) throw new Error("No entry");
      setFinalizing(true);
      // 1. Save report
      const reportPayload = {
        patientId: entry.patientId,
        testId: null,
        studyId: entry.studyId ?? null,
        type: "radiology",
        title: reportTitle.trim() || "Radiology Report",
        body: reportBody,
        impression,
        parameters: JSON.stringify({
          modality: entry.modality,
          studyDescription: entry.studyDescription,
          accessionNumber: entry.accessionNumber,
          studyInstanceUID: entry.studyInstanceUID,
        }),
        isCritical,
        criticalNote: isCritical ? criticalNote : null,
        createdBy: session?.user.name ?? "Radiologist",
      };
      let reportId: number | null = null;
      if (entry.patientId) {
        const r = await api.post<{ id: number }>("/api/patient-reports", reportPayload);
        reportId = r.id;
      }
      // 2. Update worklist
      await api.post("/api/internal/radiology/report-status", {
        accessionNumber: entry.accessionNumber,
        studyInstanceUID: entry.studyInstanceUID,
        status: "REPORT_FINAL",
        deliveryStatus: "READY_TO_SEND",
        reportId: reportId ?? undefined,
        actor: session?.user.name ?? "staff",
      });
      setFinalizing(false);
      return { reportId };
    },
    onSuccess: ({ reportId }) => {
      toast({
        title: "Report Finalized",
        description: reportId ? `Saved as Report #${reportId}` : "Status updated to FINAL",
      });
      void qc.invalidateQueries({ queryKey: ["worklist-entry", id] });
      void qc.invalidateQueries({ queryKey: ["radiology-worklist"] });
    },
    onError: (err) => {
      setFinalizing(false);
      toast({ title: "Finalize failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
    },
  });

  const aiDraftMutation = useMutation({
    mutationFn: async () => {
      if (!entry) throw new Error("No entry");
      const draft = await api.post<{
        formattedReportText?: string; impression?: string; title?: string;
      }>("/api/internal/radiology/ai-draft", {
        studyId: entry.id,
        modality: entry.modality,
        studyDescription: entry.studyDescription ?? entry.modality,
        clinicalHistory: clinicalHistory.trim() || undefined,
        rawFindings: rawFindings.trim() || undefined,
        patientName: entry.patientName,
        age: entry.age,
        sex: entry.sex,
        accessionNumber: entry.accessionNumber,
        studyDate: entry.studyDate,
      });
      return draft;
    },
    onSuccess: (draft) => {
      if (draft.formattedReportText) setReportBody(draft.formattedReportText);
      if (draft.impression) setImpression(draft.impression);
      if (draft.title) setReportTitle(draft.title);
      toast({ title: "AI Draft generated", description: "Review before finalizing" });
      void qc.invalidateQueries({ queryKey: ["worklist-entry", id] });
    },
    onError: () => toast({ title: "AI Draft failed", variant: "destructive" }),
  });

  // ── Helpers ──
  function applyNormalTemplate(t: NormalTemplate) {
    setReportBody(t.body);
    // Extract impression from the normal text
    const imp = t.body.split("IMPRESSION:")[1]?.trim() || `Normal ${t.label}`;
    setImpression(imp);
    setShowNormalPicker(false);
    toast({ title: `Applied: ${t.label}` });
  }

  function insertMeasurement(m: DicomMeasurement) {
    const rows: string[] = [];
    if (m.bpd) rows.push(`BPD: ${m.bpd}`);
    if (m.hc) rows.push(`HC: ${m.hc}`);
    if (m.ac) rows.push(`AC: ${m.ac}`);
    if (m.fl) rows.push(`FL: ${m.fl}`);
    if (m.crl) rows.push(`CRL: ${m.crl}`);
    if (m.efw) rows.push(`EFW: ${m.efw}`);
    if (m.ga) rows.push(`GA: ${m.ga}`);
    if (m.edd) rows.push(`EDD: ${m.edd}`);
    if (m.fhr) rows.push(`FHR: ${m.fhr}`);
    if (m.placentaPosition) rows.push(`Placenta: ${m.placentaPosition}`);
    if (m.liquorAfi) rows.push(`Liquor AFI: ${m.liquorAfi}`);
    if (m.fetalPresentation) rows.push(`Presentation: ${m.fetalPresentation}`);
    if (m.uterusSize) rows.push(`Uterus size: ${m.uterusSize}`);
    if (m.endometrium) rows.push(`Endometrium: ${m.endometrium}`);
    if (m.rightOvary) rows.push(`Right ovary: ${m.rightOvary}`);
    if (m.leftOvary) rows.push(`Left ovary: ${m.leftOvary}`);
    if (m.follicles) rows.push(`Follicles: ${m.follicles}`);
    if (m.adnexalLesion) rows.push(`Adnexal lesion: ${m.adnexalLesion}`);
    if (m.liverSize) rows.push(`Liver size: ${m.liverSize}`);
    if (m.spleenSize) rows.push(`Spleen size: ${m.spleenSize}`);
    if (m.rightKidney) rows.push(`Right kidney: ${m.rightKidney}`);
    if (m.leftKidney) rows.push(`Left kidney: ${m.leftKidney}`);
    if (m.cbd) rows.push(`CBD: ${m.cbd}`);
    if (m.gbWall) rows.push(`GB wall: ${m.gbWall}`);
    if (m.prostateVolume) rows.push(`Prostate volume: ${m.prostateVolume}`);
    const text = rows.join("\n");
    if (!text) return;
    const ta = textareaRef.current;
    if (!ta) {
      setReportBody((prev) => prev + "\n" + text);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = reportBody.slice(0, start);
    const after = reportBody.slice(end);
    const newText = before + text + (after.startsWith("\n") || after === "" ? "" : "\n") + after;
    setReportBody(newText);
    setTimeout(() => {
      ta.selectionStart = ta.selectionEnd = start + text.length;
      ta.focus();
    }, 0);
  }

  function openOhif() {
    if (ohifData?.ohifUrl) {
      window.open(ohifData.ohifUrl, "_blank");
    }
  }

  // ── Loading states ──
  if (entryLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!entry) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3 text-muted-foreground">
        <AlertTriangle className="h-8 w-8" />
        <p>Worklist entry not found.</p>
        <Button variant="outline" size="sm" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>
    );
  }

  const isFinal = entry.status === "REPORT_FINAL" || entry.status === "DELIVERED";
  const normalTemplates = getNormalTemplates(entry.modality);
  const ohifUrl = ohifData?.ohifUrl;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => window.history.back()}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Worklist
            </Button>
            <div>
              <h1 className="text-sm font-semibold">{entry.patientName}</h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{[entry.age, entry.sex].filter(Boolean).join(" / ") || "—"}</span>
                <span>·</span>
                <Badge variant="outline" className="text-[10px] h-4 px-1">{modalityLabel(entry.modality)}</Badge>
                <span>·</span>
                <span className="font-mono">{entry.accessionNumber}</span>
                <span>·</span>
                <Badge className={`text-[10px] h-4 px-1 ${statusColor(entry.status)}`}>
                  {STATUS_LABELS[entry.status] || entry.status}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Viewer toggle */}
            <Button
              size="sm"
              variant={showViewer ? "default" : "outline"}
              className="h-7 text-xs gap-1"
              onClick={() => setShowViewer((v) => !v)}
            >
              <MonitorPlay className="h-3.5 w-3.5" /> Images
            </Button>
            {/* Measurements toggle — feature-flagged */}
            {ffMeasurementPanel && (
              <Button
                size="sm"
                variant={showMeasurements ? "default" : "outline"}
                className="h-7 text-xs gap-1"
                onClick={() => setShowMeasurements((v) => !v)}
                disabled={measurements.length === 0}
              >
                <ClipboardPaste className="h-3.5 w-3.5" /> Measurements
                {measurements.length > 0 && (
                  <Badge className="text-[9px] h-3.5 px-1 bg-primary-foreground text-primary ml-0.5">{measurements.length}</Badge>
                )}
              </Button>
            )}
            {/* AI toggle — feature-flagged */}
            {ffAiDraftPanel && (
              <Button
                size="sm"
                variant={showAiDraft ? "default" : "outline"}
                className="h-7 text-xs gap-1"
                onClick={() => setShowAiDraft((v) => !v)}
              >
                <Sparkles className="h-3.5 w-3.5" /> AI
              </Button>
            )}
            {/* Quick Add — feature-flagged */}
            {ffQuickAdd && (
              <Button
                size="sm"
                variant={showQuickAddPanel ? "default" : "outline"}
                className="h-7 text-xs gap-1"
                onClick={() => setShowQuickAddPanel((v) => !v)}
                disabled={isFinal}
                title="Quick Add Phrases"
              >
                <Plus className="h-3.5 w-3.5" /> Quick
              </Button>
            )}
            {/* Macros — feature-flagged */}
            {ffMacros && (
              <Button
                size="sm"
                variant={showMacroPanel ? "default" : "outline"}
                className="h-7 text-xs gap-1"
                onClick={() => setShowMacroPanel((v) => !v)}
                disabled={isFinal}
                title="Radiology Macros"
              >
                <Zap className="h-3.5 w-3.5" /> Macros
              </Button>
            )}
            {/* Previous Reports — feature-flagged */}
            {ffPreviousReport && (
              <Button
                size="sm"
                variant={showPrevReportPanel ? "default" : "outline"}
                className="h-7 text-xs gap-1"
                onClick={() => setShowPrevReportPanel((v) => !v)}
                title="Previous Reports"
              >
                <History className="h-3.5 w-3.5" /> Prior
              </Button>
            )}
            {/* Favorites — feature-flagged */}
            {ffFavorites && (
              <Button
                size="sm"
                variant={showFavPanel ? "default" : "outline"}
                className="h-7 text-xs gap-1"
                onClick={() => setShowFavPanel((v) => !v)}
                disabled={isFinal}
                title="Favorite Templates"
              >
                <Star className="h-3.5 w-3.5" /> Favorites
              </Button>
            )}
            {/* Normal button */}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
              onClick={() => setShowNormalPicker((v) => !v)}
              disabled={isFinal}
            >
              <ThumbsUp className="h-3.5 w-3.5" /> Normal
            </Button>
            {/* Print */}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => {
                generateReportPDF({
                  patientName: entry.patientName,
                  age: entry.age ?? undefined,
                  sex: entry.sex ?? undefined,
                  accessionNumber: entry.accessionNumber,
                  studyDate: entry.studyDate ?? undefined,
                  referringDoctor: entry.referringDoctor ?? undefined,
                  modality: entry.modality,
                  bodyPart: entry.studyDescription ?? undefined,
                  clinicalHistory,
                  findings: reportBody,
                  impression,
                  reportTitle: reportTitle || "Radiology Report",
                  printedBy: session?.user.name ?? undefined,
                }, printSettings, clinicSettings ?? null);
                toast({ title: "PDF downloaded" });
              }}
            >
              <Download className="h-3.5 w-3.5" /> PDF
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setPrintSettingsOpen(true)}>
              <Settings2 className="h-3.5 w-3.5" />
            </Button>

            {/* Save / Finalize */}
            {!isFinal && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => saveDraftMutation.mutate()}
                  disabled={saving}
                >
                  {saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => {
                    if (confirm("Finalize this report? It will be locked for editing.")) {
                      finalizeMutation.mutate();
                    }
                  }}
                  disabled={finalizing}
                >
                  {finalizing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Finalize
                </Button>
              </>
            )}
            {isFinal && (
              <Badge className="h-7 text-xs gap-1 bg-emerald-100 text-emerald-700 border-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5" /> Finalized
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* ── Main body (3 columns) ────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Measurements + Normal templates */}
        <div className={`${(showMeasurements && ffMeasurementPanel) || showNormalPicker || (showQuickAddPanel && ffQuickAdd) || (showMacroPanel && ffMacros) || (showPrevReportPanel && ffPreviousReport) || (showFavPanel && ffFavorites) ? "w-64" : "w-0"} border-r bg-muted/20 flex flex-col overflow-hidden transition-all duration-200`}>
          {/* Normal templates picker */}
          {showNormalPicker && (
            <div className="shrink-0 border-b p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                <ThumbsUp className="h-3 w-3" /> Normal Templates
              </h3>
              <div className="space-y-1">
                {normalTemplates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyNormalTemplate(t)}
                    className="w-full text-left text-xs rounded-md border bg-background px-2 py-1.5 hover:bg-green-50 hover:border-green-200 transition-colors"
                  >
                    {t.label}
                  </button>
                ))}
                {normalTemplates.length === 0 && (
                  <p className="text-[10px] text-muted-foreground">No normal templates for {modalityLabel(entry.modality)}</p>
                )}
              </div>
            </div>
          )}

          {/* Approved measurements — feature-flagged */}
          {ffMeasurementPanel && showMeasurements && (
            <div className="flex-1 overflow-y-auto p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                <ClipboardPaste className="h-3 w-3" /> Approved Measurements
              </h3>
              {measurements.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">
                  No approved measurements. Go to USG Measurements to approve extracted values.
                </p>
              ) : (
                <div className="space-y-1">
                  {measurements.map((m) => {
                    const rows = measurementRows(m);
                    return (
                      <button
                        key={m.id}
                        onClick={() => insertMeasurement(m)}
                        className="w-full text-left text-xs rounded-md border bg-background px-2 py-1.5 hover:bg-blue-50 hover:border-blue-200 transition-colors group"
                        title="Click to insert into report"
                      >
                        <span className="font-medium">{rows.length} measurement{rows.length > 1 ? "s" : ""}</span>
                        <span className="text-muted-foreground"> · {rows.slice(0, 2).map(r => r.label).join(", ")}{rows.length > 2 ? " ..." : ""}</span>
                        <span className="text-[9px] text-green-600 ml-1 opacity-0 group-hover:opacity-100">Insert →</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Quick Add panel — placeholder */}
          {ffQuickAdd && showQuickAddPanel && (
            <div className="flex-1 overflow-y-auto p-3 border-t">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                <Plus className="h-3 w-3" /> Quick Add
              </h3>
              <p className="text-[10px] text-muted-foreground mb-2">
                Click a phrase to insert at cursor.
              </p>
              <div className="space-y-1">
                {[
                  { label: "Normal", text: "Normal in size, shape, and echotexture." },
                  { label: "No lesion", text: "No focal lesion seen." },
                  { label: "Adequate", text: "Adequate visualization." },
                  { label: "Not visualized", text: "Not adequately visualized." },
                  { label: "Enlarged", text: "Enlarged in size." },
                  { label: "Atrophy", text: "Atrophic changes noted." },
                  { label: "No calc", text: "No calcification." },
                  { label: "No fluid", text: "No free fluid." },
                  { label: "Correlate", text: "Please correlate clinically." },
                  { label: "Follow-up", text: "Follow-up advised." },
                ].map((p) => (
                  <button
                    key={p.label}
                    onClick={() => {
                      const ta = textareaRef.current;
                      if (ta) {
                        const start = ta.selectionStart;
                        const end = ta.selectionEnd;
                        const before = reportBody.slice(0, start);
                        const after = reportBody.slice(end);
                        const newText = before + p.text + (after.startsWith("\n") || after === "" ? "" : "\n") + after;
                        setReportBody(newText);
                        setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + p.text.length; ta.focus(); }, 0);
                      } else {
                        setReportBody((prev) => prev + "\n" + p.text);
                      }
                    }}
                    className="w-full text-left text-xs rounded-md border bg-background px-2 py-1.5 hover:bg-blue-50 hover:border-blue-200 transition-colors"
                    disabled={isFinal}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Macros panel — placeholder */}
          {ffMacros && showMacroPanel && (
            <div className="flex-1 overflow-y-auto p-3 border-t">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                <Zap className="h-3 w-3" /> Macros
              </h3>
              <p className="text-[10px] text-muted-foreground mb-2">
                Structured template macros with placeholders.
              </p>
              <div className="space-y-1">
                {[
                  { label: "Normal Abdomen", macro: "LIVER: {{liver_status}}. GALLBLADDER: {{gb_status}}. PANCREAS: {{pancreas_status}}. SPLEEN: {{spleen_status}}. KIDNEYS: {{kidney_status}}. BLADDER: {{bladder_status}}." },
                  { label: "Normal Pelvis", macro: "UTERUS: {{uterus_status}}. RIGHT OVARY: {{ro_status}}. LEFT OVARY: {{lo_status}}. ENDOMETRIUM: {{endo_status}}." },
                  { label: "Obstetric", macro: "BPD: {{bpd}}. HC: {{hc}}. AC: {{ac}}. FL: {{fl}}. CRL: {{crl}}. EFW: {{efw}}. GA: {{ga}}. FHR: {{fhr}}. LIQUOR: {{liquor}}. PLACENTA: {{placenta}}." },
                  { label: "Doppler", macro: "AORTA: {{aorta}}. IVC: {{ivc}}. PORTAL VEIN: {{pv}}. HEPATIC ARTERY: {{ha}}. RENAL ARTERIES: {{renal}}." },
                ].map((m) => (
                  <button
                    key={m.label}
                    onClick={() => {
                      setReportBody((prev) => prev + "\n\n" + m.macro);
                      toast({ title: `Inserted macro: ${m.label}` });
                    }}
                    className="w-full text-left text-xs rounded-md border bg-background px-2 py-1.5 hover:bg-purple-50 hover:border-purple-200 transition-colors"
                    disabled={isFinal}
                  >
                    <span className="font-medium">{m.label}</span>
                    <span className="text-[10px] text-muted-foreground ml-1">(placeholder)</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Previous Reports panel — placeholder */}
          {ffPreviousReport && showPrevReportPanel && (
            <div className="flex-1 overflow-y-auto p-3 border-t">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                <History className="h-3 w-3" /> Previous Reports
              </h3>
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground bg-muted/50 rounded p-2">
                  <p className="font-medium text-xs">Placeholder</p>
                  <p>Prior radiology reports for this patient will appear here.</p>
                  <p className="mt-1">Planned: API endpoint <code>/api/patient-reports/patient/:id</code></p>
                </div>
              </div>
            </div>
          )}

          {/* Favorites panel — placeholder */}
          {ffFavorites && showFavPanel && (
            <div className="flex-1 overflow-y-auto p-3 border-t">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                <Star className="h-3 w-3" /> Favorites
              </h3>
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground bg-muted/50 rounded p-2">
                  <p className="font-medium text-xs">Placeholder</p>
                  <p>Starred / favorite templates and snippets will appear here.</p>
                  <p className="mt-1">Planned: per-user favorites table + star toggle on templates</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Center: Report Editor */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* AI Draft input — feature-flagged */}
          {ffAiDraftPanel && showAiDraft && (
            <div className="shrink-0 border-b p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-purple-500" /> AI Draft Input
                </h3>
                <Button
                  size="sm"
                  className="h-6 text-xs bg-purple-600 hover:bg-purple-700"
                  onClick={() => aiDraftMutation.mutate()}
                  disabled={aiDraftMutation.isPending}
                >
                  {aiDraftMutation.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Generate AI Draft
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">Clinical History</label>
                  <Textarea
                    value={clinicalHistory}
                    onChange={(e) => setClinicalHistory(e.target.value)}
                    disabled={isFinal}
                    rows={2}
                    className="text-xs"
                    placeholder="Presenting complaint, relevant history..."
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Raw Findings</label>
                  <Textarea
                    value={rawFindings}
                    onChange={(e) => setRawFindings(e.target.value)}
                    disabled={isFinal}
                    rows={2}
                    className="text-xs"
                    placeholder="Key observations, dictation..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* Critical flag */}
          {!isFinal && (
            <div className="shrink-0 px-3 py-2 border-b flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={isCritical}
                  onChange={(e) => setIsCritical(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className={isCritical ? "text-red-600 font-semibold" : "text-muted-foreground"}>
                  Critical / Urgent
                </span>
              </label>
              {isCritical && (
                <Input
                  value={criticalNote}
                  onChange={(e) => setCriticalNote(e.target.value)}
                  placeholder="Critical note (e.g., 'Acute finding — notify immediately')"
                  className="text-xs h-6 flex-1"
                />
              )}
            </div>
          )}

          {/* Report title */}
          <div className="shrink-0 px-3 py-2 border-b">
            <Input
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              disabled={isFinal}
              className="text-sm font-medium"
              placeholder="Report title..."
            />
          </div>

          {/* Report body textarea */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="shrink-0 px-3 py-1 flex items-center justify-between border-b">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <FileText className="h-3 w-3" /> Report Body
              </span>
              <span className="text-[10px] text-muted-foreground">
                {reportBody.length} chars
              </span>
            </div>
            <Textarea
              ref={textareaRef}
              value={reportBody}
              onChange={(e) => setReportBody(e.target.value)}
              disabled={isFinal}
              className="flex-1 resize-none text-sm leading-relaxed font-mono"
              placeholder="Enter findings here. Click measurements on the left to insert. Click 'Normal' for template. Click 'AI' for AI draft..."
            />
          </div>

          {/* Impression */}
          <div className="shrink-0 px-3 py-2 border-t">
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Impression</label>
            <Textarea
              value={impression}
              onChange={(e) => setImpression(e.target.value)}
              disabled={isFinal}
              rows={2}
              className="text-sm font-medium"
              placeholder="Final impression / conclusion..."
            />
          </div>
        </div>

        {/* Right: OHIF Viewer */}
        {showViewer && (
          <div className="w-[45%] border-l bg-black flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-3 py-2 bg-card border-b">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <MonitorPlay className="h-3 w-3" /> DICOM Viewer
              </span>
              <div className="flex items-center gap-1">
                {ohifUrl && (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={openOhif}>
                    <ExternalLink className="h-3 w-3" /> Open
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShowViewer(false)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="flex-1 relative">
              {ohifUrl ? (
                <iframe
                  src={ohifUrl}
                  className="absolute inset-0 w-full h-full border-0"
                  title="OHIF DICOM Viewer"
                  allow="fullscreen"
                />
              ) : ohifLoading ? (
                <div className="flex items-center justify-center h-full text-white text-sm gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Loading viewer...
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-white/60 text-sm gap-2 p-4">
                  <AlertTriangle className="h-6 w-6" />
                  <p>OHIF not configured or no Study UID.</p>
                  <p className="text-xs">Check PACS Settings → Viewer Settings</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ReportPrintSettingsDialog
        open={printSettingsOpen}
        onClose={() => setPrintSettingsOpen(false)}
        settings={printSettings}
        onChange={(s) => { setPrintSettings(s); savePrintSettings(s); }}
      />
    </div>
  );
}
