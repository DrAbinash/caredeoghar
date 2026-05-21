import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { readStaffSession, FULL_ACCESS_ROLES } from "@/lib/staffSession";
import {
  Settings2, Cpu, Wifi, Eye, FlaskConical, Info, ShieldAlert,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UsgSettings {
  ocrEnabled: boolean;
  aiNormalizeEnabled: boolean;
  confidenceThreshold: "high" | "medium" | "low";
  geAeTitle: string;
  geIp: string;
  gePort: string;
  maxFramesToOcr: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function UsgAdminSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const session = readStaffSession();
  const isAdmin = FULL_ACCESS_ROLES.has(session?.user.role ?? "");

  const { data: settings, isLoading } = useQuery<UsgSettings>({
    queryKey: ["usg-admin-settings"],
    queryFn: () => fetchApi("/api/usg-extraction/settings"),
    staleTime: 60_000,
  });

  const [form, setForm] = useState<UsgSettings>({
    ocrEnabled: true,
    aiNormalizeEnabled: true,
    confidenceThreshold: "low",
    geAeTitle: "GE_USG",
    geIp: "",
    gePort: "11112",
    maxFramesToOcr: 3,
  });

  const [testMetadata, setTestMetadata] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data: UsgSettings) =>
      fetchApi("/api/usg-extraction/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast({ title: "Settings saved" });
      void qc.invalidateQueries({ queryKey: ["usg-admin-settings"] });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: (json: string) =>
      fetchApi("/api/usg-extraction/sample-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dicomMetadataJson: json }),
      }),
    onSuccess: (data: unknown) => {
      setTestResult(JSON.stringify(data, null, 2));
      toast({ title: "Test complete" });
    },
    onError: (e: Error) => toast({ title: "Test failed", description: e.message, variant: "destructive" }),
  });

  const upd = <K extends keyof UsgSettings>(k: K, v: UsgSettings[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const CONFIDENCE_OPTIONS: { value: UsgSettings["confidenceThreshold"]; label: string; desc: string }[] = [
    { value: "high",   label: "High (SR only)",  desc: "Only show measurements with DICOM SR source" },
    { value: "medium", label: "Medium (SR + OCR)", desc: "Show SR and clear OCR values" },
    { value: "low",    label: "Low (all)",         desc: "Show all extracted values including uncertain OCR" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="USG Extraction Settings"
        subtitle="Configure GE Ultrasound auto-measurement extraction and OCR pipeline"
      />

      {!isAdmin && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4 flex gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              <strong>Read-only.</strong> Admin or super-admin role required to save changes.
            </p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Card><CardContent className="pt-6 text-center text-muted-foreground">Loading settings…</CardContent></Card>
      ) : (
        <>
          {/* GE Machine Connection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wifi className="h-4 w-4" /> GE Ultrasound Machine (DICOM Node)
              </CardTitle>
              <CardDescription>
                AE Title, IP and Port of the GE USG machine pushing studies to the PACS.
                These are used for DICOM MWL push and C-ECHO verification.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="aeTitle">AE Title</Label>
                <Input
                  id="aeTitle"
                  value={form.geAeTitle}
                  onChange={(e) => upd("geAeTitle", e.target.value)}
                  disabled={!isAdmin}
                  className="font-mono"
                  placeholder="GE_USG"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="geIp">IP Address</Label>
                <Input
                  id="geIp"
                  value={form.geIp}
                  onChange={(e) => upd("geIp", e.target.value)}
                  disabled={!isAdmin}
                  className="font-mono"
                  placeholder="192.168.1.50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gePort">Port</Label>
                <Input
                  id="gePort"
                  value={form.gePort}
                  onChange={(e) => upd("gePort", e.target.value)}
                  disabled={!isAdmin}
                  className="font-mono"
                  placeholder="11112"
                />
              </div>
            </CardContent>
          </Card>

          {/* OCR + AI Pipeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Cpu className="h-4 w-4" /> Extraction Pipeline
              </CardTitle>
              <CardDescription>
                Controls which extraction methods are active. DICOM SR is always attempted;
                OCR uses Gemini Vision to read burned-in image text.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Image OCR (Gemini Vision)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Sends WADO image frames to Gemini Vision API to read burned-in measurement text.
                    Requires WADO-URI and DICOMweb base URLs configured in PACS Settings.
                  </p>
                </div>
                <Switch
                  checked={form.ocrEnabled}
                  onCheckedChange={(v) => upd("ocrEnabled", v)}
                  disabled={!isAdmin}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">AI Text Normalization</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    If image OCR fails, use Gemini to parse raw DICOM tag text into structured measurements.
                    Fallback only — lower confidence than image OCR.
                  </p>
                </div>
                <Switch
                  checked={form.aiNormalizeEnabled}
                  onCheckedChange={(v) => upd("aiNormalizeEnabled", v)}
                  disabled={!isAdmin}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="font-medium text-sm">Max Frames to OCR per Study</p>
                <p className="text-xs text-muted-foreground">
                  Number of image frames sent to Gemini per study. More frames = better coverage but higher AI cost. Recommended: 3–5.
                </p>
                <Input
                  type="number"
                  min={1} max={20}
                  value={form.maxFramesToOcr}
                  onChange={(e) => upd("maxFramesToOcr", Number(e.target.value))}
                  disabled={!isAdmin}
                  className="w-24"
                />
              </div>
            </CardContent>
          </Card>

          {/* Confidence threshold */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Eye className="h-4 w-4" /> Confidence Threshold
              </CardTitle>
              <CardDescription>
                Minimum confidence level for a measurement to appear in the review panel.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {CONFIDENCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => upd("confidenceThreshold", opt.value)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    form.confidenceThreshold === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted"
                  } ${!isAdmin ? "opacity-60 cursor-default" : "cursor-pointer"}`}
                >
                  <p className="font-medium text-sm">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Confidence legend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Info className="h-4 w-4" /> Confidence Badge Legend
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-100 text-green-800 border-green-300 border text-xs font-semibold">SR</Badge>
                <span className="text-muted-foreground">High — from DICOM Structured Report (machine-generated)</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 border text-xs font-semibold">OCR</Badge>
                <span className="text-muted-foreground">Medium — clear burned-in text read by Gemini Vision</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-red-100 text-red-800 border-red-300 border text-xs font-semibold">~OCR</Badge>
                <span className="text-muted-foreground">Low — uncertain OCR or AI normalization guess</span>
              </div>
            </CardContent>
          </Card>

          {/* Test panel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FlaskConical className="h-4 w-4" /> Test DICOM Metadata Parser
              </CardTitle>
              <CardDescription>
                Paste DICOM JSON metadata to test SR parsing and metadata extraction without running full OCR.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                className="w-full font-mono text-xs border rounded p-2 h-32 resize-y bg-muted/30"
                placeholder='{"00100010":{"Value":[{"Alphabetic":"DOE^JANE"}]},"00080060":{"Value":["US"]},...}'
                value={testMetadata}
                onChange={(e) => setTestMetadata(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => testMutation.mutate(testMetadata)}
                disabled={!testMetadata || testMutation.isPending}
              >
                <Settings2 className="h-4 w-4 mr-2" />
                {testMutation.isPending ? "Testing…" : "Test Parser"}
              </Button>
              {testResult && (
                <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-64">{testResult}</pre>
              )}
            </CardContent>
          </Card>

          {/* Save */}
          {isAdmin && (
            <div className="flex justify-end">
              <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Save Settings"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
