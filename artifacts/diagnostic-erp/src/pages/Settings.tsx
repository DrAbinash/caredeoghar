import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import {
  Plus, Trash2, Pencil, User2, Shield, CheckSquare, Square, Mail,
  Settings2, Users, Send, TestTube2, RefreshCw, X,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────── */

type AppUser = {
  id: number; name: string; email: string; role: string;
  permissions: string | null; pin: string | null; isActive: boolean;
};

type EmailSettings = {
  id?: number;
  smtpHost: string; smtpPort: string; smtpUser: string; smtpPassword: string;
  smtpSecure: boolean; fromAddress: string; fromName: string;
  adminEmail: string; extraRecipients: string;
  billEditEnabled: boolean; dailySummaryEnabled: boolean; dailySummaryTime: string;
};

/* ── Constants ──────────────────────────────────────────────── */

const ROLES = ["admin", "manager", "billing", "lab", "receptionist"];
const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  manager: "bg-purple-100 text-purple-700",
  billing: "bg-blue-100 text-blue-700",
  lab: "bg-green-100 text-green-700",
  receptionist: "bg-amber-100 text-amber-700",
};
const ALL_MODULES = [
  { path: "/", label: "Dashboard" },
  { path: "/patients", label: "Patients" },
  { path: "/register", label: "Quick Register" },
  { path: "/orders", label: "Orders" },
  { path: "/tests", label: "Test Catalog" },
  { path: "/billing", label: "Billing" },
  { path: "/payments", label: "Payments" },
  { path: "/doctors", label: "Doctors" },
  { path: "/reports", label: "Reports" },
  { path: "/report-generator", label: "Report Generator" },
  { path: "/inventory", label: "Inventory" },
  { path: "/referrals", label: "Referrals" },
  { path: "/accounting", label: "Accounting" },
  { path: "/settings", label: "Settings" },
];
const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  admin: ALL_MODULES.map(m => m.path),
  manager: ["/", "/patients", "/billing", "/payments", "/doctors", "/reports", "/referrals", "/accounting", "/register"],
  billing: ["/", "/patients", "/billing", "/payments", "/register"],
  lab: ["/orders", "/tests", "/report-generator", "/inventory"],
  receptionist: ["/", "/patients", "/orders", "/register"],
};

const TABS = [
  { id: "users", label: "Users", icon: Users },
  { id: "email", label: "Email Notifications", icon: Mail },
];

/* ── Main Component ─────────────────────────────────────────── */

export default function Settings() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>("users");

  return (
    <div className="pb-8">
      <PageHeader title="Settings" subtitle="User management and system configuration" />
      <div className="px-6">
        {/* Tab nav */}
        <div className="flex gap-1 bg-muted p-1 rounded-xl mb-6 w-fit">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all
                  ${tab === t.id ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === "users" && <UsersTab qc={qc} />}
        {tab === "email" && <EmailTab />}
      </div>
    </div>
  );
}

/* ── Users Tab ──────────────────────────────────────────────── */

function UsersTab({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const [open, setOpen] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  const { data: users = [], isLoading } = useQuery<AppUser[]>({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users"),
  });

  const saveUser = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editUser ? api.patch(`/api/users/${editUser.id}`, body) : api.post("/api/users", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setOpen(false); setEditUser(null); reset(); },
  });
  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => api.patch(`/api/users/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
  const deleteUser = useMutation({
    mutationFn: (id: number) => api.delete(`/api/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const { register, handleSubmit, reset, setValue, watch } = useForm<{
    name: string; email: string; role: string; pin: string;
  }>();

  const openAdd = () => {
    setEditUser(null);
    setSelectedPerms(DEFAULT_PERMISSIONS["receptionist"]);
    reset({ role: "receptionist" });
    setOpen(true);
  };
  const openEdit = (u: AppUser) => {
    setEditUser(u);
    setSelectedPerms(u.permissions ? JSON.parse(u.permissions) : DEFAULT_PERMISSIONS[u.role] ?? []);
    reset({ name: u.name, email: u.email, role: u.role, pin: u.pin ?? "" });
    setOpen(true);
  };
  const togglePerm = (path: string) =>
    setSelectedPerms(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]);

  const onSave = handleSubmit((d) => {
    saveUser.mutate({ ...d, permissions: selectedPerms, pin: d.pin || null });
  });

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">Manage user accounts, roles, and module access</p>
        <Button size="sm" onClick={openAdd}><Plus size={14} className="mr-1" /> Add User</Button>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}</div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <User2 size={36} className="mx-auto mb-3 opacity-30" />
            <p>No users yet. Add your first user to get started.</p>
          </div>
        ) : (
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-card-border">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Modules</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const perms: string[] = u.permissions ? JSON.parse(u.permissions) : [];
                  return (
                    <tr key={u.id} className="border-b border-card-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium">{u.name}</span>
                          {u.pin && <Shield size={11} className="text-muted-foreground" title="Has PIN" />}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3">
                        <Badge className={`${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-700"} text-xs capitalize`}>{u.role}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {perms.slice(0, 4).map(p => {
                            const mod = ALL_MODULES.find(m => m.path === p);
                            return mod ? <span key={p} className="text-xs bg-muted px-1.5 py-0.5 rounded">{mod.label}</span> : null;
                          })}
                          {perms.length > 4 && <span className="text-xs text-muted-foreground">+{perms.length - 4} more</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleActive.mutate({ id: u.id, isActive: !u.isActive })}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                        >
                          {u.isActive ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => openEdit(u)}><Pencil size={13} /></Button>
                          <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive" onClick={() => deleteUser.mutate(u.id)}><Trash2 size={13} /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="bg-muted/30 border border-card-border rounded-xl p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-3">Role Descriptions</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
            {[
              { role: "admin", desc: "Full access to all modules" },
              { role: "manager", desc: "Reports, billing, referrals, accounting" },
              { role: "billing", desc: "Patients, billing, payments, quick register" },
              { role: "lab", desc: "Orders, test catalog, report generator, inventory" },
              { role: "receptionist", desc: "Patients, orders, quick register" },
            ].map(r => (
              <div key={r.role} className="flex items-start gap-2">
                <Badge className={`${ROLE_COLORS[r.role]} text-xs capitalize flex-shrink-0 mt-0.5`}>{r.role}</Badge>
                <span className="text-muted-foreground">{r.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditUser(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editUser ? "Edit User" : "Add New User"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Full Name *</Label><Input {...register("name", { required: true })} className="mt-1" /></div>
              <div><Label>Email *</Label><Input type="email" {...register("email", { required: true })} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Role *</Label>
                <Select defaultValue={editUser?.role ?? "receptionist"} onValueChange={(v) => { setValue("role", v); setSelectedPerms(DEFAULT_PERMISSIONS[v] ?? []); }}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>PIN (4 digits)</Label><Input type="text" maxLength={4} pattern="[0-9]{4}" {...register("pin")} className="mt-1" placeholder="Optional" /></div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Module Permissions</Label>
                <div className="flex gap-2">
                  <button type="button" className="text-xs text-primary" onClick={() => setSelectedPerms(ALL_MODULES.map(m => m.path))}>All</button>
                  <span className="text-xs text-muted-foreground">·</span>
                  <button type="button" className="text-xs text-muted-foreground" onClick={() => setSelectedPerms([])}>None</button>
                </div>
              </div>
              <div className="border border-input rounded-lg p-3 grid grid-cols-2 gap-1.5">
                {ALL_MODULES.map(mod => {
                  const checked = selectedPerms.includes(mod.path);
                  return (
                    <button key={mod.path} type="button"
                      className={`flex items-center gap-2 text-sm text-left px-2 py-1.5 rounded-md transition-colors ${checked ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                      onClick={() => togglePerm(mod.path)}>
                      {checked ? <CheckSquare size={14} /> : <Square size={14} />}
                      {mod.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{selectedPerms.length} of {ALL_MODULES.length} modules selected</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveUser.isPending}>{saveUser.isPending ? "Saving…" : editUser ? "Update User" : "Add User"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── Email Tab ──────────────────────────────────────────────── */

function EmailTab() {
  const qc = useQueryClient();
  const [extraInput, setExtraInput] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [summaryResult, setSummaryResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data: settings, isLoading } = useQuery<EmailSettings | null>({
    queryKey: ["email-settings"],
    queryFn: () => api.get<EmailSettings | null>("/api/email-settings"),
  });

  const { register, handleSubmit, watch, setValue, getValues } = useForm<EmailSettings>({
    values: settings ?? {
      smtpHost: "", smtpPort: "587", smtpUser: "", smtpPassword: "",
      smtpSecure: false, fromAddress: "", fromName: "DiagnoCenter ERP",
      adminEmail: "", extraRecipients: "[]",
      billEditEnabled: true, dailySummaryEnabled: true, dailySummaryTime: "17:00",
    },
  });

  const extraList: string[] = (() => {
    try { return JSON.parse(watch("extraRecipients") || "[]"); }
    catch { return []; }
  })();

  const addExtra = () => {
    if (!extraInput.trim()) return;
    const updated = [...extraList, extraInput.trim()];
    setValue("extraRecipients", JSON.stringify(updated));
    setExtraInput("");
  };
  const removeExtra = (email: string) => {
    setValue("extraRecipients", JSON.stringify(extraList.filter(e => e !== email)));
  };

  const saveSettings = useMutation({
    mutationFn: (body: EmailSettings) => api.post("/api/email-settings", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-settings"] }),
  });

  const sendTest = useMutation({
    mutationFn: () => api.post<{ ok: boolean; message: string }>("/api/email-settings/test", {}),
    onSuccess: (data) => setTestResult(data),
    onError: (e) => setTestResult({ ok: false, message: e.message }),
  });

  const sendSummary = useMutation({
    mutationFn: () => api.post<{ ok: boolean; message: string }>("/api/email-settings/send-summary", {}),
    onSuccess: (data) => setSummaryResult(data),
    onError: (e) => setSummaryResult({ ok: false, message: e.message }),
  });

  const onSave = handleSubmit((d) => saveSettings.mutate(d));

  if (isLoading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-muted rounded-xl animate-pulse" />)}</div>;

  return (
    <form onSubmit={onSave} className="space-y-5 max-w-2xl">
      {/* SMTP Config */}
      <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Settings2 size={15} className="text-primary" />
          <h3 className="font-semibold text-sm">SMTP Configuration</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>SMTP Host</Label><Input {...register("smtpHost")} className="mt-1" placeholder="smtp.gmail.com" /></div>
          <div><Label>Port</Label><Input type="number" {...register("smtpPort")} className="mt-1" placeholder="587" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Username / Email</Label><Input {...register("smtpUser")} className="mt-1" placeholder="you@gmail.com" /></div>
          <div><Label>Password / App Password</Label><Input type="password" {...register("smtpPassword")} className="mt-1" placeholder="••••••••" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>From Address</Label><Input {...register("fromAddress")} className="mt-1" placeholder="noreply@yourclinic.com" /></div>
          <div><Label>From Name</Label><Input {...register("fromName")} className="mt-1" /></div>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <input type="checkbox" id="smtpSecure" checked={watch("smtpSecure")} onChange={e => setValue("smtpSecure", e.target.checked)} className="rounded" />
          <label htmlFor="smtpSecure" className="text-sm cursor-pointer">Use SSL/TLS (port 465)</label>
        </div>
        <p className="text-xs text-muted-foreground">For Gmail, enable 2FA and use an App Password instead of your account password.</p>
      </div>

      {/* Recipients */}
      <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Mail size={15} className="text-primary" />
          <h3 className="font-semibold text-sm">Recipients</h3>
        </div>
        <div>
          <Label>Admin Email (always notified)</Label>
          <Input type="email" {...register("adminEmail")} className="mt-1" placeholder="admin@yourclinic.com" />
        </div>
        <div>
          <Label>Additional Recipients</Label>
          <div className="flex gap-2 mt-1">
            <Input
              type="email"
              value={extraInput}
              onChange={e => setExtraInput(e.target.value)}
              placeholder="Add email and press Enter"
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addExtra(); } }}
              className="flex-1"
            />
            <Button type="button" variant="outline" size="sm" onClick={addExtra}><Plus size={14} /></Button>
          </div>
          {extraList.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {extraList.map(email => (
                <span key={email} className="flex items-center gap-1 bg-muted text-xs px-2 py-1 rounded-full">
                  {email}
                  <button type="button" onClick={() => removeExtra(email)}><X size={11} /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Notification Triggers */}
      <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Send size={15} className="text-primary" />
          <h3 className="font-semibold text-sm">Notification Triggers</h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="text-sm font-medium">Bill Edit Notifications</p>
              <p className="text-xs text-muted-foreground">Send email whenever a bill is edited with reason</p>
            </div>
            <input
              type="checkbox"
              checked={watch("billEditEnabled")}
              onChange={e => setValue("billEditEnabled", e.target.checked)}
              className="rounded w-4 h-4"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
            <div>
              <p className="text-sm font-medium">Daily Summary Report</p>
              <p className="text-xs text-muted-foreground">Daily billing summary — bills created, payments collected, edits made</p>
            </div>
            <input
              type="checkbox"
              checked={watch("dailySummaryEnabled")}
              onChange={e => setValue("dailySummaryEnabled", e.target.checked)}
              className="rounded w-4 h-4"
            />
          </div>

          {watch("dailySummaryEnabled") && (
            <div className="ml-4">
              <Label>Send daily summary at</Label>
              <Input type="time" {...register("dailySummaryTime")} className="mt-1 w-36" />
              <p className="text-xs text-muted-foreground mt-1">Default: 17:00 (5 PM). Server checks every minute.</p>
            </div>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <Button type="submit" disabled={saveSettings.isPending}>
          {saveSettings.isPending ? <><RefreshCw size={14} className="mr-1 animate-spin" /> Saving…</> : "Save Settings"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={sendTest.isPending}
          onClick={() => { setTestResult(null); sendTest.mutate(); }}
        >
          <TestTube2 size={14} className="mr-1" />
          {sendTest.isPending ? "Sending…" : "Send Test Email"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={sendSummary.isPending}
          onClick={() => { setSummaryResult(null); sendSummary.mutate(); }}
        >
          <Send size={14} className="mr-1" />
          {sendSummary.isPending ? "Sending…" : "Send Summary Now"}
        </Button>
      </div>

      {testResult && (
        <div className={`text-sm px-4 py-2.5 rounded-lg ${testResult.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {testResult.ok ? "✓ " : "✗ "}{testResult.message}
        </div>
      )}
      {summaryResult && (
        <div className={`text-sm px-4 py-2.5 rounded-lg ${summaryResult.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {summaryResult.ok ? "✓ " : "✗ "}{summaryResult.message}
        </div>
      )}

      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-xs text-blue-800 dark:text-blue-300 space-y-1">
        <p className="font-semibold">Setup Tips</p>
        <p>• Gmail: use an App Password (Google Account → Security → App Passwords)</p>
        <p>• Outlook/Microsoft 365: host <code>smtp.office365.com</code>, port 587, TLS off</p>
        <p>• Zoho Mail: host <code>smtp.zoho.in</code>, port 587</p>
        <p>• Daily summary fires at the configured time — server checks every minute</p>
      </div>
    </form>
  );
}
