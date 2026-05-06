import { useState, useEffect } from "react";
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
  Users, Download, FileText, BookOpen, ClipboardList, CreditCard,
  FlaskConical, Boxes, ShieldCheck, FileDown, KeyRound, Eye, EyeOff,
  Tag, Building2, Image as ImageIcon, Upload, MessageCircle, Printer,
  Search, Globe, Copy, ExternalLink, Check, Network, MapPin, Database,
  RefreshCcw, FileCode, Send,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type AppUser = {
  id: number; name: string; email: string; role: string;
  permissions: string | null;
  // Server returns a boolean instead of the hashed PIN string
  pin?: string | null;
  hasPin?: boolean;
  isActive: boolean;
  maxDiscount: number | null;
  username?: string | null;
  photoDataUrl?: string | null;
  mustChangePin?: boolean;
};

type EmailSettings = {
  id?: number;
  smtpHost: string; smtpPort: string; smtpUser: string; smtpPassword: string;
  smtpSecure: boolean; fromAddress: string; fromName: string;
  adminEmail: string; extraRecipients: string;
  billEditEnabled: boolean; dailySummaryEnabled: boolean; dailySummaryTime: string;
};

type ManualSection = {
  title: string;
  icon: typeof FileText;
  points: string[];
};

type ChangePasswordForm = {
  userId: string;
  currentPin: string;
  newPin: string;
  confirmPin: string;
};

const ROLES = ["super_admin", "admin", "manager", "accountant", "billing", "lab", "receptionist"];
const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-rose-100 text-rose-800 font-bold",
  admin: "bg-red-100 text-red-700",
  manager: "bg-purple-100 text-purple-700",
  accountant: "bg-indigo-100 text-indigo-700",
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
  { path: "/discounts", label: "Discounts" },
  { path: "/settings", label: "Settings" },
];
const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  super_admin: ALL_MODULES.map(m => m.path),
  admin: ALL_MODULES.map(m => m.path),
  manager: ["/", "/patients", "/billing", "/payments", "/doctors", "/reports", "/referrals", "/accounting", "/register", "/discounts"],
  accountant: ["/", "/accounting", "/reports", "/billing", "/payments"],
  billing: ["/", "/patients", "/billing", "/payments", "/register", "/discounts"],
  lab: ["/orders", "/tests", "/report-generator", "/inventory"],
  receptionist: ["/", "/patients", "/orders", "/register"],
};

const TABS = [
  { id: "clinic", label: "Clinic Info", icon: Building2 },
  { id: "users", label: "Users", icon: Users },
  { id: "departments", label: "Departments", icon: Network },
  { id: "branches", label: "Branches", icon: MapPin },
  { id: "report-templates", label: "Report Templates", icon: FileCode },
  { id: "portal", label: "Patient Portal", icon: Globe },
  { id: "form-f", label: "Form F Tests", icon: FileText },
  { id: "email", label: "Email Notifications", icon: Mail },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "printers", label: "Printers", icon: Printer },
  { id: "discount-reasons", label: "Discount Reasons", icon: Tag },
  { id: "backup", label: "Backup", icon: Database },
  { id: "manual", label: "User Manual", icon: FileDown },
  { id: "password", label: "Change Password", icon: KeyRound },
];

const MANUAL_SECTIONS: ManualSection[] = [
  { title: "Getting Started", icon: BookOpen, points: ["Use the Dashboard to review daily counts, revenue, and pending work.", "Register patients first, then create test orders, then generate bills.", "Use the Billing module to record payments and monitor balances."] },
  { title: "Core Workflow", icon: ClipboardList, points: ["Patients → Orders → Bills → Payments → Reports.", "Lab staff can process tests and publish report results.", "Accounting can review vouchers, ledgers, and summaries."] },
  { title: "Billing & Payments", icon: CreditCard, points: ["Bills auto-calculate subtotal, discount, tax, paid amount, and balance.", "Partial payments update bill status automatically.", "Super Admin can edit bill totals or delete bills with audit tracking."] },
  { title: "Inventory & Lab", icon: Boxes, points: ["Track stock movements, purchase entries, and low-stock warnings.", "Use the test catalog to maintain pricing and categories.", "Generate and manage diagnostic reports from the report generator."] },
  { title: "Referrals & Doctors", icon: FlaskConical, points: ["Manage referring doctors and commission-linked records.", "Doctor name changes automatically reflect in commission-linked modules.", "Use doctor profiles to review referral performance."] },
  { title: "Administration", icon: ShieldCheck, points: ["Settings controls users, roles, permissions, and notification preferences.", "Super Admin Portal is a separate session-based app for irreversible actions.", "All critical actions are audited for traceability."] },
];

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildManualText() {
  return [
    "Diagnostic Center Billing ERP User Manual",
    "",
    "1. Getting Started",
    "- Use the Dashboard to review daily counts, revenue, and pending work.",
    "- Register patients first, then create test orders, then generate bills.",
    "- Use the Billing module to record payments and monitor balances.",
    "",
    "2. Core Workflow",
    "- Patients → Orders → Bills → Payments → Reports.",
    "- Lab staff can process tests and publish report results.",
    "- Accounting can review vouchers, ledgers, and summaries.",
    "",
    "3. Billing & Payments",
    "- Bills auto-calculate subtotal, discount, tax, paid amount, and balance.",
    "- Partial payments update bill status automatically.",
    "- Super Admin can edit bill totals or delete bills with audit tracking.",
    "",
    "4. Inventory & Lab",
    "- Track stock movements, purchase entries, and low-stock warnings.",
    "- Use the test catalog to maintain pricing and categories.",
    "- Generate and manage diagnostic reports from the report generator.",
    "",
    "5. Referrals & Doctors",
    "- Manage referring doctors and commission-linked records.",
    "- Doctor name changes automatically reflect in commission-linked modules.",
    "- Use doctor profiles to review referral performance.",
    "",
    "6. Administration",
    "- Settings controls users, roles, permissions, and notification preferences.",
    "- Super Admin Portal is a separate session-based app for irreversible actions.",
    "- All critical actions are audited for traceability.",
  ].join("\n");
}

export default function Settings() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>("users");
  return (
    <div className="pb-8">
      <PageHeader title="Settings" subtitle="User management, system configuration, and software documentation" />
      <div className="px-6">
        <div className="flex flex-wrap gap-1 bg-muted p-1 rounded-xl mb-6 w-fit">
          {TABS.map(t => {
            const Icon = t.icon;
            return <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${tab === t.id ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}><Icon size={14} />{t.label}</button>;
          })}
        </div>
        {tab === "clinic" && <ClinicInfoTab />}
        {tab === "users" && <UsersTab qc={qc} />}
        {tab === "departments" && <DepartmentsTab />}
        {tab === "branches" && <BranchesTab />}
        {tab === "report-templates" && <ReportTemplatesTab />}
        {tab === "portal" && <PatientPortalTab />}
        {tab === "form-f" && <FormFTestsTab />}
        {tab === "email" && <EmailTab />}
        {tab === "whatsapp" && <WhatsappTab />}
        {tab === "printers" && <PrinterTab />}
        {tab === "discount-reasons" && <DiscountReasonsTab />}
        {tab === "backup" && <BackupTab />}
        {tab === "manual" && <ManualTab />}
        {tab === "password" && <ChangePasswordTab />}
      </div>
    </div>
  );
}

function UsersTab({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const [open, setOpen] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const { data: users = [], isLoading } = useQuery<AppUser[]>({ queryKey: ["users"], queryFn: () => api.get("/api/users") });
  const saveUser = useMutation({
    mutationFn: (body: Record<string, unknown>) => editUser ? api.patch(`/api/users/${editUser.id}`, body) : api.post("/api/users", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setOpen(false); setEditUser(null); setPhotoDataUrl(null); setSaveErr(""); reset(); },
    onError: (e: Error) => setSaveErr(e.message || "Could not save user"),
  });
  const toggleActive = useMutation({ mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => api.patch(`/api/users/${id}`, { isActive }), onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }) });
  const deleteUser = useMutation({ mutationFn: (id: number) => api.delete(`/api/users/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }) });
  const { register, handleSubmit, reset, setValue, watch } = useForm<{ name: string; email: string; username: string; role: string; pin: string; maxDiscount: string; }>();

  const openAdd = () => {
    setEditUser(null);
    setSelectedPerms(DEFAULT_PERMISSIONS["receptionist"]);
    setPhotoDataUrl(null);
    setPhotoErr(""); setSaveErr("");
    reset({ name: "", email: "", username: "", role: "receptionist", pin: "", maxDiscount: "" });
    setOpen(true);
  };
  const openEdit = (u: AppUser) => {
    setEditUser(u);
    setSelectedPerms(u.permissions ? JSON.parse(u.permissions) : DEFAULT_PERMISSIONS[u.role] ?? []);
    setPhotoDataUrl(u.photoDataUrl ?? null);
    setPhotoErr(""); setSaveErr("");
    // PIN field stays blank on edit — leaving it blank means "don't change".
    // Typing a new value resets it (and forces a change on next login).
    reset({ name: u.name, email: u.email, username: u.username ?? "", role: u.role, pin: "", maxDiscount: u.maxDiscount != null ? String(u.maxDiscount) : "" });
    setOpen(true);
  };
  const togglePerm = (path: string) => setSelectedPerms(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]);

  const onPhotoChange = (file: File | null) => {
    setPhotoErr("");
    if (!file) return;
    if (!file.type.startsWith("image/")) { setPhotoErr("Please pick an image file"); return; }
    if (file.size > 800_000) { setPhotoErr("Photo too large — please pick an image under 800 KB"); return; }
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const onSave = handleSubmit((d) => {
    setSaveErr("");
    const body: Record<string, unknown> = {
      name: d.name?.trim(),
      email: d.email?.trim(),
      // Lowercase + trim — matches what the server stores for case-insensitive
      // login. Empty string sent so the server clears legacy values when needed.
      username: (d.username ?? "").trim().toLowerCase(),
      role: d.role,
      permissions: selectedPerms,
      maxDiscount: d.maxDiscount !== "" ? Number(d.maxDiscount) : null,
      photoDataUrl: photoDataUrl,
    };
    // Only include PIN when admin actually typed one — blank means "leave it"
    if (d.pin && d.pin.trim().length > 0) body.pin = d.pin.trim();
    saveUser.mutate(body);
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
          <div className="text-center py-16 text-muted-foreground"><User2 size={36} className="mx-auto mb-3 opacity-30" /><p>No users yet. Add your first user to get started.</p></div>
        ) : (
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-card-border">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Username</th>
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
                  const hasPin = !!(u.hasPin ?? u.pin);
                  return (
                    <tr key={u.id} className="border-b border-card-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {u.photoDataUrl ? (
                            <img src={u.photoDataUrl} alt="" className="w-7 h-7 rounded-full object-cover border" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{u.name.charAt(0).toUpperCase()}</div>
                          )}
                          <span className="font-medium">{u.name}</span>
                          {hasPin && <Shield size={11} className="text-muted-foreground" />}
                          {u.mustChangePin && <span title="Must change PIN on next login" className="text-[10px] text-amber-600 font-medium">PIN reset</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{u.username || <span className="opacity-40">—</span>}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3"><Badge className={`${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-700"} text-xs capitalize`}>{u.role}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {perms.slice(0, 4).map(p => { const mod = ALL_MODULES.find(m => m.path === p); return mod ? <span key={p} className="text-xs bg-muted px-1.5 py-0.5 rounded">{mod.label}</span> : null; })}
                          {perms.length > 4 && <span className="text-xs text-muted-foreground">+{perms.length - 4} more</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleActive.mutate({ id: u.id, isActive: !u.isActive })} className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{u.isActive ? "Active" : "Inactive"}</button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => openEdit(u)}><Pencil size={13} /></Button>
                          <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive" onClick={() => { if (confirm(`Delete user "${u.name}"?`)) deleteUser.mutate(u.id); }}><Trash2 size={13} /></Button>
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
              { role: "super_admin", desc: "All permissions + delete/super-edit bills" },
              { role: "admin", desc: "Full access to all modules" },
              { role: "manager", desc: "Reports, billing, referrals, accounting, discounts" },
              { role: "accountant", desc: "Accounting, reports, billing & payments view" },
              { role: "billing", desc: "Patients, billing, payments, quick register, discounts" },
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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editUser ? "Edit User" : "Add User"}</DialogTitle></DialogHeader>
          <form onSubmit={onSave} className="space-y-4">
            {/* Photo at the top so admins can recognize the staff member at a glance */}
            <div className="flex items-center gap-4">
              {photoDataUrl ? (
                <img src={photoDataUrl} alt="Staff" className="w-20 h-20 rounded-full object-cover border-2 border-card-border" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-muted border-2 border-dashed border-card-border flex items-center justify-center text-muted-foreground"><User2 size={28} /></div>
              )}
              <div className="space-y-2">
                <input id="staff-photo-input" type="file" accept="image/*" className="hidden" onChange={(e) => onPhotoChange(e.target.files?.[0] ?? null)} />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById("staff-photo-input")?.click()}>
                    <Upload size={13} className="mr-1.5" /> {photoDataUrl ? "Change Photo" : "Add Photo"}
                  </Button>
                  {photoDataUrl && (
                    <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setPhotoDataUrl(null)}><Trash2 size={13} className="mr-1.5" /> Remove</Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">Optional. Square image works best. Max 800 KB.</p>
                {photoErr && <p className="text-xs text-destructive">{photoErr}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name *</Label>
                <Input {...register("name", { required: true })} className="mt-1" placeholder="Dr. Asha Verma" />
              </div>
              <div>
                <Label>Username *</Label>
                <Input {...register("username", { required: true })} className="mt-1" autoComplete="off" placeholder="asha" />
                <p className="text-[11px] text-muted-foreground mt-1">Used for staff sign-in. Letters, numbers, dot/underscore.</p>
              </div>
              <div>
                <Label>Email *</Label>
                <Input type="email" {...register("email", { required: true })} className="mt-1" />
              </div>
              <div>
                <Label>Role *</Label>
                <Select value={watch("role")} onValueChange={(v) => setValue("role", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{editUser ? "Reset PIN (leave blank to keep)" : "PIN *"}</Label>
                <Input type="password" inputMode="numeric" autoComplete="new-password" {...register("pin", editUser ? {} : { required: true, minLength: 6 })} className="mt-1" placeholder={editUser ? "•••••• (unchanged)" : "At least 6 characters"} />
                <p className="text-[11px] text-muted-foreground mt-1">User will be forced to set their own PIN on next sign-in.</p>
              </div>
              <div>
                <Label>Max Discount %</Label>
                <Input type="number" {...register("maxDiscount")} className="mt-1" placeholder="e.g. 20" />
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-3">Module Permissions</p>
              <div className="grid grid-cols-2 gap-2">
                {ALL_MODULES.map(m => (
                  <button key={m.path} type="button" onClick={() => togglePerm(m.path)} className="flex items-center gap-2 text-sm p-2 rounded-lg border border-border hover:bg-muted/50 text-left">
                    {selectedPerms.includes(m.path) ? <CheckSquare size={14} /> : <Square size={14} />}
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {saveErr && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">{saveErr}</div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveUser.isPending}>{saveUser.isPending ? "Saving…" : "Save"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

type ClinicSettings = {
  id?: number;
  name: string; tagline: string; address: string; email: string; phone: string;
  website: string; gstin: string; logoDataUrl: string | null; footerNote: string;
  patientPhotoEnabled?: boolean;
  showTatOnBill?: boolean;
};

function ClinicInfoTab() {
  const qc = useQueryClient();
  const { data: settings } = useQuery<ClinicSettings>({
    queryKey: ["clinic-settings"],
    queryFn: () => api.get("/api/clinic-settings"),
  });
  const [form, setForm] = useState<ClinicSettings | null>(null);
  const [uploadErr, setUploadErr] = useState("");

  const current = form ?? settings ?? null;

  const save = useMutation({
    mutationFn: (body: ClinicSettings) => api.put("/api/clinic-settings", body),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["clinic-settings"] });
      setForm(saved as ClinicSettings);
    },
  });

  const onLogoChange = (file: File | null) => {
    setUploadErr("");
    if (!file) return;
    if (!file.type.startsWith("image/")) { setUploadErr("Please upload an image file"); return; }
    if (file.size > 1_500_000) { setUploadErr("Image too large (max 1.5 MB). Use a smaller logo."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setForm({ ...(current as ClinicSettings), logoDataUrl: String(reader.result) });
    };
    reader.readAsDataURL(file);
  };

  if (!current) {
    return <div className="bg-card border border-card-border rounded-xl p-8 text-center text-muted-foreground">Loading clinic info…</div>;
  }

  const update = (k: keyof ClinicSettings, v: string) => setForm({ ...current, [k]: v });

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-card border border-card-border rounded-xl p-5 space-y-4">
        <div>
          <h2 className="font-bold text-lg">Hospital / Diagnostic Center Details</h2>
          <p className="text-sm text-muted-foreground">These details appear on every printed bill and report.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Center Name *</Label>
            <Input value={current.name} onChange={(e) => update("name", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Tagline / Sub-title</Label>
            <Input value={current.tagline} onChange={(e) => update("tagline", e.target.value)} className="mt-1" placeholder="e.g. Diagnostic & Pathology Services" />
          </div>
          <div className="md:col-span-2">
            <Label>Address</Label>
            <Input value={current.address} onChange={(e) => update("address", e.target.value)} className="mt-1" placeholder="Full address" />
          </div>
          <div>
            <Label>Mobile / Phone Number</Label>
            <Input value={current.phone} onChange={(e) => update("phone", e.target.value)} className="mt-1" placeholder="+91 ..." />
          </div>
          <div>
            <Label>Email Id</Label>
            <Input type="email" value={current.email} onChange={(e) => update("email", e.target.value)} className="mt-1" placeholder="info@example.com" />
          </div>
          <div>
            <Label>Website</Label>
            <Input value={current.website} onChange={(e) => update("website", e.target.value)} className="mt-1" placeholder="www.example.com" />
          </div>
          <div>
            <Label>GSTIN / Tax No.</Label>
            <Input value={current.gstin} onChange={(e) => update("gstin", e.target.value)} className="mt-1" />
          </div>
          <div className="md:col-span-2">
            <Label>Bill Footer Note</Label>
            <Input value={current.footerNote} onChange={(e) => update("footerNote", e.target.value)} className="mt-1" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-card-border">
          <Button variant="outline" type="button" onClick={() => setForm(settings ?? null)}>Reset</Button>
          <Button onClick={() => save.mutate(current)} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2"><User2 size={16} /> Patient Photo Capture</h2>
            <p className="text-sm text-muted-foreground">Allow uploading a photograph for each patient (stored in DB, &lt; 1.5 MB each).</p>
          </div>
          <button
            type="button"
            onClick={() => setForm({ ...current, patientPhotoEnabled: !current.patientPhotoEnabled })}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${current.patientPhotoEnabled ? "bg-green-50 border-green-300 dark:bg-green-950/30 dark:border-green-800" : "bg-muted/30 border-card-border"}`}
          >
            <span className="text-sm font-medium">{current.patientPhotoEnabled ? "Enabled" : "Disabled"}</span>
            <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${current.patientPhotoEnabled ? "bg-green-500" : "bg-muted-foreground/40"}`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${current.patientPhotoEnabled ? "translate-x-5" : "translate-x-1"}`} />
            </span>
          </button>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            When enabled, the New Patient form shows a photo upload field and the patient profile displays the photograph. Click <strong>Save Changes</strong> to apply.
          </p>
        </div>

        <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">⏱️ Show TAT on Bill</h2>
            <p className="text-sm text-muted-foreground">When enabled, the printed bill shows a "TAT" (turnaround time) column with each test's expected duration.</p>
          </div>
          <button
            type="button"
            onClick={() => setForm({ ...current, showTatOnBill: !current.showTatOnBill })}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${current.showTatOnBill ? "bg-green-50 border-green-300 dark:bg-green-950/30 dark:border-green-800" : "bg-muted/30 border-card-border"}`}
          >
            <span className="text-sm font-medium">{current.showTatOnBill ? "Enabled" : "Disabled"}</span>
            <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${current.showTatOnBill ? "bg-green-500" : "bg-muted-foreground/40"}`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${current.showTatOnBill ? "translate-x-5" : "translate-x-1"}`} />
            </span>
          </button>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Click <strong>Save Changes</strong> after toggling to apply.
          </p>
        </div>

        <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2"><ImageIcon size={16} /> Logo</h2>
            <p className="text-sm text-muted-foreground">Recommended: square or wide PNG/JPG, &lt; 1.5 MB.</p>
          </div>
        <div className="border-2 border-dashed border-card-border rounded-lg p-4 flex items-center justify-center bg-muted/30 min-h-[180px]">
          {current.logoDataUrl ? (
            <img src={current.logoDataUrl} alt="Logo preview" className="max-h-40 max-w-full object-contain" />
          ) : (
            <div className="text-center text-muted-foreground text-sm">
              <ImageIcon size={36} className="mx-auto mb-2 opacity-30" />
              No logo uploaded
            </div>
          )}
        </div>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => onLogoChange(e.target.files?.[0] ?? null)}
          className="hidden"
          id="clinic-logo-input"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => { document.getElementById("clinic-logo-input")?.click(); }}
          className="w-full"
        >
          <Upload size={14} className="mr-2" /> Choose Logo Image
        </Button>
        {current.logoDataUrl && (
          <Button
            variant="ghost"
            className="w-full text-destructive hover:text-destructive"
            onClick={() => setForm({ ...current, logoDataUrl: null })}
          >
            <Trash2 size={14} className="mr-2" /> Remove Logo
          </Button>
        )}
        {uploadErr && <p className="text-xs text-destructive">{uploadErr}</p>}
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Click <strong>Save Changes</strong> after selecting a logo.
        </p>
        </div>
      </div>
    </div>
  );
}

type PortalConfig = {
  portalEnabled: boolean;
  portalHeading: string;
  portalWelcomeMessage: string;
  portalAllowAppointmentBooking: boolean;
  portalAllowProfileEdit: boolean;
  name: string;
};

function PatientPortalTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<PortalConfig>({
    queryKey: ["clinic-settings"],
    queryFn: () => api.get("/api/clinic-settings"),
  });
  const [form, setForm] = useState<PortalConfig | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (data) setForm(data); }, [data]);

  const save = useMutation({
    mutationFn: (body: Partial<PortalConfig>) => api.put("/api/clinic-settings", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clinic-settings"] }),
  });

  if (isLoading || !form) {
    return <div className="bg-card border border-card-border rounded-xl p-8 text-center text-muted-foreground">Loading…</div>;
  }

  const portalUrl = `${window.location.origin}${import.meta.env.BASE_URL || "/"}portal`.replace(/\/+/g, "/").replace(":/", "://");

  const Toggle = ({ value, onChange, label, hint }: { value: boolean; onChange: (v: boolean) => void; label: string; hint: string }) => (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`w-full text-left flex items-start justify-between gap-3 px-4 py-3 rounded-lg border transition-colors ${value ? "bg-green-50 border-green-300 dark:bg-green-950/30 dark:border-green-800" : "bg-muted/30 border-card-border"}`}
    >
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors mt-0.5 shrink-0 ${value ? "bg-green-500" : "bg-muted-foreground/40"}`}>
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${value ? "translate-x-5" : "translate-x-1"}`} />
      </span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-900 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-500 flex items-center justify-center shrink-0">
            <Globe size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-lg">Public Patient Portal</h2>
            <p className="text-sm text-muted-foreground mt-1">
              A simple, mobile-friendly web page where your patients can sign in with their mobile number to view bills, lab reports, book appointments, and update their profile. Staff can also sign in to access the main system.
            </p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left: enable + URL */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-card border border-card-border rounded-xl p-5 space-y-3">
            <div>
              <h3 className="font-bold">Status</h3>
              <p className="text-xs text-muted-foreground">Turn the public portal on or off.</p>
            </div>
            <Toggle
              value={form.portalEnabled}
              onChange={(v) => setForm({ ...form, portalEnabled: v })}
              label={form.portalEnabled ? "Portal is ON — visible to public" : "Portal is OFF — hidden"}
              hint={form.portalEnabled ? "Anyone with the link can access the portal" : "Visiting the link will show 'Portal Not Available'"}
            />
          </div>

          <div className="bg-card border border-card-border rounded-xl p-5 space-y-3">
            <div>
              <h3 className="font-bold">Share Link</h3>
              <p className="text-xs text-muted-foreground">Give this link to your patients (print on bills, send via SMS / WhatsApp).</p>
            </div>
            <div className="flex items-center gap-2 bg-muted/50 border border-card-border rounded-lg p-2">
              <code className="flex-1 text-xs truncate font-mono">{portalUrl}</code>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => { navigator.clipboard.writeText(portalUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
                title="Copy link"
              >
                {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
              </Button>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(portalUrl, "_blank")}
            >
              <ExternalLink size={14} className="mr-2" /> Open Portal in new tab
            </Button>
          </div>
        </div>

        {/* Right: customization */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
            <div>
              <h3 className="font-bold">Page Customization</h3>
              <p className="text-xs text-muted-foreground">What patients see when they open the portal.</p>
            </div>
            <div>
              <Label>Heading</Label>
              <Input
                value={form.portalHeading}
                onChange={(e) => setForm({ ...form, portalHeading: e.target.value })}
                placeholder={form.name || "e.g. CARE Diagnostics — Patient Portal"}
                className="mt-1"
                maxLength={120}
              />
              <p className="text-[11px] text-muted-foreground mt-1">If left blank, your clinic name will be used.</p>
            </div>
            <div>
              <Label>Welcome Message</Label>
              <textarea
                value={form.portalWelcomeMessage}
                onChange={(e) => setForm({ ...form, portalWelcomeMessage: e.target.value })}
                placeholder="e.g. Access your lab reports, bills and appointment bookings — anytime, anywhere."
                rows={3}
                maxLength={500}
                className="w-full mt-1 rounded-md border border-card-border bg-background px-3 py-2 text-sm"
              />
              <p className="text-[11px] text-muted-foreground mt-1">{form.portalWelcomeMessage.length}/500 characters. Shown below the heading.</p>
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-xl p-5 space-y-3">
            <div>
              <h3 className="font-bold">Patient Permissions</h3>
              <p className="text-xs text-muted-foreground">Control what logged-in patients can do.</p>
            </div>
            <Toggle
              value={form.portalAllowAppointmentBooking}
              onChange={(v) => setForm({ ...form, portalAllowAppointmentBooking: v })}
              label="Allow appointment booking"
              hint="Patients can self-book new appointments online."
            />
            <Toggle
              value={form.portalAllowProfileEdit}
              onChange={(v) => setForm({ ...form, portalAllowProfileEdit: v })}
              label="Allow patients to edit their profile"
              hint="Patients can update name, mobile, email, address, blood group themselves."
            />
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-4 text-sm">
            <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">Login methods</p>
            <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-disc pl-4">
              <li><strong>Patients</strong> sign in with their <strong>registered mobile number</strong> only — make sure each patient's phone in your records is correct.</li>
              <li><strong>Staff</strong> sign in with their <strong>work email + PIN</strong> (set under the Users tab). After login they're taken to the main system.</li>
            </ul>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={() => data && setForm(data)} disabled={save.isPending}>Reset</Button>
            <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmailTab() { const { data: settings } = useQuery<EmailSettings>({ queryKey: ["email-settings"], queryFn: () => api.get("/api/email-settings") }); const save = useMutation({ mutationFn: (body: EmailSettings) => api.put("/api/email-settings", body) }); const { register, handleSubmit, reset } = useForm<EmailSettings>({ defaultValues: settings }); return (<div className="grid grid-cols-1 gap-4"><div className="bg-card border border-card-border rounded-xl p-4"><p className="text-sm text-muted-foreground">Configure SMTP and email notifications.</p></div><form onSubmit={handleSubmit((d) => save.mutate(d))} className="space-y-4 bg-card border border-card-border rounded-xl p-4"><div className="grid md:grid-cols-2 gap-4"><div><Label>SMTP Host</Label><Input {...register("smtpHost")} className="mt-1" /></div><div><Label>SMTP Port</Label><Input {...register("smtpPort")} className="mt-1" /></div><div><Label>SMTP User</Label><Input {...register("smtpUser")} className="mt-1" /></div><div><Label>SMTP Password</Label><Input {...register("smtpPassword")} className="mt-1" type="password" /></div><div><Label>From Address</Label><Input {...register("fromAddress")} className="mt-1" /></div><div><Label>From Name</Label><Input {...register("fromName")} className="mt-1" /></div><div><Label>Admin Email</Label><Input {...register("adminEmail")} className="mt-1" /></div><div><Label>Extra Recipients</Label><Input {...register("extraRecipients")} className="mt-1" /></div></div><div className="flex justify-end gap-2"><Button variant="outline" type="button" onClick={() => reset(settings)}>Reset</Button><Button type="submit">Save</Button></div></form></div>);
}

function ManualTab() { const manualText = buildManualText(); return (<div className="space-y-4"><div className="bg-card border border-card-border rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"><div><p className="text-sm font-semibold uppercase text-muted-foreground mb-1">Downloadable Manual</p><h2 className="text-xl font-bold">User Manual & Software Functionality</h2><p className="text-sm text-muted-foreground mt-1">A printable guide covering daily workflow, billing, lab, inventory, referrals, and administration.</p></div><Button onClick={() => downloadTextFile("Diagnostic-Center-Billing-ERP-Manual.txt", manualText)}><Download size={14} className="mr-2" /> Download Manual</Button></div><div className="grid gap-4 md:grid-cols-2">{MANUAL_SECTIONS.map((section) => { const Icon = section.icon; return (<div key={section.title} className="bg-card border border-card-border rounded-xl p-5"><div className="flex items-center gap-2 mb-3"><Icon size={16} className="text-primary" /><h3 className="font-semibold">{section.title}</h3></div><ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">{section.points.map((point) => <li key={point}>{point}</li>)}</ul></div>); })}</div><div className="bg-muted/30 border border-card-border rounded-xl p-5"><div className="flex items-center gap-2 mb-3"><FileText size={16} className="text-primary" /><h3 className="font-semibold">Software Functionality Summary</h3></div><div className="grid gap-3 md:grid-cols-3 text-sm"><div className="bg-card border border-card-border rounded-lg p-3"><p className="font-medium mb-1">Patient Flow</p><p className="text-muted-foreground">Register, order tests, bill, collect payments, and track history.</p></div><div className="bg-card border border-card-border rounded-lg p-3"><p className="font-medium mb-1">Operations</p><p className="text-muted-foreground">Manage doctors, commissions, inventory, lab reports, and accounting.</p></div><div className="bg-card border border-card-border rounded-lg p-3"><p className="font-medium mb-1">Security</p><p className="text-muted-foreground">Role-based permissions, audit logs, email alerts, and super admin portal.</p></div></div></div></div>);
}

type DiscountReason = { id: number; label: string; isActive: boolean };

type WhatsappCfg = {
  id?: number; enabled: boolean;
  phoneNumberId: string; accessToken: string;
  templateName: string; templateLang: string;
  defaultCountryCode: string;
  autoSendOnVerify?: boolean;
  includeViewerLink?: boolean;
  reportMessageTemplate?: string;
};
type PrinterCfg = { id?: number; billPrinter: string; barcodePrinter: string; tokenPrinter: string };

const PRINTER_TABS: { key: keyof Omit<PrinterCfg, "id">; label: string; description: string }[] = [
  { key: "billPrinter",    label: "Bill Printer",    description: "A4 / A5 receipts and invoice printouts." },
  { key: "barcodePrinter", label: "Barcode Printer", description: "Small label printer used for sample barcodes." },
  { key: "tokenPrinter",   label: "Token Printer",   description: "Queue token slip printer at the front desk." },
];

const KNOWN_PRINTERS_KEY = "diagnosticErp:knownPrinters";

function loadKnownPrinters(): string[] {
  try {
    const raw = localStorage.getItem(KNOWN_PRINTERS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function saveKnownPrinters(list: string[]) {
  try { localStorage.setItem(KNOWN_PRINTERS_KEY, JSON.stringify(list)); } catch { /* noop */ }
}

function testPrintPrinter(printerName: string, label: string) {
  const w = window.open("", "_blank", "width=420,height=600");
  if (!w) {
    alert("Pop-up blocked. Please allow pop-ups so the print dialog can open.");
    return;
  }
  const safeName = printerName ? printerName.replace(/[<>&"']/g, "") : "(default)";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Test ${label}</title>
    <style>
      @page { size: A6; margin: 6mm; }
      body { font-family: Arial, sans-serif; padding: 12px; color:#000; }
      h1 { font-size: 16px; margin: 0 0 8px; }
      p { font-size: 12px; margin: 4px 0; }
      .box { border: 1px dashed #000; padding: 10px; margin-top: 10px; text-align:center; font-weight:700; }
    </style></head><body>
    <h1>${label} — Test Print</h1>
    <p>Configured printer name: <strong>${safeName}</strong></p>
    <p>Date: ${new Date().toLocaleString("en-IN")}</p>
    <div class="box">Choose <strong>${safeName}</strong> in the print dialog to confirm it works.</div>
  </body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
  w.onload = () => { w.focus(); w.print(); setTimeout(() => w.close(), 400); };
}

function PrinterTab() {
  const qc = useQueryClient();
  const { data: cfg } = useQuery<PrinterCfg>({ queryKey: ["printer-settings"], queryFn: () => api.get("/api/printers/settings") });
  const [form, setForm] = useState<PrinterCfg | null>(null);
  const [activeTab, setActiveTab] = useState<keyof Omit<PrinterCfg, "id">>("billPrinter");
  const [knownPrinters, setKnownPrinters] = useState<string[]>(() => loadKnownPrinters());
  const [newPrinterName, setNewPrinterName] = useState("");
  const cur = form ?? cfg ?? null;
  const save = useMutation({
    mutationFn: (body: PrinterCfg) => api.put("/api/printers/settings", body),
    onSuccess: (saved) => { qc.invalidateQueries({ queryKey: ["printer-settings"] }); setForm(saved as PrinterCfg); },
  });
  if (!cur) return <div className="bg-card border border-card-border rounded-xl p-8 text-center text-muted-foreground">Loading printer settings…</div>;

  const update = (k: keyof PrinterCfg, v: string) => setForm({ ...(cur as PrinterCfg), [k]: v });

  function addKnownPrinter() {
    const name = newPrinterName.trim();
    if (!name) return;
    if (knownPrinters.includes(name)) { setNewPrinterName(""); return; }
    const next = [...knownPrinters, name];
    setKnownPrinters(next);
    saveKnownPrinters(next);
    setNewPrinterName("");
  }

  function removeKnownPrinter(name: string) {
    const next = knownPrinters.filter((n) => n !== name);
    setKnownPrinters(next);
    saveKnownPrinters(next);
  }

  const activeMeta = PRINTER_TABS.find((t) => t.key === activeTab)!;
  const activeValue = cur[activeTab] ?? "";

  return (
    <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
      <div>
        <h2 className="font-bold text-lg flex items-center gap-2"><Printer size={16} /> Printer Routing</h2>
        <p className="text-sm text-muted-foreground mt-1">Configure each printer separately. Pick from the printer aliases saved on this workstation, or type the exact system printer name.</p>
      </div>

      {/* Sub-tabs for the three printers */}
      <div className="flex gap-1 border-b border-card-border">
        {PRINTER_TABS.map((t) => {
          const active = activeTab === t.key;
          const value = cur[t.key];
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Printer size={13} />
              <span>{t.label}</span>
              {value
                ? <Badge variant="secondary" className="text-[10px] font-mono">{value}</Badge>
                : <Badge variant="outline" className="text-[10px]">unset</Badge>}
            </button>
          );
        })}
      </div>

      {/* Active printer panel */}
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-sm">{activeMeta.label}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{activeMeta.description}</p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Pick a saved printer</Label>
            <Select
              value={activeValue || "__none"}
              onValueChange={(v) => update(activeTab, v === "__none" ? "" : v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={knownPrinters.length === 0 ? "No printer aliases saved yet" : "Select a printer"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— None / use system default —</SelectItem>
                {knownPrinters.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Browsers cannot auto-list installed printers. Add aliases for this workstation in the panel below.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Or type the exact printer name</Label>
            <Input
              value={activeValue}
              onChange={(e) => update(activeTab, e.target.value)}
              placeholder="e.g. HP LaserJet 1020 / Zebra GK420"
              className="h-9"
            />
            <p className="text-[11px] text-muted-foreground">
              Use the name shown in your operating system's "Printers & scanners" list.
            </p>
          </div>
        </div>

        {/* Manage workstation printer list */}
        <div className="bg-muted/30 border border-card-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold">Printers installed on this computer</h4>
              <p className="text-[11px] text-muted-foreground">Saved locally in this browser. Add the printers physically installed on this workstation so they appear in the dropdown.</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              value={newPrinterName}
              onChange={(e) => setNewPrinterName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKnownPrinter(); } }}
              placeholder="Add a printer name (as shown in OS)"
              className="h-9"
            />
            <Button type="button" variant="outline" onClick={addKnownPrinter} disabled={!newPrinterName.trim()}>
              <Plus size={14} className="mr-1" /> Add
            </Button>
          </div>

          {knownPrinters.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No printers saved yet on this computer.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {knownPrinters.map((p) => {
                const inUse = p === activeValue;
                return (
                  <div
                    key={p}
                    className={`flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs ${
                      inUse ? "border-primary bg-primary/5 text-primary" : "border-card-border bg-card"
                    }`}
                  >
                    <Printer size={11} />
                    <span className="font-mono">{p}</span>
                    {!inUse && (
                      <button
                        type="button"
                        onClick={() => update(activeTab, p)}
                        className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-primary"
                      >
                        Use
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeKnownPrinter(p)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${p}`}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => testPrintPrinter(activeValue, activeMeta.label)}
          >
            <Printer size={14} className="mr-1.5" /> Test Print
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" type="button" onClick={() => setForm(cfg ?? null)}>Reset</Button>
            <Button onClick={() => save.mutate(cur)} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
function WhatsappTab() {
  const qc = useQueryClient();
  const { data: cfg } = useQuery<WhatsappCfg>({ queryKey: ["whatsapp-settings"], queryFn: () => api.get("/api/whatsapp/settings") });
  const [form, setForm] = useState<WhatsappCfg | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [showToken, setShowToken] = useState(false);
  const cur = form ?? cfg ?? null;
  const save = useMutation({
    mutationFn: (body: WhatsappCfg) => api.put("/api/whatsapp/settings", body),
    onSuccess: (saved) => { qc.invalidateQueries({ queryKey: ["whatsapp-settings"] }); setForm(saved as WhatsappCfg); },
  });
  const test = useMutation({
    mutationFn: (phone: string) => api.post<{ ok: boolean; error?: string; messageId?: string }>("/api/whatsapp/test", { phone }),
  });
  if (!cur) return <div className="bg-card border border-card-border rounded-xl p-8 text-center text-muted-foreground">Loading WhatsApp settings…</div>;
  const update = (k: keyof WhatsappCfg, v: string | boolean) => setForm({ ...(cur as WhatsappCfg), [k]: v });
  return (
    <div className="space-y-4">
      <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2"><MessageCircle size={16} /> WhatsApp Cloud API</h2>
            <p className="text-sm text-muted-foreground mt-1">When enabled, every new bill auto-sends a WhatsApp template message to the patient with bill number, amount, and queue token.</p>
          </div>
          <button
            type="button"
            onClick={() => update("enabled", !cur.enabled)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${cur.enabled ? "bg-primary" : "bg-muted"}`}
            aria-label="Toggle WhatsApp"
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${cur.enabled ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Phone Number ID *</Label>
            <Input value={cur.phoneNumberId} onChange={(e) => update("phoneNumberId", e.target.value)} className="mt-1" placeholder="e.g. 105296888774421" />
            <p className="text-[11px] text-muted-foreground mt-1">From Meta Business → WhatsApp Manager → API Setup.</p>
          </div>
          <div>
            <Label>Permanent Access Token *</Label>
            <div className="relative">
              <Input type={showToken ? "text" : "password"} value={cur.accessToken} onChange={(e) => update("accessToken", e.target.value)} className="mt-1 pr-10" placeholder="EAAJk..." />
              <button type="button" onClick={() => setShowToken(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label="Show/hide token">
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <Label>Template Name *</Label>
            <Input value={cur.templateName} onChange={(e) => update("templateName", e.target.value)} className="mt-1" placeholder="e.g. bill_notification" />
            <p className="text-[11px] text-muted-foreground mt-1">Template body must accept 4 variables: {"{{1}}"} name, {"{{2}}"} bill no, {"{{3}}"} amount, {"{{4}}"} token.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Template Language</Label>
              <Input value={cur.templateLang} onChange={(e) => update("templateLang", e.target.value)} className="mt-1" placeholder="en" />
            </div>
            <div>
              <Label>Default Country Code</Label>
              <Input value={cur.defaultCountryCode} onChange={(e) => update("defaultCountryCode", e.target.value)} className="mt-1" placeholder="91" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-card-border">
          <Button variant="outline" type="button" onClick={() => setForm(cfg ?? null)}>Reset</Button>
          <Button onClick={() => save.mutate(cur)} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Send size={14} /> Patient Report Auto-Delivery</h3>
          <p className="text-xs text-muted-foreground mt-1">When a verifier finalises a patient report, automatically send the patient a WhatsApp message with the PDF download link (and, for radiology, a tokenised image-viewer link).</p>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label className="font-medium">Auto-send on verify</Label>
            <p className="text-[11px] text-muted-foreground">Off by default — turn on once your delivery template is approved.</p>
          </div>
          <button
            type="button"
            onClick={() => update("autoSendOnVerify", !cur.autoSendOnVerify)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${cur.autoSendOnVerify ? "bg-primary" : "bg-muted"}`}
            aria-label="Toggle auto-send"
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${cur.autoSendOnVerify ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label className="font-medium">Include image-viewer link (radiology)</Label>
            <p className="text-[11px] text-muted-foreground">Adds a tokenised tele-radiology viewer URL (7-day expiry) for radiology reports.</p>
          </div>
          <button
            type="button"
            onClick={() => update("includeViewerLink", cur.includeViewerLink === false)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${cur.includeViewerLink !== false ? "bg-primary" : "bg-muted"}`}
            aria-label="Toggle viewer link"
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${cur.includeViewerLink !== false ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
        <div>
          <Label>Custom delivery message (optional)</Label>
          <Textarea
            value={cur.reportMessageTemplate ?? ""}
            onChange={(e) => update("reportMessageTemplate", e.target.value)}
            rows={4}
            className="mt-1 font-mono text-xs"
            placeholder={`Leave empty to use the default. Placeholders:\n  {{name}} {{reportNumber}} {{testName}} {{reportUrl}} {{viewerUrl}}`}
          />
          <p className="text-[11px] text-muted-foreground mt-1">Sent as a plain WhatsApp text (not a template). Requires the patient to have messaged you within 24h, or for your number to be approved for proactive utility messages.</p>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-5">
        <h3 className="font-semibold mb-2">Send Test Message</h3>
        <p className="text-xs text-muted-foreground mb-3">Sends the configured template using placeholder values to verify your credentials and template approval.</p>
        <div className="flex gap-2">
          <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="10-digit phone (or full intl. format)" className="flex-1" />
          <Button type="button" disabled={!testPhone || test.isPending || !cur.enabled} onClick={() => test.mutate(testPhone)}>
            {test.isPending ? "Sending…" : "Send Test"}
          </Button>
        </div>
        {test.data && (
          <p className={`text-xs mt-3 ${test.data.ok ? "text-green-600" : "text-destructive"}`}>
            {test.data.ok ? `Sent ✓  (msg id: ${test.data.messageId ?? "—"})` : `Failed: ${test.data.error}`}
          </p>
        )}
        {!cur.enabled && <p className="text-xs text-muted-foreground mt-3">Enable WhatsApp above to send test messages.</p>}
      </div>
    </div>
  );
}

function DiscountReasonsTab() {
  const qc = useQueryClient();
  const { data: reasons = [], isLoading } = useQuery<DiscountReason[]>({
    queryKey: ["discount-reasons"],
    queryFn: () => api.get("/api/discount-reasons"),
  });
  const [newLabel, setNewLabel] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const addReason = useMutation({
    mutationFn: (label: string) => api.post("/api/discount-reasons", { label }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["discount-reasons"] }); setNewLabel(""); },
  });
  const updateReason = useMutation({
    mutationFn: (body: { id: number; data: Partial<DiscountReason> }) => api.patch(`/api/discount-reasons/${body.id}`, body.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["discount-reasons"] }); setEditId(null); },
  });
  const deleteReason = useMutation({
    mutationFn: (id: number) => api.delete(`/api/discount-reasons/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discount-reasons"] }),
  });

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-card border border-card-border rounded-xl p-5">
        <p className="text-sm text-muted-foreground">
          Manage the list of preset reasons available in the Billing Desk discount field. Inactive reasons are hidden from billing but kept for historical bills.
        </p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); if (newLabel.trim()) addReason.mutate(newLabel.trim()); }}
        className="bg-card border border-card-border rounded-xl p-4 flex gap-2"
      >
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="New reason (e.g. Weekend Promo)"
          className="flex-1"
        />
        <Button type="submit" disabled={!newLabel.trim() || addReason.isPending}>
          <Plus size={14} className="mr-1" /> Add
        </Button>
      </form>

      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : reasons.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">No reasons configured.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-card-border">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase text-muted-foreground w-12">#</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase text-muted-foreground">Label</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase text-muted-foreground w-28">Status</th>
                <th className="px-4 py-2.5 w-24" />
              </tr>
            </thead>
            <tbody>
              {reasons.map((r) => (
                <tr key={r.id} className="border-b border-card-border last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.id}</td>
                  <td className="px-4 py-2">
                    {editId === r.id ? (
                      <Input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") updateReason.mutate({ id: r.id, data: { label: editLabel } });
                          if (e.key === "Escape") setEditId(null);
                        }}
                        autoFocus
                        className="h-8"
                      />
                    ) : (
                      <span className="font-medium">{r.label}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => updateReason.mutate({ id: r.id, data: { isActive: !r.isActive } })}
                      className={`text-xs px-2 py-1 rounded font-medium ${r.isActive ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" : "bg-muted text-muted-foreground"}`}
                    >
                      {r.isActive ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {editId === r.id ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => updateReason.mutate({ id: r.id, data: { label: editLabel } })}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>✕</Button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditId(r.id); setEditLabel(r.label); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil size={13} /></button>
                          <button
                            onClick={() => { if (confirm(`Delete reason "${r.label}"?`)) deleteReason.mutate(r.id); }}
                            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          ><Trash2 size={13} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

type DiagnosticTest = { id: number; code: string; name: string; category: string; isActive: boolean };

function FormFTestsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: tests = [], isLoading: testsLoading } = useQuery<DiagnosticTest[]>({
    queryKey: ["tests-all-formf"],
    queryFn: () => api.get<{ tests: DiagnosticTest[] }>("/api/tests?limit=500").then((d) => d.tests ?? []),
  });

  const { data: settings, isLoading: settingsLoading } = useQuery<{ formFTestIds?: string }>({
    queryKey: ["clinic-settings"],
    queryFn: () => api.get("/api/clinic-settings"),
  });

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!settingsLoading && settings !== undefined) {
      try {
        const ids: number[] = JSON.parse(settings?.formFTestIds ?? "[]");
        setSelectedIds(new Set(ids));
      } catch { /* ignore */ }
    }
  }, [settings, settingsLoading]);

  const saveMut = useMutation({
    mutationFn: () =>
      api.put("/api/clinic-settings", { formFTestIds: JSON.stringify([...selectedIds]) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinic-settings"] });
    },
  });

  const toggleTest = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
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
    return <div className="bg-card border border-card-border rounded-xl p-8 text-center text-muted-foreground animate-pulse">Loading tests…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-card border border-card-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <FileText size={16} className="text-primary" /> PCPNDT Form F — Required Tests
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Mark which tests require PCPNDT Form F. When these tests are added in Billing Desk,
              Husband's Name and Address will become mandatory before generating the bill.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-primary">{selectedIds.size} test(s) selected</span>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} size="sm">
              {saveMut.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        {saveMut.isSuccess && (
          <div className="mt-2 text-xs text-green-600 font-medium">✓ Form F test settings saved successfully.</div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search tests by name, code or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Quick select USG category */}
      <div className="flex gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground self-center">Quick select:</span>
        {["Radiology", "Ultrasound", "USG", "Sonography"].map((cat) => {
          const catTests = activeTests.filter((t) => t.category.toLowerCase().includes(cat.toLowerCase()));
          if (catTests.length === 0) return null;
          return (
            <Button
              key={cat}
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSelectedIds((prev) => {
                const next = new Set(prev);
                catTests.forEach((t) => next.add(t.id));
                return next;
              })}
            >
              Select all {cat} ({catTests.length})
            </Button>
          );
        })}
        <Button variant="outline" size="sm" className="h-7 text-xs text-destructive" onClick={() => setSelectedIds(new Set())}>
          Clear all
        </Button>
      </div>

      {/* Test list by category */}
      {Object.entries(byCategory).map(([cat, catTests]) => (
        <div key={cat} className="bg-card border border-card-border rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-muted/40 border-b border-card-border flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat}</span>
            <button
              className="text-xs text-primary hover:underline"
              onClick={() => setSelectedIds((prev) => {
                const next = new Set(prev);
                const allSelected = catTests.every((t) => next.has(t.id));
                catTests.forEach((t) => allSelected ? next.delete(t.id) : next.add(t.id));
                return next;
              })}
            >
              {catTests.every((t) => selectedIds.has(t.id)) ? "Deselect all" : "Select all"}
            </button>
          </div>
          <div className="divide-y divide-card-border">
            {catTests.map((t) => {
              const checked = selectedIds.has(t.id);
              return (
                <label key={t.id} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${checked ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTest(t.id)}
                    className="w-4 h-4 accent-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{t.code}</div>
                  </div>
                  {checked && (
                    <span className="text-[10px] bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">
                      Form F Required
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      ))}

      {filteredTests.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm">
          No tests found{search ? ` for "${search}"` : ""}. Add tests in the Test Catalog first.
        </div>
      )}
    </div>
  );
}

function ChangePasswordTab() {
  const { data: users = [] } = useQuery<AppUser[]>({ queryKey: ["users"], queryFn: () => api.get("/api/users") });
  const [visible, setVisible] = useState(false);
  const changePassword = useMutation({ mutationFn: (body: { userId: number; currentPin: string; newPin: string }) => api.patch(`/api/users/${body.userId}/password`, { currentPin: body.currentPin, newPin: body.newPin }) });
  const { register, handleSubmit, watch, reset, setValue } = useForm<ChangePasswordForm>({ defaultValues: { userId: "", currentPin: "", newPin: "", confirmPin: "" } });
  const onSubmit = handleSubmit((d) => { if (!d.userId || d.newPin !== d.confirmPin) return; changePassword.mutate({ userId: Number(d.userId), currentPin: d.currentPin, newPin: d.newPin }, { onSuccess: () => reset({ userId: "", currentPin: "", newPin: "", confirmPin: "" }) }); });
  return (<div className="max-w-2xl space-y-4"><div className="bg-card border border-card-border rounded-xl p-5"><p className="text-sm text-muted-foreground">Change a user PIN/password for login and secure actions.</p></div><form onSubmit={onSubmit} className="space-y-4 bg-card border border-card-border rounded-xl p-5"><div><Label>User</Label><Select value={watch("userId")} onValueChange={(v) => setValue("userId", v)}><SelectTrigger className="mt-1"><SelectValue placeholder="Select user" /></SelectTrigger><SelectContent>{users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name} — {u.role}</SelectItem>)}</SelectContent></Select></div><div><Label>Current PIN</Label><Input {...register("currentPin", { required: true })} className="mt-1" type={visible ? "text" : "password"} /></div><div><Label>New PIN</Label><Input {...register("newPin", { required: true })} className="mt-1" type={visible ? "text" : "password"} /></div><div><Label>Confirm New PIN</Label><Input {...register("confirmPin", { required: true })} className="mt-1" type={visible ? "text" : "password"} /></div><div className="flex items-center justify-between"><button type="button" onClick={() => setVisible((v) => !v)} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">{visible ? <EyeOff size={14} /> : <Eye size={14} />} Toggle visibility</button><Button type="submit" disabled={changePassword.isPending}>Update PIN</Button></div>{changePassword.isError && <p className="text-sm text-destructive">Failed to update PIN.</p>}</form></div>);
}

// ============================================================
// DEPARTMENTS TAB
// ============================================================
type Department = {
  id: number; name: string; code: string | null; description: string | null;
  headOfDepartment: string | null; contactPhone: string | null; contactEmail: string | null;
  isActive: boolean; testCount: number; staffCount: number; machineCount: number;
};

function DepartmentsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: rows = [], isLoading } = useQuery<Department[]>({
    queryKey: ["departments"],
    queryFn: () => api.get("/api/departments"),
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState({ name: "", code: "", description: "", headOfDepartment: "", contactPhone: "", contactEmail: "", isActive: true });

  const reset = () => { setEditing(null); setForm({ name: "", code: "", description: "", headOfDepartment: "", contactPhone: "", contactEmail: "", isActive: true }); };

  const create = useMutation({
    mutationFn: (b: typeof form) => api.post("/api/departments", b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["departments"] }); setOpen(false); reset(); toast({ title: "Department added" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: ({ id, b }: { id: number; b: typeof form }) => api.patch(`/api/departments/${id}`, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["departments"] }); setOpen(false); reset(); toast({ title: "Department updated" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/departments/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["departments"] }); toast({ title: "Department deleted" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const onEdit = (d: Department) => {
    setEditing(d);
    setForm({ name: d.name, code: d.code || "", description: d.description || "", headOfDepartment: d.headOfDepartment || "", contactPhone: d.contactPhone || "", contactEmail: d.contactEmail || "", isActive: d.isActive });
    setOpen(true);
  };
  const onSubmit = () => { if (!form.name.trim()) return; if (editing) update.mutate({ id: editing.id, b: form }); else create.mutate(form); };

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Network size={16} /> Departments</h3>
          <p className="text-xs text-muted-foreground mt-1">Lab departments referenced by tests, staff and machines.</p>
        </div>
        <Button onClick={() => { reset(); setOpen(true); }}><Plus size={14} className="mr-1" /> Add Department</Button>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium text-xs">Name</th>
              <th className="px-3 py-2 font-medium text-xs">Code</th>
              <th className="px-3 py-2 font-medium text-xs">Head</th>
              <th className="px-3 py-2 font-medium text-xs">Contact</th>
              <th className="px-3 py-2 font-medium text-xs text-right">Tests</th>
              <th className="px-3 py-2 font-medium text-xs text-right">Staff</th>
              <th className="px-3 py-2 font-medium text-xs text-right">Machines</th>
              <th className="px-3 py-2 font-medium text-xs">Status</th>
              <th className="px-3 py-2 font-medium text-xs text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? <tr><td colSpan={9} className="px-3 py-8 text-center text-xs text-muted-foreground">Loading…</td></tr>
              : rows.length === 0
                ? <tr><td colSpan={9} className="px-3 py-8 text-center text-xs text-muted-foreground">No departments yet — add common ones like Pathology, Radiology, Cardiology</td></tr>
                : rows.map(d => (
                  <tr key={d.id} className="border-t border-border/50 hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{d.name}</td>
                    <td className="px-3 py-2 text-xs font-mono">{d.code || "—"}</td>
                    <td className="px-3 py-2 text-xs">{d.headOfDepartment || "—"}</td>
                    <td className="px-3 py-2 text-xs">{d.contactPhone || d.contactEmail || "—"}</td>
                    <td className="px-3 py-2 text-xs text-right">{d.testCount}</td>
                    <td className="px-3 py-2 text-xs text-right">{d.staffCount}</td>
                    <td className="px-3 py-2 text-xs text-right">{d.machineCount}</td>
                    <td className="px-3 py-2"><Badge className={d.isActive ? "bg-emerald-100 text-emerald-700" : "bg-zinc-200 text-zinc-700"}>{d.isActive ? "active" : "inactive"}</Badge></td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => onEdit(d)}><Pencil size={13} /></Button>
                        <Button size="sm" variant="outline" onClick={() => { if (confirm(`Delete ${d.name}?`)) remove.mutate(d.id); }}><Trash2 size={13} className="text-rose-500" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Department" : "Add Department"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label className="text-xs">Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label className="text-xs">Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="PATH" /></div>
            <div><Label className="text-xs">Head of Dept</Label><Input value={form.headOfDepartment} onChange={(e) => setForm({ ...form, headOfDepartment: e.target.value })} /></div>
            <div><Label className="text-xs">Contact Phone</Label><Input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} /></div>
            <div><Label className="text-xs">Contact Email</Label><Input value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></div>
            <div className="col-span-2"><Label className="text-xs">Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <label className="flex items-center gap-2 col-span-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Active
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
            <Button onClick={onSubmit} disabled={!form.name.trim()}>{editing ? "Save" : "Add"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// BRANCHES TAB
// ============================================================
type Branch = {
  id: number; code: string; name: string; address: string | null;
  city: string | null; state: string | null; pincode: string | null;
  phone: string | null; email: string | null; gstin: string | null;
  manager: string | null; isMain: boolean; isActive: boolean; notes: string | null;
};

function BranchesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: rows = [], isLoading } = useQuery<Branch[]>({
    queryKey: ["branches"],
    queryFn: () => api.get("/api/branches"),
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState({ code: "", name: "", address: "", city: "", state: "", pincode: "", phone: "", email: "", gstin: "", manager: "", isMain: false, isActive: true, notes: "" });

  const reset = () => { setEditing(null); setForm({ code: "", name: "", address: "", city: "", state: "", pincode: "", phone: "", email: "", gstin: "", manager: "", isMain: false, isActive: true, notes: "" }); };

  const create = useMutation({
    mutationFn: (b: typeof form) => api.post("/api/branches", b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["branches"] }); setOpen(false); reset(); toast({ title: "Branch added" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: ({ id, b }: { id: number; b: typeof form }) => api.patch(`/api/branches/${id}`, b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["branches"] }); setOpen(false); reset(); toast({ title: "Branch updated" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/branches/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["branches"] }); toast({ title: "Branch deleted" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const onEdit = (b: Branch) => {
    setEditing(b);
    setForm({ code: b.code, name: b.name, address: b.address || "", city: b.city || "", state: b.state || "", pincode: b.pincode || "", phone: b.phone || "", email: b.email || "", gstin: b.gstin || "", manager: b.manager || "", isMain: b.isMain, isActive: b.isActive, notes: b.notes || "" });
    setOpen(true);
  };
  const onSubmit = () => { if (!form.code.trim() || !form.name.trim()) return; if (editing) update.mutate({ id: editing.id, b: form }); else create.mutate(form); };

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><MapPin size={16} /> Branches</h3>
          <p className="text-xs text-muted-foreground mt-1">Multi-branch / multi-location setup. Mark one as the main branch.</p>
        </div>
        <Button onClick={() => { reset(); setOpen(true); }}><Plus size={14} className="mr-1" /> Add Branch</Button>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium text-xs">Code</th>
              <th className="px-3 py-2 font-medium text-xs">Name</th>
              <th className="px-3 py-2 font-medium text-xs">Address</th>
              <th className="px-3 py-2 font-medium text-xs">Phone / Email</th>
              <th className="px-3 py-2 font-medium text-xs">GSTIN</th>
              <th className="px-3 py-2 font-medium text-xs">Manager</th>
              <th className="px-3 py-2 font-medium text-xs">Status</th>
              <th className="px-3 py-2 font-medium text-xs text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? <tr><td colSpan={8} className="px-3 py-8 text-center text-xs text-muted-foreground">Loading…</td></tr>
              : rows.length === 0
                ? <tr><td colSpan={8} className="px-3 py-8 text-center text-xs text-muted-foreground">No branches yet — add your main branch first</td></tr>
                : rows.map(b => (
                  <tr key={b.id} className="border-t border-border/50 hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono text-xs">{b.code}</td>
                    <td className="px-3 py-2 font-medium">
                      {b.name}
                      {b.isMain && <Badge className="ml-2 bg-violet-100 text-violet-700">Main</Badge>}
                    </td>
                    <td className="px-3 py-2 text-xs">{[b.address, b.city, b.state, b.pincode].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-3 py-2 text-xs">{b.phone || "—"}<div className="text-[10px] text-muted-foreground">{b.email || ""}</div></td>
                    <td className="px-3 py-2 text-xs font-mono">{b.gstin || "—"}</td>
                    <td className="px-3 py-2 text-xs">{b.manager || "—"}</td>
                    <td className="px-3 py-2"><Badge className={b.isActive ? "bg-emerald-100 text-emerald-700" : "bg-zinc-200 text-zinc-700"}>{b.isActive ? "active" : "inactive"}</Badge></td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => onEdit(b)}><Pencil size={13} /></Button>
                        <Button size="sm" variant="outline" onClick={() => { if (confirm(`Delete ${b.name}?`)) remove.mutate(b.id); }}><Trash2 size={13} className="text-rose-500" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit Branch" : "Add Branch"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Code *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!!editing} /></div>
            <div><Label className="text-xs">Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="col-span-2"><Label className="text-xs">Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div><Label className="text-xs">City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div><Label className="text-xs">State</Label><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
            <div><Label className="text-xs">Pincode</Label><Input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} /></div>
            <div><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label className="text-xs">Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label className="text-xs">GSTIN</Label><Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></div>
            <div><Label className="text-xs">Manager</Label><Input value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} /></div>
            <div className="col-span-2"><Label className="text-xs">Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isMain} onChange={(e) => setForm({ ...form, isMain: e.target.checked })} />
              Main branch
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Active
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
            <Button onClick={onSubmit} disabled={!form.code.trim() || !form.name.trim()}>{editing ? "Save" : "Add"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// REPORT TEMPLATES TAB
// ============================================================
type ReportTemplate = {
  id: number; testId: number; name: string; format: string;
  content: string; isDefault: boolean; tags: string | null; modality: string | null;
};
type LiteTest = { id: number; code: string; name: string; category: string };

function ReportTemplatesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: templates = [], isLoading } = useQuery<ReportTemplate[]>({
    queryKey: ["report-templates"],
    queryFn: () => api.get("/api/report-templates"),
  });
  const { data: tests = [] } = useQuery<LiteTest[]>({
    queryKey: ["report-templates-tests"],
    queryFn: async () => {
      const r = await api.get<{ tests: LiteTest[]; total: number } | LiteTest[]>("/api/tests");
      return Array.isArray(r) ? r : (r?.tests ?? []);
    },
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ReportTemplate | null>(null);
  const [search, setSearch] = useState("");
  const [filterTest, setFilterTest] = useState<string>("");
  const [form, setForm] = useState({ testId: "", name: "", format: "text", content: "", isDefault: false, tags: "", modality: "" });

  const testMap = new Map(tests.map(t => [t.id, t]));

  const reset = () => { setEditing(null); setForm({ testId: "", name: "", format: "text", content: "", isDefault: false, tags: "", modality: "" }); };

  const create = useMutation({
    mutationFn: (b: typeof form) => api.post("/api/report-templates", { ...b, testId: Number(b.testId) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["report-templates"] }); setOpen(false); reset(); toast({ title: "Template created" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const update = useMutation({
    mutationFn: ({ id, b }: { id: number; b: typeof form }) => api.patch(`/api/report-templates/${id}`, { ...b, testId: Number(b.testId) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["report-templates"] }); setOpen(false); reset(); toast({ title: "Template updated" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/report-templates/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["report-templates"] }); toast({ title: "Template deleted" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const onEdit = (t: ReportTemplate) => {
    setEditing(t);
    setForm({ testId: String(t.testId), name: t.name, format: t.format, content: t.content, isDefault: t.isDefault, tags: t.tags || "", modality: t.modality || "" });
    setOpen(true);
  };
  const onSubmit = () => {
    if (!form.testId || !form.name.trim() || !form.content.trim()) {
      toast({ title: "Test, name and content are required", variant: "destructive" });
      return;
    }
    if (editing) update.mutate({ id: editing.id, b: form });
    else create.mutate(form);
  };

  const filtered = templates.filter(t => {
    if (filterTest && String(t.testId) !== filterTest) return false;
    if (search) {
      const q = search.toLowerCase();
      const test = testMap.get(t.testId);
      if (!t.name.toLowerCase().includes(q) && !(test?.name.toLowerCase().includes(q)) && !(t.tags || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><FileCode size={16} /> Report Templates</h3>
          <p className="text-xs text-muted-foreground mt-1">Per-test report templates used by Report Generator. Mark one default per test for auto-load.</p>
        </div>
        <Button onClick={() => { reset(); setOpen(true); }}><Plus size={14} className="mr-1" /> New Template</Button>
      </div>

      <div className="bg-card border border-border rounded-xl p-3 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <Label className="text-xs">Search</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Template name, test or tag" className="h-9" />
        </div>
        <div className="min-w-[200px]">
          <Label className="text-xs">Filter by Test</Label>
          <Select value={filterTest || "__all__"} onValueChange={(v) => setFilterTest(v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__all__">All tests</SelectItem>
              {tests.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.code} — {t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium text-xs">Test</th>
              <th className="px-3 py-2 font-medium text-xs">Template Name</th>
              <th className="px-3 py-2 font-medium text-xs">Format</th>
              <th className="px-3 py-2 font-medium text-xs">Modality</th>
              <th className="px-3 py-2 font-medium text-xs">Tags</th>
              <th className="px-3 py-2 font-medium text-xs text-center">Default</th>
              <th className="px-3 py-2 font-medium text-xs text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? <tr><td colSpan={7} className="px-3 py-8 text-center text-xs text-muted-foreground">Loading…</td></tr>
              : filtered.length === 0
                ? <tr><td colSpan={7} className="px-3 py-8 text-center text-xs text-muted-foreground">No templates {templates.length > 0 ? "matching filters" : "yet — create your first template"}</td></tr>
                : filtered.map(t => {
                  const test = testMap.get(t.testId);
                  return (
                    <tr key={t.id} className="border-t border-border/50 hover:bg-muted/20">
                      <td className="px-3 py-2 text-xs">{test ? <span><span className="font-mono">{test.code}</span> — {test.name}</span> : `Test #${t.testId}`}</td>
                      <td className="px-3 py-2 font-medium">{t.name}</td>
                      <td className="px-3 py-2"><Badge variant="outline">{t.format}</Badge></td>
                      <td className="px-3 py-2 text-xs">{t.modality || "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs truncate" title={t.tags || ""}>{t.tags || "—"}</td>
                      <td className="px-3 py-2 text-center">{t.isDefault ? <Badge className="bg-violet-100 text-violet-700">Default</Badge> : <span className="text-muted-foreground text-xs">—</span>}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => onEdit(t)}><Pencil size={13} /></Button>
                          <Button size="sm" variant="outline" onClick={() => { if (confirm(`Delete "${t.name}"?`)) remove.mutate(t.id); }}><Trash2 size={13} className="text-rose-500" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Template" : "New Report Template"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Test *</Label>
              <Select value={form.testId} onValueChange={(v) => setForm({ ...form, testId: v })}>
                <SelectTrigger><SelectValue placeholder="Select test" /></SelectTrigger>
                <SelectContent className="max-h-72">{tests.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.code} — {t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Standard PA View" /></div>
            <div><Label className="text-xs">Format</Label>
              <Select value={form.format} onValueChange={(v) => setForm({ ...form, format: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="text">text</SelectItem><SelectItem value="html">html</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Modality</Label><Input value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })} placeholder="USG, CT, MRI, X-RAY, LAB, ECG…" /></div>
            <div><Label className="text-xs">Tags (comma-separated)</Label><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="fatty liver, hepatomegaly" /></div>
            <div className="col-span-2">
              <Label className="text-xs">Content (use [PLACEHOLDERS]) *</Label>
              <Textarea rows={10} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="font-mono text-xs" placeholder="Patient: [PATIENT_NAME]&#10;Age: [AGE]&#10;..." />
            </div>
            <label className="flex items-center gap-2 col-span-2 text-sm">
              <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
              Mark as default for this test (auto-loaded by Report Generator)
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
            <Button onClick={onSubmit}>{editing ? "Save" : "Create"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// BACKUP TAB
// ============================================================
type BackupLog = {
  id: number; backupType: string; status: string; format: string;
  rowCount: number | null; sizeBytes: number | null; errorMessage: string | null;
  performedBy: string | null; createdAt: string;
};

function BackupTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: logs = [] } = useQuery<BackupLog[]>({
    queryKey: ["backup-logs"],
    queryFn: () => api.get("/api/backup/logs"),
    refetchInterval: 5000,
  });
  const { data: info } = useQuery<{ tables: string[] }>({
    queryKey: ["backup-info"],
    queryFn: () => api.get("/api/backup/info"),
  });
  const [running, setRunning] = useState(false);

  const fmtSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1_048_576).toFixed(2)} MB`;
  };

  const runBackup = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/backup/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ performedBy: "user" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Backup failed");
      }
      const blob = await res.blob();
      const filename = res.headers.get("Content-Disposition")?.match(/filename="?([^"]+)"?/)?.[1] || `backup-${new Date().toISOString()}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Backup downloaded", description: filename });
      qc.invalidateQueries({ queryKey: ["backup-logs"] });
    } catch (err) {
      toast({ title: "Backup failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-semibold flex items-center gap-2"><Database size={16} /> Master Data Backup</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Download a JSON snapshot of master data and configuration (settings, users, doctors, tests, templates, departments, branches, machines, AMC contracts, etc.).
          For full Postgres-level backups (including transactional data like patients/orders/bills), use <code className="bg-muted px-1 rounded">pg_dump</code> against your DATABASE_URL.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={runBackup} disabled={running}>
            {running ? <RefreshCcw size={14} className="mr-1 animate-spin" /> : <Download size={14} className="mr-1" />}
            {running ? "Generating…" : "Run Backup & Download"}
          </Button>
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["backup-logs"] })}>
            <RefreshCcw size={14} className="mr-1" /> Refresh log
          </Button>
        </div>
        {info && (
          <div className="mt-3 text-[11px] text-muted-foreground">
            <span className="font-medium">Included tables ({info.tables.length}):</span> {info.tables.join(" · ")}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h4 className="font-medium text-sm">Backup History</h4>
          <span className="text-[11px] text-muted-foreground">last 50 runs</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium text-xs">When</th>
              <th className="px-3 py-2 font-medium text-xs">Type</th>
              <th className="px-3 py-2 font-medium text-xs">Status</th>
              <th className="px-3 py-2 font-medium text-xs">By</th>
              <th className="px-3 py-2 font-medium text-xs text-right">Rows</th>
              <th className="px-3 py-2 font-medium text-xs text-right">Size</th>
              <th className="px-3 py-2 font-medium text-xs">Error</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0
              ? <tr><td colSpan={7} className="px-3 py-8 text-center text-xs text-muted-foreground">No backups yet — click "Run Backup" above</td></tr>
              : logs.map(l => (
                <tr key={l.id} className="border-t border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs"><Badge variant="outline">{l.backupType}</Badge></td>
                  <td className="px-3 py-2"><Badge className={l.status === "success" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}>{l.status}</Badge></td>
                  <td className="px-3 py-2 text-xs">{l.performedBy || "—"}</td>
                  <td className="px-3 py-2 text-xs text-right">{l.rowCount ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-right">{fmtSize(l.sizeBytes)}</td>
                  <td className="px-3 py-2 text-xs text-rose-600 max-w-xs truncate" title={l.errorMessage || ""}>{l.errorMessage || ""}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
