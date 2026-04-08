import { useState, useRef } from "react";
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
  Plus, Trash2, ChevronDown, ChevronUp, Stethoscope, Star,
  Printer, BarChart2, List, Tag, ClipboardList,
} from "lucide-react";

type CommRule = {
  id: number; doctorId: number; name: string; type: "percentage" | "fixed";
  value: number; scope: "all" | "category" | "test"; categories: string[];
  testIds: number[]; isExclusive: boolean; isActive: boolean;
};

type TestRow = {
  testId: number; testName: string; category: string;
  orderId: number; orderNumber: string; orderDate: string;
  price: number; commission: number; ruleName: string;
};

type DetailedDoctor = {
  doctor: { id: number; name: string; specialization: string; defaultCommission: number; defaultCommissionType: string };
  orderCount: number; testCount: number;
  totalRevenue: number; totalCommission: number; effectiveRate: number;
  grouped: unknown;
  testRows?: TestRow[];
};
type DetailedReport = { report: DetailedDoctor[]; grandTotal: { doctors: number; orders: number; revenue: number; commission: number } };

type SimpleEntry = {
  doctor: { id: number; name: string; specialization: string; defaultCommission: number; defaultCommissionType: string };
  orderCount: number; totalRevenue: number; totalCommission: number;
  orders: { orderId: number; orderNumber: string; date: string; revenue: number; commission: number; commissionRule: string }[];
};

const CATEGORIES = ["hematology", "biochemistry", "microbiology", "serology", "radiology", "cardiology", "urine analysis", "other"];
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type GroupBy = "consolidated" | "order" | "test" | "category";

const GROUP_OPTIONS: { value: GroupBy; label: string; icon: React.ReactNode }[] = [
  { value: "consolidated", label: "Consolidated", icon: <BarChart2 size={14} /> },
  { value: "order",        label: "By Order",     icon: <ClipboardList size={14} /> },
  { value: "test",         label: "By Test",      icon: <List size={14} /> },
  { value: "category",     label: "By Category",  icon: <Tag size={14} /> },
];

export default function Referrals() {
  const qc = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [editRule, setEditRule] = useState<CommRule | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set());
  const [groupBy, setGroupBy] = useState<GroupBy>("consolidated");

  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0];
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

  const { data: detailedData, isLoading: reportLoading } = useQuery<DetailedReport>({
    queryKey: ["commission-report-detailed", from, to, selectedDoctorId, groupBy],
    queryFn: () =>
      api.get(`/api/commission/report-detailed?from=${from}&to=${to}&groupBy=${groupBy === "consolidated" ? "consolidated" : groupBy}${selectedDoctorId ? `&doctorId=${selectedDoctorId}` : ""}`),
  });

  // Legacy consolidated also for the simple order view
  const { data: simpleReport = [] } = useQuery<SimpleEntry[]>({
    queryKey: ["commission-report-simple", from, to, selectedDoctorId],
    queryFn: () => api.get(`/api/commission/report?from=${from}&to=${to}${selectedDoctorId ? `&doctorId=${selectedDoctorId}` : ""}`),
    enabled: groupBy === "order",
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
      doctorId: selectedDoctorId, name: d.name, type: d.type, value: Number(d.value),
      scope: d.scope, isExclusive: d.isExclusive === "true",
    };
    if (d.scope === "category") body.categories = d.categories.split(",").map(s => s.trim()).filter(Boolean);
    if (d.scope === "test") body.testIds = d.testIds.split(",").map(n => Number(n)).filter(Boolean);
    saveRule.mutate(body);
  });

  const report = detailedData?.report ?? [];
  const grandTotal = detailedData?.grandTotal ?? { doctors: 0, orders: 0, revenue: 0, commission: 0 };

  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(`
      <html><head>
        <title>Commission Report — ${from} to ${to}</title>
        <style>
          * { box-sizing:border-box; margin:0; padding:0; }
          body { font-family:sans-serif; font-size:13px; color:#1a1a1a; padding:24px; }
          h1 { font-size:18px; margin-bottom:4px; }
          h2 { font-size:14px; font-weight:600; margin:16px 0 6px; color:#374151; }
          .meta { font-size:12px; color:#6b7280; margin-bottom:16px; }
          .summary { display:flex; gap:12px; margin-bottom:16px; flex-wrap:wrap; }
          .card { border:1px solid #e5e7eb; border-radius:6px; padding:10px 14px; flex:1; min-width:100px; }
          .card-label { font-size:10px; text-transform:uppercase; color:#6b7280; letter-spacing:.05em; }
          .card-value { font-size:18px; font-weight:700; margin-top:2px; }
          table { width:100%; border-collapse:collapse; margin-bottom:20px; }
          thead { background:#f3f4f6; }
          th { padding:7px 10px; text-align:left; font-size:11px; text-transform:uppercase; color:#6b7280; border-bottom:2px solid #e5e7eb; }
          td { padding:7px 10px; border-bottom:1px solid #f3f4f6; }
          .right { text-align:right; }
          .bold { font-weight:600; }
          .amber { color:#d97706; }
          .doctor-header { background:#fffbeb; font-weight:600; }
          .sub-row { background:#f9fafb; }
          @media print {
            @page { margin:15mm; }
            body { padding:0; }
          }
        </style>
      </head><body>
        ${el.innerHTML}
        <script>window.onload=function(){window.print();}<\/script>
      </body></html>
    `);
    win.document.close();
  };

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
                {doctors.map((d) => (
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
                ))}
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
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-end justify-between">
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
                <div>
                  <Label className="text-xs">Group By</Label>
                  <div className="mt-1 flex gap-1">
                    {GROUP_OPTIONS.map(opt => (
                      <Button
                        key={opt.value}
                        size="sm"
                        variant={groupBy === opt.value ? "default" : "outline"}
                        className="h-9 text-xs gap-1"
                        onClick={() => setGroupBy(opt.value)}
                      >
                        {opt.icon}{opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1">
                <Printer size={14} /> Print Report
              </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-card border border-card-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Doctors with Referrals</p>
                <p className="text-xl font-bold">{grandTotal.doctors}</p>
              </div>
              <div className="bg-card border border-card-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Total Orders</p>
                <p className="text-xl font-bold">{grandTotal.orders}</p>
              </div>
              <div className="bg-card border border-card-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Total Revenue</p>
                <p className="text-xl font-bold">{inr(grandTotal.revenue)}</p>
              </div>
              <div className="bg-card border border-card-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Commission Payable</p>
                <p className="text-xl font-bold text-amber-600">{inr(grandTotal.commission)}</p>
              </div>
            </div>

            {/* Print-friendly wrapper */}
            <div ref={printRef}>
              <div className="print-header" style={{ display: "none" }}>
                <h1>Commission Report</h1>
                <p className="meta">Period: {from} to {to} &nbsp;|&nbsp; Group: {groupBy} &nbsp;|&nbsp; Generated: {new Date().toLocaleString("en-IN")}</p>
                <div className="summary">
                  <div className="card"><div className="card-label">Doctors</div><div className="card-value">{grandTotal.doctors}</div></div>
                  <div className="card"><div className="card-label">Orders</div><div className="card-value">{grandTotal.orders}</div></div>
                  <div className="card"><div className="card-label">Revenue</div><div className="card-value">{inr(grandTotal.revenue)}</div></div>
                  <div className="card"><div className="card-label">Commission</div><div className="card-value amber">{inr(grandTotal.commission)}</div></div>
                </div>
              </div>

              {reportLoading ? (
                <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
              ) : report.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">No referral data for selected period</div>
              ) : (
                <div className="space-y-3">
                  {report.map((entry) => (
                    <DoctorCard
                      key={entry.doctor.id}
                      entry={entry}
                      groupBy={groupBy}
                      simpleEntry={simpleReport.find(s => s.doctor.id === entry.doctor.id)}
                      expandedOrders={expandedOrders}
                      setExpandedOrders={setExpandedOrders}
                    />
                  ))}

                  {/* Grand Total Row */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
                    <div className="font-semibold text-sm">Grand Total — {grandTotal.doctors} doctors, {grandTotal.orders} orders</div>
                    <div className="flex gap-8">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Revenue</p>
                        <p className="font-bold">{inr(grandTotal.revenue)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Commission</p>
                        <p className="font-bold text-amber-600">{inr(grandTotal.commission)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Eff. Rate</p>
                        <p className="font-bold">{grandTotal.revenue > 0 ? ((grandTotal.commission / grandTotal.revenue) * 100).toFixed(1) : "0"}%</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
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

// ─── Doctor Card sub-component ────────────────────────────────────────────────
function DoctorCard({
  entry, groupBy, simpleEntry, expandedOrders, setExpandedOrders,
}: {
  entry: DetailedDoctor;
  groupBy: GroupBy;
  simpleEntry?: SimpleEntry;
  expandedOrders: Set<number>;
  setExpandedOrders: (fn: (prev: Set<number>) => Set<number>) => void;
}) {
  const expanded = expandedOrders.has(entry.doctor.id);
  const toggle = () => setExpandedOrders(prev => {
    const next = new Set(prev);
    expanded ? next.delete(entry.doctor.id) : next.add(entry.doctor.id);
    return next;
  });

  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      {/* Doctor header row */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/20"
        onClick={toggle}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Stethoscope size={15} className="text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm">{entry.doctor.name}</p>
            <p className="text-xs text-muted-foreground">
              {entry.doctor.specialization} · {entry.orderCount} orders · {entry.testCount} tests
            </p>
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
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Rate</p>
            <p className="font-semibold text-sm">{entry.effectiveRate}%</p>
          </div>
          {expanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
        </div>
      </div>

      {/* Expandable detail */}
      {expanded && (
        <div className="border-t border-card-border">
          {groupBy === "consolidated" && (
            <div className="p-4 text-sm text-muted-foreground">
              <p>Effective commission rate: <strong className="text-foreground">{entry.effectiveRate}%</strong></p>
              <p className="mt-1">Total revenue from this doctor's referrals: <strong className="text-foreground">{inr(entry.totalRevenue)}</strong></p>
              <p className="mt-1">Commission payable: <strong className="text-amber-600">{inr(entry.totalCommission)}</strong></p>
            </div>
          )}

          {groupBy === "order" && simpleEntry && simpleEntry.orders.length > 0 && (
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 text-muted-foreground">Order</th>
                  <th className="text-left px-4 py-2 text-muted-foreground">Date</th>
                  <th className="text-right px-4 py-2 text-muted-foreground">Revenue</th>
                  <th className="text-right px-4 py-2 text-muted-foreground">Commission</th>
                  <th className="text-left px-4 py-2 text-muted-foreground">Rule</th>
                </tr>
              </thead>
              <tbody>
                {simpleEntry.orders.map(o => (
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
          )}

          {groupBy === "test" && Array.isArray(entry.grouped) && (
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 text-muted-foreground">Test Name</th>
                  <th className="text-left px-4 py-2 text-muted-foreground">Category</th>
                  <th className="text-right px-4 py-2 text-muted-foreground">Count</th>
                  <th className="text-right px-4 py-2 text-muted-foreground">Revenue</th>
                  <th className="text-right px-4 py-2 text-muted-foreground">Commission</th>
                  <th className="text-left px-4 py-2 text-muted-foreground">Rule</th>
                </tr>
              </thead>
              <tbody>
                {(entry.grouped as { testId: number; testName: string; category: string; count: number; revenue: number; commission: number; ruleName: string }[]).map(row => (
                  <tr key={row.testId} className="border-t border-card-border">
                    <td className="px-4 py-2 font-medium">{row.testName}</td>
                    <td className="px-4 py-2 text-muted-foreground capitalize">{row.category}</td>
                    <td className="px-4 py-2 text-right">{row.count}</td>
                    <td className="px-4 py-2 text-right">{inr(row.revenue)}</td>
                    <td className="px-4 py-2 text-right text-amber-600">{inr(row.commission)}</td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">{row.ruleName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {groupBy === "category" && Array.isArray(entry.grouped) && (
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 text-muted-foreground">Category</th>
                  <th className="text-right px-4 py-2 text-muted-foreground">Tests</th>
                  <th className="text-right px-4 py-2 text-muted-foreground">Orders</th>
                  <th className="text-right px-4 py-2 text-muted-foreground">Revenue</th>
                  <th className="text-right px-4 py-2 text-muted-foreground">Commission</th>
                </tr>
              </thead>
              <tbody>
                {(entry.grouped as { category: string; testCount: number; orderCount: number; revenue: number; commission: number }[]).map(row => (
                  <tr key={row.category} className="border-t border-card-border">
                    <td className="px-4 py-2 font-medium capitalize">{row.category}</td>
                    <td className="px-4 py-2 text-right">{row.testCount}</td>
                    <td className="px-4 py-2 text-right">{row.orderCount}</td>
                    <td className="px-4 py-2 text-right">{inr(row.revenue)}</td>
                    <td className="px-4 py-2 text-right text-amber-600">{inr(row.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
