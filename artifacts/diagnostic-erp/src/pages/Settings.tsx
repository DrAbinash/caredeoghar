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
  Plus, Trash2, Pencil, User2, Shield, CheckSquare, Square,
} from "lucide-react";

type AppUser = {
  id: number; name: string; email: string; role: string;
  permissions: string | null; pin: string | null; isActive: boolean;
};

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

export default function Settings() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [defaultPerms, setDefaultPerms] = useState<Record<string, string[]>>({});

  const { data: users = [], isLoading } = useQuery<AppUser[]>({
    queryKey: ["users"],
    queryFn: () => api.get("/api/users"),
  });
  useQuery<Record<string, string[]>>({
    queryKey: ["default-permissions"],
    queryFn: async () => {
      const data = await api.get<Record<string, string[]>>("/api/users/default-permissions");
      setDefaultPerms(data);
      return data;
    },
  });

  const saveUser = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editUser
        ? api.patch(`/api/users/${editUser.id}`, body)
        : api.post("/api/users", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setOpen(false); setEditUser(null); reset(); },
  });
  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      api.patch(`/api/users/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
  const deleteUser = useMutation({
    mutationFn: (id: number) => api.delete(`/api/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const { register, handleSubmit, reset, setValue, watch } = useForm<{
    name: string; email: string; role: string; pin: string;
  }>();
  const roleWatch = watch("role");

  const openAdd = () => {
    setEditUser(null);
    setSelectedPerms(defaultPerms["receptionist"] ?? []);
    reset({ role: "receptionist" });
    setOpen(true);
  };
  const openEdit = (u: AppUser) => {
    setEditUser(u);
    setSelectedPerms(u.permissions ? JSON.parse(u.permissions) : (defaultPerms[u.role] ?? []));
    reset({ name: u.name, email: u.email, role: u.role, pin: u.pin ?? "" });
    setOpen(true);
  };

  const togglePerm = (path: string) => {
    setSelectedPerms(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  const onSave = handleSubmit((d) => {
    saveUser.mutate({ ...d, permissions: selectedPerms, pin: d.pin || null });
  });

  return (
    <div className="pb-8">
      <PageHeader
        title="Settings — User Management"
        subtitle="Manage user accounts, roles, and module permissions"
        actions={
          <Button size="sm" onClick={openAdd}>
            <Plus size={14} className="mr-1" /> Add User
          </Button>
        }
      />

      <div className="px-6 space-y-4">
        {isLoading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <User2 size={40} className="mx-auto mb-3 opacity-30" />
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
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => openEdit(u)}>
                            <Pencil size={13} />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive" onClick={() => deleteUser.mutate(u.id)}>
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Role info */}
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

      {/* Add / Edit Dialog */}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditUser(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editUser ? "Edit User" : "Add New User"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Full Name *</Label>
                <Input {...register("name", { required: true })} className="mt-1" />
              </div>
              <div>
                <Label>Email *</Label>
                <Input type="email" {...register("email", { required: true })} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Role *</Label>
                <Select
                  defaultValue={editUser?.role ?? "receptionist"}
                  onValueChange={(v) => {
                    setValue("role", v);
                    setSelectedPerms(defaultPerms[v] ?? []);
                  }}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => (
                      <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>PIN (4 digits)</Label>
                <Input
                  type="text"
                  maxLength={4}
                  pattern="[0-9]{4}"
                  {...register("pin")}
                  className="mt-1"
                  placeholder="Optional"
                />
              </div>
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
                    <button
                      key={mod.path}
                      type="button"
                      className={`flex items-center gap-2 text-sm text-left px-2 py-1.5 rounded-md transition-colors ${checked ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                      onClick={() => togglePerm(mod.path)}
                    >
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
              <Button type="submit" disabled={saveUser.isPending}>
                {saveUser.isPending ? "Saving…" : editUser ? "Update User" : "Add User"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
