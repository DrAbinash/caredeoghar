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
  { id: "users", label: "Users", icon: Users },
  { id: "email", label: "Email Notifications", icon: Mail },
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
        {tab === "users" && <UsersTab qc={qc} />}
        {tab === "email" && <EmailTab />}
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

function EmailTab() { const { data: settings } = useQuery<EmailSettings>({ queryKey: ["email-settings"], queryFn: () => api.get("/api/email-settings") }); const save = useMutation({ mutationFn: (body: EmailSettings) => api.put("/api/email-settings", body) }); const { register, handleSubmit, reset } = useForm<EmailSettings>({ defaultValues: settings }); return (<div className="grid grid-cols-1 gap-4"><div className="bg-card border border-card-border rounded-xl p-4"><p className="text-sm text-muted-foreground">Configure SMTP and email notifications.</p></div><form onSubmit={handleSubmit((d) => save.mutate(d))} className="space-y-4 bg-card border border-card-border rounded-xl p-4"><div className="grid md:grid-cols-2 gap-4"><div><Label>SMTP Host</Label><Input {...register("smtpHost")} className="mt-1" /></div><div><Label>SMTP Port</Label><Input {...register("smtpPort")} className="mt-1" /></div><div><Label>SMTP User</Label><Input {...register("smtpUser")} className="mt-1" /></div><div><Label>SMTP Password</Label><Input {...register("smtpPassword")} className="mt-1" type="password" /></div><div><Label>From Address</Label><Input {...register("fromAddress")} className="mt-1" /></div><div><Label>From Name</Label><Input {...register("fromName")} className="mt-1" /></div><div><Label>Admin Email</Label><Input {...register("adminEmail")} className="mt-1" /></div><div><Label>Extra Recipients</Label><Input {...register("extraRecipients")} className="mt-1" /></div></div><div className="flex justify-end gap-2"><Button variant="outline" type="button" onClick={() => reset(settings)}>Reset</Button><Button type="submit">Save</Button></div></form></div>);
}

function ManualTab() { const manualText = buildManualText(); return (<div className="space-y-4"><div className="bg-card border border-card-border rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"><div><p className="text-sm font-semibold uppercase text-muted-foreground mb-1">Downloadable Manual</p><h2 className="text-xl font-bold">User Manual & Software Functionality</h2><p className="text-sm text-muted-foreground mt-1">A printable guide covering daily workflow, billing, lab, inventory, referrals, and administration.</p></div><Button onClick={() => downloadTextFile("Diagnostic-Center-Billing-ERP-Manual.txt", manualText)}><Download size={14} className="mr-2" /> Download Manual</Button></div><div className="grid gap-4 md:grid-cols-2">{MANUAL_SECTIONS.map((section) => { const Icon = section.icon; return (<div key={section.title} className="bg-card border border-card-border rounded-xl p-5"><div className="flex items-center gap-2 mb-3"><Icon size={16} className="text-primary" /><h3 className="font-semibold">{section.title}</h3></div><ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">{section.points.map((point) => <li key={point}>{point}</li>)}</ul></div>); })}</div><div className="bg-muted/30 border border-card-border rounded-xl p-5"><div className="flex items-center gap-2 mb-3"><FileText size={16} className="text-primary" /><h3 className="font-semibold">Software Functionality Summary</h3></div><div className="grid gap-3 md:grid-cols-3 text-sm"><div className="bg-card border border-card-border rounded-lg p-3"><p className="font-medium mb-1">Patient Flow</p><p className="text-muted-foreground">Register, order tests, bill, collect payments, and track history.</p></div><div className="bg-card border border-card-border rounded-lg p-3"><p className="font-medium mb-1">Operations</p><p className="text-muted-foreground">Manage doctors, commissions, inventory, lab reports, and accounting.</p></div><div className="bg-card border border-card-border rounded-lg p-3"><p className="font-medium mb-1">Security</p><p className="text-muted-foreground">Role-based permissions, audit logs, email alerts, and super admin portal.</p></div></div></div></div>);
}

function ChangePasswordTab() {
  const { data: users = [] } = useQuery<AppUser[]>({ queryKey: ["users"], queryFn: () => api.get("/api/users") });
  const [visible, setVisible] = useState(false);
  const changePassword = useMutation({ mutationFn: (body: { userId: number; currentPin: string; newPin: string }) => api.patch(`/api/users/${body.userId}/password`, { currentPin: body.currentPin, newPin: body.newPin }) });
  const { register, handleSubmit, watch, reset, setValue } = useForm<ChangePasswordForm>({ defaultValues: { userId: "", currentPin: "", newPin: "", confirmPin: "" } });
  const onSubmit = handleSubmit((d) => { if (!d.userId || d.newPin !== d.confirmPin) return; changePassword.mutate({ userId: Number(d.userId), currentPin: d.currentPin, newPin: d.newPin }, { onSuccess: () => reset({ userId: "", currentPin: "", newPin: "", confirmPin: "" }) }); });
  return (<div className="max-w-2xl space-y-4"><div className="bg-card border border-card-border rounded-xl p-5"><p className="text-sm text-muted-foreground">Change a user PIN/password for login and secure actions.</p></div><form onSubmit={onSubmit} className="space-y-4 bg-card border border-card-border rounded-xl p-5"><div><Label>User</Label><Select value={watch("userId")} onValueChange={(v) => setValue("userId", v)}><SelectTrigger className="mt-1"><SelectValue placeholder="Select user" /></SelectTrigger><SelectContent>{users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name} — {u.role}</SelectItem>)}</SelectContent></Select></div><div><Label>Current PIN</Label><Input {...register("currentPin", { required: true })} className="mt-1" type={visible ? "text" : "password"} /></div><div><Label>New PIN</Label><Input {...register("newPin", { required: true })} className="mt-1" type={visible ? "text" : "password"} /></div><div><Label>Confirm New PIN</Label><Input {...register("confirmPin", { required: true })} className="mt-1" type={visible ? "text" : "password"} /></div><div className="flex items-center justify-between"><button type="button" onClick={() => setVisible((v) => !v)} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">{visible ? <EyeOff size={14} /> : <Eye size={14} />} Toggle visibility</button><Button type="submit" disabled={changePassword.isPending}>Update PIN</Button></div>{changePassword.isError && <p className="text-sm text-destructive">Failed to update PIN.</p>}</form></div>);
}
