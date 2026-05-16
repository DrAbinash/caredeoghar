import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Lock, Unlock, RefreshCw, Printer, AlertTriangle, CheckCircle2, Users, Clock } from "lucide-react";
import { readStaffSession } from "@/lib/staffSession";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

type MethodTotals = { cash: number; upi: number; card: number; cheque: number; other: number; total: number; count: number };
type StaffRow = MethodTotals & { userId: number | null; userName: string };

type StaffUserStatus = {
  userId: number;
  userName: string;
  isClosed: boolean;
  closedAt: string | null;
  totalCollected: number;
  totalBilled: number;
  variance: number;
};
type StaffStatusResult = { users: StaffUserStatus[]; lastOverallClose: string | null };

type Preview = {
  coveredFromTs: string | null;
  coveredToTs: string;
  expected: MethodTotals;
  byStaff: StaffRow[];
  billsCount: number;
  paymentsCount: number;
};

type Closure = {
  id: number;
  closureDate: string;
  closedAt: string;
  closedByName: string;
  coveredFromTs: string | null;
  coveredToTs: string;
  expectedCash: string; expectedUpi: string; expectedCard: string; expectedCheque: string; expectedOther: string;
  actualCash: string; actualUpi: string; actualCard: string; actualCheque: string; actualOther: string;
  variance: string; varianceNote: string;
  billsCount: number; paymentsCount: number;
  totalExpected: string; totalActual: string;
  staffBreakdown: StaffRow[];
  status: "closed" | "reopened";
  reopenedAt: string | null; reopenedByName: string; reopenReason: string;
};

type ClinicLite = { name?: string; dayCloseAutoPrint?: boolean };

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

const fmtIst = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "—";

function n(v: string | number | undefined | null): number {
  return Number(v ?? 0) || 0;
}

function buildSummarySlipHtml(c: Closure, clinic: ClinicLite): string {
  const esc = (s: string) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]!));
  const variance = n(c.variance);
  const variancePill = variance === 0
    ? `<span style="color:#166534;font-weight:700">Balanced</span>`
    : variance < 0
      ? `<span style="color:#991b1b;font-weight:700">Short ${esc(inr(Math.abs(variance)))}</span>`
      : `<span style="color:#92400e;font-weight:700">Surplus ${esc(inr(variance))}</span>`;

  const staffRows = (c.staffBreakdown ?? []).map((s) => `
    <tr>
      <td>${esc(s.userName)}</td>
      <td style="text-align:right">${s.count}</td>
      <td style="text-align:right">${esc(inr(n(s.total)))}</td>
    </tr>`).join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Day Close ${esc(c.closureDate)}</title>
    <style>
      @page { size: A5 portrait; margin: 8mm; }
      body { font-family: Arial, sans-serif; color:#000; margin:0; padding:0; font-size:12px; }
      h1 { font-size:18px; margin:0 0 4px; color:#1e40af; text-align:center; }
      h2 { font-size:13px; margin:14px 0 4px; border-bottom:1px solid #ccc; padding-bottom:2px; }
      table { width:100%; border-collapse:collapse; margin:4px 0; }
      td, th { padding:4px 6px; border-bottom:1px solid #eee; vertical-align:top; }
      th { text-align:left; background:#f4f4f4; font-size:11px; text-transform:uppercase; }
      .meta { text-align:center; color:#555; font-size:11px; margin-bottom:8px; }
      .totals td:first-child { font-weight:600; }
      .totals td:last-child { text-align:right; font-family:monospace; }
      .grand td { border-top:2px solid #000; padding-top:6px; font-size:14px; font-weight:800; }
      .note { margin-top:10px; padding:6px; background:#fef9e7; border:1px dashed #d97706; font-size:11px; }
      .footer { margin-top:14px; text-align:center; font-size:10px; color:#666; }
    </style></head><body>
    <h1>${esc(clinic?.name || "Diagnostic Centre")} — Day Close</h1>
    <div class="meta">
      ${esc(c.closureDate)} &middot; Closed by ${esc(c.closedByName)}<br/>
      Window: ${esc(fmtIst(c.coveredFromTs))} &rarr; ${esc(fmtIst(c.coveredToTs))}<br/>
      ${c.billsCount} bills &middot; ${c.paymentsCount} payments
    </div>

    <h2>Cash Drawer</h2>
    <table class="totals">
      <thead><tr><th>Method</th><th style="text-align:right">Expected</th><th style="text-align:right">Actual</th><th style="text-align:right">Variance</th></tr></thead>
      <tbody>
        ${(["cash","upi","card","cheque","other"] as const).map((m) => {
          const e = n((c as Record<string, unknown>)[`expected${m[0].toUpperCase()}${m.slice(1)}`] as string);
          const a = n((c as Record<string, unknown>)[`actual${m[0].toUpperCase()}${m.slice(1)}`] as string);
          const v = a - e;
          return `<tr>
            <td style="text-transform:uppercase">${m}</td>
            <td style="text-align:right">${esc(inr(e))}</td>
            <td style="text-align:right">${esc(inr(a))}</td>
            <td style="text-align:right;color:${v < 0 ? "#991b1b" : v > 0 ? "#92400e" : "#166534"}">${v === 0 ? "—" : esc(inr(v))}</td>
          </tr>`;
        }).join("")}
        <tr class="grand"><td>Total</td><td style="text-align:right">${esc(inr(n(c.totalExpected)))}</td><td style="text-align:right">${esc(inr(n(c.totalActual)))}</td><td style="text-align:right">${variancePill}</td></tr>
      </tbody>
    </table>

    ${staffRows ? `<h2>Per-Staff Collection</h2>
    <table>
      <thead><tr><th>Staff</th><th style="text-align:right">Payments</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>${staffRows}</tbody>
    </table>` : ""}

    ${c.varianceNote ? `<div class="note"><strong>Note:</strong> ${esc(c.varianceNote)}</div>` : ""}
    <div class="footer">Printed ${esc(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST &middot; Closure #${c.id}</div>
  </body></html>`;
}

function autoPrintSlip(c: Closure, clinic: ClinicLite) {
  const html = buildSummarySlipHtml(c, clinic);
  const w = window.open("", "_blank", "width=520,height=720");
  if (!w) {
    alert("Pop-up blocked. Allow pop-ups to auto-print the Day Close summary slip.");
    return;
  }
  w.document.open(); w.document.write(html); w.document.close();
  w.onload = () => { w.focus(); w.print(); setTimeout(() => w.close(), 600); };
}

export default function DayClose() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const session = readStaffSession();
  const isSuperAdmin = session?.user?.role === "super_admin";
  const isOwner = ["admin", "super_admin", "owner"].includes(session?.user?.role ?? "");

  const previewQ = useQuery<Preview>({
    queryKey: ["day-close-preview"],
    queryFn: () => api.get<Preview>("/api/day-close/preview"),
    refetchInterval: 30_000,
  });
  const closuresQ = useQuery<Closure[]>({
    queryKey: ["day-close-list"],
    queryFn: () => api.get<Closure[]>("/api/day-close"),
  });
  const clinicQ = useQuery<ClinicLite>({
    queryKey: ["clinic-settings"],
    queryFn: () => api.get<ClinicLite>("/api/clinic-settings"),
    staleTime: 60_000,
  });
  const staffStatusQ = useQuery<StaffStatusResult>({
    queryKey: ["day-close-staff-status"],
    queryFn: () => api.get<StaffStatusResult>("/api/day-close/staff-status"),
    refetchInterval: 30_000,
    enabled: isOwner,
  });

  const [actuals, setActuals] = useState({ cash: "", upi: "", card: "", cheque: "", other: "" });
  const [varianceNote, setVarianceNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState<Closure | null>(null);
  const [reopenOpen, setReopenOpen] = useState<Closure | null>(null);
  const [reopenReason, setReopenReason] = useState("");

  // Pre-fill actuals from expected totals so a "balanced" close is one click.
  useEffect(() => {
    if (!previewQ.data) return;
    setActuals({
      cash: String(previewQ.data.expected.cash || ""),
      upi: String(previewQ.data.expected.upi || ""),
      card: String(previewQ.data.expected.card || ""),
      cheque: String(previewQ.data.expected.cheque || ""),
      other: String(previewQ.data.expected.other || ""),
    });
  }, [previewQ.data]);

  const totalActual = useMemo(() =>
    n(actuals.cash) + n(actuals.upi) + n(actuals.card) + n(actuals.cheque) + n(actuals.other),
    [actuals]);
  const totalExpected = previewQ.data?.expected.total ?? 0;
  const variance = totalActual - totalExpected;

  const closeMut = useMutation<Closure>({
    mutationFn: () =>
      api.post<Closure>("/api/day-close", {
        actuals: {
          cash: n(actuals.cash), upi: n(actuals.upi), card: n(actuals.card),
          cheque: n(actuals.cheque), other: n(actuals.other),
        },
        varianceNote,
      }),
    onSuccess: (closure) => {
      toast({ title: "Day closed", description: `Variance: ${inr(n(closure.variance))}` });
      setConfirmOpen(false);
      setVarianceNote("");
      qc.invalidateQueries({ queryKey: ["day-close-preview"] });
      qc.invalidateQueries({ queryKey: ["day-close-list"] });
      if (clinicQ.data?.dayCloseAutoPrint !== false) {
        autoPrintSlip(closure, clinicQ.data ?? {});
      }
    },
    onError: (e: Error) => toast({ title: "Close failed", description: e.message, variant: "destructive" }),
  });

  const reopenMut = useMutation<Closure, Error, { id: number; reason: string }>({
    mutationFn: (vars) =>
      api.post<Closure>(`/api/day-close/${vars.id}/reopen`, { reason: vars.reason }),
    onSuccess: () => {
      toast({ title: "Day re-opened", description: "Subsequent closures will recompute totals from the previous closed boundary." });
      setReopenOpen(null);
      setReopenReason("");
      qc.invalidateQueries({ queryKey: ["day-close-preview"] });
      qc.invalidateQueries({ queryKey: ["day-close-list"] });
    },
    onError: (e: Error) => toast({ title: "Reopen failed", description: e.message, variant: "destructive" }),
  });

  const expected = previewQ.data?.expected;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Lock size={20} /> Day Close / Cash Drawer</h1>
          <p className="text-sm text-muted-foreground">Reconcile expected vs collected cash for the open business day. Bills created after close belong to the next day.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => previewQ.refetch()} disabled={previewQ.isFetching}>
          <RefreshCw size={14} className={`mr-2 ${previewQ.isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Staff Day Close Status — owner/admin only */}
      {isOwner && staffStatusQ.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users size={16} /> Staff Day Close Status
              {(() => {
                const users = staffStatusQ.data.users;
                const closed = users.filter((u) => u.isClosed).length;
                return (
                  <span className={`ml-auto text-sm font-normal px-2 py-0.5 rounded-full ${
                    closed === users.length ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                  }`}>
                    {closed}/{users.length} closed
                  </span>
                );
              })()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {staffStatusQ.data.users.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active staff accounts found.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {staffStatusQ.data.users.map((u) => (
                  <div
                    key={u.userId}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-sm ${
                      u.isClosed
                        ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
                        : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
                    }`}
                  >
                    {u.isClosed
                      ? <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                      : <Clock size={14} className="text-amber-600 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{u.userName}</div>
                      {u.isClosed && u.closedAt && (
                        <div className="text-xs text-muted-foreground">
                          {new Date(u.closedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                          {" · "}
                          {inr(u.totalCollected)}
                        </div>
                      )}
                      {!u.isClosed && (
                        <div className="text-xs text-amber-600">Not yet closed</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {staffStatusQ.data.users.some((u) => !u.isClosed) && (
              <p className="text-xs text-amber-600 mt-3 flex items-center gap-1">
                <AlertTriangle size={12} />
                Some staff have not closed their day. You can still close the overall day — their window will reset when you do.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Open window summary */}
      <Card>
        <CardHeader><CardTitle className="text-base">Open Window</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><div className="text-muted-foreground">From</div><div className="font-medium">{fmtIst(previewQ.data?.coveredFromTs ?? null)}</div></div>
            <div><div className="text-muted-foreground">Now (IST)</div><div className="font-medium">{fmtIst(previewQ.data?.coveredToTs ?? null)}</div></div>
            <div><div className="text-muted-foreground">Bills</div><div className="font-medium">{previewQ.data?.billsCount ?? 0}</div></div>
            <div><div className="text-muted-foreground">Payments</div><div className="font-medium">{previewQ.data?.paymentsCount ?? 0}</div></div>
          </div>
        </CardContent>
      </Card>

      {/* Reconcile form */}
      <Card>
        <CardHeader><CardTitle className="text-base">Reconcile &amp; Close</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-5">
            {(["cash","upi","card","cheque","other"] as const).map((m) => {
              const exp = expected ? expected[m] : 0;
              const act = n(actuals[m]);
              const diff = act - exp;
              return (
                <div key={m}>
                  <Label className="capitalize">{m}</Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={actuals[m]}
                    onChange={(e) => setActuals((a) => ({ ...a, [m]: e.target.value }))}
                    className="mt-1"
                  />
                  <div className="text-xs mt-1 flex items-center justify-between">
                    <span className="text-muted-foreground">Expected: {inr(exp)}</span>
                    {diff !== 0 && (
                      <span className={diff < 0 ? "text-red-600" : "text-amber-600"}>
                        {diff < 0 ? "−" : "+"}{inr(Math.abs(diff))}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 bg-muted/30 rounded-lg">
            <div><div className="text-xs text-muted-foreground">Expected Total</div><div className="text-lg font-bold">{inr(totalExpected)}</div></div>
            <div><div className="text-xs text-muted-foreground">Actual Total</div><div className="text-lg font-bold">{inr(totalActual)}</div></div>
            <div>
              <div className="text-xs text-muted-foreground">Variance</div>
              <div className={`text-lg font-bold ${variance === 0 ? "text-green-600" : variance < 0 ? "text-red-600" : "text-amber-600"}`}>
                {variance === 0 ? "Balanced" : `${variance < 0 ? "−" : "+"}${inr(Math.abs(variance))}`}
              </div>
            </div>
          </div>

          {variance !== 0 && (
            <div>
              <Label>Variance Note {variance !== 0 && <span className="text-red-600">*</span>}</Label>
              <Textarea
                value={varianceNote}
                onChange={(e) => setVarianceNote(e.target.value)}
                placeholder="Explain the variance — e.g. ₹500 short, possibly cash given as change without entry."
                className="mt-1"
                rows={2}
              />
            </div>
          )}

          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={() => setConfirmOpen(true)}
              disabled={previewQ.isLoading || (variance !== 0 && varianceNote.trim().length < 3)}
              className="bg-blue-700 hover:bg-blue-800"
            >
              <Lock size={16} className="mr-2" />
              Close Day
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Per-staff breakdown */}
      {(previewQ.data?.byStaff?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Per-Staff Collection (Open Window)</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground uppercase border-b">
                <tr><th className="py-2">Staff</th><th>Cash</th><th>UPI</th><th>Card</th><th>Cheque</th><th>Other</th><th>Count</th><th className="text-right">Total</th></tr>
              </thead>
              <tbody>
                {previewQ.data!.byStaff.map((s) => (
                  <tr key={`${s.userId ?? "u"}-${s.userName}`} className="border-b last:border-b-0">
                    <td className="py-2 font-medium">{s.userName}</td>
                    <td>{inr(s.cash)}</td>
                    <td>{inr(s.upi)}</td>
                    <td>{inr(s.card)}</td>
                    <td>{inr(s.cheque)}</td>
                    <td>{inr(s.other)}</td>
                    <td>{s.count}</td>
                    <td className="text-right font-semibold">{inr(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Past closures */}
      <Card>
        <CardHeader><CardTitle className="text-base">Past Closures</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground uppercase border-b">
              <tr><th className="py-2">Date</th><th>Closed At</th><th>By</th><th>Bills</th><th>Total</th><th>Variance</th><th>Status</th><th className="text-right">Actions</th></tr>
            </thead>
            <tbody>
              {(closuresQ.data ?? []).map((c) => {
                const v = n(c.variance);
                return (
                  <tr key={c.id} className="border-b last:border-b-0">
                    <td className="py-2 font-medium">{c.closureDate}</td>
                    <td>{fmtIst(c.closedAt)}</td>
                    <td>{c.closedByName}</td>
                    <td>{c.billsCount}</td>
                    <td>{inr(n(c.totalActual))}</td>
                    <td className={v === 0 ? "text-green-600" : v < 0 ? "text-red-600" : "text-amber-600"}>
                      {v === 0 ? "—" : `${v < 0 ? "−" : "+"}${inr(Math.abs(v))}`}
                    </td>
                    <td>
                      {c.status === "reopened"
                        ? <Badge variant="destructive">Re-opened</Badge>
                        : <Badge className="bg-green-600">Closed</Badge>}
                    </td>
                    <td className="text-right space-x-2">
                      <Button size="sm" variant="ghost" onClick={() => setDetailOpen(c)}>View</Button>
                      <Button size="sm" variant="ghost" onClick={() => autoPrintSlip(c, clinicQ.data ?? {})}><Printer size={14} /></Button>
                      {isSuperAdmin && c.status === "closed" && (
                        <Button size="sm" variant="ghost" className="text-amber-600" onClick={() => setReopenOpen(c)}>
                          <Unlock size={14} className="mr-1" /> Reopen
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!closuresQ.isLoading && (closuresQ.data?.length ?? 0) === 0 && (
                <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No closures yet — close your first day above.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Confirm close dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {variance === 0 ? <CheckCircle2 className="text-green-600" /> : <AlertTriangle className="text-amber-600" />}
              Confirm Day Close
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Bills</span><strong>{previewQ.data?.billsCount ?? 0}</strong></div>
            <div className="flex justify-between"><span>Expected</span><strong>{inr(totalExpected)}</strong></div>
            <div className="flex justify-between"><span>Actual</span><strong>{inr(totalActual)}</strong></div>
            <div className="flex justify-between"><span>Variance</span>
              <strong className={variance === 0 ? "text-green-600" : variance < 0 ? "text-red-600" : "text-amber-600"}>
                {variance === 0 ? "Balanced" : `${variance < 0 ? "−" : "+"}${inr(Math.abs(variance))}`}
              </strong>
            </div>
            {varianceNote && <div className="p-2 bg-amber-50 dark:bg-amber-950/30 border rounded text-xs">{varianceNote}</div>}
            {clinicQ.data?.dayCloseAutoPrint !== false && (
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Printer size={12} /> A summary slip will print automatically after close.</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={() => closeMut.mutate()} disabled={closeMut.isPending} className="bg-blue-700 hover:bg-blue-800">
              {closeMut.isPending ? "Closing..." : "Confirm & Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!detailOpen} onOpenChange={(o) => !o && setDetailOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Closure #{detailOpen?.id} — {detailOpen?.closureDate}</DialogTitle></DialogHeader>
          {detailOpen && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><div className="text-muted-foreground text-xs">Closed By</div><div>{detailOpen.closedByName}</div></div>
                <div><div className="text-muted-foreground text-xs">Closed At</div><div>{fmtIst(detailOpen.closedAt)}</div></div>
                <div><div className="text-muted-foreground text-xs">Window From</div><div>{fmtIst(detailOpen.coveredFromTs)}</div></div>
                <div><div className="text-muted-foreground text-xs">Window To</div><div>{fmtIst(detailOpen.coveredToTs)}</div></div>
              </div>
              <table className="w-full text-xs border-t">
                <thead><tr className="text-muted-foreground"><th className="text-left py-1">Method</th><th className="text-right">Expected</th><th className="text-right">Actual</th><th className="text-right">Diff</th></tr></thead>
                <tbody>
                  {(["Cash","Upi","Card","Cheque","Other"] as const).map((m) => {
                    const e = n(detailOpen[`expected${m}` as keyof Closure] as string);
                    const a = n(detailOpen[`actual${m}` as keyof Closure] as string);
                    const v = a - e;
                    return (
                      <tr key={m} className="border-t"><td className="py-1">{m}</td><td className="text-right">{inr(e)}</td><td className="text-right">{inr(a)}</td><td className={`text-right ${v < 0 ? "text-red-600" : v > 0 ? "text-amber-600" : ""}`}>{v === 0 ? "—" : inr(v)}</td></tr>
                    );
                  })}
                </tbody>
              </table>
              {detailOpen.varianceNote && <div className="p-2 bg-amber-50 dark:bg-amber-950/30 border rounded text-xs"><strong>Note:</strong> {detailOpen.varianceNote}</div>}
              {detailOpen.status === "reopened" && (
                <div className="p-2 bg-red-50 dark:bg-red-950/30 border border-red-300 rounded text-xs">
                  <strong>Re-opened</strong> by {detailOpen.reopenedByName} on {fmtIst(detailOpen.reopenedAt)}<br/>
                  Reason: {detailOpen.reopenReason}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => detailOpen && autoPrintSlip(detailOpen, clinicQ.data ?? {})}><Printer size={14} className="mr-2" /> Print Slip</Button>
            <Button onClick={() => setDetailOpen(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen dialog (super-admin only) */}
      <Dialog open={!!reopenOpen} onOpenChange={(o) => !o && setReopenOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Unlock className="text-amber-600" /> Re-open Closure #{reopenOpen?.id}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Re-opening marks this closure as "reopened". The next day-close will recompute its window from the most recent <em>closed</em> boundary, which means transactions in the re-opened window will roll into the next close.
            </p>
            <Label>Reason (required, audited)</Label>
            <Textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="e.g. Cash counted again, found ₹200 missed earlier." rows={3} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReopenOpen(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={reopenMut.isPending || reopenReason.trim().length < 3}
              onClick={() => reopenOpen && reopenMut.mutate({ id: reopenOpen.id, reason: reopenReason.trim() })}
            >
              {reopenMut.isPending ? "Re-opening..." : "Confirm Re-open"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
