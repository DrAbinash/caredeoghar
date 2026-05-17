import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Save, RefreshCw, Trash2, Server, Settings2, Radio, Search, ScanLine, MonitorPlay, Network, ToggleLeft, ToggleRight } from "lucide-react";

type Setting = { id: number; key: string; value: string | null; category: string; isSecret: boolean };
type Modality = {
  id: number; machineName: string; modality: string | null; aeTitle: string | null;
  ipAddress: string | null; port: number | null; location: string | null;
  autoSendEnabled: boolean; isActive: boolean;
  lastConnectionStatus: string | null; lastSeenAt: string | null;
};

const SETTING_CATEGORIES = ["general", "conquest", "mwl", "delivery", "notification"];
const MODALITY_CODES = ["MR", "CT", "CR", "DX", "US", "MG", "XA", "OT"];

// MWL settings stored in pacs_settings under category "mwl"
const MWL_FIELDS: Array<{
  key: string;
  label: string;
  placeholder: string;
  type?: string;
  isSelect?: boolean;
  options?: string[];
  hint?: string;
}> = [
  {
    key: "mwl_ae_title",
    label: "MWL AE Title",
    placeholder: "ERPMWL",
    hint: "DICOM Application Entity title for the MWL SCP (e.g. ERPMWL)",
  },
  {
    key: "mwl_port",
    label: "MWL Port",
    placeholder: "4242",
    type: "number",
    hint: "TCP port the MWL SCP listens on",
  },
  {
    key: "mwl_default_station_ae_title",
    label: "Default Station AE Title",
    placeholder: "STATION01",
    hint: "Scheduled station AE title pre-filled on new radiology orders",
  },
  {
    key: "mwl_default_modality",
    label: "Default Modality",
    placeholder: "MR",
    isSelect: true,
    options: ["MR", "CT", "DX", "CR", "US", "MG"],
    hint: "Default DICOM modality code for new radiology orders",
  },
  {
    key: "mwl_accession_prefix",
    label: "Auto Accession Number Prefix",
    placeholder: "ACC",
    hint: "Short prefix prepended to auto-generated accession numbers (e.g. ACC, DCH, RAD)",
  },
];

function SettingRow({ setting, onSave, onDelete }: {
  setting: Setting;
  onSave: (id: number, value: string) => void;
  onDelete: (id: number) => void;
}) {
  const [val, setVal] = useState(setting.value ?? "");
  const dirty = val !== (setting.value ?? "");
  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{setting.key}</p>
        <p className="text-xs text-muted-foreground">{setting.category}</p>
      </div>
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        type={setting.isSecret ? "password" : "text"}
        className="w-56 text-sm h-8"
        placeholder={setting.isSecret ? "••••••••" : "value"}
      />
      {dirty && (
        <Button size="sm" variant="default" className="h-8 px-2" onClick={() => onSave(setting.id, val)}>
          <Save size={12} />
        </Button>
      )}
      <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive" onClick={() => onDelete(setting.id)}>
        <Trash2 size={12} />
      </Button>
    </div>
  );
}

function ModalityCard({ m, onToggle, onDelete }: {
  m: Modality;
  onToggle: (id: number, field: "autoSendEnabled" | "isActive", val: boolean) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sm">{m.machineName}</p>
          <p className="text-xs text-muted-foreground">{m.location ?? "No location"}</p>
        </div>
        <div className="flex gap-1">
          <Badge variant={m.isActive ? "default" : "secondary"}>{m.isActive ? "Active" : "Inactive"}</Badge>
          <Badge variant="outline">{m.modality ?? "OT"}</Badge>
        </div>
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
        <p>AE: <span className="font-mono">{m.aeTitle ?? "—"}</span> · IP: <span className="font-mono">{m.ipAddress ?? "—"}:{m.port ?? "—"}</span></p>
        {m.lastConnectionStatus && <p>Last: <span className={m.lastConnectionStatus === "ok" ? "text-green-600" : "text-red-600"}>{m.lastConnectionStatus}</span></p>}
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onToggle(m.id, "isActive", !m.isActive)}>
          {m.isActive ? "Deactivate" : "Activate"}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onToggle(m.id, "autoSendEnabled", !m.autoSendEnabled)}>
          Auto-send: {m.autoSendEnabled ? "On" : "Off"}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive ml-auto" onClick={() => onDelete(m.id)}>
          <Trash2 size={12} />
        </Button>
      </div>
    </div>
  );
}

// MWL Settings tab — dedicated form for the five MWL configuration keys.
// Values are persisted to pacs_settings under category "mwl".
function MwlSettingsTab({
  settings,
  onSave,
}: {
  settings: Setting[];
  onSave: (key: string, value: string) => void;
}) {
  // Build an editable state map from the current saved settings
  const savedMap: Record<string, string> = {};
  for (const s of settings.filter((s) => s.category === "mwl")) {
    savedMap[s.key] = s.value ?? "";
  }

  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of MWL_FIELDS) init[f.key] = savedMap[f.key] ?? "";
    return init;
  });

  // Re-initialise when server data arrives (query refetch)
  // This is intentionally done via a key approach in the parent — see below.

  const dirty = MWL_FIELDS.some((f) => values[f.key] !== (savedMap[f.key] ?? ""));

  function handleSave() {
    for (const f of MWL_FIELDS) {
      const current = savedMap[f.key] ?? "";
      if (values[f.key] !== current) {
        onSave(f.key, values[f.key] ?? "");
      }
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Radio size={16} className="text-primary" />
          <h3 className="text-sm font-semibold">Modality Worklist (MWL) Settings</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Configure the DICOM Modality Worklist SCP so imaging machines (CT, MRI, X-Ray)
          can query scheduled studies directly from this ERP.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {MWL_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <label className="text-xs font-medium text-foreground">{f.label}</label>
              {f.isSelect ? (
                <select
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  className="w-full h-9 text-sm border rounded-md px-2 bg-background"
                >
                  <option value="">— use system default —</option>
                  {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <Input
                  type={f.type ?? "text"}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="h-9 text-sm"
                />
              )}
              {f.hint && <p className="text-[11px] text-muted-foreground">{f.hint}</p>}
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <Button size="sm" onClick={handleSave} disabled={!dirty} className="h-8">
            <Save size={13} className="mr-1" /> Save MWL Settings
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-muted/40 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground text-sm">Mandatory DICOM fields before scanning</p>
        <p>A radiology order cannot move to <span className="font-mono bg-muted px-1 rounded">in_progress</span> (ready-for-scan) until all of these are filled on the study:</p>
        <ul className="list-disc ml-4 mt-1 space-y-0.5">
          <li>Study Description (DICOM 0008,1030)</li>
          <li>Body Part Examined (DICOM 0018,0015)</li>
          <li>Scheduled Station AE Title (DICOM 0040,0001)</li>
          <li>Referring Physician Name (DICOM 0008,0090)</li>
          <li>Modality must be one of: MR · CT · DX · CR · US · MG</li>
          <li>Patient sex, mobile number, and date of birth</li>
        </ul>
        <p className="mt-2">Internal MWL endpoint: <span className="font-mono bg-muted px-1 rounded">GET /api/internal/radiology/mwl-orders</span> (requires Bearer INTERNAL_API_KEY)</p>
        <p>MWL status update: <span className="font-mono bg-muted px-1 rounded">POST /api/internal/radiology/mwl-order-status</span></p>
        <p className="mt-1">Valid MWL statuses: SCHEDULED · ARRIVED · IN_PROGRESS · COMPLETED · CANCELLED</p>
      </div>
    </div>
  );
}

type DiagnosticTest = { id: number; name: string; code: string; category: string; isActive: boolean };

type MwlTestDefault = { bodyPart: string; stationAE: string };

function DicomMwlTestsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const { data: tests = [], isLoading: testsLoading } = useQuery<DiagnosticTest[]>({
    queryKey: ["tests-all-dicom-mwl"],
    queryFn: () => api.get<{ tests: DiagnosticTest[] }>("/api/tests?limit=500").then((d) => d.tests ?? []),
  });

  const { data: settings, isLoading: settingsLoading } = useQuery<{ dicomMwlTestIds?: string; dicomMwlTestDefaults?: string }>({
    queryKey: ["clinic-settings"],
    queryFn: () => api.get("/api/clinic-settings"),
  });

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // Per-test defaults: { "<id>": { bodyPart, stationAE } }
  const [defaults, setDefaults] = useState<Record<string, MwlTestDefault>>({});

  useEffect(() => {
    if (!settingsLoading && settings !== undefined) {
      try {
        const ids: number[] = JSON.parse(settings?.dicomMwlTestIds ?? "[]");
        setSelectedIds(new Set(ids));
      } catch { /* ignore */ }
      try {
        const d = JSON.parse(settings?.dicomMwlTestDefaults ?? "{}");
        setDefaults(typeof d === "object" && d !== null ? d : {});
      } catch { /* ignore */ }
    }
  }, [settings, settingsLoading]);

  const saveMut = useMutation({
    mutationFn: () =>
      api.put("/api/clinic-settings", {
        dicomMwlTestIds: JSON.stringify([...selectedIds]),
        dicomMwlTestDefaults: JSON.stringify(defaults),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinic-settings"] });
      toast({ title: "DICOM MWL test list saved" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const toggleTest = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const setDefault = (id: number, field: keyof MwlTestDefault, value: string) => {
    setDefaults((prev) => {
      const existing: MwlTestDefault = prev[String(id)] ?? { bodyPart: "", stationAE: "" };
      return { ...prev, [String(id)]: { ...existing, [field]: value } };
    });
  };

  const activeTests = tests.filter((t) => t.isActive !== false);
  const filteredTests = activeTests.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
  });

  const byCategory: Record<string, DiagnosticTest[]> = {};
  for (const t of filteredTests) {
    if (!byCategory[t.category]) byCategory[t.category] = [];
    byCategory[t.category].push(t);
  }

  if (testsLoading || settingsLoading) {
    return <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground text-sm animate-pulse">Loading tests…</div>;
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <ScanLine size={15} className="text-blue-600" />
            DICOM MWL — Required Tests & Defaults
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tick each test that needs DICOM Worklist. Set a default Body Part and Station AE Title
            so Billing Desk auto-fills them — staff only need to type the Referring Doctor.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold text-blue-600">{selectedIds.size} selected</span>
          <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="h-8">
            {saveMut.isPending ? "Saving…" : <><Save size={12} className="mr-1" />Save</>}
          </Button>
        </div>
      </div>

      {/* Quick-select buttons */}
      <div className="flex gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground self-center">Quick select:</span>
        {["Radiology", "CT", "MRI", "X-Ray", "Ultrasound", "USG"].map((cat) => {
          const catTests = activeTests.filter((t) => t.category.toLowerCase().includes(cat.toLowerCase()) || t.name.toLowerCase().includes(cat.toLowerCase()));
          if (catTests.length === 0) return null;
          return (
            <Button key={cat} variant="outline" size="sm" className="h-7 text-xs"
              onClick={() => setSelectedIds((prev) => { const next = new Set(prev); catTests.forEach((t) => next.add(t.id)); return next; })}
            >
              + {cat} ({catTests.length})
            </Button>
          );
        })}
        <Button variant="outline" size="sm" className="h-7 text-xs text-destructive"
          onClick={() => setSelectedIds(new Set())}>
          Clear all
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Filter tests by name, code or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-8 text-sm"
        />
      </div>

      {/* Test list grouped by category */}
      <div className="max-h-[480px] overflow-y-auto space-y-3 pr-1">
        {Object.keys(byCategory).length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No tests match the filter.</p>
        )}
        {Object.entries(byCategory).map(([cat, catTests]) => (
          <div key={cat}>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{cat}</p>
            <div className="space-y-1.5">
              {catTests.map((t) => {
                const checked = selectedIds.has(t.id);
                const def = defaults[String(t.id)] ?? { bodyPart: "", stationAE: "" };
                return (
                  <div
                    key={t.id}
                    className={`rounded-md border transition-colors ${checked ? "border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800" : "border-transparent hover:bg-muted/50"}`}
                  >
                    {/* Checkbox row */}
                    <label className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer text-sm">
                      <input type="checkbox" checked={checked} onChange={() => toggleTest(t.id)} className="accent-blue-600 shrink-0" />
                      <span className="flex-1 font-medium">{t.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{t.code}</span>
                    </label>
                    {/* Defaults row — only visible when checked */}
                    {checked && (
                      <div className="px-3 pb-2 grid grid-cols-2 gap-2">
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-muted-foreground font-medium">Default Body Part</p>
                          <Input
                            value={def.bodyPart}
                            onChange={(e) => setDefault(t.id, "bodyPart", e.target.value.toUpperCase())}
                            placeholder="e.g. BRAIN"
                            className="h-7 text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-muted-foreground font-medium">Default Station AE Title</p>
                          <Input
                            value={def.stationAE}
                            onChange={(e) => setDefault(t.id, "stationAE", e.target.value.toUpperCase())}
                            placeholder="e.g. MRI_ROOM1"
                            className="h-7 text-xs font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {saveMut.isSuccess && (
        <p className="text-xs text-green-600 font-medium">✓ Settings saved successfully.</p>
      )}
    </div>
  );
}

export default function PacsSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"settings" | "modalities" | "mwl" | "viewer" | "routing">("settings");
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [newCat, setNewCat] = useState("general");
  const [newSecret, setNewSecret] = useState(false);

  const [newMachineName, setNewMachineName] = useState("");
  const [newModCode, setNewModCode] = useState("MR");
  const [newAeTitle, setNewAeTitle] = useState("");
  const [newIp, setNewIp] = useState("");
  const [newPort, setNewPort] = useState("");
  const [newLocation, setNewLocation] = useState("");

  const { data: settings = [], refetch: refetchSettings, isFetching: fetchingSettings } = useQuery<Setting[]>({
    queryKey: ["pacs-settings"],
    queryFn: () => api.get("/api/radiology/pacs-settings"),
  });

  const { data: modalities = [], refetch: refetchModalities, isFetching: fetchingModalities } = useQuery<Modality[]>({
    queryKey: ["pacs-modalities"],
    queryFn: () => api.get("/api/radiology/modalities"),
  });

  const upsertSetting = useMutation({
    mutationFn: (body: object) => api.post("/api/radiology/pacs-settings", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pacs-settings"] }); toast({ title: "Setting saved" }); },
    onError: () => toast({ title: "Failed to save setting", variant: "destructive" }),
  });

  const deleteSetting = useMutation({
    mutationFn: (id: number) => api.delete(`/api/radiology/pacs-settings/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pacs-settings"] }); toast({ title: "Setting deleted" }); },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const upsertModality = useMutation({
    mutationFn: (body: object) => api.post("/api/radiology/modalities", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pacs-modalities"] }); toast({ title: "Modality saved" }); },
    onError: () => toast({ title: "Failed to save modality", variant: "destructive" }),
  });

  const deleteModality = useMutation({
    mutationFn: (id: number) => api.delete(`/api/radiology/modalities/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pacs-modalities"] }); toast({ title: "Modality deleted" }); },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const grouped = settings.reduce<Record<string, Setting[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  // Save a single MWL key via the generic pacs-settings upsert endpoint.
  function saveMwlKey(key: string, value: string) {
    const existing = settings.find((s) => s.key === key);
    upsertSetting.mutate({
      ...(existing ? { id: existing.id } : {}),
      key,
      value,
      category: "mwl",
      isSecret: false,
    });
  }

  // Save a single viewer setting key
  function saveViewerKey(key: string, value: string) {
    const existing = settings.find((s) => s.key === key && s.category === "viewer");
    upsertSetting.mutate({
      ...(existing ? { id: existing.id } : {}),
      key,
      value,
      category: "viewer",
      isSecret: false,
    });
  }

  // Viewer settings form state
  const viewerMap: Record<string, string> = {};
  for (const s of settings) if (s.category === "viewer") viewerMap[s.key] = s.value ?? "";

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="PACS / DICOM Settings"
        subtitle="Configure Conquest PACS, imaging devices, and Modality Worklist (MWL)"
        actions={
          <Button variant="outline" size="sm" onClick={() => { refetchSettings(); refetchModalities(); }} disabled={fetchingSettings || fetchingModalities}>
            <RefreshCw size={14} className={fetchingSettings || fetchingModalities ? "animate-spin" : ""} />
            Refresh
          </Button>
        }
      />

      {/* Tab bar */}
      <div className="flex flex-wrap gap-2 border-b">
        {([
          { key: "settings",   icon: <Settings2  size={14} className="inline mr-1" />, label: "Settings" },
          { key: "modalities", icon: <Server     size={14} className="inline mr-1" />, label: "Modalities" },
          { key: "mwl",        icon: <Radio      size={14} className="inline mr-1" />, label: "Worklist (MWL)" },
          { key: "viewer",     icon: <MonitorPlay size={14} className="inline mr-1" />, label: "Viewer Settings" },
          { key: "routing",    icon: <Network    size={14} className="inline mr-1" />, label: "Routing Rules" },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {activeTab === "settings" && (
        <div className="space-y-6">
          {/* Add new setting */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h3 className="text-sm font-semibold">Add / Update Setting</h3>
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Key (e.g. conquest_host)" value={newKey} onChange={(e) => setNewKey(e.target.value)} className="w-48 h-8 text-sm" />
              <Input placeholder="Value" value={newVal} onChange={(e) => setNewVal(e.target.value)} className="w-48 h-8 text-sm" />
              <select value={newCat} onChange={(e) => setNewCat(e.target.value)} className="h-8 text-sm border rounded-md px-2 bg-background">
                {SETTING_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={newSecret} onChange={(e) => setNewSecret(e.target.checked)} />
                Secret
              </label>
              <Button size="sm" className="h-8" onClick={() => {
                if (!newKey.trim()) return;
                upsertSetting.mutate({ key: newKey.trim(), value: newVal, category: newCat, isSecret: newSecret });
                setNewKey(""); setNewVal("");
              }}>
                <Plus size={13} />Add
              </Button>
            </div>
          </div>

          {/* Existing settings */}
          {Object.entries(grouped).length === 0 ? (
            <p className="text-sm text-muted-foreground">No settings configured yet.</p>
          ) : (
            Object.entries(grouped).map(([cat, rows]) => (
              <div key={cat} className="rounded-xl border bg-card p-4">
                <h3 className="text-sm font-semibold mb-3 capitalize">{cat}</h3>
                {rows.map((s) => (
                  <SettingRow
                    key={s.id}
                    setting={s}
                    onSave={(id, value) => upsertSetting.mutate({ id, key: s.key, value, category: s.category, isSecret: s.isSecret })}
                    onDelete={(id) => deleteSetting.mutate(id)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "modalities" && (
        <div className="space-y-6">
          {/* Link to full modality management page */}
          <div className="rounded-xl border bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">Full Modality Management</p>
              <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                Configure polling, C-FIND/C-MOVE, destination PACS, and test connectivity for each imaging device.
              </p>
            </div>
            <a href="/erp/radiology/modality-management" className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 transition-colors">
              Open →
            </a>
          </div>

          {/* Add new modality (quick-add) */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h3 className="text-sm font-semibold">Quick-Add Imaging Device</h3>
            <div className="flex flex-wrap gap-2">
              <Input placeholder="Machine name" value={newMachineName} onChange={(e) => setNewMachineName(e.target.value)} className="w-40 h-8 text-sm" />
              <select value={newModCode} onChange={(e) => setNewModCode(e.target.value)} className="h-8 text-sm border rounded-md px-2 bg-background">
                {MODALITY_CODES.map((m) => <option key={m}>{m}</option>)}
              </select>
              <Input placeholder="AE Title" value={newAeTitle} onChange={(e) => setNewAeTitle(e.target.value)} className="w-32 h-8 text-sm" />
              <Input placeholder="IP Address" value={newIp} onChange={(e) => setNewIp(e.target.value)} className="w-36 h-8 text-sm" />
              <Input placeholder="Port" value={newPort} onChange={(e) => setNewPort(e.target.value)} className="w-20 h-8 text-sm" type="number" />
              <Input placeholder="Location (Room/Ward)" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} className="w-36 h-8 text-sm" />
              <Button size="sm" className="h-8" onClick={() => {
                if (!newMachineName.trim()) return;
                upsertModality.mutate({
                  machineName: newMachineName.trim(), modality: newModCode,
                  aeTitle: newAeTitle || null, ipAddress: newIp || null,
                  port: newPort ? Number(newPort) : null, location: newLocation || null,
                });
                setNewMachineName(""); setNewAeTitle(""); setNewIp(""); setNewPort(""); setNewLocation("");
              }}>
                <Plus size={13} />Add
              </Button>
            </div>
          </div>

          {/* Modality cards */}
          {modalities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No imaging devices configured.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {modalities.map((m) => (
                <ModalityCard
                  key={m.id}
                  m={m}
                  onToggle={(id, field, val) => upsertModality.mutate({ id, [field]: val })}
                  onDelete={(id) => deleteModality.mutate(id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "mwl" && (
        <div className="space-y-6">
          <MwlSettingsTab
            key={settings.length}
            settings={settings}
            onSave={saveMwlKey}
          />
          <DicomMwlTestsTab />
        </div>
      )}

      {/* ── Viewer Settings Tab ── */}
      {activeTab === "viewer" && (
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-5 space-y-5">
            <h3 className="font-semibold text-sm">Viewer Mode</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ViewerField label="Viewer Mode" description="Which viewer buttons to show" type="select"
                options={["WEASIS", "OHIF", "BOTH"]} value={viewerMap["viewer_mode"] ?? "BOTH"}
                onSave={(v) => saveViewerKey("viewer_mode", v)} />
              <ViewerField label="Default Viewer" description="Primary viewer button" type="select"
                options={["OHIF", "WEASIS"]} value={viewerMap["default_viewer"] ?? "OHIF"}
                onSave={(v) => saveViewerKey("default_viewer", v)} />
              <ViewerField label="OHIF Enabled" type="select" options={["true", "false"]}
                value={viewerMap["ohif_enabled"] ?? "true"} onSave={(v) => saveViewerKey("ohif_enabled", v)} />
              <ViewerField label="Weasis Enabled" type="select" options={["true", "false"]}
                value={viewerMap["weasis_enabled"] ?? "true"} onSave={(v) => saveViewerKey("weasis_enabled", v)} />
              <ViewerField label="Viewer Open Mode" type="select" options={["NEW_TAB", "SAME_TAB", "EMBEDDED"]}
                value={viewerMap["viewer_open_mode"] ?? "NEW_TAB"} onSave={(v) => saveViewerKey("viewer_open_mode", v)} />
              <ViewerField label="Allow Public Viewer Links" description="False by default (requires login)" type="select"
                options={["false", "true"]} value={viewerMap["allow_public_viewer_links"] ?? "false"}
                onSave={(v) => saveViewerKey("allow_public_viewer_links", v)} />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-5">
            <h3 className="font-semibold text-sm">OHIF Viewer URLs</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ViewerField label="OHIF Base URL" description="e.g. http://192.168.1.10:3000" type="text"
                value={viewerMap["ohif_base_url"] ?? ""} onSave={(v) => saveViewerKey("ohif_base_url", v)}
                placeholder="http://192.168.1.10:3000" />
              <ViewerField label="DICOMweb Base URL" description="e.g. http://orthanc:8042/dicom-web" type="text"
                value={viewerMap["dicom_web_base_url"] ?? ""} onSave={(v) => saveViewerKey("dicom_web_base_url", v)}
                placeholder="http://192.168.1.10:8042/dicom-web" />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-5">
            <h3 className="font-semibold text-sm">Weasis / WADO URLs</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ViewerField label="WADO Base URL" description="Primary WADO-URI endpoint" type="text"
                value={viewerMap["wado_base_url"] ?? ""} onSave={(v) => saveViewerKey("wado_base_url", v)}
                placeholder="http://192.168.1.10:8080/wado" />
              <ViewerField label="Orthanc Base URL" description="e.g. http://192.168.1.10:8042" type="text"
                value={viewerMap["orthanc_base_url"] ?? ""} onSave={(v) => saveViewerKey("orthanc_base_url", v)}
                placeholder="http://192.168.1.10:8042" />
              <ViewerField label="Conquest WADO Base URL" type="text"
                value={viewerMap["conquest_wado_base_url"] ?? ""} onSave={(v) => saveViewerKey("conquest_wado_base_url", v)}
                placeholder="http://192.168.1.10:8080/wado" />
            </div>
          </div>

          <div className="rounded-xl border bg-blue-50 dark:bg-blue-950/20 p-4 text-sm text-blue-800 dark:text-blue-300">
            <p className="font-semibold mb-1">How viewer URLs are used</p>
            <ul className="space-y-1 text-blue-700 dark:text-blue-400 text-xs list-disc list-inside">
              <li><strong>OHIF Base URL</strong>: Used to build <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">{"<OHIF_BASE_URL>/viewer?StudyInstanceUIDs=<UID>"}</code></li>
              <li><strong>WADO Base URL</strong>: Used by Weasis URI scheme to fetch DICOM images</li>
              <li><strong>DICOMweb Base URL</strong>: Passed to OHIF as the DICOMweb source</li>
              <li>Settings are saved to <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">pacs_settings</code> with category <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">viewer</code></li>
            </ul>
          </div>
        </div>
      )}

      {/* ── Routing Rules Tab ── */}
      {activeTab === "routing" && (
        <RoutingRulesTab />
      )}
    </div>
  );
}

// ─── ViewerField component ────────────────────────────────────────────────────

function ViewerField({
  label, description, type, value, onSave, options, placeholder,
}: {
  label: string;
  description?: string;
  type: "text" | "select";
  value: string;
  onSave: (v: string) => void;
  options?: string[];
  placeholder?: string;
}) {
  const [val, setVal] = useState(value);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setVal(value); }, [value]);

  const dirty = val !== value;

  function save() {
    onSave(val);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
      <div className="flex gap-2">
        {type === "select" && options ? (
          <select
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="flex-1 h-8 text-sm border rounded-md px-2 bg-background"
          >
            {options.map((o) => <option key={o}>{o}</option>)}
          </select>
        ) : (
          <Input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder={placeholder}
            className="flex-1 h-8 text-sm"
          />
        )}
        <Button
          size="sm"
          className="h-8 px-2"
          variant={saved ? "outline" : dirty ? "default" : "outline"}
          onClick={save}
        >
          {saved ? "✓" : <Save size={12} />}
        </Button>
      </div>
    </div>
  );
}

// ─── RoutingRulesTab component ────────────────────────────────────────────────

interface RoutingRule {
  id: number;
  name: string;
  modalityType: string | null;
  sourceAeTitle: string | null;
  destinationPacs: string;
  destinationAeTitle: string | null;
  destinationIp: string | null;
  destinationPort: number | null;
  autoPush: boolean;
  priority: number;
  isEnabled: boolean;
  notes: string | null;
}

function RoutingRulesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: rules = [], isLoading } = useQuery<RoutingRule[]>({
    queryKey: ["routing-rules"],
    queryFn: () => api.get("/api/radiology/routing-rules"),
  });

  const saveMutation = useMutation({
    mutationFn: (body: object) => api.post("/api/radiology/routing-rules", body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["routing-rules"] }); toast({ title: "Rule saved" }); },
    onError: () => toast({ title: "Failed to save rule", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/api/radiology/routing-rules/${id}/toggle`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["routing-rules"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/radiology/routing-rules/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["routing-rules"] }); toast({ title: "Rule deleted" }); },
  });

  const [name, setName] = useState("");
  const [modality, setModality] = useState("*");
  const [destPacs, setDestPacs] = useState("CONQUEST");
  const [destAe, setDestAe] = useState("");
  const [destIp, setDestIp] = useState("");
  const [destPort, setDestPort] = useState("104");

  function addRule() {
    if (!name.trim()) return;
    saveMutation.mutate({
      name: name.trim(),
      modalityType: modality === "*" ? null : modality,
      destinationPacs: destPacs,
      destinationAeTitle: destAe || null,
      destinationIp: destIp || null,
      destinationPort: destPort ? Number(destPort) : null,
      autoPush: true,
      isEnabled: true,
    });
    setName(""); setDestAe(""); setDestIp(""); setDestPort("104");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-blue-50 dark:bg-blue-950/20 p-4 text-sm text-blue-800 dark:text-blue-300">
        <p className="font-semibold mb-1">What are routing rules?</p>
        <p className="text-xs text-blue-700 dark:text-blue-400">
          Routing rules tell the pull agent where to forward studies after retrieval.
          Example: all MR studies → ORTHANC2, all CT studies → CONQUEST_ARCHIVE.
          Rules are matched by modality type and source AE title in priority order.
        </p>
      </div>

      {/* Add new rule */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">Add Routing Rule</h3>
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Rule name (e.g. MRI → Orthanc)" value={name} onChange={(e) => setName(e.target.value)} className="w-52 h-8 text-sm" />
          <select value={modality} onChange={(e) => setModality(e.target.value)} className="h-8 text-sm border rounded-md px-2 bg-background">
            {["*", "MR", "CT", "CR", "DX", "US", "NM", "PT", "MG"].map((m) => (
              <option key={m} value={m}>{m === "*" ? "All modalities" : m}</option>
            ))}
          </select>
          <select value={destPacs} onChange={(e) => setDestPacs(e.target.value)} className="h-8 text-sm border rounded-md px-2 bg-background">
            <option>CONQUEST</option>
            <option>ORTHANC</option>
            <option>CUSTOM</option>
          </select>
          <Input placeholder="Dest AE Title" value={destAe} onChange={(e) => setDestAe(e.target.value)} className="w-28 h-8 text-sm" />
          <Input placeholder="Dest IP" value={destIp} onChange={(e) => setDestIp(e.target.value)} className="w-32 h-8 text-sm" />
          <Input placeholder="Port" value={destPort} onChange={(e) => setDestPort(e.target.value)} className="w-20 h-8 text-sm" type="number" />
          <Button size="sm" className="h-8" onClick={addRule} disabled={saveMutation.isPending}>
            <Plus size={13} /> Add Rule
          </Button>
        </div>
      </div>

      {/* Rules list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading rules…</p>
      ) : rules.length === 0 ? (
        <div className="rounded-xl border p-8 text-center text-muted-foreground text-sm">
          No routing rules yet. Add a rule above.
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-sm">Routing Rules ({rules.length})</h3>
            <span className="text-xs text-muted-foreground">Applied in priority order (lower number = higher priority)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 text-xs text-muted-foreground border-b">
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Modality</th>
                  <th className="px-4 py-2 text-left">Destination</th>
                  <th className="px-4 py-2 text-center">Priority</th>
                  <th className="px-4 py-2 text-center">Status</th>
                  <th className="px-4 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rules.map((r) => (
                  <tr key={r.id} className={`hover:bg-muted/20 transition-colors ${!r.isEnabled ? "opacity-50" : ""}`}>
                    <td className="px-4 py-2.5 font-medium">{r.name}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className="font-mono text-xs">{r.modalityType ?? "*"}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-xs">{r.destinationPacs}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.destinationAeTitle ?? ""}{r.destinationIp ? ` · ${r.destinationIp}:${r.destinationPort ?? 104}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-center text-xs font-mono">{r.priority}</td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => toggleMutation.mutate(r.id)}
                        className={`text-xs rounded-full px-2 py-0.5 font-medium ${r.isEnabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}
                      >
                        {r.isEnabled ? "Enabled" : "Disabled"}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 text-red-600 hover:text-red-700"
                        onClick={() => deleteMutation.mutate(r.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
