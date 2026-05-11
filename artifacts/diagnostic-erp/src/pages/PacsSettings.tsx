import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Save, RefreshCw, Trash2, Server, Settings2 } from "lucide-react";

type Setting = { id: number; key: string; value: string | null; category: string; isSecret: boolean };
type Modality = {
  id: number; machineName: string; modality: string | null; aeTitle: string | null;
  ipAddress: string | null; port: number | null; location: string | null;
  autoSendEnabled: boolean; isActive: boolean;
  lastConnectionStatus: string | null; lastSeenAt: string | null;
};

const SETTING_CATEGORIES = ["general", "conquest", "mwl", "delivery", "notification"];
const MODALITY_CODES = ["MR", "CT", "CR", "DX", "US", "MG", "XA", "OT"];

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

export default function PacsSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"settings" | "modalities">("settings");
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

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="PACS Settings"
        subtitle="Configure Conquest PACS connection, modalities, and delivery options"
        actions={
          <Button variant="outline" size="sm" onClick={() => { refetchSettings(); refetchModalities(); }} disabled={fetchingSettings || fetchingModalities}>
            <RefreshCw size={14} className={fetchingSettings || fetchingModalities ? "animate-spin" : ""} />
            Refresh
          </Button>
        }
      />

      {/* Tab bar */}
      <div className="flex gap-2 border-b">
        {(["settings", "modalities"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors capitalize ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {tab === "settings" ? <><Settings2 size={14} className="inline mr-1" />Settings</> : <><Server size={14} className="inline mr-1" />Modalities</>}
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
          {/* Add new modality */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h3 className="text-sm font-semibold">Add Imaging Device</h3>
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
    </div>
  );
}
