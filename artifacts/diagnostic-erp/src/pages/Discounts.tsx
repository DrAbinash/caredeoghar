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
import { Switch } from "@/components/ui/switch";
import { useForm, Controller } from "react-hook-form";
import {
  Plus, Pencil, Trash2, Tag, Percent, BadgeDollarSign,
  Calendar, CheckCircle2, XCircle, AlertCircle, UserCheck,
  Stethoscope, Baby, X,
} from "lucide-react";

type Test = { id: number; name: string; code: string | null; category: string | null };
type Doctor = { id: number; name: string; specialization?: string };
type RuleCondition =
  | { type: "age_gte"; value: number }
  | { type: "age_lte"; value: number }
  | { type: "referral_doctor_id"; value: number };

type DiscountRule = {
  id: number; name: string; type: "percentage" | "fixed"; value: number;
  scope: "all" | "category" | "test"; categories: string[]; testIds: number[];
  conditions: RuleCondition[];
  expiresAt: string | null; reason: string | null; isActive: boolean;
  createdAt: string;
};

const CATEGORIES = ["Haematology", "Biochemistry", "Microbiology", "Serology", "Pathology", "Radiology", "Cardiology", "Other"];

const CONDITION_TYPES = [
  { value: "age_gte", label: "Patient Age ≥ (years)", icon: UserCheck },
  { value: "age_lte", label: "Patient Age ≤ (years)", icon: Baby },
  { value: "referral_doctor_id", label: "Referred by Doctor", icon: Stethoscope },
] as const;

function statusBadge(rule: DiscountRule) {
  const today = new Date().toISOString().split("T")[0];
  if (!rule.isActive) return <Badge className="bg-gray-100 text-gray-600"><XCircle size={11} className="mr-1" />Inactive</Badge>;
  if (rule.expiresAt && rule.expiresAt < today) return <Badge className="bg-red-100 text-red-700"><AlertCircle size={11} className="mr-1" />Expired</Badge>;
  if (rule.expiresAt) {
    const daysLeft = Math.ceil((new Date(rule.expiresAt).getTime() - Date.now()) / 86400000);
    if (daysLeft <= 7) return <Badge className="bg-amber-100 text-amber-700"><Calendar size={11} className="mr-1" />Expires in {daysLeft}d</Badge>;
  }
  return <Badge className="bg-green-100 text-green-700"><CheckCircle2 size={11} className="mr-1" />Active</Badge>;
}

type FormValues = {
  name: string; type: string; value: string; scope: string;
  categories: string[]; testIds: string[]; expiresAt: string; reason: string;
};

export default function Discounts() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editRule, setEditRule] = useState<DiscountRule | null>(null);
  const [catInput, setCatInput] = useState("");
  const [testInput, setTestInput] = useState("");
  // Conditions state managed separately (not via react-hook-form for simplicity)
  const [conditions, setConditions] = useState<RuleCondition[]>([]);

  const { data: rules = [], isLoading } = useQuery<DiscountRule[]>({
    queryKey: ["discounts"],
    queryFn: () => api.get("/api/discounts"),
  });
  const { data: testsResp } = useQuery<{ tests: Test[]; total: number }>({
    queryKey: ["tests-simple"],
    queryFn: () => api.get("/api/tests"),
  });
  const tests: Test[] = testsResp?.tests ?? [];

  const { data: doctors = [] } = useQuery<Doctor[]>({
    queryKey: ["doctors"],
    queryFn: () => api.get("/api/doctors"),
  });

  const { register, handleSubmit, reset, watch, setValue, control } = useForm<FormValues>({
    defaultValues: { name: "", type: "percentage", value: "", scope: "all", categories: [], testIds: [], expiresAt: "", reason: "" },
  });
  const scope = watch("scope");
  const type = watch("type");
  const selectedCats = watch("categories") || [];
  const selectedTestIds = watch("testIds") || [];

  const openCreate = () => {
    setEditRule(null);
    setConditions([]);
    reset({ name: "", type: "percentage", value: "", scope: "all", categories: [], testIds: [], expiresAt: "", reason: "" });
    setOpen(true);
  };
  const openEdit = (r: DiscountRule) => {
    setEditRule(r);
    setConditions(r.conditions ?? []);
    reset({ name: r.name, type: r.type, value: String(r.value), scope: r.scope, categories: r.categories, testIds: r.testIds.map(String), expiresAt: r.expiresAt ?? "", reason: r.reason ?? "" });
    setOpen(true);
  };

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/discounts", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["discounts"] }); setOpen(false); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => api.patch(`/api/discounts/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["discounts"] }); setOpen(false); },
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => api.patch(`/api/discounts/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discounts"] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/discounts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discounts"] }),
  });

  const onSubmit = (data: FormValues) => {
    const body = {
      name: data.name,
      type: data.type,
      value: Number(data.value),
      scope: data.scope,
      categories: data.scope === "category" ? data.categories : [],
      testIds: data.scope === "test" ? data.testIds.map(Number) : [],
      conditions,
      expiresAt: data.expiresAt || null,
      reason: data.reason || null,
    };
    if (editRule) updateMut.mutate({ id: editRule.id, body });
    else createMut.mutate(body);
  };

  // ── Condition helpers ────────────────────────────────────────────────────────
  function addCondition() {
    setConditions(prev => [...prev, { type: "age_gte", value: 60 }]);
  }
  function removeCondition(idx: number) {
    setConditions(prev => prev.filter((_, i) => i !== idx));
  }
  function updateConditionType(idx: number, newType: RuleCondition["type"]) {
    setConditions(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      if (newType === "referral_doctor_id") return { type: newType, value: doctors[0]?.id ?? 0 };
      return { type: newType, value: 60 };
    }));
  }
  function updateConditionValue(idx: number, val: number) {
    setConditions(prev => prev.map((c, i) => i === idx ? { ...c, value: val } as RuleCondition : c));
  }

  const today = new Date().toISOString().split("T")[0];
  const activeCount = rules.filter(r => r.isActive && (!r.expiresAt || r.expiresAt >= today)).length;

  function conditionLabel(c: RuleCondition, docs: Doctor[]): string {
    if (c.type === "age_gte") return `Age ≥ ${c.value} yrs`;
    if (c.type === "age_lte") return `Age ≤ ${c.value} yrs`;
    if (c.type === "referral_doctor_id") {
      const d = docs.find(d => d.id === c.value);
      return `Referred by ${d?.name ?? `Doctor #${c.value}`}`;
    }
    return "";
  }

  return (
    <div className="pb-8">
      <PageHeader
        title="Discount Rules"
        subtitle={`${rules.length} rules · ${activeCount} active`}
        actions={<Button size="sm" onClick={openCreate}><Plus size={15} className="mr-1.5" />New Rule</Button>}
      />

      <div className="px-6 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Total Rules", value: rules.length, color: "text-foreground" },
            { label: "Active", value: activeCount, color: "text-green-600" },
            { label: "Expired / Inactive", value: rules.length - activeCount, color: "text-red-500" },
          ].map(c => (
            <div key={c.label} className="bg-card border border-card-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Rules list */}
        {isLoading ? (
          <div className="animate-pulse space-y-3">{[0,1,2].map(i => <div key={i} className="h-20 bg-muted rounded-xl" />)}</div>
        ) : rules.length === 0 ? (
          <div className="bg-card border border-card-border rounded-xl p-12 text-center">
            <Tag size={32} className="text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-foreground">No discount rules yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create rules to auto-apply discounts during billing</p>
            <Button className="mt-4" size="sm" onClick={openCreate}><Plus size={14} className="mr-1" />Create First Rule</Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {rules.map(rule => {
              const expired = rule.expiresAt && rule.expiresAt < today;
              return (
                <div key={rule.id} className={`bg-card border rounded-xl p-4 flex items-start justify-between gap-4 ${expired ? "border-red-200 bg-red-50/30 dark:bg-red-950/10" : "border-card-border"}`}>
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${rule.type === "percentage" ? "bg-blue-100 dark:bg-blue-900/30" : "bg-amber-100 dark:bg-amber-900/30"}`}>
                      {rule.type === "percentage" ? <Percent size={18} className="text-blue-600" /> : <BadgeDollarSign size={18} className="text-amber-600" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{rule.name}</p>
                        {statusBadge(rule)}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-sm text-primary font-bold">
                          {rule.type === "percentage" ? `${rule.value}% off` : `₹${rule.value} off`}
                        </span>
                        <span className="text-xs text-muted-foreground capitalize">
                          Scope: {rule.scope === "all" ? "All Tests" : rule.scope === "category" ? `Categories (${rule.categories.join(", ")})` : `Tests (${rule.testIds.length})`}
                        </span>
                        {rule.expiresAt && <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar size={11} />Expires {rule.expiresAt}</span>}
                      </div>
                      {/* Auto-apply condition badges */}
                      {rule.conditions && rule.conditions.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {rule.conditions.map((c, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                              <CheckCircle2 size={9} /> Auto: {conditionLabel(c, doctors)}
                            </span>
                          ))}
                        </div>
                      )}
                      {rule.reason && <p className="text-xs text-muted-foreground mt-0.5 italic">"{rule.reason}"</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Switch
                      checked={rule.isActive}
                      onCheckedChange={(v) => toggleMut.mutate({ id: rule.id, isActive: v })}
                    />
                    <Button size="icon" variant="ghost" onClick={() => openEdit(rule)}><Pencil size={14} /></Button>
                    <Button size="icon" variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => { if (confirm("Delete this discount rule?")) deleteMut.mutate(rule.id); }}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Info box */}
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-800 dark:text-blue-300">
          <p className="font-semibold mb-1">How discount rules work</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs">
            <li>Rules are automatically suggested during the billing step</li>
            <li>Auto-apply conditions (age, referring doctor) trigger the rule instantly when a patient is loaded in Billing Desk</li>
            <li>All conditions on a rule must match for it to auto-apply (AND logic)</li>
            <li>The best applicable discount is selected; staff can override within their allowed limit</li>
            <li>Per-user maximum discount limits are set in <strong>Settings → Users</strong></li>
            <li>Expired rules are shown but not applied during billing</li>
          </ul>
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editRule ? "Edit Discount Rule" : "New Discount Rule"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Rule Name *</Label>
              <Input {...register("name", { required: true })} className="mt-1" placeholder="e.g., Senior Citizen 10% Off" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Discount Type *</Label>
                <Controller control={control} name="type" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div>
                <Label>{type === "percentage" ? "Discount %" : "Discount ₹"} *</Label>
                <Input type="number" step="0.01" min="0" max={type === "percentage" ? "100" : undefined}
                  {...register("value", { required: true })} className="mt-1" placeholder={type === "percentage" ? "e.g., 10" : "e.g., 500"} />
              </div>
            </div>

            <div>
              <Label>Applies To *</Label>
              <Controller control={control} name="scope" render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => { field.onChange(v); setValue("categories", []); setValue("testIds", []); }}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tests</SelectItem>
                    <SelectItem value="category">Specific Categories</SelectItem>
                    <SelectItem value="test">Specific Tests</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </div>

            {scope === "category" && (
              <div>
                <Label>Select Categories</Label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {CATEGORIES.map(c => {
                    const sel = selectedCats.includes(c);
                    return (
                      <button key={c} type="button"
                        onClick={() => setValue("categories", sel ? selectedCats.filter(x => x !== c) : [...selectedCats, c])}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${sel ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary"}`}>
                        {c}
                      </button>
                    );
                  })}
                </div>
                <Input value={catInput} onChange={e => setCatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (catInput.trim()) { setValue("categories", [...selectedCats, catInput.trim()]); setCatInput(""); } } }}
                  className="mt-2" placeholder="Or type custom category + Enter" />
              </div>
            )}

            {scope === "test" && (
              <div>
                <Label>Select Tests</Label>
                <Input value={testInput} onChange={e => setTestInput(e.target.value)} className="mt-1" placeholder="Search tests…" />
                <div className="mt-2 max-h-40 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
                  {tests
                    .filter(t => !testInput ||
                      t.name.toLowerCase().includes(testInput.toLowerCase()) ||
                      (t.code ?? "").toLowerCase().includes(testInput.toLowerCase()))
                    .slice(0, 100)
                    .map(t => {
                      const sel = selectedTestIds.includes(String(t.id));
                      return (
                        <button key={t.id} type="button"
                          onClick={() => setValue("testIds", sel ? selectedTestIds.filter(x => x !== String(t.id)) : [...selectedTestIds, String(t.id)])}
                          className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center justify-between transition-colors ${sel ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                          <span>{t.code ? `${t.code} — ` : ""}{t.name}</span>
                          {sel && <CheckCircle2 size={12} className="text-primary flex-shrink-0" />}
                        </button>
                      );
                    })}
                  {tests.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">Loading tests…</p>}
                </div>
                {selectedTestIds.length > 0 && <p className="text-xs text-muted-foreground mt-1">{selectedTestIds.length} test(s) selected</p>}
              </div>
            )}

            {/* ── Auto-Apply Conditions ────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Auto-Apply Conditions <span className="text-xs font-normal text-muted-foreground ml-1">(optional — all must match)</span></Label>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2" onClick={addCondition}>
                  <Plus size={11} className="mr-1" /> Add
                </Button>
              </div>

              {conditions.length === 0 ? (
                <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                  No conditions — rule applies to every patient. Add conditions to auto-trigger based on age or referring doctor.
                </p>
              ) : (
                <div className="space-y-2">
                  {conditions.map((cond, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-muted/20 border border-card-border rounded-lg p-2">
                      {/* Type selector */}
                      <Select value={cond.type} onValueChange={(v) => updateConditionType(idx, v as RuleCondition["type"])}>
                        <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONDITION_TYPES.map(ct => (
                            <SelectItem key={ct.value} value={ct.value}>
                              <span className="flex items-center gap-1.5">
                                <ct.icon size={12} /> {ct.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Value */}
                      {cond.type === "referral_doctor_id" ? (
                        <Select value={String(cond.value)} onValueChange={(v) => updateConditionValue(idx, Number(v))}>
                          <SelectTrigger className="h-7 text-xs w-40 flex-shrink-0">
                            <SelectValue placeholder="Pick doctor" />
                          </SelectTrigger>
                          <SelectContent>
                            {doctors.map(d => (
                              <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                            ))}
                            {doctors.length === 0 && <SelectItem value="0" disabled>No doctors found</SelectItem>}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type="number" min="0" max="120"
                          value={cond.value}
                          onChange={e => updateConditionValue(idx, Number(e.target.value))}
                          className="h-7 text-xs w-20 flex-shrink-0"
                          placeholder="years"
                        />
                      )}

                      <button type="button" onClick={() => removeCondition(idx)}
                        className="flex-shrink-0 text-muted-foreground hover:text-red-500 transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  ))}

                  <p className="text-[10px] text-muted-foreground">
                    When a patient is loaded in Billing Desk, matching rules are auto-applied instantly.
                  </p>
                </div>
              )}
            </div>

            <div>
              <Label>Expiry Date</Label>
              <Input type="date" {...register("expiresAt")} className="mt-1" min={today} />
              <p className="text-xs text-muted-foreground mt-1">Leave blank for no expiry</p>
            </div>

            <div>
              <Label>Default Reason / Description</Label>
              <Input {...register("reason")} className="mt-1" placeholder="e.g., Senior citizen concession" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {createMut.isPending || updateMut.isPending ? "Saving…" : editRule ? "Update Rule" : "Create Rule"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
