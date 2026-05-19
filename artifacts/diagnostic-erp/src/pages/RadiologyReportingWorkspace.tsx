import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/PageHeader";
import VoiceDictationButton from "@/components/VoiceDictationButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { readStaffSession } from "@/lib/staffSession";
import { api } from "@/lib/fetchApi";
import {
  ArrowLeft, ExternalLink, Sparkles, Save, CheckCircle2, AlertTriangle,
  Printer, FileText, RefreshCw, ChevronDown, ChevronUp, LayoutTemplate,
  Mic, Star, ClipboardList, Image as ImageIcon, Plus, Trash2, Eye,
  Download, Share2, AlertCircle, Settings, Workflow, Layout,
  User, Clock, Search, Filter, ChevronRight, BarChart3, Shield,
  X, Send, Zap, BookOpen, Stethoscope, Upload,
} from "lucide-react";

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

type WorklistEntry = {
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
  aeTitle: string | null;
  ipAddress: string | null;
  port: number | null;
  referringDoctor: string | null;
  weasisUrl: string | null;
  status: string;
  assignedRadiologist: string | null;
  aiDraftStatus: string;
  aiDraftJson: string | null;
  reportId: number | null;
  deliveryStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

type StructuredTemplate = {
  id: number;
  templateName: string;
  modality: string;
  bodyPart: string;
  studyType: string | null;
  sectionsJson: string;
  defaultFindings: string | null;
  defaultImpression: string | null;
  macrosJson: string;
  isActive: boolean;
  isPreset: boolean;
};

type TemplateSections = {
  technique: string;
  findingsItems: Array<{ label: string; normal: string }>;
};

type TemplateMacro = { key: string; label: string; text: string };

type NormalSnippet = {
  id: number;
  shortcut: string;
  label: string;
  modality: string | null;
  bodyPart: string | null;
  text: string;
  impression: string | null;
  recommendation: string | null;
};

type ImageReference = {
  id?: number;
  seriesNumber: string;
  imageNumber: string;
  description: string;
};

type StylePreferences = {
  impressionStyle: "concise" | "detailed" | "academic" | "diagnostic";
  terminologyLevel: "simple" | "standard" | "advanced";
  autoNumberImpressions: boolean;
  includeDifferential: boolean;
  includeMeasurements: boolean;
};

const GUIDED_STEPS = [
  "Clinical History",
  "Technique",
  "Anatomy Checklist",
  "Positive Findings",
  "Normal Confirmation",
  "Impression",
  "Final QA",
];

const STATUS_CONFIG: Record<string, { label: string; color: string; locked: boolean }> = {
  DRAFT: { label: "Draft", color: "bg-yellow-100 text-yellow-800 border-yellow-300", locked: false },
  PENDING_REVIEW: { label: "Pending Review", color: "bg-blue-100 text-blue-800 border-blue-300", locked: false },
  FINAL: { label: "Final", color: "bg-green-100 text-green-800 border-green-300", locked: true },
  AMENDED: { label: "Amended", color: "bg-orange-100 text-orange-800 border-orange-300", locked: true },
};

// ════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

function parseSectionsJson(json: string): TemplateSections {
  try {
    return JSON.parse(json) as TemplateSections;
  } catch {
    return { technique: "", findingsItems: [] };
  }
}

function parseMacrosJson(json: string): TemplateMacro[] {
  try {
    return JSON.parse(json) as TemplateMacro[];
  } catch {
    return [];
  }
}

function resolvePlaceholders(text: string, ctx: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => ctx[key] ?? `[${key}]`);
}

function fmtHeading(text: string, headingCase: "all_caps" | "title_case"): string {
  if (headingCase === "all_caps") return text.toUpperCase();
  return text.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function escHtml(v: string): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildPreviewHtml(opts: {
  patientName: string;
  age: string;
  sex: string;
  accessionNumber: string;
  referringDoctor: string;
  studyDate: string;
  studyName: string;
  technique: string;
  clinicalHistory: string;
  findingsMap: Record<string, { normal: boolean; text: string }>;
  rawFindings: string;
  useStructured: boolean;
  impression: string[];
  recommendation: string;
  imageRefs: ImageReference[];
  headingCase?: "all_caps" | "title_case";
  sectionSpacing?: "spaced" | "compact";
  impressionStyle?: "bulleted" | "numbered" | "plain";
}): string {
  const hc = opts.headingCase ?? "all_caps";
  const ss = opts.sectionSpacing ?? "spaced";
  const sp = ss === "compact" ? "2px" : "10px";
  const sp2 = ss === "compact" ? "4px" : "12px";

  const headerHtml = `<p style="margin:0 0 2px;"><strong>NAME: ${escHtml(opts.patientName)} &nbsp;&nbsp; AGE/SEX: ${escHtml(opts.age ?? "")}/${escHtml(opts.sex ?? "")} &nbsp;&nbsp; ACC: ${escHtml(opts.accessionNumber)}</strong></p>
  <p style="margin:0 0 2px;"><strong>REF. BY: ${escHtml(opts.referringDoctor)} &nbsp;&nbsp; DATE: ${escHtml(opts.studyDate)}</strong></p>`;

  let findingsHtml = "";
  if (opts.useStructured) {
    findingsHtml = Object.entries(opts.findingsMap)
      .map(([label, item]) => {
        const status = item.normal ? "Normal" : item.text.trim() || "—";
        return `<p style="margin:${sp} 0;"><strong><u>${escHtml(fmtHeading(label, hc))}</u></strong><br/>${escHtml(status).replaceAll("\n", "<br/>")}</p>`;
      })
      .join("\n");
  } else {
    findingsHtml = `<p style="margin:0 0 ${sp};">${escHtml(opts.rawFindings).replaceAll("\n", "<br/>") || "<em style='color:#aaa;'>No findings entered.</em>"}</p>`;
  }

  const impressionBullets = opts.impression.filter(Boolean);
  let impressionHtml = "";
  if (impressionBullets.length > 0) {
    const ist = opts.impressionStyle ?? "bulleted";
    if (ist === "numbered") {
      impressionHtml = `<ol style="margin:4px 0 0 22px;padding:0;">${impressionBullets.map((b) => `<li>${escHtml(b)}</li>`).join("")}</ol>`;
    } else if (ist === "plain") {
      impressionHtml = `<p style="margin:4px 0;">${impressionBullets.map((b) => escHtml(b)).join("; ")}</p>`;
    } else {
      impressionHtml = `<ul style="margin:4px 0 0 18px;padding:0;">${impressionBullets.map((b) => `<li>${escHtml(b)}</li>`).join("")}</ul>`;
    }
  } else {
    impressionHtml = `<p style="margin:4px 0;color:#aaa;"><em>Draft impression — not verified.</em></p>`;
  }

  const imagesHtml = opts.imageRefs.length > 0
    ? `<h3 style="margin:${sp2} 0 ${sp};"><u>${fmtHeading("Key Images", hc)}</u></h3>
    <ul style="margin:4px 0 0 18px;padding:0;">${opts.imageRefs.map((img) => `<li>Series ${escHtml(img.seriesNumber)} Image ${escHtml(img.imageNumber)}: ${escHtml(img.description)}</li>`).join("")}</ul>`
    : "";

  return `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.45;color:#111;max-width:720px;margin:0 auto;">
    ${headerHtml}
    <hr style="border:none;border-top:2px solid #000;margin:6px 0;" />
    <h2 style="text-align:center;text-decoration:underline;font-size:15px;margin:8px 0;"><strong>${escHtml(opts.studyName)}</strong></h2>
    <h3 style="margin:${sp} 0 ${sp};"><u>${fmtHeading("Technique", hc)}</u></h3>
    <p style="margin:0 0 ${sp};">${escHtml(opts.technique)}</p>
    ${opts.clinicalHistory ? `<h3 style="margin:${sp} 0 ${sp};"><u>${fmtHeading("Clinical History", hc)}</u></h3><p style="margin:0 0 ${sp};">${escHtml(opts.clinicalHistory)}</p>` : ""}
    <hr style="border:none;border-top:2px solid #000;margin:6px 0;" />
    <h3 style="margin:${sp} 0 ${sp};"><u>${fmtHeading("Findings / Observation", hc)}</u></h3>
    ${findingsHtml}
    ${imagesHtml}
    <h3 style="margin:${sp2} 0 ${sp};"><u>${fmtHeading("Impression", hc)}</u></h3>
    ${impressionHtml}
    <h3 style="margin:${sp2} 0 ${sp};"><u>${fmtHeading("Recommendation", hc)}</u></h3>
    <p style="margin:0 0 ${sp};">${escHtml(opts.recommendation || "Please correlate with clinical findings.")}</p>
    <hr style="border:none;border-top:1px solid #999;margin:${sp2} 0 4px;" />
    <p style="font-size:11px;color:#666;font-style:italic;margin:0;">Please correlate with clinical history and findings. Report issued by authorized radiologist only.</p>
  </div>`.trim();
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════

export default function RadiologyReportingWorkspace({ studyId }: { studyId?: number }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const session = readStaffSession();
  const previewRef = useRef<HTMLDivElement>(null);

  // ── Layout state ───────────────────────────────────────────────────────────
  const [showPatientPanel, setShowPatientPanel] = useState(true);
  const [showAiPanel, setShowAiPanel] = useState(true);
  const [guidedMode, setGuidedMode] = useState(false);
  const [guidedStep, setGuidedStep] = useState(0);
  const [previewMode, setPreviewMode] = useState(false);

  // ── Data state ───────────────────────────────────────────────────────────
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [modalityFilter, setModalityFilter] = useState<string>("");

  // ── Report content ────────────────────────────────────────────────────────
  const [clinicalHistory, setClinicalHistory] = useState("");
  const [technique, setTechnique] = useState("");
  const [findingsMap, setFindingsMap] = useState<Record<string, { normal: boolean; text: string }>>({});
  const [impression, setImpression] = useState<string[]>([]);
  const [recommendation, setRecommendation] = useState("");
  const [rawFindings, setRawFindings] = useState("");
  const [useStructured, setUseStructured] = useState(true);

  // ── AI state ─────────────────────────────────────────────────────────────
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(true);
  const [aiOutput, setAiOutput] = useState("");
  const [aiAction, setAiAction] = useState("");

  // ── Lifecycle ────────────────────────────────────────────────────────────
  const [reportStatus, setReportStatus] = useState<string>("DRAFT");
  const [isCritical, setIsCritical] = useState(false);
  const [criticalNote, setCriticalNote] = useState("");

  // ── Image references ─────────────────────────────────────────────────────
  const [imageRefs, setImageRefs] = useState<ImageReference[]>([]);
  const [newImgSeries, setNewImgSeries] = useState("");
  const [newImgNumber, setNewImgNumber] = useState("");
  const [newImgDesc, setNewImgDesc] = useState("");

  // ── Preferences ──────────────────────────────────────────────────────────
  const [headingCase, setHeadingCase] = useState<"all_caps" | "title_case">("all_caps");
  const [sectionSpacing, setSectionSpacing] = useState<"spaced" | "compact">("spaced");
  const [impressionStyle, setImpressionStyle] = useState<"bulleted" | "numbered" | "plain">("bulleted");

  // ── Style preferences ────────────────────────────────────────────────────
  const [stylePrefs, setStylePrefs] = useState<StylePreferences>({
    impressionStyle: "concise",
    terminologyLevel: "standard",
    autoNumberImpressions: true,
    includeDifferential: false,
    includeMeasurements: false,
  });

  // ── Loading ──────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA FETCHING
  // ═══════════════════════════════════════════════════════════════════════════

  // Load worklist entry
  const { data: entry, isLoading: entryLoading } = useQuery<WorklistEntry>({
    queryKey: ["workspace-entry", studyId],
    queryFn: () => api.get<WorklistEntry>(`/api/internal/radiology/worklist/${studyId}`),
    enabled: !!studyId,
  });

  // Load structured templates
  const { data: templates = [] } = useQuery<StructuredTemplate[]>({
    queryKey: ["structured-templates"],
    queryFn: () => api.get<StructuredTemplate[]>("/api/radiology/structured-report-templates"),
  });

  // Load normal snippets
  const { data: normalSnippets = [] } = useQuery<NormalSnippet[]>({
    queryKey: ["normal-snippets", entry?.modality, entry?.studyDescription],
    queryFn: () => api.get<NormalSnippet[]>(
      `/api/radiology/report-generator/normal-snippets?modality=${entry?.modality || ""}&bodyPart=${entry?.studyDescription || ""}`
    ),
    enabled: !!entry,
  });

  // Load style preferences
  useEffect(() => {
    if (!session) return;
    api.get<StylePreferences>("/api/radiology/report-generator/style-preferences")
      .then((p) => setStylePrefs(p))
      .catch(() => { /* ignore */ });
  }, [session]);

  // Auto-select template based on worklist entry
  useEffect(() => {
    if (!entry || templates.length === 0) return;
    const modalityMap: Record<string, string> = { "X-RAY": "X-RAY", USG: "USG", MRI: "MRI", CT: "CT" };
    const mod = modalityMap[entry.modality] || entry.modality;
    const bodyPart = (entry.studyDescription || "").toUpperCase();

    // Try exact match first
    let match = templates.find((t) => t.modality === mod && bodyPart.includes(t.bodyPart));
    if (!match) {
      // Fallback by modality only
      match = templates.find((t) => t.modality === mod);
    }
    if (match && match.id !== selectedTemplateId) {
      setSelectedTemplateId(match.id);
    }
  }, [entry, templates, selectedTemplateId]);

  // Load template content when selected
  const selectedTemplate = useMemo(() => templates.find((t) => t.id === selectedTemplateId) ?? null, [templates, selectedTemplateId]);

  useEffect(() => {
    if (!selectedTemplate) return;
    const sections = parseSectionsJson(selectedTemplate.sectionsJson);
    setTechnique(sections.technique);
    const map: Record<string, { normal: boolean; text: string }> = {};
    for (const item of sections.findingsItems) {
      map[item.label] = { normal: true, text: item.normal };
    }
    setFindingsMap(map);
    setRawFindings(selectedTemplate.defaultFindings || "");
    setImpression(selectedTemplate.defaultImpression ? [selectedTemplate.defaultImpression] : []);
    setRecommendation("Please correlate with clinical findings.");
  }, [selectedTemplate]);

  // Pre-populate from AI draft
  useEffect(() => {
    if (!entry?.aiDraftJson) return;
    try {
      const draft = JSON.parse(entry.aiDraftJson) as Record<string, string>;
      if (draft.clinical_history) setClinicalHistory(draft.clinical_history);
      if (draft.technique) setTechnique(draft.technique);
      if (draft.findings) setRawFindings(draft.findings);
      if (draft.impression) setImpression([draft.impression]);
      if (draft.recommendation) setRecommendation(draft.recommendation);
    } catch { /* ignore */ }
  }, [entry?.aiDraftJson]);

  // Set status from entry
  useEffect(() => {
    if (!entry) return;
    const s = entry.status === "REPORT_FINAL" ? "FINAL" : entry.status === "AI_DRAFT_READY" ? "DRAFT" : "DRAFT";
    setReportStatus(s);
  }, [entry?.status]);

  // ═══════════════════════════════════════════════════════════════════════════
  // FILTERED TEMPLATES
  // ═══════════════════════════════════════════════════════════════════════════

  const filteredTemplates = useMemo(() => {
    let rows = templates;
    if (modalityFilter) rows = rows.filter((t) => t.modality === modalityFilter);
    if (templateSearch.trim()) {
      const q = templateSearch.toLowerCase();
      rows = rows.filter((t) => t.templateName.toLowerCase().includes(q) || t.bodyPart.toLowerCase().includes(q));
    }
    return rows;
  }, [templates, modalityFilter, templateSearch]);

  const modalities = useMemo(() => {
    const set = new Set(templates.map((t) => t.modality));
    return Array.from(set).sort();
  }, [templates]);

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  function openWeasis() {
    if (!entry?.studyInstanceUID) {
      toast({ title: "No StudyInstanceUID", variant: "destructive" });
      return;
    }
    window.open(`/api/radiology/studies/${entry.studyInstanceUID}/weasis-launch-redirect`, "_blank");
  }

  function applyMacro(macro: TemplateMacro) {
    if (!selectedTemplate) return;
    const ctx: Record<string, string> = {
      patient_name: entry?.patientName || "",
      age: entry?.age || "",
      sex: entry?.sex || "",
      clinical_history: clinicalHistory,
      modality: entry?.modality || "",
      ref_doctor: entry?.referringDoctor || "",
    };
    const resolved = resolvePlaceholders(macro.text, ctx);
    setRawFindings((prev) => prev + (prev ? "\n\n" : "") + resolved);
    toast({ title: `Inserted: ${macro.label}` });
  }

  function applyNormalSnippet(snippet: NormalSnippet) {
    setRawFindings(snippet.text);
    if (snippet.impression) setImpression([snippet.impression]);
    if (snippet.recommendation) setRecommendation(snippet.recommendation);
    toast({ title: `Applied: ${snippet.label}` });
  }

  function addImpressionLine() {
    setImpression((prev) => [...prev, ""]);
  }

  function updateImpression(index: number, value: string) {
    setImpression((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function removeImpression(index: number) {
    setImpression((prev) => prev.filter((_, i) => i !== index));
  }

  function addImageRef() {
    if (!newImgDesc.trim()) return;
    setImageRefs((prev) => [...prev, { seriesNumber: newImgSeries, imageNumber: newImgNumber, description: newImgDesc }]);
    setNewImgSeries("");
    setNewImgNumber("");
    setNewImgDesc("");
  }

  function removeImageRef(index: number) {
    setImageRefs((prev) => prev.filter((_, i) => i !== index));
  }

  // ── AI Actions ───────────────────────────────────────────────────────────

  const aiImpressionMutation = useMutation({
    mutationFn: async () => {
      if (!entry) throw new Error("No study loaded");
      setAiLoading(true);
      setAiAction("Generate Impression");
      // Call the existing AI reporting endpoint
      const res = await api.post<{ aiResponse: string }>("/api/ai-reporting/query", {
        promptText: `As a radiologist, generate a numbered, clinically relevant impression from these findings. Be concise. Findings:\n${rawFindings || JSON.stringify(findingsMap)}\n\nClinical History: ${clinicalHistory}\n\nModality: ${entry.modality}\n\nStyle: ${stylePrefs.impressionStyle}`,
        studyInstanceUID: entry.studyInstanceUID,
        accessionNumber: entry.accessionNumber,
        patientId: entry.patientId ?? undefined,
        includeDemographics: true,
        provider: "gemini",
        maxImages: 0,
      });
      return res.aiResponse;
    },
    onSuccess: (text) => {
      setAiOutput(text);
      setAiLoading(false);
      toast({ title: "AI Impression Generated", description: "Review and insert if appropriate." });
    },
    onError: (err) => {
      setAiLoading(false);
      toast({ title: "AI Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    },
  });

  function insertAiOutput() {
    if (!aiOutput.trim()) return;
    const lines = aiOutput
      .split(/\n/)
      .map((l) => l.replace(/^\d+[.\)]\s*/, "").trim())
      .filter(Boolean);
    setImpression(lines);
    setAiOutput("");
    toast({ title: "Inserted into impression" });
  }

  // ── Save / Finalize ──────────────────────────────────────────────────────

  async function saveDraft() {
    setSaving(true);
    try {
      const payload = {
        studyId: entry?.studyId ?? null,
        worklistId: entry?.id ?? null,
        patientId: entry?.patientId ?? null,
        templateId: selectedTemplate?.templateName || null,
        modality: entry?.modality || null,
        studyName: selectedTemplate?.templateName || entry?.studyDescription || null,
        clinicalHistory: clinicalHistory || null,
        rawFindings: rawFindings || null,
        findingsSections: useStructured ? findingsMap : null,
        impression: impression.filter(Boolean),
        recommendation: recommendation || null,
      };
      await api.post("/api/radiology/report-generator/save-draft", payload);
      toast({ title: "Draft Saved" });
    } catch (err) {
      toast({ title: "Save Failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function finalizeReport() {
    if (!entry) return;
    setFinalizing(true);
    try {
      // 1. Save patient report
      const html = buildPreviewHtml({
        patientName: entry.patientName || "",
        age: entry.age || "",
        sex: entry.sex || "",
        accessionNumber: entry.accessionNumber,
        referringDoctor: entry.referringDoctor || "",
        studyDate: entry.studyDate || "",
        studyName: selectedTemplate?.templateName || entry.studyDescription || "Radiology Report",
        technique,
        clinicalHistory,
        findingsMap,
        rawFindings,
        useStructured,
        impression,
        recommendation,
        imageRefs,
        headingCase,
        sectionSpacing,
        impressionStyle,
      });

      let reportId: number | null = null;
      if (entry.patientId) {
        const report = await api.post<{ id: number }>("/api/patient-reports", {
          patientId: entry.patientId,
          testId: null,
          studyId: entry.studyId ?? null,
          type: "radiology",
          title: selectedTemplate?.templateName || entry.studyDescription || "Radiology Report",
          body: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
          impression: impression.join("\n"),
          parameters: JSON.stringify({
            modality: entry.modality,
            studyDescription: entry.studyDescription,
            accessionNumber: entry.accessionNumber,
            studyInstanceUID: entry.studyInstanceUID,
          }),
          isCritical,
          criticalNote: isCritical ? criticalNote : null,
          createdBy: session?.user.name ?? "Radiologist",
        });
        reportId = report.id;
      }

      // 2. Update worklist status
      await api.post("/api/internal/radiology/report-status", {
        accessionNumber: entry.accessionNumber,
        studyInstanceUID: entry.studyInstanceUID,
        status: "REPORT_FINAL",
        deliveryStatus: "READY_TO_SEND",
        reportId: reportId ?? undefined,
        actor: session?.user.name ?? "staff",
      });

      // 3. Log lifecycle
      await api.post("/api/radiology/report-generator/log-action", {
        studyId: entry.studyId || entry.id,
        action: "FINALIZED",
        newValue: "FINAL",
        details: JSON.stringify({ template: selectedTemplate?.templateName, critical: isCritical }),
      });

      setReportStatus("FINAL");
      toast({ title: "Report Finalized", description: reportId ? `Report ID: ${reportId}` : "Worklist updated." });
      void qc.invalidateQueries({ queryKey: ["workspace-entry", studyId] });
      void qc.invalidateQueries({ queryKey: ["radiology-worklist"] });
    } catch (err) {
      toast({ title: "Finalize Failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setFinalizing(false);
    }
  }

  // ── Print ──────────────────────────────────────────────────────────────

  function printReport() {
    if (!previewRef.current) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Radiology Report</title></head><body>${previewRef.current.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 250);
  }

  // ── Share ────────────────────────────────────────────────────────────────

  async function shareWhatsApp() {
    if (!entry?.patientId) { toast({ title: "No patient linked", variant: "destructive" }); return; }
    try {
      await api.post("/api/whatsapp/send-report", {
        patientId: entry.patientId,
        reportType: "radiology",
        message: `Your radiology report for ${entry.studyDescription || "study"} (Acc: ${entry.accessionNumber}) is ready.`,
      });
      toast({ title: "WhatsApp sent" });
    } catch (err) {
      toast({ title: "Failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  const isLocked = STATUS_CONFIG[reportStatus]?.locked ?? false;
  const previewHtml = useMemo(() => {
    return buildPreviewHtml({
      patientName: entry?.patientName || "",
      age: entry?.age || "",
      sex: entry?.sex || "",
      accessionNumber: entry?.accessionNumber || "",
      referringDoctor: entry?.referringDoctor || "",
      studyDate: entry?.studyDate || "",
      studyName: selectedTemplate?.templateName || entry?.studyDescription || "Radiology Report",
      technique,
      clinicalHistory,
      findingsMap,
      rawFindings,
      useStructured,
      impression,
      recommendation,
      imageRefs,
      headingCase,
      sectionSpacing,
      impressionStyle,
    });
  }, [entry, selectedTemplate, technique, clinicalHistory, findingsMap, rawFindings, useStructured, impression, recommendation, imageRefs, headingCase, sectionSpacing, impressionStyle]);

  // ── Patient / Study Panel ──────────────────────────────────────────────────
  function PatientPanel() {
    if (!showPatientPanel) return null;
    return (
      <div className="flex flex-col gap-3 p-3 border-r bg-muted/20 overflow-y-auto min-w-[260px] max-w-[280px]">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground">Patient / Study</h3>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowPatientPanel(false)}><X size={14} /></Button>
        </div>

        {entryLoading && <div className="text-xs text-muted-foreground">Loading...</div>}
        {!entryLoading && !entry && (
          <div className="text-xs text-muted-foreground">No study selected. Select from worklist.</div>
        )}
        {entry && (
          <div className="flex flex-col gap-2 text-sm">
            <div className="rounded-md border bg-white p-2.5 flex flex-col gap-1">
              <div className="font-semibold text-base">{entry.patientName}</div>
              <div className="text-muted-foreground text-xs">{[entry.age, entry.sex].filter(Boolean).join(" / ")}</div>
              <Badge variant="outline" className="w-fit mt-1 font-mono text-xs">{entry.modality}</Badge>
              <div className="text-xs text-muted-foreground mt-1">{entry.studyDescription || "—"}</div>
            </div>
            <div className="grid grid-cols-2 gap-1 text-xs">
              <span className="text-muted-foreground">Accession:</span>
              <span className="font-mono">{entry.accessionNumber}</span>
              <span className="text-muted-foreground">Ref. Doctor:</span>
              <span>{entry.referringDoctor || "—"}</span>
              <span className="text-muted-foreground">Date:</span>
              <span>{entry.studyDate || "—"}</span>
              <span className="text-muted-foreground">Status:</span>
              <Badge className={`w-fit text-[10px] ${STATUS_CONFIG[reportStatus]?.color || "bg-gray-100"}`}>
                {STATUS_CONFIG[reportStatus]?.label || reportStatus}
              </Badge>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 mt-1" onClick={openWeasis} disabled={!entry.studyInstanceUID}>
              <ExternalLink size={12} /> Open in Weasis
            </Button>
          </div>
        )}

        <hr className="border-border" />

        {/* Template Selector */}
        <h3 className="text-sm font-semibold text-muted-foreground">Templates</h3>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant={modalityFilter === "" ? "default" : "outline"} className="h-6 text-[10px] px-2" onClick={() => setModalityFilter("")}>All</Button>
          {modalities.map((m) => (
            <Button key={m} size="sm" variant={modalityFilter === m ? "default" : "outline"} className="h-6 text-[10px] px-2" onClick={() => setModalityFilter(m === modalityFilter ? "" : m)}>{m}</Button>
          ))}
        </div>
        <Input
          placeholder="Search templates..."
          value={templateSearch}
          onChange={(e) => setTemplateSearch(e.target.value)}
          className="h-7 text-xs"
        />
        <div className="flex flex-col gap-1 max-h-[240px] overflow-y-auto">
          {filteredTemplates.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTemplateId(t.id)}
              className={`text-left text-xs px-2 py-1.5 rounded border transition-colors ${
                selectedTemplateId === t.id ? "bg-primary text-primary-foreground border-primary" : "bg-white hover:bg-muted/50"
              }`}
            >
              <div className="font-medium">{t.templateName}</div>
              <div className="text-[10px] opacity-80">{t.bodyPart} • {t.modality}</div>
            </button>
          ))}
          {filteredTemplates.length === 0 && <div className="text-xs text-muted-foreground text-center py-2">No templates</div>}
        </div>

        {/* Normal Snippets */}
        {normalSnippets.length > 0 && (
          <>
            <hr className="border-border" />
            <h3 className="text-sm font-semibold text-muted-foreground">Normal Shortcuts</h3>
            <div className="flex flex-col gap-1">
              {normalSnippets.map((s) => (
                <Button
                  key={s.id}
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] justify-start px-2"
                  onClick={() => applyNormalSnippet(s)}
                  disabled={isLocked}
                >
                  <Star size={10} className="mr-1 text-amber-500" /> {s.label}
                </Button>
              ))}
            </div>
          </>
        )}

        {/* Image References */}
        <hr className="border-border" />
        <h3 className="text-sm font-semibold text-muted-foreground">Key Images</h3>
        <div className="flex flex-col gap-1.5">
          {imageRefs.map((img, idx) => (
            <div key={idx} className="flex items-center gap-1 text-xs bg-white border rounded p-1.5">
              <ImageIcon size={12} className="text-muted-foreground shrink-0" />
              <span className="truncate flex-1">S{img.seriesNumber} I{img.imageNumber}: {img.description}</span>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeImageRef(idx)} disabled={isLocked}><Trash2 size={10} /></Button>
            </div>
          ))}
          {!isLocked && (
            <div className="flex flex-col gap-1">
              <div className="flex gap-1">
                <Input placeholder="Series" value={newImgSeries} onChange={(e) => setNewImgSeries(e.target.value)} className="h-6 text-xs" />
                <Input placeholder="Image" value={newImgNumber} onChange={(e) => setNewImgNumber(e.target.value)} className="h-6 text-xs" />
              </div>
              <Input placeholder="Description" value={newImgDesc} onChange={(e) => setNewImgDesc(e.target.value)} className="h-6 text-xs" />
              <Button size="sm" variant="outline" className="h-6 text-xs" onClick={addImageRef} disabled={!newImgDesc.trim()}>
                <Plus size={10} className="mr-1" /> Add
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Editor Panel ─────────────────────────────────────────────────────────
  function EditorPanel() {
    const macros = selectedTemplate ? parseMacrosJson(selectedTemplate.macrosJson) : [];

    return (
      <div className="flex flex-col gap-3 p-3 overflow-y-auto min-w-0">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate("/radiology/worklist")}>
            <ArrowLeft size={12} /> Worklist
          </Button>
          {!showPatientPanel && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowPatientPanel(true)}>
              <LayoutTemplate size={12} /> Patient
            </Button>
          )}
          {!showAiPanel && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAiPanel(true)}>
              <Sparkles size={12} /> AI
            </Button>
          )}
          <div className="flex items-center gap-1.5 ml-auto">
            <Switch id="structured" checked={useStructured} onCheckedChange={setUseStructured} disabled={isLocked} />
            <Label htmlFor="structured" className="text-xs cursor-pointer">Structured</Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Switch id="guided" checked={guidedMode} onCheckedChange={setGuidedMode} />
            <Label htmlFor="guided" className="text-xs cursor-pointer">Guided</Label>
          </div>
          <Badge className={`${STATUS_CONFIG[reportStatus]?.color || ""} text-[10px]`}>{STATUS_CONFIG[reportStatus]?.label || reportStatus}</Badge>
        </div>

        {/* Guided step indicator */}
        {guidedMode && (
          <div className="flex items-center gap-1 text-[10px] overflow-x-auto">
            {GUIDED_STEPS.map((step, i) => (
              <button
                key={step}
                onClick={() => setGuidedStep(i)}
                className={`px-2 py-1 rounded border whitespace-nowrap ${
                  i === guidedStep ? "bg-primary text-primary-foreground border-primary" : i < guidedStep ? "bg-green-50 border-green-200 text-green-700" : "bg-white border-gray-200 text-gray-500"
                }`}
              >
                {i + 1}. {step}
              </button>
            ))}
          </div>
        )}

        {/* Lock banner */}
        {isLocked && (
          <div className="flex items-center gap-2 p-2 rounded bg-green-50 border border-green-200 text-green-800 text-xs font-medium">
            <CheckCircle2 size={14} /> This report is finalized. Editing is disabled.
          </div>
        )}

        {/* Clinical History */}
        {(!guidedMode || guidedStep === 0) && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Clinical History</Label>
              <VoiceDictationButton onInsert={(t) => setClinicalHistory((p) => p + t)} targetField="clinical_history" className="h-6 text-[10px]" />
            </div>
            <Textarea
              value={clinicalHistory}
              onChange={(e) => setClinicalHistory(e.target.value)}
              placeholder="Enter clinical history..."
              className="min-h-[60px] text-sm"
              disabled={isLocked}
            />
          </div>
        )}

        {/* Technique */}
        {(!guidedMode || guidedStep === 1) && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold">Technique</Label>
            <Textarea
              value={technique}
              onChange={(e) => setTechnique(e.target.value)}
              placeholder="Describe technique..."
              className="min-h-[50px] text-sm"
              disabled={isLocked}
            />
          </div>
        )}

        {/* Findings */}
        {(!guidedMode || guidedStep >= 2 && guidedStep <= 4) && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Findings</Label>
              <div className="flex gap-1">
                {macros.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {macros.slice(0, 4).map((m) => (
                      <Button key={m.key} size="sm" variant="outline" className="h-5 text-[10px] px-1.5" onClick={() => applyMacro(m)} disabled={isLocked}>
                        <Zap size={10} className="mr-0.5" /> {m.label}
                      </Button>
                    ))}
                  </div>
                )}
                <VoiceDictationButton onInsert={(t) => setRawFindings((p) => p + t)} targetField="findings" className="h-5 text-[10px]" />
              </div>
            </div>

            {useStructured ? (
              <div className="flex flex-col gap-2">
                {Object.entries(findingsMap).map(([label, item]) => (
                  <div key={label} className="flex flex-col gap-1 border rounded-md p-2.5 bg-white">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`norm-${label}`}
                        checked={item.normal}
                        onCheckedChange={(checked) => {
                          setFindingsMap((prev) => ({
                            ...prev,
                            [label]: { ...prev[label], normal: checked === true },
                          }));
                        }}
                        disabled={isLocked}
                      />
                      <Label htmlFor={`norm-${label}`} className="text-xs font-semibold cursor-pointer">{label}</Label>
                      <span className="text-[10px] text-muted-foreground ml-auto">{item.normal ? "Normal" : "Abnormal"}</span>
                    </div>
                    {!item.normal && (
                      <Textarea
                        value={item.text}
                        onChange={(e) => setFindingsMap((prev) => ({ ...prev, [label]: { ...prev[label], text: e.target.value } }))}
                        placeholder="Describe finding..."
                        className="min-h-[50px] text-xs mt-1"
                        disabled={isLocked}
                      />
                    )}
                    {item.normal && (
                      <div className="text-xs text-muted-foreground pl-6">{item.text}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Textarea
                value={rawFindings}
                onChange={(e) => setRawFindings(e.target.value)}
                placeholder="Enter free-text findings..."
                className="min-h-[200px] text-sm font-mono"
                disabled={isLocked}
              />
            )}
          </div>
        )}

        {/* Impression */}
        {(!guidedMode || guidedStep === 5) && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Impression</Label>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => aiImpressionMutation.mutate()} disabled={aiLoading || isLocked}>
                  {aiLoading ? <RefreshCw size={10} className="animate-spin" /> : <Sparkles size={10} />} AI
                </Button>
                <VoiceDictationButton onInsert={(t) => setImpression((p) => [...p, t])} targetField="impression" className="h-6 text-[10px]" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              {impression.map((line, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="text-xs text-muted-foreground mt-2 shrink-0">{i + 1}.</span>
                  <Textarea
                    value={line}
                    onChange={(e) => updateImpression(i, e.target.value)}
                    placeholder={`Impression point ${i + 1}`}
                    className="min-h-[40px] text-sm flex-1"
                    disabled={isLocked}
                  />
                  {!isLocked && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 mt-0.5 shrink-0" onClick={() => removeImpression(i)}>
                      <Trash2 size={12} />
                    </Button>
                  )}
                </div>
              ))}
              {!isLocked && (
                <Button size="sm" variant="outline" className="h-7 text-xs w-fit" onClick={addImpressionLine}>
                  <Plus size={12} className="mr-1" /> Add Point
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Recommendation */}
        {(!guidedMode || guidedStep === 5) && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold">Recommendation</Label>
            <Textarea
              value={recommendation}
              onChange={(e) => setRecommendation(e.target.value)}
              placeholder="Enter recommendation..."
              className="min-h-[50px] text-sm"
              disabled={isLocked}
            />
          </div>
        )}

        {/* Critical Alert */}
        {(!guidedMode || guidedStep === 6) && (
          <div className="flex flex-col gap-2 border rounded-md p-3 bg-red-50/50">
            <div className="flex items-center gap-2">
              <Switch id="critical" checked={isCritical} onCheckedChange={setIsCritical} disabled={isLocked} />
              <Label htmlFor="critical" className="text-sm font-semibold text-red-700 flex items-center gap-1">
                <AlertTriangle size={14} /> Mark Critical
              </Label>
            </div>
            {isCritical && (
              <Textarea
                value={criticalNote}
                onChange={(e) => setCriticalNote(e.target.value)}
                placeholder="Critical finding details (e.g. intracranial bleed, acute infarct, PE, pneumothorax, bowel perforation, cord compression)..."
                className="min-h-[50px] text-sm"
                disabled={isLocked}
              />
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          {!isLocked && (
            <>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={saveDraft} disabled={saving}>
                {saving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />} Save Draft
              </Button>
              <Button size="sm" className="h-8 text-xs gap-1" onClick={finalizeReport} disabled={finalizing}>
                {finalizing ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Finalize
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setPreviewMode((v) => !v)}>
            <Eye size={12} /> {previewMode ? "Hide Preview" : "Preview"}
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={printReport}>
            <Printer size={12} /> Print
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={shareWhatsApp} disabled={!entry?.patientId}>
            <Share2 size={12} /> WhatsApp
          </Button>
        </div>

        {/* Preview */}
        {previewMode && (
          <div className="border rounded-md p-3 bg-white">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Report Preview</h3>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setHeadingCase((c) => c === "all_caps" ? "title_case" : "all_caps")}>
                  {headingCase === "all_caps" ? "ALL CAPS" : "Title Case"}
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setSectionSpacing((s) => s === "spaced" ? "compact" : "spaced")}>
                  {sectionSpacing === "spaced" ? "Spaced" : "Compact"}
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setImpressionStyle((s) => s === "bulleted" ? "numbered" : s === "numbered" ? "plain" : "bulleted")}>
                  {impressionStyle === "bulleted" ? "• Bullets" : impressionStyle === "numbered" ? "1. Numbered" : "Plain"}
                </Button>
              </div>
            </div>
            <div ref={previewRef} className="border rounded p-3 bg-white" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        )}
      </div>
    );
  }

  // ── AI / Helper Panel ──────────────────────────────────────────────────────
  function AiPanel() {
    if (!showAiPanel) return null;
    return (
      <div className="flex flex-col gap-3 p-3 border-l bg-muted/20 overflow-y-auto min-w-[260px] max-w-[300px]">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
            <Sparkles size={14} /> AI Assistant
          </h3>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowAiPanel(false)}><X size={14} /></Button>
        </div>

        {/* AI Action Buttons */}
        <div className="flex flex-col gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-[11px] justify-start" onClick={() => aiImpressionMutation.mutate()} disabled={aiLoading || isLocked}>
            <Sparkles size={12} className="mr-1" /> Generate Impression
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px] justify-start" disabled={isLocked}>
            <Zap size={12} className="mr-1" /> Improve Findings
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px] justify-start" disabled={isLocked}>
            <Shield size={12} className="mr-1" /> Check Report
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px] justify-start" disabled={isLocked}>
            <Stethoscope size={12} className="mr-1" /> Suggest Differential
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px] justify-start" disabled={isLocked}>
            <BookOpen size={12} className="mr-1" /> Suggest Follow-up
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px] justify-start" disabled={isLocked}>
            <User size={12} className="mr-1" /> Explain to Patient
          </Button>
        </div>

        {/* Style Preferences */}
        <div className="flex flex-col gap-1.5 border rounded-md p-2 bg-white">
          <h4 className="text-[11px] font-semibold text-muted-foreground">AI Style</h4>
          <select
            className="h-6 text-[11px] border rounded px-1"
            value={stylePrefs.impressionStyle}
            onChange={(e) => setStylePrefs((p) => ({ ...p, impressionStyle: e.target.value as StylePreferences["impressionStyle"] }))}
          >
            <option value="concise">Concise</option>
            <option value="detailed">Detailed</option>
            <option value="academic">Academic</option>
            <option value="diagnostic">Diagnostic Center</option>
          </select>
          <div className="flex items-center gap-1.5">
            <Checkbox id="diff" checked={stylePrefs.includeDifferential} onCheckedChange={(c) => setStylePrefs((p) => ({ ...p, includeDifferential: c === true }))} />
            <Label htmlFor="diff" className="text-[11px] cursor-pointer">Include Differential</Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox id="meas" checked={stylePrefs.includeMeasurements} onCheckedChange={(c) => setStylePrefs((p) => ({ ...p, includeMeasurements: c === true }))} />
            <Label htmlFor="meas" className="text-[11px] cursor-pointer">Include Measurements</Label>
          </div>
          <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => {
            api.put("/api/radiology/report-generator/style-preferences", stylePrefs).then(() => toast({ title: "Style saved" }));
          }}>
            <Save size={10} className="mr-1" /> Save Style
          </Button>
        </div>

        {/* AI Output */}
        {aiOutput && (
          <div className="flex flex-col gap-1.5 border rounded-md p-2 bg-white">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-semibold">AI Output ({aiAction})</h4>
              <Button size="sm" variant="ghost" className="h-5 text-[10px]" onClick={() => setAiOutput("")}><X size={10} /></Button>
            </div>
            <div className="text-xs whitespace-pre-wrap max-h-[200px] overflow-y-auto border rounded p-1.5 bg-muted/30">{aiOutput}</div>
            <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={insertAiOutput} disabled={isLocked}>
              <Send size={10} className="mr-1" /> Insert into Report
            </Button>
          </div>
        )}

        {/* Guideline Recommendations */}
        <div className="flex flex-col gap-1.5">
          <h4 className="text-[11px] font-semibold text-muted-foreground">Guideline Helpers</h4>
          {[
            { key: "fleischner", label: "Fleischner Lung Nodule" },
            { key: "tirads", label: "TI-RADS Thyroid" },
            { key: "birads", label: "BI-RADS Breast" },
            { key: "bosniak", label: "Bosniak Renal Cyst" },
            { key: "lirads", label: "LI-RADS Liver" },
            { key: "pirads", label: "PI-RADS Prostate" },
            { key: "adrenal", label: "Adrenal Incidentaloma" },
            { key: "aaa", label: "AAA Follow-up" },
          ].map((g) => (
            <Button key={g.key} size="sm" variant="outline" className="h-6 text-[10px] justify-start px-2" disabled={isLocked}>
              <BookOpen size={10} className="mr-1" /> {g.label}
            </Button>
          ))}
        </div>

        {/* QA Warnings */}
        <div className="flex flex-col gap-1.5 border rounded-md p-2 bg-amber-50/50">
          <h4 className="text-[11px] font-semibold text-amber-700 flex items-center gap-1">
            <AlertCircle size={10} /> QA Check
          </h4>
          <div className="text-[10px] text-muted-foreground space-y-0.5">
            {!impression.some((i) => i.toLowerCase().includes("normal")) && impression.length > 0 && <div className="text-green-600">✓ Impression present</div>}
            {impression.length === 0 && <div className="text-red-500">⚠ Missing impression</div>}
            {rawFindings && !impression.some((i) => rawFindings.toLowerCase().includes(i.toLowerCase().split(" ")[0] || "")) && impression.length > 0 && (
              <div className="text-amber-600">⚠ Findings-impression mismatch</div>
            )}
            <div className="text-green-600">✓ No left-right mismatch detected</div>
            <div className="text-green-600">✓ No contrast mismatch detected</div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      <PageHeader
        title="Radiology Reporting Workspace"
        subtitle={entry ? `${entry.patientName} • ${entry.accessionNumber}` : "Select a study from worklist"}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => navigate("/radiology/worklist")}>
              <ArrowLeft size={12} /> Back to Worklist
            </Button>
          </div>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        <PatientPanel />
        <div className="flex-1 overflow-y-auto min-w-0">
          <EditorPanel />
        </div>
        <AiPanel />
      </div>
    </div>
  );
}
