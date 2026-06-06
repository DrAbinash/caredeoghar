/**
 * Phase 8: Radiology Copilot Panel
 * Prior Study Auto-Fetch, Smart Impression, Consistency Checker, Follow-up Suggestions
 */
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  History,
  Brain,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Calendar,
  FileText,
  User,
  Sparkles,
  Clock,
  ArrowRight,
  List,
  Database,
} from "lucide-react";

interface PriorStudy {
  id: number;
  accessionNumber: string;
  modality: string;
  bodyPart: string | null;
  studyDate: string;
  testName: string;
  testCode: string | null;
  impression: string | null;
  finalReport: string | null;
  reportedBy: string | null;
  reportedAt: string | null;
  status: string;
}

interface ConsistencyIssue {
  type: string;
  message: string;
  severity: "warning" | "error" | "info";
}

interface FollowUpSuggestion {
  category: string;
  recommendation: string;
  urgency: "routine" | "urgent" | "immediate";
  timeframe: string;
  source: string;
}

interface DicomMetadata {
  modality: string | null;
  bodyPart: string | null;
  studyDescription: string | null;
  accessionNumber: string | null;
  studyInstanceUid: string | null;
  scheduledStationAETitle: string | null;
  referringDoctor: string | null;
  numImages: number | null;
  technique: string;
}

interface Props {
  patientId?: number;
  currentOrderId?: number;
  studyId?: number;
  findingsText?: string;
  impressionText?: string;
  onImpressionSuggestion?: (text: string) => void;
}

export default function RadiologyCopilotPanel({
  patientId,
  currentOrderId,
  studyId,
  findingsText,
  impressionText,
  onImpressionSuggestion,
}: Props) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"prior" | "impression" | "consistency" | "followup" | "dicom">("prior");
  const [priorStudies, setPriorStudies] = useState<PriorStudy[]>([]);
  const [loadingPrior, setLoadingPrior] = useState(false);
  const [expandedStudy, setExpandedStudy] = useState<number | null>(null);
  const [suggestedImpression, setSuggestedImpression] = useState("");
  const [loadingImpression, setLoadingImpression] = useState(false);
  const [consistencyIssues, setConsistencyIssues] = useState<ConsistencyIssue[]>([]);
  const [loadingConsistency, setLoadingConsistency] = useState(false);
  const [followUpSuggestions, setFollowUpSuggestions] = useState<FollowUpSuggestion[]>([]);
  const [loadingFollowUp, setLoadingFollowUp] = useState(false);
  const [dicomMeta, setDicomMeta] = useState<DicomMetadata | null>(null);
  const [loadingDicomMeta, setLoadingDicomMeta] = useState(false);

  // Fetch prior studies when patientId changes
  useEffect(() => {
    if (!patientId) return;
    setLoadingPrior(true);
    fetch(`/radiology-copilot/prior-studies?patientId=${patientId}&limit=20`)
      .then((r) => r.json())
      .then((data) => {
        setPriorStudies(data.studies ?? []);
      })
      .catch(() => toast({ title: "Could not load prior studies", variant: "destructive" }))
      .finally(() => setLoadingPrior(false));
  }, [patientId, toast]);

  // Smart impression suggestion
  const generateImpression = useCallback(async () => {
    if (!findingsText?.trim()) {
      toast({ title: "Enter findings first", variant: "destructive" });
      return;
    }
    setLoadingImpression(true);
    try {
      const r = await fetch("/radiology-copilot/impression-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findings: findingsText }),
      });
      const data = await r.json();
      if (r.ok) {
        setSuggestedImpression(data.impression);
      } else {
        toast({ title: "Could not generate impression", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not generate impression", variant: "destructive" });
    } finally {
      setLoadingImpression(false);
    }
  }, [findingsText, toast]);

  // Consistency check
  const checkConsistency = useCallback(async () => {
    if (!findingsText?.trim() || !impressionText?.trim()) {
      toast({ title: "Enter both findings and impression", variant: "destructive" });
      return;
    }
    setLoadingConsistency(true);
    try {
      const r = await fetch("/radiology-copilot/consistency-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findings: findingsText, impression: impressionText }),
      });
      const data = await r.json();
      if (r.ok) {
        setConsistencyIssues(data.issues ?? []);
      } else {
        toast({ title: "Could not check consistency", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not check consistency", variant: "destructive" });
    } finally {
      setLoadingConsistency(false);
    }
  }, [findingsText, impressionText, toast]);

  // Follow-up suggestions
  const getFollowUp = useCallback(async () => {
    if (!impressionText?.trim()) {
      toast({ title: "Enter impression first", variant: "destructive" });
      return;
    }
    setLoadingFollowUp(true);
    try {
      const r = await fetch("/radiology-copilot/follow-up-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ impression: impressionText }),
      });
      const data = await r.json();
      if (r.ok) {
        setFollowUpSuggestions(data.suggestions ?? []);
      } else {
        toast({ title: "Could not get follow-up suggestions", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not get follow-up suggestions", variant: "destructive" });
    } finally {
      setLoadingFollowUp(false);
    }
  }, [impressionText, toast]);

  // Fetch DICOM metadata when studyId changes
  useEffect(() => {
    if (!studyId) return;
    setLoadingDicomMeta(true);
    fetch(`/radiology-copilot/dicom-metadata/${studyId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.technique) setDicomMeta(data);
      })
      .catch(() => {})
      .finally(() => setLoadingDicomMeta(false));
  }, [studyId]);

  const tabs = [
    { id: "prior" as const, label: "Prior Studies", icon: History },
    { id: "impression" as const, label: "Impression", icon: Brain },
    { id: "consistency" as const, label: "Consistency", icon: CheckCircle },
    { id: "followup" as const, label: "Follow-up", icon: Clock },
    { id: "dicom" as const, label: "DICOM", icon: Database },
  ];

  return (
    <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center gap-2">
        <Sparkles size={14} className="text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Radiology Copilot</span>
      </div>

      {/* Tab buttons */}
      <div className="flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-primary/10 text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
            }`}
          >
            <tab.icon size={12} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-3 space-y-3 max-h-[400px] overflow-y-auto">
        {activeTab === "prior" && (
          <>
            {loadingPrior ? (
              <div className="text-center py-4 text-xs text-muted-foreground">Loading prior studies...</div>
            ) : priorStudies.length === 0 ? (
              <div className="text-center py-4 text-xs text-muted-foreground">
                {patientId ? "No prior studies found for this patient." : "Select a patient to see prior studies."}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <List size={11} />
                  {priorStudies.length} prior study{priorStudies.length > 1 ? "ies" : "y"} found
                </div>
                {priorStudies.map((study) => (
                  <div key={study.id} className="border rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/20 transition-colors"
                      onClick={() => setExpandedStudy(expandedStudy === study.id ? null : study.id)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-mono uppercase text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          {study.modality}
                        </span>
                        <span className="text-xs truncate">{study.testName}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] text-muted-foreground">
                          <Calendar size={10} className="inline mr-0.5" />
                          {new Date(study.studyDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                        </span>
                        {expandedStudy === study.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </div>
                    </button>
                    {expandedStudy === study.id && (
                      <div className="px-3 py-2 border-t bg-muted/10 text-xs space-y-1.5">
                        {study.bodyPart && (
                          <div className="text-muted-foreground">Body Part: {study.bodyPart}</div>
                        )}
                        {study.impression && (
                          <div>
                            <span className="font-medium text-[10px] uppercase text-muted-foreground">Impression</span>
                            <p className="text-[11px] mt-0.5">{study.impression}</p>
                          </div>
                        )}
                        {study.reportedBy && (
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <User size={10} /> {study.reportedBy}
                            {study.reportedAt && (
                              <span>
                                <Calendar size={10} className="inline mx-0.5" />
                                {new Date(study.reportedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "impression" && (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Suggest an impression based on current findings. The radiologist always has final authority.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs"
              disabled={loadingImpression || !findingsText?.trim()}
              onClick={generateImpression}
            >
              <Brain size={13} className="mr-1.5" />
              {loadingImpression ? "Generating..." : "Suggest Impression"}
            </Button>
            {suggestedImpression && (
              <div className="space-y-2">
                <div className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
                  <AlertTriangle size={10} /> AI Draft — Requires Radiologist Review
                </div>
                <Textarea
                  value={suggestedImpression}
                  onChange={(e) => setSuggestedImpression(e.target.value)}
                  className="text-xs min-h-[60px]"
                />
                {onImpressionSuggestion && (
                  <Button
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => onImpressionSuggestion(suggestedImpression)}
                  >
                    <ArrowRight size={12} className="mr-1" /> Use This Impression
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "consistency" && (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Check if findings and impression are consistent. Detects side mismatches and region mismatches.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs"
              disabled={loadingConsistency || !findingsText?.trim() || !impressionText?.trim()}
              onClick={checkConsistency}
            >
              <CheckCircle size={13} className="mr-1.5" />
              {loadingConsistency ? "Checking..." : "Check Consistency"}
            </Button>
            {consistencyIssues.length > 0 && (
              <div className="space-y-1.5">
                {consistencyIssues.map((issue, i) => (
                  <div
                    key={i}
                    className={`px-2.5 py-1.5 rounded text-[11px] flex items-start gap-1.5 ${
                      issue.severity === "error"
                        ? "bg-red-50 text-red-700 border border-red-200"
                        : issue.severity === "warning"
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-green-50 text-green-700 border border-green-200"
                    }`}
                  >
                    {issue.severity === "error" ? (
                      <AlertTriangle size={12} className="mt-0.5 flex-shrink-0 text-red-500" />
                    ) : issue.severity === "warning" ? (
                      <AlertTriangle size={12} className="mt-0.5 flex-shrink-0 text-amber-500" />
                    ) : (
                      <CheckCircle size={12} className="mt-0.5 flex-shrink-0 text-green-500" />
                    )}
                    {issue.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "followup" && (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Guideline-based follow-up suggestions from BI-RADS, TI-RADS, and best practice.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs"
              disabled={loadingFollowUp || !impressionText?.trim()}
              onClick={getFollowUp}
            >
              <Clock size={13} className="mr-1.5" />
              {loadingFollowUp ? "Loading..." : "Suggest Follow-up"}
            </Button>
            {followUpSuggestions.length > 0 && (
              <div className="space-y-2">
                {followUpSuggestions.map((s, i) => (
                  <div key={i} className="border rounded-lg p-2.5 text-xs space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${
                          s.urgency === "immediate"
                            ? "bg-red-100 text-red-700"
                            : s.urgency === "urgent"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {s.urgency}
                      </span>
                      <span className="text-[10px] font-medium text-muted-foreground">{s.category}</span>
                    </div>
                    <p className="font-medium text-[11px]">{s.recommendation}</p>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock size={10} /> {s.timeframe}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <FileText size={10} /> {s.source}
                    </div>
                  </div>
                ))}
                <div className="text-[10px] text-muted-foreground text-center pt-1">
                  AI Draft — Requires Radiologist Review
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "dicom" && (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              DICOM metadata from the study. Used to auto-generate the technique section.
            </p>
            {loadingDicomMeta ? (
              <div className="text-center py-4 text-xs text-muted-foreground">Loading metadata...</div>
            ) : !dicomMeta ? (
              <div className="text-center py-4 text-xs text-muted-foreground">
                {studyId ? "No DICOM metadata available for this study." : "Select a study to view DICOM metadata."}
              </div>
            ) : (
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between border-b border-border py-1">
                  <span className="text-muted-foreground">Modality</span>
                  <span className="font-mono uppercase">{dicomMeta.modality ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border py-1">
                  <span className="text-muted-foreground">Body Part</span>
                  <span>{dicomMeta.bodyPart ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border py-1">
                  <span className="text-muted-foreground">Images</span>
                  <span>{dicomMeta.numImages ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border py-1">
                  <span className="text-muted-foreground">Accession</span>
                  <span className="font-mono">{dicomMeta.accessionNumber ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border py-1">
                  <span className="text-muted-foreground">Station</span>
                  <span>{dicomMeta.scheduledStationAETitle ?? "—"}</span>
                </div>
                <div className="pt-1">
                  <span className="text-[10px] font-medium uppercase text-muted-foreground">Technique</span>
                  <p className="text-[11px] mt-0.5 leading-relaxed">{dicomMeta.technique}</p>
                </div>
                <div className="text-[10px] text-muted-foreground text-center pt-1">
                  AI Draft — Requires Radiologist Review
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
