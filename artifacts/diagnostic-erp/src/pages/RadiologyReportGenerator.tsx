import { useState, useEffect, useRef, useCallback } from "react";
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
  Type,
  Settings,
  Layout,
  LayoutTemplate,
  PanelLeft,
  Workflow,
  Pencil,
  Mic,
  MicOff,
  Loader2 as LoaderIcon,
  X,
  Plus,
  Search,
  Grid3X3,
  ChevronDown,
  Hash,
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

interface TextMacro {
  id: number;
  shortcut: string;
  expansion: string;
  modality: string | null;
  isGlobal: boolean;
  sortOrder: number;
}

interface ReportPreferences {
  headingCase: "all_caps" | "title_case";
  sectionSpacing: "spaced" | "compact";
  impressionStyle: "bulleted" | "numbered" | "plain";
  showEndOfReportFooter: boolean;
  footerText: string | null;
  headerLine1: string | null;
  headerLine2Source: "template_name" | "custom";
  headerLine2Custom: string | null;
  workspaceLayout: "3_panel" | "preview_first" | "workflow";
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

const DEFAULT_PREFERENCES: ReportPreferences = {
  headingCase: "all_caps",
  sectionSpacing: "spaced",
  impressionStyle: "bulleted",
  showEndOfReportFooter: true,
  footerText: null,
  headerLine1: null,
  headerLine2Source: "template_name",
  headerLine2Custom: null,
  workspaceLayout: "3_panel",
};

// ── Utility ───────────────────────────────────────────────────────────────────

function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue] as const;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RadiologyReportGenerator({ studyId }: { studyId?: number }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Templates
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [templateId, setTemplateId] = useState("MRI_BRAIN_PLAIN");
  const template = templates.find((t) => t.templateId === templateId) ?? templates[0] ?? null;

  // Demog
  const [demog, setDemog] = useState<StudyDemog>(EMPTY_DEMOG);
  const [studyLoading, setStudyLoading] = useState(false);

  // Report content
  const [clinicalHistory, setClinicalHistory] = useState("");
  const [findingsSections, setFindingsSections] = useState<Record<string, string>>({});
  const [impressionRaw, setImpressionRaw] = useState("");
  const [recommendation, setRecommendation] = useState("Please correlate with clinical findings.");

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

  // ── TextRad features ────────────────────────────────────────────────────────

  // Text macros
  const [macros, setMacros] = useState<TextMacro[]>([]);
  const [showMacroManager, setShowMacroManager] = useState(false);

  // Report preferences
  const [preferences, setPreferences] = useState<ReportPreferences>(DEFAULT_PREFERENCES);
  const [showPreferences, setShowPreferences] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);

  // Workspace layout
  const [layout, setLayout] = useLocalStorage<ReportPreferences["workspaceLayout"]>("rrg_layout", "3_panel");

  // Template library enhancement
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateFilter, setTemplateFilter] = useState<string>("All");
  const [recentTemplates, setRecentTemplates] = useLocalStorage<string[]>("rrg_recent_templates", []);

  // Enhanced dictation overlay
  const [showDictation, setShowDictation] = useState(false);
  const [dictationTranscript, setDictationTranscript] = useState("");
  const [dictationListening, setDictationListening] = useState(false);
  const dictationRef = useRef<any>(null);

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    void api
      .get<{ templates: ReportTemplate[] }>("/api/radiology/report-generator/templates")
      .then((d) => setTemplates(d.templates))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!studyId) return;
    void loadStudyData(studyId);
    void loadExistingDraft(studyId);
  }, [studyId]);

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

  // Load macros and preferences once
  useEffect(() => {
    void loadMacros();
    void loadPreferences();
  }, []);

  // Sync layout preference with localStorage
  useEffect(() => {
    setPreferences((p) => ({ ...p, workspaceLayout: layout }));
  }, [layout]);

  // ── Data loaders ────────────────────────────────────────────────────────────

  async function loadMacros() {
    try {
      const rows = await api.get<TextMacro[]>("/api/radiology/report-generator/macros");
      setMacros(rows);
    } catch { /* ignore */ }
  }

  async function loadPreferences() {
    try {
      const p = await api.get<ReportPreferences & { workspaceLayout?: string }>("/api/radiology/report-generator/preferences");
      const merged: ReportPreferences = {
        ...DEFAULT_PREFERENCES,
        ...p,
        workspaceLayout: (p.workspaceLayout as ReportPreferences["workspaceLayout"]) || layout || "3_panel",
      };
      setPreferences(merged);
      setLayout(merged.workspaceLayout);
    } catch { /* ignore */ }
  }

  async function savePreferences(prefs: ReportPreferences) {
    setPrefsSaving(true);
    try {
      const saved = await api.put<ReportPreferences>("/api/radiology/report-generator/preferences", prefs);
      setPreferences(saved);
      toast({ title: "Preferences saved" });
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to save preferences", description: String(e) });
    } finally {
      setPrefsSaving(false);
    }
  }

  async function loadStudyData(sid: number) {
    setStudyLoading(true);
    try {
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
        }>(`/api/radiology/worklist?limit=1&studyId=${sid}`)
        .catch(() => null);

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

  // ── Template helpers ────────────────────────────────────────────────────────

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

  function trackRecentTemplate(id: string) {
    setRecentTemplates((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 10);
      return next;
    });
  }

  // ── Text macro expansion ────────────────────────────────────────────────────

  const expandMacros = useCallback(
    (text: string, modalityFilter?: string) => {
      let result = text;
      const applicable = macros.filter((m) => !m.modality || m.modality === modalityFilter);
      for (const macro of applicable) {
        const re = new RegExp(`\\b${macro.shortcut.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
        result = result.replace(re, macro.expansion);
      }
      return result;
    },
    [macros],
  );

  function handleTextareaMacro(
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    value: string,
    setter: (v: string) => void,
  ) {
    if (e.key === " " || e.key === "Enter") {
      const expanded = expandMacros(value, template?.modality);
      if (expanded !== value) {
        e.preventDefault();
        setter(expanded);
      }
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
      preferences: {
        headingCase: preferences.headingCase,
        sectionSpacing: preferences.sectionSpacing,
        impressionStyle: preferences.impressionStyle,
        showEndOfReportFooter: preferences.showEndOfReportFooter,
        footerText: preferences.footerText,
        headerLine1: preferences.headerLine1,
        headerLine2Source: preferences.headerLine2Source,
        headerLine2Custom: preferences.headerLine2Custom,
      },
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
        description: `Report #${reportRes.report?.id ?? "\u2014"} created. Sign it from the Reports module.`,
      });
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

  // ── Enhanced dictation ─────────────────────────────────────────────────────

  function startDictationOverlay() {
    setShowDictation(true);
    setDictationTranscript("");
    startListening();
  }

  function startListening() {
    const win = window as any;
    const SR: (new () => any) | undefined = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!SR) {
      alert("Voice dictation requires Chrome or Edge.");
      return;
    }
    const recognition = new SR();
    recognition.lang = "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event: any) => {
      let final = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript + " ";
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setDictationTranscript((prev) => prev + final + interim);
    };
    recognition.onend = () => setDictationListening(false);
    recognition.onerror = () => setDictationListening(false);
    recognition.start();
    dictationRef.current = recognition;
    setDictationListening(true);
  }

  function stopListening() {
    dictationRef.current?.stop();
    setDictationListening(false);
  }

  function acceptDictation() {
    const cleaned = dictationTranscript.trim();
    if (cleaned) {
      setClinicalHistory((v) => v + (v ? "\n" : "") + cleaned);
    }
    setShowDictation(false);
    setDictationTranscript("");
    stopListening();
  }

  // ── Template filtering ──────────────────────────────────────────────────────

  const modalities = [...new Set(templates.map((t) => t.modality))];
  const modalityCounts: Record<string, number> = {};
  for (const t of templates) modalityCounts[t.modality] = (modalityCounts[t.modality] ?? 0) + 1;

  const filteredTemplates = (() => {
    let pool = templates;
    if (templateFilter !== "All" && templateFilter !== "Recent" && templateFilter !== "User") {
      pool = pool.filter((t) => t.modality === templateFilter);
    }
    if (templateFilter === "Recent") {
      pool = recentTemplates
        .map((id) => templates.find((t) => t.templateId === id))
        .filter(Boolean) as ReportTemplate[];
    }
    if (templateSearch.trim()) {
      const q = templateSearch.toLowerCase();
      pool = pool.filter((t) => t.studyName.toLowerCase().includes(q) || t.technique.toLowerCase().includes(q));
    }
    return pool;
  })();

  // ── Render helpers ─────────────────────────────────────────────────────────

  const isWorkflowMode = layout === "workflow";
  const workflowStep = isWorkflowMode ? (templateId ? (previewHtml ? 3 : 2) : 1) : 0;

  function renderTemplateLibrary() {
    const pills = ["All", "Recent", ...modalities];
    return (
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <LayoutTemplate size={15} />
          <h3 className="font-semibold text-sm">Template Library</h3>
          <span className="text-[11px] text-muted-foreground ml-auto">{filteredTemplates.length} results</span>
        </div>
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-7 text-sm"
            placeholder="Search templates..."
            value={templateSearch}
            onChange={(e) => setTemplateSearch(e.target.value)}
          />
        </div>
        {/* Modality pills */}
        <div className="flex flex-wrap gap-1.5">
          {pills.map((m) => (
            <button
              key={m}
              onClick={() => setTemplateFilter(m)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                templateFilter === m
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border hover:bg-accent"
              }`}
            >
              {m}
              {m !== "All" && m !== "Recent" && m !== "User" && (
                <span className="ml-1 opacity-70">{modalityCounts[m] ?? 0}</span>
              )}
            </button>
          ))}
        </div>
        {/* Template list */}
        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
          {filteredTemplates.map((t) => (
            <button
              key={t.templateId}
              onClick={() => {
                setTemplateId(t.templateId);
                trackRecentTemplate(t.templateId);
                setTemplateFilter("All");
                setTemplateSearch("");
              }}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                templateId === t.templateId
                  ? "bg-primary/10 text-primary font-medium border border-primary/20"
                  : "hover:bg-muted border border-transparent"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="truncate">{t.studyName}</span>
                <Badge variant="outline" className="text-[10px] ml-2 shrink-0">{t.modality}</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">{t.technique}</p>
            </button>
          ))}
          {filteredTemplates.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No templates match your search.</p>
          )}
        </div>
      </div>
    );
  }

  function renderMacroManager() {
    const [newShortcut, setNewShortcut] = useState("");
    const [newExpansion, setNewExpansion] = useState("");
    const [newModality, setNewModality] = useState("");
    const [savingMacro, setSavingMacro] = useState(false);

    async function createMacro() {
      if (!newShortcut.trim() || !newExpansion.trim()) return;
      setSavingMacro(true);
      try {
        const row = await api.post<TextMacro>("/api/radiology/report-generator/macros", {
          shortcut: newShortcut.trim(),
          expansion: newExpansion.trim(),
          modality: newModality || undefined,
        });
        setMacros((prev) => [...prev, row]);
        setNewShortcut("");
        setNewExpansion("");
        setNewModality("");
        toast({ title: "Macro created" });
      } catch (e) {
        toast({ variant: "destructive", title: "Failed", description: String(e) });
      } finally {
        setSavingMacro(false);
      }
    }

    async function deleteMacro(id: number) {
      try {
        await api.delete(`/api/radiology/report-generator/macros/${id}`);
        setMacros((prev) => prev.filter((m) => m.id !== id));
        toast({ title: "Macro deleted" });
      } catch (e) {
        toast({ variant: "destructive", title: "Failed", description: String(e) });
      }
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowMacroManager(false)}>
        <div className="bg-card border rounded-xl shadow-lg w-full max-w-lg mx-4 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base flex items-center gap-2">
              <Hash size={16} />
              Text Macros
            </h3>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setShowMacroManager(false)}><X size={14} /></Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Type the shortcut followed by space or Enter in any text field to expand it.
          </p>
          {/* Create */}
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <div>
              <Label className="text-xs">Shortcut</Label>
              <Input className="h-8 text-sm" value={newShortcut} onChange={(e) => setNewShortcut(e.target.value)} placeholder="e.g. .pol" />
            </div>
            <div>
              <Label className="text-xs">Expansion</Label>
              <Input className="h-8 text-sm" value={newExpansion} onChange={(e) => setNewExpansion(e.target.value)} placeholder="Full phrase..." />
            </div>
            <Button size="sm" className="h-8" onClick={() => void createMacro()} disabled={savingMacro}>
              {savingMacro ? <LoaderIcon size={12} className="animate-spin" /> : <Plus size={12} />}
            </Button>
          </div>
          <div className="flex gap-2">
            <div className="w-28">
              <Label className="text-xs">Modality filter (opt)</Label>
              <Select value={newModality} onValueChange={setNewModality}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any</SelectItem>
                  {modalities.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* List */}
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {macros.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-md border text-sm">
                <div className="min-w-0">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{m.shortcut}</code>
                  <span className="mx-2 text-muted-foreground">\u2192</span>
                  <span className="text-muted-foreground truncate">{m.expansion}</span>
                  {m.modality && <Badge variant="outline" className="text-[10px] ml-2">{m.modality}</Badge>}
                  {m.isGlobal && <Badge className="text-[10px] ml-2">Global</Badge>}
                </div>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => void deleteMacro(m.id)}>
                  <Trash2 size={12} />
                </Button>
              </div>
            ))}
            {macros.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No macros yet. Create your first one above.</p>}
          </div>
        </div>
      </div>
    );
  }

  function renderPreferencesPanel() {
    const [draft, setDraft] = useState<ReportPreferences>(preferences);

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPreferences(false)}>
        <div className="bg-card border rounded-xl shadow-lg w-full max-w-lg mx-4 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base flex items-center gap-2">
              <Settings size={16} />
              Report Preferences
            </h3>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setShowPreferences(false)}><X size={14} /></Button>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Heading Case</Label>
              <div className="flex gap-2 mt-1">
                {(["all_caps", "title_case"] as const).map((v) => (
                  <Button
                    key={v}
                    size="sm"
                    variant={draft.headingCase === v ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setDraft((d) => ({ ...d, headingCase: v }))}
                  >
                    {v === "all_caps" ? "ALL CAPS" : "Title Case"}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Section Spacing</Label>
              <div className="flex gap-2 mt-1">
                {(["spaced", "compact"] as const).map((v) => (
                  <Button
                    key={v}
                    size="sm"
                    variant={draft.sectionSpacing === v ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setDraft((d) => ({ ...d, sectionSpacing: v }))}
                  >
                    {v === "spaced" ? "Spaced" : "Compact"}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Impression Style</Label>
              <div className="flex gap-2 mt-1">
                {(["bulleted", "numbered", "plain"] as const).map((v) => (
                  <Button
                    key={v}
                    size="sm"
                    variant={draft.impressionStyle === v ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setDraft((d) => ({ ...d, impressionStyle: v }))}
                  >
                    {v === "bulleted" ? "Bulleted" : v === "numbered" ? "Numbered" : "Plain"}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={draft.showEndOfReportFooter}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, showEndOfReportFooter: v }))}
              />
              <Label className="text-sm">Show "End of Report" footer</Label>
            </div>
            <div>
              <Label className="text-xs">Footer Text (optional, appears above disclaimer)</Label>
              <Input
                className="h-8 text-sm mt-1"
                value={draft.footerText ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, footerText: e.target.value || null }))}
                placeholder="e.g. Department of Radiology & Imaging"
              />
            </div>
            <div>
              <Label className="text-xs">Header Line 1 (institution / department)</Label>
              <Input
                className="h-8 text-sm mt-1"
                value={draft.headerLine1 ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, headerLine1: e.target.value || null }))}
                placeholder="e.g. AIIMS PATNA — DEPARTMENT OF RADIOLOGY"
              />
            </div>
            <div>
              <Label className="text-xs">Header Line 2</Label>
              <div className="flex gap-2 mt-1">
                <Button
                  size="sm"
                  variant={draft.headerLine2Source === "template_name" ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setDraft((d) => ({ ...d, headerLine2Source: "template_name" }))}
                >
                  Use Template Name
                </Button>
                <Button
                  size="sm"
                  variant={draft.headerLine2Source === "custom" ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setDraft((d) => ({ ...d, headerLine2Source: "custom" }))}
                >
                  Custom
                </Button>
              </div>
              {draft.headerLine2Source === "custom" && (
                <Input
                  className="h-8 text-sm mt-1"
                  value={draft.headerLine2Custom ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, headerLine2Custom: e.target.value || null }))}
                  placeholder="e.g. MRI BRAIN WITH CONTRAST"
                />
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button size="sm" variant="outline" onClick={() => setShowPreferences(false)}>Cancel</Button>
            <Button size="sm" onClick={() => { void savePreferences(draft); setShowPreferences(false); }} disabled={prefsSaving}>
              {prefsSaving ? <LoaderIcon size={12} className="animate-spin mr-1" /> : null}
              Save Preferences
            </Button>
          </div>
        </div>
      </div>
    );
  }

  function renderDictationOverlay() {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="bg-card border rounded-xl shadow-2xl w-full max-w-2xl mx-4 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Mic size={18} />
              Dictate or Type
            </h2>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setShowDictation(false); stopListening(); }}>
              <X size={14} />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {dictationListening
              ? "Listening... speak clearly. Transcript appears below in real time."
              : "Click Start to begin voice dictation, or type directly into the box."}
          </p>
          <Textarea
            className="text-sm min-h-[200px] resize-y"
            value={dictationTranscript}
            onChange={(e) => setDictationTranscript(e.target.value)}
            placeholder="Your transcript will appear here..."
          />
          <div className="flex gap-2 justify-center">
            {!dictationListening ? (
              <Button size="sm" onClick={startListening} className="gap-1">
                <Mic size={14} /> Start Listening
              </Button>
            ) : (
              <Button size="sm" variant="destructive" onClick={stopListening} className="gap-1">
                <MicOff size={14} /> Stop
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setDictationTranscript("")} className="gap-1">
              <Trash2 size={14} /> Clear
            </Button>
            <Button size="sm" variant="outline" onClick={acceptDictation} className="gap-1">
              <CheckCircle2 size={14} /> Insert into Report
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Layout helpers ──────────────────────────────────────────────────────────

  const layoutGridClass =
    layout === "3_panel"
      ? "grid xl:grid-cols-[320px_1fr_1fr] gap-4"
      : layout === "preview_first"
        ? "grid xl:grid-cols-[280px_1.5fr_1fr] gap-4"
        : "grid xl:grid-cols-[280px_1fr_1fr] gap-4";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Print-only style */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .report-preview-content { font-size: 12px; }
        }
        .print-only { display: none; }
      `}</style>

      {/* Overlays */}
      {showMacroManager && renderMacroManager()}
      {showPreferences && renderPreferencesPanel()}
      {showDictation && renderDictationOverlay()}

      {/* Header */}
      <div className="no-print">
        <PageHeader
          title="Radiology Report Generator"
          subtitle={
            studyId
              ? `Study ${studyId}${demog.accessionNumber ? ` \u00b7 ACC ${demog.accessionNumber}` : ""}`
              : "Manual Mode"
          }
          actions={
            <div className="flex gap-2 flex-wrap items-center">
              {/* Layout toggle */}
              <div className="flex items-center border rounded-md overflow-hidden">
                <button
                  title="3-Panel"
                  onClick={() => setLayout("3_panel")}
                  className={`px-2 py-1.5 text-xs flex items-center gap-1 ${layout === "3_panel" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  <Grid3X3 size={12} /> 3-Panel
                </button>
                <button
                  title="Preview First"
                  onClick={() => setLayout("preview_first")}
                  className={`px-2 py-1.5 text-xs flex items-center gap-1 ${layout === "preview_first" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  <PanelLeft size={12} /> Preview
                </button>
                <button
                  title="Workflow"
                  onClick={() => setLayout("workflow")}
                  className={`px-2 py-1.5 text-xs flex items-center gap-1 ${layout === "workflow" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  <Workflow size={12} /> Workflow
                </button>
              </div>

              <Button size="sm" variant="outline" onClick={() => navigate("/radiology/worklist")}>
                <ArrowLeft size={14} className="mr-1" />
                Worklist
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowMacroManager(true)}>
                <Type size={14} className="mr-1" />
                Macros
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowPreferences(true)}>
                <Settings size={14} className="mr-1" />
                Preferences
              </Button>
              <Button size="sm" variant="outline" onClick={startDictationOverlay}>
                <Mic size={14} className="mr-1" />
                Dictate
              </Button>
              <Button size="sm" variant="outline" onClick={() => void saveDraft()} disabled={saving}>
                {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />}
                Save Draft
              </Button>
              <Button size="sm" onClick={() => void generate()} disabled={generating}>
                {generating ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Eye size={14} className="mr-1" />}
                Generate
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
                {finalSaving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <CheckCircle2 size={14} className="mr-1" />}
                Save Final
              </Button>
            </div>
          }
        />
      </div>

      {/* Workflow step indicator */}
      {isWorkflowMode && (
        <div className="no-print px-4 pt-3">
          <div className="flex items-center gap-3 text-sm">
            <span className={`px-3 py-1 rounded-full ${workflowStep >= 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              1. Select Template
            </span>
            <span className="text-muted-foreground">\u2192</span>
            <span className={`px-3 py-1 rounded-full ${workflowStep >= 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              2. Enter Findings
            </span>
            <span className="text-muted-foreground">\u2192</span>
            <span className={`px-3 py-1 rounded-full ${workflowStep >= 3 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              3. Preview & Save
            </span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        <div className={layoutGridClass + " items-start"}>
          {/* ── LEFT: Template Library + Demographics ── */}
          <div className="space-y-4 no-print">
            {renderTemplateLibrary()}

            {/* Demographics */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <User size={15} />
                Patient Demographics
                {studyLoading && <Loader2 size={12} className="animate-spin" />}
                {studyId && (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs ml-auto" onClick={() => void loadStudyData(studyId)}>
                    <RefreshCw size={11} className="mr-1" /> Reload
                  </Button>
                )}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Label className="text-xs mb-1 block">Patient Name</Label>
                  <Input className="h-8 text-sm" value={demog.patientName} onChange={(e) => setDemog((d) => ({ ...d, patientName: e.target.value }))} placeholder="Full name" />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Age</Label>
                  <Input className="h-8 text-sm" value={demog.age} onChange={(e) => setDemog((d) => ({ ...d, age: e.target.value }))} placeholder="e.g. 45Y" />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Sex</Label>
                  <Select value={demog.sex} onValueChange={(v) => setDemog((d) => ({ ...d, sex: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Sex" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">Male</SelectItem>
                      <SelectItem value="F">Female</SelectItem>
                      <SelectItem value="O">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">UHID</Label>
                  <Input className="h-8 text-sm" value={demog.uhid} onChange={(e) => setDemog((d) => ({ ...d, uhid: e.target.value }))} placeholder="Patient ID" />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Accession No.</Label>
                  <Input className="h-8 text-sm" value={demog.accessionNumber} onChange={(e) => setDemog((d) => ({ ...d, accessionNumber: e.target.value }))} placeholder="ACC-..." />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Ref. Doctor</Label>
                  <Input className="h-8 text-sm" value={demog.referringDoctor} onChange={(e) => setDemog((d) => ({ ...d, referringDoctor: e.target.value }))} placeholder="Referring physician" />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Study Date</Label>
                  <Input className="h-8 text-sm" value={demog.studyDate} onChange={(e) => setDemog((d) => ({ ...d, studyDate: e.target.value }))} placeholder="YYYY-MM-DD" />
                </div>
              </div>
              {demog.patientId && (
                <div className="flex gap-2 flex-wrap text-[11px]">
                  <Badge variant="outline" className="text-[11px]">PID: {demog.patientId}</Badge>
                  {demog.testId && <Badge variant="outline" className="text-[11px]">TestID: {demog.testId}</Badge>}
                  {!demog.testId && <Badge variant="destructive" className="text-[11px]">No test linked \u2014 final save disabled</Badge>}
                </div>
              )}
            </div>
          </div>

          {/* ── CENTER: Editor Form ── */}
          <div className="space-y-4 no-print">
            {/* Clinical History */}
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Clinical History</Label>
                <VoiceDictationButton onInsert={(t) => setClinicalHistory((v) => v + t)} draftId={draftId ?? undefined} studyId={studyId} targetField="clinicalHistory" />
              </div>
              <Textarea
                className="text-sm min-h-[70px] resize-y"
                value={clinicalHistory}
                onChange={(e) => setClinicalHistory(e.target.value)}
                onKeyDown={(e) => handleTextareaMacro(e, clinicalHistory, setClinicalHistory)}
                placeholder="Enter clinical history, symptoms, and indication..."
              />
            </div>

            {/* Findings sections */}
            {template && (
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <h3 className="font-semibold text-sm">Findings / Observation</h3>
                {template.sections.map((section) => (
                  <div key={section} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section}</Label>
                      <VoiceDictationButton
                        onInsert={(t) =>
                          setFindingsSections((prev) => ({ ...prev, [section]: (prev[section] ?? "") + t }))
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
                        setFindingsSections((prev) => ({ ...prev, [section]: e.target.value }))
                      }
                      onKeyDown={(e) =>
                        handleTextareaMacro(e, findingsSections[section] ?? "", (v) =>
                          setFindingsSections((prev) => ({ ...prev, [section]: v })),
                        )
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
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => imageInputRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 size={12} className="animate-spin mr-1" /> : <Upload size={12} className="mr-1" />}
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
                Upload JPG/PNG/WebP screenshots from DICOM viewer. Toggle to include/exclude in the report.
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
                    className={`relative rounded-lg border p-2 space-y-2 ${img.includeInReport ? "border-border" : "border-dashed opacity-60"}`}
                  >
                    <img src={img.imageUrl} alt={img.caption || "Key image"} className="w-full h-28 object-contain rounded bg-muted" />
                    <div className="flex items-center gap-1">
                      <Switch checked={img.includeInReport} onCheckedChange={() => void toggleInclude(img)} className="scale-75" />
                      <span className="text-[10px] text-muted-foreground">{img.includeInReport ? "In report" : "Excluded"}</span>
                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0 ml-auto text-destructive hover:text-destructive" onClick={() => void deleteKeyImage(img.id)}>
                        <Trash2 size={11} />
                      </Button>
                    </div>
                    <Input className="h-7 text-xs" placeholder="Caption..." defaultValue={img.caption} onBlur={(e) => { if (e.target.value !== img.caption) void updateCaption(img, e.target.value); }} />
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
                <VoiceDictationButton onInsert={(t) => setImpressionRaw((v) => v + t)} draftId={draftId ?? undefined} studyId={studyId} targetField="impression" />
              </div>
              <Textarea
                className="text-sm min-h-[80px] resize-y"
                value={impressionRaw}
                onChange={(e) => setImpressionRaw(e.target.value)}
                onKeyDown={(e) => handleTextareaMacro(e, impressionRaw, setImpressionRaw)}
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
                onKeyDown={(e) => handleTextareaMacro(e, recommendation, setRecommendation)}
              />
            </div>

            {/* Safety note */}
            <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 p-3">
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                <strong>Draft only.</strong> Voice dictation and AI assistance create draft content. The final report must be explicitly saved and then signed by an authorized radiologist.
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
                  {draftId && <Badge variant="outline" className="text-[11px]">Draft #{draftId}</Badge>}
                </span>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void generate()} disabled={generating}>
                  {generating ? <Loader2 size={12} className="animate-spin mr-1" /> : <RefreshCw size={12} className="mr-1" />}
                  Refresh
                </Button>
              </div>
              <div className="p-4 min-h-[600px] report-preview-content">
                {previewHtml ? (
                  <div dangerouslySetInnerHTML={{ __html: previewHtml }} className="text-sm leading-relaxed" />
                ) : (
                  <div className="flex flex-col items-center justify-center h-60 text-muted-foreground gap-3">
                    <FileText size={40} className="opacity-30" />
                    <p className="text-sm">Fill in the form and click "Generate"</p>
                    <Button size="sm" onClick={() => void generate()} disabled={generating}>
                      {generating ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Eye size={14} className="mr-1" />}
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
