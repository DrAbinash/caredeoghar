import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListDoctors, useListTests } from "@workspace/api-client-react";
import { api } from "@/lib/fetchApi";
import { exportPDF, exportExcel, exportWord, type ExportDoctorSection, type ReportMeta } from "@/lib/exportReport";
import PageHeader from "@/components/PageHeader";
import Doctors from "@/pages/Doctors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Stethoscope, Star, Printer, Download, ChevronDown, FileText, Sheet, FileType } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type CommRule = {
  id: number; doctorId: number; name: string; type: "percentage" | "fixed";
  value: number; scope: "all" | "category" | "test"; categories: string[];
  testIds: number[]; isExclusive: boolean; isActive: boolean;
};

type TestGroupRow = {
  testId: number; testName: string; category: string;
  count: number; revenue: number; commission: number;
  ruleName: string; ruleValue: number; ruleType: string;
};

type DetailedDoctor = {
  doctor: { id: number; name: string; specialization: string; defaultCommission: number; defaultCommissionType: string };
  orderCount: number; testCount: number;
  totalRevenue: number; totalCommission: number; effectiveRate: number;
  grouped: TestGroupRow[] | null;
};

type DetailedReport = {
  report: DetailedDoctor[];
  grandTotal: { doctors: number; orders: number; revenue: number; commission: number };
};

const CATEGORIES = ["hematology", "biochemistry", "microbiology", "serology", "radiology", "cardiology", "urine analysis", "other"];
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ALPHA = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p"];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Referrals() {
  const qc = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

  // report state
  const [reportDoctorId, setReportDoctorId] = useState<number | null>(null);
  const [exportBusy, setExportBusy] = useState<"pdf" | "excel" | "word" | null>(null);
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0];
  });
  const [to, setTo] = useState(new Date().toISOString().split("T")[0]);

  // rules state
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [editRule, setEditRule] = useState<CommRule | null>(null);

  const { data: doctorData } = useListDoctors({});
  const { data: testsData } = useListTests({});
  const doctors = doctorData?.doctors ?? [];
  const tests = testsData?.tests ?? [];

  const { data: rules = [] } = useQuery<CommRule[]>({
    queryKey: ["commission-rules", selectedDoctorId],
    queryFn: () => api.get(`/api/commission/rules${selectedDoctorId ? `?doctorId=${selectedDoctorId}` : ""}`),
  });

  const { data: detailedData, isLoading: reportLoading } = useQuery<DetailedReport>({
    queryKey: ["commission-report-test", from, to, reportDoctorId],
    queryFn: () =>
      api.get(`/api/commission/report-detailed?from=${from}&to=${to}&groupBy=test${reportDoctorId ? `&doctorId=${reportDoctorId}` : ""}`),
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

  // ── Print ──
  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(`
      <html><head>
        <title>Referral Commission Report — ${from} to ${to}</title>
        <style>
          * { box-sizing:border-box; margin:0; padding:0; }
          body { font-family:Arial,sans-serif; font-size:13px; color:#1a1a1a; padding:24px; }
          h1 { font-size:17px; font-weight:700; text-align:center; text-transform:uppercase; letter-spacing:.08em; margin-bottom:14px; }
          .meta { font-size:12px; color:#555; margin-bottom:4px; }
          .doctor-label { font-size:14px; font-weight:700; margin:20px 0 6px; }
          table { width:100%; border-collapse:collapse; margin-bottom:8px; }
          thead tr { background:#f0f0f0; }
          th { padding:7px 10px; text-align:left; font-size:11px; text-transform:uppercase; color:#555; border:1px solid #ddd; }
          td { padding:7px 10px; border:1px solid #e5e7eb; }
          .right { text-align:right; }
          .center { text-align:center; }
          .total-row td { font-weight:700; background:#fffbeb; border-top:2px solid #d97706; }
          .grand-row td { font-weight:700; background:#fef3c7; font-size:14px; }
          @media print { @page { margin:15mm; } body { padding:0; } }
        </style>
      </head><body>
        ${el.innerHTML}
        <script>window.onload=function(){window.print();}<\/script>
      </body></html>
    `);
    win.document.close();
  };

  // ── Build export data from current report ──
  function buildExportData(): { sections: ExportDoctorSection[]; meta: ReportMeta } {
    const ALPHA2 = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p"];
    const sections: ExportDoctorSection[] = report.map((entry, idx) => ({
      label: `${ALPHA2[idx] ?? String(idx + 1)})`,
      doctorName: entry.doctor.name,
      specialization: entry.doctor.specialization,
      orderCount: entry.orderCount,
      testCount: entry.testCount,
      effectiveRate: entry.effectiveRate,
      totalRevenue: entry.totalRevenue,
      totalCommission: entry.totalCommission,
      rows: (entry.grouped ?? []).map(r => ({
        testName: r.testName,
        count: r.count,
        rateLabel: r.ruleType === "percentage" ? `${r.ruleValue}%` : `Rs.${r.ruleValue.toFixed(2)}`,
        commission: r.commission,
      })),
    }));

    const meta: ReportMeta = {
      title: "Referral Commission Report",
      from,
      to,
      doctorFilter: reportDoctorId ? (doctors.find(d => d.id === reportDoctorId)?.name ?? "—") : "All Doctors",
      generatedAt: new Date().toLocaleString("en-IN"),
      grandTotal: report.length > 0 ? grandTotal : undefined,
    };

    return { sections, meta };
  }

  async function handleExport(format: "pdf" | "excel" | "word") {
    if (report.length === 0) {
      toast({ title: "No data to export", description: "Select a date range with referral data.", variant: "destructive" });
      return;
    }
    setExportBusy(format);
    try {
      const { sections, meta } = buildExportData();
      if (format === "pdf")   await exportPDF(sections, meta);
      if (format === "excel") await exportExcel(sections, meta);
      if (format === "word")  await exportWord(sections, meta);
      toast({ title: `${format.toUpperCase()} exported`, description: "File downloaded successfully." });
    } catch (err) {
      console.error(err);
      toast({ title: "Export failed", description: String(err), variant: "destructive" });
    } finally {
      setExportBusy(null);
    }
  }

  return (
    <div className="pb-8">
      <PageHeader
        title="Referrals & Commission"
        subtitle="Manage doctor referral commissions and payouts"
      />

      <div className="px-6">
        <Tabs defaultValue="report">
          <TabsList className="mb-4">
            <TabsTrigger value="report">Commission Report</TabsTrigger>
            <TabsTrigger value="rules">Commission Rules</TabsTrigger>
            <TabsTrigger value="doctors">Doctors</TabsTrigger>
          </TabsList>

          <TabsContent value="doctors" className="-mx-6">
            <Doctors />
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════
              COMMISSION REPORT TAB
          ══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="report" className="space-y-4">

            {/* Filter bar */}
            <div className="flex flex-wrap gap-3 items-end justify-between">
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <Label className="text-xs">Date Range — From</Label>
                  <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-1 w-36" />
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="mt-1 w-36" />
                </div>
                <div>
                  <Label className="text-xs">Referral Doctor</Label>
                  <Select onValueChange={v => setReportDoctorId(v === "all" ? null : Number(v))}>
                    <SelectTrigger className="mt-1 w-52">
                      <SelectValue placeholder="All Doctors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Doctors</SelectItem>
                      {doctors.map(d => (
                        <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
                  <Printer size={14} /> Print
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="gap-1.5" disabled={exportBusy !== null}>
                      <Download size={14} />
                      {exportBusy ? "Exporting…" : "Export"}
                      <ChevronDown size={13} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => handleExport("pdf")}>
                      <FileText size={14} className="text-red-500" />
                      <span>Export as PDF</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => handleExport("excel")}>
                      <Sheet size={14} className="text-green-600" />
                      <span>Export as Excel</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => handleExport("word")}>
                      <FileType size={14} className="text-blue-600" />
                      <span>Export as Word</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Doctors with Referrals", value: grandTotal.doctors, amber: false },
                { label: "Total Orders",           value: grandTotal.orders,  amber: false },
                { label: "Total Revenue",          value: inr(grandTotal.revenue),     amber: false, str: true },
                { label: "Commission Payable",     value: inr(grandTotal.commission),  amber: true,  str: true },
              ].map(c => (
                <div key={c.label} className="bg-card border border-card-border rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
                  <p className={`text-xl font-bold ${c.amber ? "text-amber-600" : ""}`}>{c.value}</p>
                </div>
              ))}
            </div>

            {/* ── Printable Report Body ── */}
            <div ref={printRef}>
              {/* Print-only header (hidden on screen) */}
              <div style={{ display: "none" }}>
                <h1>Referral Commission Report</h1>
                <p className="meta">Date Range: {from} &nbsp;to&nbsp; {to}</p>
                <p className="meta">Doctor: {reportDoctorId ? doctors.find(d => d.id === reportDoctorId)?.name ?? "—" : "All"}</p>
                <p className="meta">Generated: {new Date().toLocaleString("en-IN")}</p>
              </div>

              {reportLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : report.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm">
                  No referral data for the selected period / doctor
                </div>
              ) : (
                <div className="space-y-6">
                  {report.map((entry, idx) => (
                    <CommissionTable key={entry.doctor.id} entry={entry} index={idx} />
                  ))}

                  {/* Grand Total */}
                  {report.length > 1 && (
                    <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-sm">Grand Total</p>
                        <p className="text-xs text-muted-foreground">{grandTotal.doctors} doctors · {grandTotal.orders} orders</p>
                      </div>
                      <div className="flex gap-10">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Total Revenue</p>
                          <p className="font-bold text-base">{inr(grandTotal.revenue)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Commission Payable</p>
                          <p className="font-bold text-base text-amber-600">{inr(grandTotal.commission)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════
              COMMISSION RULES TAB
          ══════════════════════════════════════════════════════════════════ */}
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
        </Tabs>
      </div>

      {/* ── Rule Create/Edit Dialog ── */}
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
                      <input
                        type="checkbox"
                        value={t.id}
                        onChange={e => {
                          const cur = (watch("testIds") || "").split(",").filter(Boolean).map(Number);
                          const id = Number(e.target.value);
                          const next = e.target.checked ? [...cur, id] : cur.filter(x => x !== id);
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

  // expose ALPHA to CommissionTable via closure — not needed since it's module-level
}

// ─── Commission Table sub-component ─────────────────────────────────────────
function CommissionTable({ entry, index }: { entry: DetailedDoctor; index: number }) {
  const label = ALPHA[index] ?? String(index + 1);
  const rows: TestGroupRow[] = Array.isArray(entry.grouped) ? entry.grouped : [];

  return (
    <div className="bg-card border border-card-border rounded-xl overflow-hidden">
      {/* Doctor header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-card-border bg-muted/30">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider w-5">{label})</span>
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Stethoscope size={14} className="text-primary" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-sm">{entry.doctor.name}</p>
          <p className="text-xs text-muted-foreground">{entry.doctor.specialization} · {entry.orderCount} orders · {entry.testCount} tests</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Effective Rate</p>
          <p className="font-semibold text-sm">{entry.effectiveRate}%</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-6 text-sm text-muted-foreground text-center">No test data for this period</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border bg-muted/20">
              <th className="text-left px-5 py-2.5 text-xs font-semibold uppercase text-muted-foreground">Test Name</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold uppercase text-muted-foreground">No of Tests</th>
              <th className="text-center px-4 py-2.5 text-xs font-semibold uppercase text-muted-foreground">% / Fixed</th>
              <th className="text-right px-5 py-2.5 text-xs font-semibold uppercase text-muted-foreground">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.testId}
                className={`border-b border-card-border last:border-0 ${i % 2 === 1 ? "bg-muted/10" : ""}`}
              >
                <td className="px-5 py-2.5 font-medium">{row.testName}</td>
                <td className="px-4 py-2.5 text-center tabular-nums">{row.count}</td>
                <td className="px-4 py-2.5 text-center tabular-nums text-muted-foreground">
                  {row.ruleType === "percentage"
                    ? <span className="inline-flex items-center gap-0.5">{row.ruleValue}<span className="text-xs">%</span></span>
                    : <span className="text-xs">{inr(row.ruleValue)}</span>
                  }
                </td>
                <td className="px-5 py-2.5 text-right font-semibold text-amber-700 tabular-nums">
                  {inr(row.commission)}
                </td>
              </tr>
            ))}

            {/* TOTAL row */}
            <tr className="border-t-2 border-amber-300 bg-amber-50">
              <td className="px-5 py-3 font-bold text-sm" colSpan={3}>
                Total →
              </td>
              <td className="px-5 py-3 text-right font-bold text-base text-amber-700 tabular-nums">
                {inr(entry.totalCommission)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
