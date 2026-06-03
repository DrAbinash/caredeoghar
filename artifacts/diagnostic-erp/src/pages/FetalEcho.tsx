import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { api } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Baby, Heart, Activity, Zap, Save, Send, AlertTriangle,
  CheckCircle2, ChevronLeft, Stethoscope,
} from "lucide-react";

interface FetalEchoData {
  id?: number;
  gaWeeks?: number;
  gaDays?: number;
  edd?: string;
  lmp?: string;
  fetalHeartRate?: number;
  situs?: string;
  cardiacAxis?: string;
  cardiacPosition?: string;
  avConcordance?: string;
  vaConcordance?: string;
  raNormal?: boolean;
  laNormal?: boolean;
  rvNormal?: boolean;
  lvNormal?: boolean;
  fourChamberView?: string;
  lvot?: string;
  rvot?: string;
  threeVesselView?: string;
  threeVesselTracheaView?: string;
  aorticArch?: string;
  ductalArch?: string;
  interatrialSeptum?: string;
  interventricularSeptum?: string;
  mitralValve?: string;
  tricuspidValve?: string;
  aorticValve?: string;
  pulmonaryValve?: string;
  rhythm?: string;
  rhythmNotes?: string;
  umbilicalArteryPi?: number;
  umbilicalArteryRi?: number;
  ductusVenoususPi?: number;
  ductusVenoususAWave?: string;
  mcaPi?: number;
  mcaRi?: number;
  suspectedAbnormalities?: string;
  status?: string;
  aiDraft?: string;
  criticalAlertsAcknowledged?: boolean;
}

const VIEW_OPTIONS = ["normal", "abnormal", "not_visualized"];
const VALVE_OPTIONS = ["normal", "abnormal", "not_assessed"];
const RHYTHM_OPTIONS = ["normal_sinus", "tachycardia", "bradycardia", "arrhythmia"];
const DV_A_WAVE_OPTIONS = ["positive", "absent", "reversed"];
const CONCORDANCE_OPTIONS = ["concordant", "discordant"];
const SITUS_OPTIONS = ["solitus", "inversus", "ambiguous"];
const ABNORMALITY_OPTIONS = [
  "VSD", "ASD", "AV canal defect", "TOF", "TGA", "DORV", "HLHS",
  "Coarctation", "Pulmonary stenosis", "Aortic stenosis", "Ebstein anomaly",
  "Cardiac rhabdomyoma", "Pericardial effusion", "Fetal arrhythmia",
  "Cardiomegaly", "Hydrops fetalis",
];

export default function FetalEcho() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [studyId, setStudyId] = useState<number | null>(null);
  const [data, setData] = useState<FetalEchoData>({});
  const [selectedAbnormalities, setSelectedAbnormalities] = useState<string[]>([]);
  const [criticalAlerts, setCriticalAlerts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("maternal");

  const params = new URLSearchParams(window.location.search);
  const sid = Number(params.get("studyId"));

  useEffect(() => {
    if (sid) { setStudyId(sid); loadData(sid); }
  }, [sid]);

  async function loadData(sid: number) {
    setLoading(true);
    try {
      const res = await api.get<{ study: FetalEchoData | null }>(`/api/echo-cardiology/fetal/${sid}`);
      if (res.study) {
        setData(res.study);
        const ab = JSON.parse(res.study.suspectedAbnormalities ?? "[]") as string[];
        setSelectedAbnormalities(ab);
      }
      const c = await api.get<{ alerts: string[]; hasCritical: boolean }>(`/api/echo-cardiology/fetal/${sid}/critical-alerts`);
      setCriticalAlerts(c.alerts);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function saveData() {
    if (!studyId) return;
    setSaving(true);
    try {
      const payload = {
        ...data,
        suspectedAbnormalities: JSON.stringify(selectedAbnormalities),
      };
      await api.post(`/api/echo-cardiology/fetal/${studyId}`, payload);
      toast({ title: "Saved" });
    } catch (e) { toast({ variant: "destructive", title: "Failed", description: String(e) }); }
    finally { setSaving(false); }
  }

  async function generateDraft() {
    if (!studyId) return;
    setLoading(true);
    try {
      const res = await api.post<{ aiDraft: string }>(`/api/echo-cardiology/fetal/${studyId}/generate-draft`, {});
      setData((prev) => ({ ...prev, aiDraft: res.aiDraft }));
      toast({ title: "AI Draft generated" });
    } catch (e) { toast({ variant: "destructive", title: "Failed", description: String(e) }); }
    finally { setLoading(false); }
  }

  async function reviewReport() {
    if (!studyId) return;
    try {
      await api.post(`/api/echo-cardiology/fetal/${studyId}/review`, {});
      setData((prev) => ({ ...prev, status: "reviewed" }));
      toast({ title: "Reviewed" });
    } catch (e) { toast({ variant: "destructive", title: "Failed", description: String(e) }); }
  }

  async function finalizeReport() {
    if (!studyId) return;
    try {
      await api.post(`/api/echo-cardiology/fetal/${studyId}/finalize`, {});
      setData((prev) => ({ ...prev, status: "final" }));
      toast({ title: "Finalized" });
    } catch (e: any) {
      if (e?.error?.includes("Critical")) {
        toast({ variant: "destructive", title: "Critical alerts", description: e.error });
      } else {
        toast({ variant: "destructive", title: "Failed", description: String(e) });
      }
    }
  }

  async function acknowledgeCritical() {
    if (!studyId) return;
    try {
      await api.post(`/api/echo-cardiology/fetal/${studyId}/acknowledge-critical`, {});
      setData((prev) => ({ ...prev, criticalAlertsAcknowledged: true }));
      toast({ title: "Acknowledged" });
    } catch (e) { toast({ variant: "destructive", title: "Failed", description: String(e) }); }
  }

  function updateData<K extends keyof FetalEchoData>(key: K, value: FetalEchoData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function toggleAbnormality(a: string) {
    setSelectedAbnormalities((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fetal Echocardiography"
        subtitle="Fetal echo reporting with structured views, abnormality library, and AI draft"
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setLocation("/radiology/worklist")}>
              <ChevronLeft size={14} className="mr-1" /> Worklist
            </Button>
          </div>
        }
      />

      {criticalAlerts.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-700 font-semibold">
            <AlertTriangle size={16} />
            Critical Alerts
          </div>
          <ul className="list-disc list-inside text-sm text-red-700">
            {criticalAlerts.map((a) => (<li key={a}>{a}</li>))}
          </ul>
          {!data.criticalAlertsAcknowledged && (
            <Button size="sm" variant="outline" className="border-red-300 text-red-700" onClick={acknowledgeCritical}>
              Acknowledge
            </Button>
          )}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="maternal"><Baby size={14} className="mr-1" /> Maternal / GA</TabsTrigger>
          <TabsTrigger value="views"><Heart size={14} className="mr-1" /> Views</TabsTrigger>
          <TabsTrigger value="doppler"><Activity size={14} className="mr-1" /> Doppler</TabsTrigger>
          <TabsTrigger value="abnormalities"><AlertTriangle size={14} className="mr-1" /> Abnormalities</TabsTrigger>
          <TabsTrigger value="report"><Stethoscope size={14} className="mr-1" /> Report</TabsTrigger>
        </TabsList>

        <TabsContent value="maternal" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Maternal / Gestational Age</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-4 gap-3">
              <div><Label className="text-xs">GA Weeks</Label><Input type="number" value={data.gaWeeks ?? ""} onChange={(e) => updateData("gaWeeks", Number(e.target.value))} /></div>
              <div><Label className="text-xs">GA Days</Label><Input type="number" value={data.gaDays ?? ""} onChange={(e) => updateData("gaDays", Number(e.target.value))} /></div>
              <div><Label className="text-xs">EDD</Label><Input type="date" value={data.edd ?? ""} onChange={(e) => updateData("edd", e.target.value)} /></div>
              <div><Label className="text-xs">LMP</Label><Input type="date" value={data.lmp ?? ""} onChange={(e) => updateData("lmp", e.target.value)} /></div>
              <div><Label className="text-xs">FHR (bpm)</Label><Input type="number" value={data.fetalHeartRate ?? ""} onChange={(e) => updateData("fetalHeartRate", Number(e.target.value))} /></div>
              <div><Label className="text-xs">Situs</Label>
                <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={data.situs ?? ""} onChange={(e) => updateData("situs", e.target.value)}>
                  <option value="">Select</option>
                  {SITUS_OPTIONS.map((o) => (<option key={o} value={o}>{o}</option>))}
                </select>
              </div>
              <div><Label className="text-xs">Cardiac Axis</Label><Input value={data.cardiacAxis ?? ""} onChange={(e) => updateData("cardiacAxis", e.target.value)} /></div>
              <div><Label className="text-xs">Cardiac Position</Label><Input value={data.cardiacPosition ?? ""} onChange={(e) => updateData("cardiacPosition", e.target.value)} /></div>
              <div><Label className="text-xs">AV Concordance</Label>
                <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={data.avConcordance ?? ""} onChange={(e) => updateData("avConcordance", e.target.value)}>
                  <option value="">Select</option>
                  {CONCORDANCE_OPTIONS.map((o) => (<option key={o} value={o}>{o}</option>))}
                </select>
              </div>
              <div><Label className="text-xs">VA Concordance</Label>
                <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={data.vaConcordance ?? ""} onChange={(e) => updateData("vaConcordance", e.target.value)}>
                  <option value="">Select</option>
                  {CONCORDANCE_OPTIONS.map((o) => (<option key={o} value={o}>{o}</option>))}
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Chambers</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-4 gap-3">
              {[
                ["RA Normal", "raNormal"], ["LA Normal", "laNormal"], ["RV Normal", "rvNormal"], ["LV Normal", "lvNormal"],
              ].map(([label, key]) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={(data as any)[key] ? "true" : "false"} onChange={(e) => updateData(key as any, e.target.value === "true")}>
                    <option value="true">Normal</option>
                    <option value="false">Abnormal</option>
                  </select>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={saveData} disabled={saving}>
              <Save size={14} className="mr-1" /> {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="views" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Views</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-3">
              {[
                ["Four Chamber", "fourChamberView"], ["LVOT", "lvot"], ["RVOT", "rvot"],
                ["3-Vessel", "threeVesselView"], ["3VT", "threeVesselTracheaView"], ["Aortic Arch", "aorticArch"], ["Ductal Arch", "ductalArch"],
              ].map(([label, key]) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={(data as any)[key] ?? ""} onChange={(e) => updateData(key as any, e.target.value)}>
                    <option value="">Select</option>
                    {VIEW_OPTIONS.map((o) => (<option key={o} value={o}>{o.replace(/_/g, " ")}</option>))}
                  </select>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Septa</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Interatrial Septum</Label><Input value={data.interatrialSeptum ?? ""} onChange={(e) => updateData("interatrialSeptum", e.target.value)} /></div>
              <div><Label className="text-xs">Interventricular Septum</Label><Input value={data.interventricularSeptum ?? ""} onChange={(e) => updateData("interventricularSeptum", e.target.value)} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Valves</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-4 gap-3">
              {[
                ["Mitral", "mitralValve"], ["Tricuspid", "tricuspidValve"], ["Aortic", "aorticValve"], ["Pulmonary", "pulmonaryValve"],
              ].map(([label, key]) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={(data as any)[key] ?? ""} onChange={(e) => updateData(key as any, e.target.value)}>
                    <option value="">Select</option>
                    {VALVE_OPTIONS.map((o) => (<option key={o} value={o}>{o.replace(/_/g, " ")}</option>))}
                  </select>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Rhythm</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Rhythm</Label>
                <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={data.rhythm ?? ""} onChange={(e) => updateData("rhythm", e.target.value)}>
                  <option value="">Select</option>
                  {RHYTHM_OPTIONS.map((o) => (<option key={o} value={o}>{o.replace(/_/g, " ")}</option>))}
                </select>
              </div>
              <div><Label className="text-xs">Rhythm Notes</Label><Input value={data.rhythmNotes ?? ""} onChange={(e) => updateData("rhythmNotes", e.target.value)} /></div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={saveData} disabled={saving}>
              <Save size={14} className="mr-1" /> {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="doppler" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Doppler</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-4 gap-3">
              <div><Label className="text-xs">UA PI</Label><Input type="number" value={data.umbilicalArteryPi ?? ""} onChange={(e) => updateData("umbilicalArteryPi", Number(e.target.value))} /></div>
              <div><Label className="text-xs">UA RI</Label><Input type="number" value={data.umbilicalArteryRi ?? ""} onChange={(e) => updateData("umbilicalArteryRi", Number(e.target.value))} /></div>
              <div><Label className="text-xs">DV PI</Label><Input type="number" value={data.ductusVenoususPi ?? ""} onChange={(e) => updateData("ductusVenoususPi", Number(e.target.value))} /></div>
              <div><Label className="text-xs">DV A-Wave</Label>
                <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={data.ductusVenoususAWave ?? ""} onChange={(e) => updateData("ductusVenoususAWave", e.target.value)}>
                  <option value="">Select</option>
                  {DV_A_WAVE_OPTIONS.map((o) => (<option key={o} value={o}>{o}</option>))}
                </select>
              </div>
              <div><Label className="text-xs">MCA PI</Label><Input type="number" value={data.mcaPi ?? ""} onChange={(e) => updateData("mcaPi", Number(e.target.value))} /></div>
              <div><Label className="text-xs">MCA RI</Label><Input type="number" value={data.mcaRi ?? ""} onChange={(e) => updateData("mcaRi", Number(e.target.value))} /></div>
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <Button onClick={saveData} disabled={saving}>
              <Save size={14} className="mr-1" /> {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="abnormalities" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Suspected Abnormalities</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {ABNORMALITY_OPTIONS.map((a) => (
                <button
                  key={a}
                  className={`text-xs px-3 py-1.5 rounded border transition-colors ${selectedAbnormalities.includes(a) ? "bg-red-50 border-red-300 text-red-700" : "hover:bg-muted"}`}
                  onClick={() => toggleAbnormality(a)}
                >
                  {selectedAbnormalities.includes(a) && <AlertTriangle size={10} className="inline mr-1" />}
                  {a}
                </button>
              ))}
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <Button onClick={saveData} disabled={saving}>
              <Save size={14} className="mr-1" /> {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="report" className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={data.status === "final" ? "default" : data.status === "reviewed" ? "secondary" : "outline"}>{data.status ?? "draft"}</Badge>
            <Button size="sm" variant="outline" onClick={generateDraft} disabled={loading}>
              <Zap size={14} className="mr-1" /> {loading ? "Generating..." : "Generate AI Draft"}
            </Button>
            <Button size="sm" variant="outline" onClick={reviewReport} disabled={data.status === "reviewed" || data.status === "final"}>
              <CheckCircle2 size={14} className="mr-1" /> Mark Reviewed
            </Button>
            <Button size="sm" onClick={finalizeReport} disabled={data.status === "final"}>
              <Send size={14} className="mr-1" /> Finalize
            </Button>
          </div>

          {data.aiDraft && (
            <Card>
              <CardHeader><CardTitle className="text-sm">AI Draft</CardTitle></CardHeader>
              <CardContent>
                <Textarea className="text-sm bg-muted" value={data.aiDraft} readOnly rows={12} />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
