import { useState, useMemo, useEffect } from "react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search, RefreshCw, Download, IndianRupee, AlertCircle,
  TrendingUp, Users, Wallet, Receipt, Trash2, Plus, X, BookOpen,
} from "lucide-react";
import { api } from "@/lib/fetchApi";
import { toast } from "@/hooks/use-toast";

const inr = (n: number) =>
  `₹${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Row = {
  doctorId: number;
  doctorName: string;
  specialization: string;
  phone: string | null;
  email: string | null;
  orderCount: number;
  revenueWindow: number;
  earnedWindow: number;
  paidWindow: number;
  dueWindow: number;
  earnedLifetime: number;
  paidLifetime: number;
  outstanding: number;
};

type SummaryResponse = {
  rows: Row[];
  totals: { doctors: number; earnedWindow: number; paidWindow: number; dueWindow: number; outstanding: number };
  window: { from: string | null; to: string | null };
};

type LedgerEntry = {
  kind: "earned" | "paid";
  date: string;
  particular: string;
  credit: number;
  debit: number;
  balance: number;
  ref?: string | null;
  id?: number;
};

type Payout = {
  id: number;
  doctorId: number;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  reference: string | null;
  notes: string | null;
  periodFrom: string | null;
  periodTo: string | null;
};

type DetailResponse = {
  doctor: { id: number; name: string; specialization: string; phone: string | null; email: string | null };
  window: { from: string | null; to: string | null };
  summary: {
    totalRevenue: number;
    totalEarned: number;
    totalPaid: number;
    dueWindow: number;
    lifetimeEarned: number;
    lifetimePaid: number;
    outstanding: number;
    orderCount: number;
    payoutCount: number;
  };
  payouts: Payout[];
  ledger: LedgerEntry[];
};

const todayStr = () => new Date().toISOString().split("T")[0];
const monthStartStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const PRESETS = [
  { label: "This Month", from: monthStartStr(), to: todayStr() },
  { label: "Last 30d", from: new Date(Date.now() - 30 * 86400e3).toISOString().split("T")[0], to: todayStr() },
  { label: "Last 90d", from: new Date(Date.now() - 90 * 86400e3).toISOString().split("T")[0], to: todayStr() },
  { label: "All time", from: "", to: "" },
];

export default function DoctorLedger() {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const [openDoctorId, setOpenDoctorId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [pendingPayDialog, setPendingPayDialog] = useState(false);
  const [payForm, setPayForm] = useState({
    amount: "",
    paymentDate: todayStr(),
    paymentMethod: "cash",
    reference: "",
    notes: "",
    periodFrom: "",
    periodTo: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [deletingPayout, setDeletingPayout] = useState<Payout | null>(null);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (search.trim()) params.set("search", search.trim());
      const resp = await api.get<SummaryResponse>(`/api/doctor-ledger?${params.toString()}`);
      setData(resp);
    } catch (err) {
      toast({ title: "Failed to load doctor ledger", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (doctorId: number) => {
    setDetailLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const resp = await api.get<DetailResponse>(`/api/doctor-ledger/${doctorId}?${params.toString()}`);
      setDetail(resp);
    } catch (err) {
      toast({ title: "Failed to load ledger", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => { loadSummary(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [from, to]);
  useEffect(() => {
    if (openDoctorId !== null) loadDetail(openDoctorId);
    else { setDetail(null); setPendingPayDialog(false); }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [openDoctorId, from, to]);

  // Open the Pay dialog only after detail for the *correct* doctor has loaded.
  useEffect(() => {
    if (pendingPayDialog && detail && detail.doctor.id === openDoctorId && !detailLoading) {
      setPayDialogOpen(true);
      setPendingPayDialog(false);
    }
  }, [pendingPayDialog, detail, openDoctorId, detailLoading]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    if (!term) return data.rows;
    return data.rows.filter(r =>
      r.doctorName.toLowerCase().includes(term) ||
      (r.specialization || "").toLowerCase().includes(term),
    );
  }, [data, search]);

  const submitPayout = async () => {
    if (!detail) return;
    const amt = Number(payForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/api/doctor-ledger/${detail.doctor.id}/payouts`, {
        amount: amt,
        paymentDate: payForm.paymentDate,
        paymentMethod: payForm.paymentMethod,
        reference: payForm.reference || null,
        notes: payForm.notes || null,
        periodFrom: payForm.periodFrom || null,
        periodTo: payForm.periodTo || null,
      });
      toast({ title: "Payment recorded", description: `${inr(amt)} paid to ${detail.doctor.name}` });
      setPayDialogOpen(false);
      setPayForm({
        amount: "", paymentDate: todayStr(), paymentMethod: "cash",
        reference: "", notes: "", periodFrom: "", periodTo: "",
      });
      await Promise.all([loadDetail(detail.doctor.id), loadSummary()]);
    } catch (err) {
      toast({ title: "Failed to record payment", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDeletePayout = async () => {
    if (!deletingPayout || !detail) return;
    try {
      await api.delete(`/api/doctor-ledger/payouts/${deletingPayout.id}`);
      toast({ title: "Payout deleted" });
      setDeletingPayout(null);
      await Promise.all([loadDetail(detail.doctor.id), loadSummary()]);
    } catch (err) {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  const exportCSV = async () => {
    if (!detail) return;
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const url = `/api/doctor-ledger/${detail.doctor.id}/export?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Export failed: ${res.status} ${res.statusText}`);
      const blob = await res.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = `doctor_ledger_${detail.doctor.name.replace(/[^a-z0-9]+/gi, "_")}_${from || "all"}_${to || "all"}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(dlUrl);
    } catch (err) {
      toast({ title: "Export failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  const prefillFullDue = () => {
    if (!detail) return;
    const due = detail.summary.outstanding > 0 ? detail.summary.outstanding : detail.summary.dueWindow;
    if (due > 0) setPayForm(p => ({ ...p, amount: due.toFixed(2) }));
  };

  const totals = data?.totals ?? { doctors: 0, earnedWindow: 0, paidWindow: 0, dueWindow: 0, outstanding: 0 };

  return (
    <div className="pb-8">
      <PageHeader title="Doctor Due / Payment Ledger" subtitle="Commission earned, paid and outstanding per doctor" />

      <div className="px-6 space-y-4">
        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard icon={<Users size={16} />} label="Doctors" value={String(totals.doctors)} />
          <KpiCard icon={<TrendingUp size={16} />} label="Earned (window)" value={inr(totals.earnedWindow)} />
          <KpiCard icon={<Wallet size={16} />} label="Paid (window)" value={inr(totals.paidWindow)} />
          <KpiCard icon={<IndianRupee size={16} />} label="Due (window)" value={inr(totals.dueWindow)} tone={totals.dueWindow > 0 ? "warn" : "ok"} />
          <KpiCard icon={<AlertCircle size={16} />} label="Outstanding (lifetime)" value={inr(totals.outstanding)} tone={totals.outstanding > 0 ? "danger" : "ok"} />
        </div>

        {/* Filters */}
        <div className="bg-card border border-card-border rounded-xl p-3 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 text-muted-foreground" size={14} />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Doctor name or specialization"
                className="pl-8"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-[150px]" />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-[150px]" />
          </div>
          <div className="flex gap-1">
            {PRESETS.map(p => (
              <Button
                key={p.label}
                size="sm"
                variant="outline"
                onClick={() => { setFrom(p.from); setTo(p.to); }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={loadSummary}>
            <RefreshCw size={14} className="mr-1" /> Refresh
          </Button>
        </div>

        {/* Doctor table */}
        <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/30">
                  <th className="px-4 py-3 font-medium">Doctor</th>
                  <th className="px-4 py-3 font-medium">Orders (window)</th>
                  <th className="px-4 py-3 font-medium text-right">Earned (window)</th>
                  <th className="px-4 py-3 font-medium text-right">Paid (window)</th>
                  <th className="px-4 py-3 font-medium text-right">Due (window)</th>
                  <th className="px-4 py-3 font-medium text-right">Outstanding (life)</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-border/50 animate-pulse">
                      {[...Array(7)].map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded w-24" /></td>
                      ))}
                    </tr>
                  ))
                ) : filteredRows.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No doctors found</td></tr>
                ) : (
                  filteredRows.map(r => (
                    <tr key={r.doctorId} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.doctorName}</div>
                        <div className="text-xs text-muted-foreground">{r.specialization}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.orderCount}</td>
                      <td className="px-4 py-3 text-right font-mono">{inr(r.earnedWindow)}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-600">{inr(r.paidWindow)}</td>
                      <td className={`px-4 py-3 text-right font-mono font-medium ${r.dueWindow > 0 ? "text-amber-600" : ""}`}>{inr(r.dueWindow)}</td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold ${r.outstanding > 0 ? "text-rose-600" : "text-muted-foreground"}`}>{inr(r.outstanding)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setOpenDoctorId(r.doctorId)}>
                            <BookOpen size={14} className="mr-1" /> Ledger
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => { setOpenDoctorId(r.doctorId); setPendingPayDialog(true); }}
                          >
                            <Plus size={14} className="mr-1" /> Pay
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Per-doctor ledger drawer (Dialog as wide modal) */}
      <Dialog open={openDoctorId !== null} onOpenChange={(v) => !v && setOpenDoctorId(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <DialogTitle className="flex items-center gap-2">
                <BookOpen size={18} />
                {detail?.doctor.name ?? "Loading…"}
                <span className="text-sm font-normal text-muted-foreground">
                  {detail?.doctor.specialization}
                </span>
              </DialogTitle>
            </div>
          </DialogHeader>

          {detailLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading ledger…</div>
          ) : !detail ? null : (
            <div className="space-y-4">
              {/* Summary tiles */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SummaryTile label="Earned (window)" value={inr(detail.summary.totalEarned)} />
                <SummaryTile label="Paid (window)" value={inr(detail.summary.totalPaid)} tone="ok" />
                <SummaryTile label="Due (window)" value={inr(detail.summary.dueWindow)} tone={detail.summary.dueWindow > 0 ? "warn" : "ok"} />
                <SummaryTile label="Outstanding (life)" value={inr(detail.summary.outstanding)} tone={detail.summary.outstanding > 0 ? "danger" : "ok"} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => setPayDialogOpen(true)}>
                  <Plus size={14} className="mr-1" /> Record Payment
                </Button>
                <Button variant="outline" onClick={exportCSV}>
                  <Download size={14} className="mr-1" /> Export CSV
                </Button>
                <div className="flex-1" />
                <span className="text-xs text-muted-foreground">
                  Window: {from || "all"} → {to || "all"}
                </span>
              </div>

              {/* Combined ledger table */}
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 text-xs font-medium uppercase tracking-wide flex items-center gap-2">
                  <Receipt size={14} /> Ledger entries
                </div>
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="text-left text-xs text-muted-foreground border-b border-border">
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Particular</th>
                        <th className="px-3 py-2 text-right">Credit (Earned)</th>
                        <th className="px-3 py-2 text-right">Debit (Paid)</th>
                        <th className="px-3 py-2 text-right">Balance</th>
                        <th className="px-3 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.ledger.length === 0 ? (
                        <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground text-xs">No entries in this window</td></tr>
                      ) : (
                        detail.ledger.map((e, i) => (
                          <tr key={`${e.kind}-${e.id ?? e.ref ?? "x"}-${e.date}-${i}`} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                            <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{e.date}</td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded mr-1 ${e.kind === "earned" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>
                                {e.kind === "earned" ? "EARN" : "PAID"}
                              </span>
                              {e.particular}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-blue-600">{e.credit ? inr(e.credit) : ""}</td>
                            <td className="px-3 py-2 text-right font-mono text-emerald-600">{e.debit ? inr(e.debit) : ""}</td>
                            <td className={`px-3 py-2 text-right font-mono font-semibold ${e.balance > 0 ? "text-rose-600" : e.balance < 0 ? "text-emerald-700" : ""}`}>{inr(e.balance)}</td>
                            <td className="px-3 py-2">
                              {e.kind === "paid" && e.id ? (
                                <button
                                  onClick={() => {
                                    const p = detail.payouts.find(po => po.id === e.id);
                                    if (p) setDeletingPayout(p);
                                  }}
                                  className="text-rose-500 hover:text-rose-700"
                                  title="Delete payout"
                                >
                                  <Trash2 size={13} />
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {detail.ledger.length > 0 && (
                      <tfoot>
                        <tr className="bg-muted/40 border-t border-border font-semibold text-sm">
                          <td colSpan={2} className="px-3 py-2">Window totals</td>
                          <td className="px-3 py-2 text-right font-mono">{inr(detail.summary.totalEarned)}</td>
                          <td className="px-3 py-2 text-right font-mono">{inr(detail.summary.totalPaid)}</td>
                          <td className={`px-3 py-2 text-right font-mono ${detail.summary.dueWindow > 0 ? "text-rose-600" : ""}`}>{inr(detail.summary.dueWindow)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDoctorId(null)}>
              <X size={14} className="mr-1" /> Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record payment dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment to {detail?.doctor.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Amount (₹) *</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={payForm.amount}
                  onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                />
                <Button type="button" variant="outline" size="sm" onClick={prefillFullDue} disabled={!detail}>
                  Full due
                </Button>
              </div>
              {detail && (
                <div className="text-xs text-muted-foreground mt-1">
                  Window due: <span className="font-mono">{inr(detail.summary.dueWindow)}</span>
                  {" · "}Outstanding: <span className="font-mono">{inr(detail.summary.outstanding)}</span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Payment Date *</Label>
                <Input type="date" value={payForm.paymentDate} onChange={e => setPayForm(p => ({ ...p, paymentDate: e.target.value }))} />
              </div>
              <div>
                <Label>Method *</Label>
                <Select value={payForm.paymentMethod} onValueChange={v => setPayForm(p => ({ ...p, paymentMethod: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank Transfer</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Reference (txn id, cheque no.)</Label>
              <Input value={payForm.reference} onChange={e => setPayForm(p => ({ ...p, reference: e.target.value }))} placeholder="optional" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Period from</Label>
                <Input type="date" value={payForm.periodFrom} onChange={e => setPayForm(p => ({ ...p, periodFrom: e.target.value }))} />
              </div>
              <div>
                <Label>Period to</Label>
                <Input type="date" value={payForm.periodTo} onChange={e => setPayForm(p => ({ ...p, periodTo: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={payForm.notes} onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))} placeholder="optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitPayout} disabled={submitting}>
              {submitting ? "Saving…" : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete payout confirm */}
      <AlertDialog open={deletingPayout !== null} onOpenChange={(v) => !v && setDeletingPayout(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete payout?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingPayout && (
                <>
                  Remove payout of <span className="font-mono">{inr(deletingPayout.amount)}</span> on{" "}
                  <span className="font-mono">{deletingPayout.paymentDate}</span> via{" "}
                  <span className="uppercase">{deletingPayout.paymentMethod}</span>?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeletePayout} className="bg-rose-600 hover:bg-rose-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "ok" | "warn" | "danger" }) {
  const toneClass =
    tone === "danger" ? "border-rose-200 bg-rose-50/50 dark:bg-rose-900/10 dark:border-rose-900/30" :
    tone === "warn"   ? "border-amber-200 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-900/30" :
    tone === "ok"     ? "border-emerald-200 bg-emerald-50/30 dark:bg-emerald-900/10 dark:border-emerald-900/30" :
    "";
  return (
    <div className={`bg-card border border-card-border rounded-xl p-3 shadow-sm ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
        {icon} {label}
      </div>
      <div className="text-xl font-semibold mt-1 font-mono">{value}</div>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "danger" }) {
  const toneClass =
    tone === "danger" ? "text-rose-600" :
    tone === "warn"   ? "text-amber-600" :
    tone === "ok"     ? "text-emerald-600" :
    "";
  return (
    <div className="border border-border rounded-lg p-3">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-semibold font-mono mt-1 ${toneClass}`}>{value}</div>
    </div>
  );
}
