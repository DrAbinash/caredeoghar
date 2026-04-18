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
  Users, Download, FileText, BookOpen, ClipboardList, CreditCard,
  FlaskConical, Boxes, ShieldCheck, FileDown, KeyRound, Eye, EyeOff,
  Tag, Building2, Image as ImageIcon, Upload, MessageCircle, Printer,
} from "lucide-react";

type AppUser = {
  id: number; name: string; email: string; role: string;
  permissions: string | null; pin: string | null; isActive: boolean;
  maxDiscount: number | null;
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
  { id: "email", label: "Email Notifications", icon: Mail },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "printers", label: "Printers", icon: Printer },
  { id: "discount-reasons", label: "Discount Reasons", icon: Tag },
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
        {tab === "email" && <EmailTab />}
        {tab === "whatsapp" && <WhatsappTab />}
        {tab === "printers" && <PrinterTab />}
        {tab === "discount-reasons" && <DiscountReasonsTab />}
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
  const { data: users = [], isLoading } = useQuery<AppUser[]>({ queryKey: ["users"], queryFn: () => api.get("/api/users") });
  const saveUser = useMutation({ mutationFn: (body: Record<string, unknown>) => editUser ? api.patch(`/api/users/${editUser.id}`, body) : api.post("/api/users", body), onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setOpen(false); setEditUser(null); reset(); } });
  const toggleActive = useMutation({ mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => api.patch(`/api/users/${id}`, { isActive }), onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }) });
  const deleteUser = useMutation({ mutationFn: (id: number) => api.delete(`/api/users/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }) });
  const { register, handleSubmit, reset, setValue, watch } = useForm<{ name: string; email: string; role: string; pin: string; maxDiscount: string; }>();
  const openAdd = () => { setEditUser(null); setSelectedPerms(DEFAULT_PERMISSIONS["receptionist"]); reset({ role: "receptionist", maxDiscount: "" }); setOpen(true); };
  const openEdit = (u: AppUser) => { setEditUser(u); setSelectedPerms(u.permissions ? JSON.parse(u.permissions) : DEFAULT_PERMISSIONS[u.role] ?? []); reset({ name: u.name, email: u.email, role: u.role, pin: u.pin ?? "", maxDiscount: u.maxDiscount != null ? String(u.maxDiscount) : "" }); setOpen(true); };
  const togglePerm = (path: string) => setSelectedPerms(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]);
  const onSave = handleSubmit((d) => { saveUser.mutate({ ...d, permissions: selectedPerms, pin: d.pin || null, maxDiscount: d.maxDiscount !== "" ? Number(d.maxDiscount) : null }); });
  return (<><div className="flex items-center justify-between mb-4"><p className="text-sm text-muted-foreground">Manage user accounts, roles, and module access</p><Button size="sm" onClick={openAdd}><Plus size={14} className="mr-1" /> Add User</Button></div><div className="space-y-4">{isLoading ? <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}</div> : users.length === 0 ? <div className="text-center py-16 text-muted-foreground"><User2 size={36} className="mx-auto mb-3 opacity-30" /><p>No users yet. Add your first user to get started.</p></div> : (<div className="bg-card border border-card-border rounded-xl overflow-hidden"><table className="w-full text-sm"><thead className="bg-muted/50 border-b border-card-border"><tr><th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Name</th><th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Email</th><th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Role</th><th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Modules</th><th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Status</th><th className="px-4 py-3" /></tr></thead><tbody>{users.map((u) => { const perms: string[] = u.permissions ? JSON.parse(u.permissions) : []; return (<tr key={u.id} className="border-b border-card-border last:border-0 hover:bg-muted/20"><td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{u.name.charAt(0).toUpperCase()}</div><span className="font-medium">{u.name}</span>{u.pin && <Shield size={11} className="text-muted-foreground" />}</div></td><td className="px-4 py-3 text-muted-foreground">{u.email}</td><td className="px-4 py-3"><Badge className={`${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-700"} text-xs capitalize`}>{u.role}</Badge></td><td className="px-4 py-3"><div className="flex flex-wrap gap-1 max-w-xs">{perms.slice(0, 4).map(p => { const mod = ALL_MODULES.find(m => m.path === p); return mod ? <span key={p} className="text-xs bg-muted px-1.5 py-0.5 rounded">{mod.label}</span> : null; })}{perms.length > 4 && <span className="text-xs text-muted-foreground">+{perms.length - 4} more</span>}</div></td><td className="px-4 py-3"><button onClick={() => toggleActive.mutate({ id: u.id, isActive: !u.isActive })} className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{u.isActive ? "Active" : "Inactive"}</button></td><td className="px-4 py-3"><div className="flex gap-1 justify-end"><Button size="sm" variant="ghost" className="h-7" onClick={() => openEdit(u)}><Pencil size={13} /></Button><Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive" onClick={() => deleteUser.mutate(u.id)}><Trash2 size={13} /></Button></div></td></tr>); })}</tbody></table></div>)}<div className="bg-muted/30 border border-card-border rounded-xl p-4"><p className="text-xs font-semibold uppercase text-muted-foreground mb-3">Role Descriptions</p><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">{[{ role: "super_admin", desc: "All permissions + delete/super-edit bills" }, { role: "admin", desc: "Full access to all modules" }, { role: "manager", desc: "Reports, billing, referrals, accounting, discounts" }, { role: "accountant", desc: "Accounting, reports, billing & payments view" }, { role: "billing", desc: "Patients, billing, payments, quick register, discounts" }, { role: "lab", desc: "Orders, test catalog, report generator, inventory" }, { role: "receptionist", desc: "Patients, orders, quick register" }].map(r => (<div key={r.role} className="flex items-start gap-2"><Badge className={`${ROLE_COLORS[r.role]} text-xs capitalize flex-shrink-0 mt-0.5`}>{r.role}</Badge><span className="text-muted-foreground">{r.desc}</span></div>))}</div></div></div><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editUser ? "Edit User" : "Add User"}</DialogTitle></DialogHeader><form onSubmit={onSave} className="space-y-4"><div className="grid grid-cols-2 gap-4"><div><Label>Name</Label><Input {...register("name", { required: true })} className="mt-1" /></div><div><Label>Email</Label><Input {...register("email", { required: true })} className="mt-1" /></div><div><Label>Role</Label><Select value={watch("role")} onValueChange={(v) => setValue("role", v)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{ROLES.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent></Select></div><div><Label>PIN</Label><Input {...register("pin")} className="mt-1" /></div></div><div><Label>Max Discount</Label><Input {...register("maxDiscount")} className="mt-1" /></div><div className="border-t pt-4"><p className="text-xs font-semibold uppercase text-muted-foreground mb-3">Module Permissions</p><div className="grid grid-cols-2 gap-2">{ALL_MODULES.map(m => (<button key={m.path} type="button" onClick={() => togglePerm(m.path)} className="flex items-center gap-2 text-sm p-2 rounded-lg border border-border hover:bg-muted/50 text-left">{selectedPerms.includes(m.path) ? <CheckSquare size={14} /> : <Square size={14} />}<span>{m.label}</span></button>))}</div></div><div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit">Save</Button></div></form></DialogContent></Dialog></>);
}

type ClinicSettings = {
  id?: number;
  name: string; tagline: string; address: string; email: string; phone: string;
  website: string; gstin: string; logoDataUrl: string | null; footerNote: string;
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
  );
}

function EmailTab() { const { data: settings } = useQuery<EmailSettings>({ queryKey: ["email-settings"], queryFn: () => api.get("/api/email-settings") }); const save = useMutation({ mutationFn: (body: EmailSettings) => api.put("/api/email-settings", body) }); const { register, handleSubmit, reset } = useForm<EmailSettings>({ defaultValues: settings }); return (<div className="grid grid-cols-1 gap-4"><div className="bg-card border border-card-border rounded-xl p-4"><p className="text-sm text-muted-foreground">Configure SMTP and email notifications.</p></div><form onSubmit={handleSubmit((d) => save.mutate(d))} className="space-y-4 bg-card border border-card-border rounded-xl p-4"><div className="grid md:grid-cols-2 gap-4"><div><Label>SMTP Host</Label><Input {...register("smtpHost")} className="mt-1" /></div><div><Label>SMTP Port</Label><Input {...register("smtpPort")} className="mt-1" /></div><div><Label>SMTP User</Label><Input {...register("smtpUser")} className="mt-1" /></div><div><Label>SMTP Password</Label><Input {...register("smtpPassword")} className="mt-1" type="password" /></div><div><Label>From Address</Label><Input {...register("fromAddress")} className="mt-1" /></div><div><Label>From Name</Label><Input {...register("fromName")} className="mt-1" /></div><div><Label>Admin Email</Label><Input {...register("adminEmail")} className="mt-1" /></div><div><Label>Extra Recipients</Label><Input {...register("extraRecipients")} className="mt-1" /></div></div><div className="flex justify-end gap-2"><Button variant="outline" type="button" onClick={() => reset(settings)}>Reset</Button><Button type="submit">Save</Button></div></form></div>);
}

function ManualTab() { const manualText = buildManualText(); return (<div className="space-y-4"><div className="bg-card border border-card-border rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"><div><p className="text-sm font-semibold uppercase text-muted-foreground mb-1">Downloadable Manual</p><h2 className="text-xl font-bold">User Manual & Software Functionality</h2><p className="text-sm text-muted-foreground mt-1">A printable guide covering daily workflow, billing, lab, inventory, referrals, and administration.</p></div><Button onClick={() => downloadTextFile("Diagnostic-Center-Billing-ERP-Manual.txt", manualText)}><Download size={14} className="mr-2" /> Download Manual</Button></div><div className="grid gap-4 md:grid-cols-2">{MANUAL_SECTIONS.map((section) => { const Icon = section.icon; return (<div key={section.title} className="bg-card border border-card-border rounded-xl p-5"><div className="flex items-center gap-2 mb-3"><Icon size={16} className="text-primary" /><h3 className="font-semibold">{section.title}</h3></div><ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">{section.points.map((point) => <li key={point}>{point}</li>)}</ul></div>); })}</div><div className="bg-muted/30 border border-card-border rounded-xl p-5"><div className="flex items-center gap-2 mb-3"><FileText size={16} className="text-primary" /><h3 className="font-semibold">Software Functionality Summary</h3></div><div className="grid gap-3 md:grid-cols-3 text-sm"><div className="bg-card border border-card-border rounded-lg p-3"><p className="font-medium mb-1">Patient Flow</p><p className="text-muted-foreground">Register, order tests, bill, collect payments, and track history.</p></div><div className="bg-card border border-card-border rounded-lg p-3"><p className="font-medium mb-1">Operations</p><p className="text-muted-foreground">Manage doctors, commissions, inventory, lab reports, and accounting.</p></div><div className="bg-card border border-card-border rounded-lg p-3"><p className="font-medium mb-1">Security</p><p className="text-muted-foreground">Role-based permissions, audit logs, email alerts, and super admin portal.</p></div></div></div></div>);
}

type DiscountReason = { id: number; label: string; isActive: boolean };

type WhatsappCfg = { id?: number; enabled: boolean; phoneNumberId: string; accessToken: string; templateName: string; templateLang: string; defaultCountryCode: string };
type PrinterCfg = { id?: number; billPrinter: string; barcodePrinter: string; tokenPrinter: string };

function PrinterTab() {
  const qc = useQueryClient();
  const { data: cfg } = useQuery<PrinterCfg>({ queryKey: ["printer-settings"], queryFn: () => api.get("/api/printers/settings") });
  const [form, setForm] = useState<PrinterCfg | null>(null);
  const cur = form ?? cfg ?? null;
  const save = useMutation({
    mutationFn: (body: PrinterCfg) => api.put("/api/printers/settings", body),
    onSuccess: (saved) => { qc.invalidateQueries({ queryKey: ["printer-settings"] }); setForm(saved as PrinterCfg); },
  });
  if (!cur) return <div className="bg-card border border-card-border rounded-xl p-8 text-center text-muted-foreground">Loading printer settings…</div>;
  const update = (k: keyof PrinterCfg, v: string) => setForm({ ...(cur as PrinterCfg), [k]: v });
  return (
    <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
      <div>
        <h2 className="font-bold text-lg flex items-center gap-2"><Printer size={16} /> Printer Routing</h2>
        <p className="text-sm text-muted-foreground mt-1">Auto-routes bill, barcode, and token print jobs to the configured printer names.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div><Label>Bill Printer</Label><Input value={cur.billPrinter} onChange={(e) => update("billPrinter", e.target.value)} className="mt-1" placeholder="Windows / system printer name" /></div>
        <div><Label>Barcode Printer</Label><Input value={cur.barcodePrinter} onChange={(e) => update("barcodePrinter", e.target.value)} className="mt-1" placeholder="Windows / system printer name" /></div>
        <div><Label>Token Printer</Label><Input value={cur.tokenPrinter} onChange={(e) => update("tokenPrinter", e.target.value)} className="mt-1" placeholder="Windows / system printer name" /></div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={() => setForm(cfg ?? null)}>Reset</Button>
        <Button onClick={() => save.mutate(cur)} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
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

function ChangePasswordTab() {
  const { data: users = [] } = useQuery<AppUser[]>({ queryKey: ["users"], queryFn: () => api.get("/api/users") });
  const [visible, setVisible] = useState(false);
  const changePassword = useMutation({ mutationFn: (body: { userId: number; currentPin: string; newPin: string }) => api.patch(`/api/users/${body.userId}/password`, { currentPin: body.currentPin, newPin: body.newPin }) });
  const { register, handleSubmit, watch, reset, setValue } = useForm<ChangePasswordForm>({ defaultValues: { userId: "", currentPin: "", newPin: "", confirmPin: "" } });
  const onSubmit = handleSubmit((d) => { if (!d.userId || d.newPin !== d.confirmPin) return; changePassword.mutate({ userId: Number(d.userId), currentPin: d.currentPin, newPin: d.newPin }, { onSuccess: () => reset({ userId: "", currentPin: "", newPin: "", confirmPin: "" }) }); });
  return (<div className="max-w-2xl space-y-4"><div className="bg-card border border-card-border rounded-xl p-5"><p className="text-sm text-muted-foreground">Change a user PIN/password for login and secure actions.</p></div><form onSubmit={onSubmit} className="space-y-4 bg-card border border-card-border rounded-xl p-5"><div><Label>User</Label><Select value={watch("userId")} onValueChange={(v) => setValue("userId", v)}><SelectTrigger className="mt-1"><SelectValue placeholder="Select user" /></SelectTrigger><SelectContent>{users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name} — {u.role}</SelectItem>)}</SelectContent></Select></div><div><Label>Current PIN</Label><Input {...register("currentPin", { required: true })} className="mt-1" type={visible ? "text" : "password"} /></div><div><Label>New PIN</Label><Input {...register("newPin", { required: true })} className="mt-1" type={visible ? "text" : "password"} /></div><div><Label>Confirm New PIN</Label><Input {...register("confirmPin", { required: true })} className="mt-1" type={visible ? "text" : "password"} /></div><div className="flex items-center justify-between"><button type="button" onClick={() => setVisible((v) => !v)} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">{visible ? <EyeOff size={14} /> : <Eye size={14} />} Toggle visibility</button><Button type="submit" disabled={changePassword.isPending}>Update PIN</Button></div>{changePassword.isError && <p className="text-sm text-destructive">Failed to update PIN.</p>}</form></div>);
}
