import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListDoctors, useListTests } from "@workspace/api-client-react";
import { api } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import {
  Plus, Trash2, ChevronDown, ChevronUp, IndianRupee,
  Stethoscope, Star, TrendingUp,
} from "lucide-react";

type CommRule = {
  id: number; doctorId: number; name: string; type: "percentage" | "fixed";
  value: number; scope: "all" | "category" | "test"; categories: string[];
  testIds: number[]; isExclusive: boolean; isActive: boolean;
};
type ReportEntry = {
  doctor: { id: number; name: string; specialization: string; defaultCommission: number; defaultCommissionType: string };
  orderCount: number; totalRevenue: number; totalCommission: number;
  orders: { orderId: number; orderNumber: string; date: string; revenue: number; commission: number; commissionRule: string }[];
};

const CATEGORIES = ["hematology", "biochemistry", "microbiology", "serology", "radiology", "cardiology", "urine analysis", "other"];
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Referrals() {
  const qc = useQueryClient();
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [editRule, setEditRule] = useState<CommRule | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set());
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [to, setTo] = useState(new Date().toISOString().split("T")[0]);

  const { data: doctorData } = useListDoctors({});
  const { data: testsData } = useListTests({});
  const doctors = doctorData?.doctors ?? [];
  const tests = testsData?.tests ?? [];

  const { data: rules = [] } = useQuery<CommRule[]>({
    queryKey: ["commission-rules", selectedDoctorId],
    queryFn: () => api.get(`/api/commission/rules${selectedDoctorId ? `?doctorId=${selectedDoctorId}` : ""}`),
  });
  const { data: report = [], isLoading: reportLoading } = useQuery<ReportEntry[]>({
    queryKey: ["commission-report", from, to, selectedDoctorId],
    queryFn: () => api.get(`/api/commission/report?from=${from}&to=${to}${selectedDoctorId ? `&doctorId=${selectedDoctorId}` : ""}`),
  });

  const deleteRule = useMutation({
    mutationFn: (id: number) => api.delete(`/api/commission/rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["commission-rules"] }),
  });
  const saveRule = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editRule ? api.patch(`/api/commission/rules/${editRule.id}`, body) : api.post("/api/commission/rules", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["commission-rules"] }); setRuleOpen(false); setEditRule(null); reset(); },
  });

  const { register, handleSubmit, reset, watch, setValue } = useForm<{
    name: string; type: string; value: string; scope: string;
    categories: string; testIds: string; isExclusive: string;
  }>();
  const scope = watch("scope", "all");
  const ruleType = watch("type", "percentage");

  const openEdit = (rule: CommRule) => {
    setEditRule(rule);
    reset({
      name: rule.name, type: rule.type, value: String(rule.value), scope: rule.scope,
      categories: rule.categories.join(","), testIds: rule.testIds.join(","),
      isExclusive: rule.isExclusive ? "true" : "false",
    });
    setRuleOpen(true);
  };

  const onSave = handleSubmit((d) => {
    const body: Record<string, unknown> = {
      doctorId: selectedDoctorId,
      name: d.name, type: d.type, value: Number(d.value), scope: d.scope,
      isExclusive: d.isExclusive === "true",
    };
    if (d.scope === "category") body.categories = d.categories.split(",").map(s => s.trim()).filter(Boolean);
    if (d.scope === "test") body.testIds = d.testIds.split(",").map(n => Number(n)).filter(Boolean);
    saveRule.mutate(body);
  });

  const totalCommission = report.reduce((s, r) => s + r.totalCommission, 0);
  const totalRevenue = report.reduce((s, r) => s + r.totalRevenue, 0);

  return (
    <div className="pb-8">
      <PageHeader
        title="Referrals & Commission"
        subtitle="Manage doctor referral commissions and payouts"
      />

      <div className="px-6">
        <Tabs defaultValue="rules">
          <TabsList className="mb-4">
            <TabsTrigger value="rules">Commission Rules</TabsTrigger>
            <TabsTrigger value="report">Payout Report</TabsTrigger>
          </TabsList>

          {/* ── Commission Rules Tab ── */}
          <TabsContent value="rules" className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <div className="w-64">
                <Select onValueChange={(v) => setSelectedDoctorId(v === "all" ? null : Number(v))}>
                  <SelectTrigger><SelectValue placeholder="All Doctors" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Doctors</SelectItem>
                    {doctors.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {selectedDoctorId && (
                <Button size="sm" onClick={() => { setEditRule(null); reset({ type: "percentage", scope: "all", isExclusive: "false" }); setRuleOpen(true); }}>
                  <Plus size={14} className="mr-1" /> Add Rule
                </Button>
              )}
            </div>

            {!selectedDoctorId ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {doctors.map((d) => {
                  const doctorRules = rules.filter(r => r.doctorId === d.id);
                  return (
                    <div
                      key={d.id}
                      className="bg-card border border-card-border rounded-xl p-5 cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => setSelectedDoctorId(d.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Stethoscope size={16} className="text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">{d.name}</p>
                          <p className="text-xs text-muted-foreground">{d.specialization}</p>
                          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                            <Star size={11} className="text-amber-500" />
                            Default: {Number((d as unknown as Record<string, string>).defaultCommission) > 0
                              ? `${(d as unknown as Record<string, string>).defaultCommissionType === "percentage" ? Number((d as unknown as Record<string, string>).defaultCommission) + "%" : inr(Number((d as unknown as Record<string, string>).defaultCommission))} per referral`
                              : "No default"}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setSelectedDoctorId(null)}>
                  ← Back to all doctors
                </Button>
                {rules.filter(r => r.doctorId === selectedDoctorId).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">No custom rules. Uses default commission from doctor profile.</div>
                ) : (
                  <div className="bg-card border border-card-border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b border-card-border">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Rule Name</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Value</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Scope</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Flags</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {rules.filter(r => r.doctorId === selectedDoctorId).map((rule) => (
                          <tr key={rule.id} className="border-b border-card-border last:border-0 hover:bg-muted/20">
                            <td className="px-4 py-3 font-medium">{rule.name}</td>
                            <td className="px-4 py-3">
                              {rule.type === "percentage" ? `${rule.value}%` : inr(rule.value)}
                            </td>
                            <td className="px-4 py-3 capitalize text-muted-foreground">{rule.scope}</td>
                            <td className="px-4 py-3">
                              {rule.isExclusive && <Badge className="bg-purple-100 text-purple-700 text-xs mr-1">Exclusive</Badge>}
                              {!rule.isActive && <Badge className="bg-gray-100 text-gray-500 text-xs">Inactive</Badge>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1 justify-end">
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(rule)}>Edit</Button>
                                <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive" onClick={() => deleteRule.mutate(rule.id)}>
                                  <Trash2 size={13} />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* ── Payout Report Tab ── */}
          <TabsContent value="report" className="space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <Label className="text-xs">From</Label>
                <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-1 w-36" />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="mt-1 w-36" />
              </div>
              <div>
                <Label className="text-xs">Doctor</Label>
                <Select onValueChange={v => setSelectedDoctorId(v === "all" ? null : Number(v))}>
                  <SelectTrigger className="mt-1 w-48"><SelectValue placeholder="All Doctors" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Doctors</SelectItem>
                    {doctors.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-card border border-card-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Total Revenue (Referrals)</p>
                <p className="text-xl font-bold text-foreground">{inr(totalRevenue)}</p>
              </div>
              <div className="bg-card border border-card-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Total Commission Payable</p>
                <p className="text-xl font-bold text-amber-600">{inr(totalCommission)}</p>
              </div>
              <div className="bg-card border border-card-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Effective Rate</p>
                <p className="text-xl font-bold text-foreground">
                  {totalRevenue > 0 ? ((totalCommission / totalRevenue) * 100).toFixed(1) : "0"}%
                </p>
              </div>
            </div>

            {reportLoading ? (
              <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
            ) : report.filter(r => r.orderCount > 0).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No referral data for selected period</div>
            ) : (
              <div className="space-y-3">
                {report.filter(r => r.orderCount > 0).map((entry) => {
                  const expanded = expandedOrders.has(entry.doctor.id);
                  return (
                    <div key={entry.doctor.id} className="bg-card border border-card-border rounded-xl overflow-hidden">
                      <div
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/20"
                        onClick={() => setExpandedOrders(prev => {
                          const next = new Set(prev);
                          expanded ? next.delete(entry.doctor.id) : next.add(entry.doctor.id);
                          return next;
                        })}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Stethoscope size={15} className="text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{entry.doctor.name}</p>
                            <p className="text-xs text-muted-foreground">{entry.doctor.specialization} · {entry.orderCount} orders</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Revenue</p>
                            <p className="font-semibold text-sm">{inr(entry.totalRevenue)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Commission</p>
                            <p className="font-semibold text-sm text-amber-600">{inr(entry.totalCommission)}</p>
                          </div>
                          {expanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                        </div>
                      </div>
                      {expanded && entry.orders.length > 0 && (
                        <div className="border-t border-card-border">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="text-left px-4 py-2 text-muted-foreground">Order</th>
                                <th className="text-left px-4 py-2 text-muted-foreground">Date</th>
                                <th className="text-right px-4 py-2 text-muted-foreground">Revenue</th>
                                <th className="text-right px-4 py-2 text-muted-foreground">Commission</th>
                                <th className="text-left px-4 py-2 text-muted-foreground">Rule Applied</th>
                              </tr>
                            </thead>
                            <tbody>
                              {entry.orders.map(o => (
                                <tr key={o.orderId} className="border-t border-card-border">
                                  <td className="px-4 py-2 font-mono">{o.orderNumber}</td>
                                  <td className="px-4 py-2 text-muted-foreground">{o.date}</td>
                                  <td className="px-4 py-2 text-right">{inr(o.revenue)}</td>
                                  <td className="px-4 py-2 text-right text-amber-600">{inr(o.commission)}</td>
                                  <td className="px-4 py-2 text-muted-foreground">{o.commissionRule}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Rule Create/Edit Dialog */}
      <Dialog open={ruleOpen} onOpenChange={(o) => { setRuleOpen(o); if (!o) setEditRule(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editRule ? "Edit" : "Add"} Commission Rule</DialogTitle></DialogHeader>
          <form onSubmit={onSave} className="space-y-4">
            <div><Label>Rule Name *</Label><Input {...register("name", { required: true })} className="mt-1" placeholder="e.g., Lab Tests 10%" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select onValueChange={(v) => setValue("type", v)} defaultValue={editRule?.type || "percentage"}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed (₹)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{ruleType === "percentage" ? "Percentage" : "Amount (₹)"} *</Label>
                <Input type="number" step="any" {...register("value", { required: true })} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Applies To</Label>
              <Select onValueChange={(v) => setValue("scope", v)} defaultValue={editRule?.scope || "all"}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tests</SelectItem>
                  <SelectItem value="category">Specific Categories</SelectItem>
                  <SelectItem value="test">Specific Tests</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scope === "category" && (
              <div>
                <Label>Categories (comma-separated)</Label>
                <Input {...register("categories")} className="mt-1" placeholder="hematology, biochemistry" />
                <p className="text-xs text-muted-foreground mt-1">Options: {CATEGORIES.join(", ")}</p>
              </div>
            )}
            {scope === "test" && (
              <div>
                <Label>Tests</Label>
                <div className="mt-1 border border-input rounded-lg p-2 max-h-32 overflow-y-auto space-y-1">
                  {tests.map(t => (
                    <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" value={t.id}
                        onChange={e => {
                          const cur = (watch("testIds") || "").split(",").filter(Boolean).map(Number);
                          const next = e.target.checked ? [...cur, t.id] : cur.filter(id => id !== t.id);
                          setValue("testIds", next.join(","));
                        }}
                        defaultChecked={editRule?.testIds.includes(t.id)}
                        className="rounded"
                      />
                      {t.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label>Priority</Label>
              <Select onValueChange={(v) => setValue("isExclusive", v)} defaultValue={editRule ? (editRule.isExclusive ? "true" : "false") : "false"}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">Normal (can stack)</SelectItem>
                  <SelectItem value="true">Exclusive (overrides default)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => { setRuleOpen(false); setEditRule(null); }}>Cancel</Button>
              <Button type="submit" disabled={saveRule.isPending}>{saveRule.isPending ? "Saving…" : editRule ? "Update" : "Add Rule"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
