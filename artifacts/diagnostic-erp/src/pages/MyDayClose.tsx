import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Lock, RefreshCw, CheckCircle2, AlertTriangle, TrendingUp, Wallet,
} from "lucide-react";
import { readStaffSession } from "@/lib/staffSession";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

type MethodTotals = {
  cash: number; upi: number; card: number; cheque: number; other: number;
  total: number; count: number;
};

type MyPreview = {
  userName: string;
  coveredFromTs: string | null;
  coveredToTs: string;
  expected: MethodTotals;
  billsCount: number;
  paymentsCount: number;
  totalBilled: number;
  totalDue: number;
};

type MyClose = {
  id: number;
  closureDate: string;
  closedAt: string;
  coveredFromTs: string | null;
  expectedCash: string; expectedUpi: string; expectedCard: string;
  expectedCheque: string; expectedOther: string;
  totalExpected: string;
  totalBilled: string;
  totalDue: string;
  billsCount: number;
  paymentsCount: number;
  actualCash: string; actualUpi: string; actualCard: string;
  actualCheque: string; actualOther: string;
  totalActual: string;
  variance: string;
  varianceNote: string;
  notes: string;
};

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

const fmtIst = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })
    : "Beginning of records";

function nv(v: string | number | undefined | null): number {
  return Number(v ?? 0) || 0;
}

export default function MyDayClose() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const session = readStaffSession();
  const myName = session?.user?.name ?? "Staff";

  const previewQ = useQuery<MyPreview>({
    queryKey: ["my-day-close-preview"],
    queryFn: () => api.get<MyPreview>("/api/day-close/my-preview"),
    refetchInterval: 30_000,
  });

  const historyQ = useQuery<MyClose[]>({
    queryKey: ["my-day-close-list"],
    queryFn: () => api.get<MyClose[]>("/api/day-close/my-list"),
  });

  const [actuals, setActuals] = useState({ cash: "", upi: "", card: "", cheque: "", other: "" });
  const [varianceNote, setVarianceNote] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState<MyClose | null>(null);

  useEffect(() => {
    if (!previewQ.data) return;
    setActuals({
      cash:   String(previewQ.data.expected.cash   || ""),
      upi:    String(previewQ.data.expected.upi    || ""),
      card:   String(previewQ.data.expected.card   || ""),
      cheque: String(previewQ.data.expected.cheque || ""),
      other:  String(previewQ.data.expected.other  || ""),
    });
  }, [previewQ.data]);

  const totalActual = useMemo(
    () => nv(actuals.cash) + nv(actuals.upi) + nv(actuals.card) + nv(actuals.cheque) + nv(actuals.other),
    [actuals],
  );
  const totalExpected = previewQ.data?.expected.total ?? 0;
  const variance = totalActual - totalExpected;

  const closeMut = useMutation<MyClose>({
    mutationFn: () =>
      api.post<MyClose>("/api/day-close/my-close", {
        actuals: {
          cash:   nv(actuals.cash),
          upi:    nv(actuals.upi),
          card:   nv(actuals.card),
          cheque: nv(actuals.cheque),
          other:  nv(actuals.other),
        },
        varianceNote,
        notes,
      }),
    onSuccess: () => {
      toast({ title: "Your day is closed", description: "New bills from this point count towards tomorrow." });
      setConfirmOpen(false);
      setVarianceNote("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["my-day-close-preview"] });
      qc.invalidateQueries({ queryKey: ["my-day-close-list"] });
      qc.invalidateQueries({ queryKey: ["day-close-staff-status"] });
    },
    onError: (e: Error) => toast({ title: "Close failed", description: e.message, variant: "destructive" }),
  });

  const expected = previewQ.data?.expected;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Lock size={20} /> My Day Close
          </h1>
          <p className="text-sm text-muted-foreground">
            Close your shift — <strong>{myName}</strong>.
            Bills you create after closing are accounted from tomorrow.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => previewQ.refetch()} disabled={previewQ.isFetching}>
          <RefreshCw size={14} className={`mr-2 ${previewQ.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Open window summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp size={16} /> My Open Window
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">From</div>
              <div className="font-medium">{fmtIst(previewQ.data?.coveredFromTs ?? null)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Now (IST)</div>
              <div className="font-medium">{fmtIst(previewQ.data?.coveredToTs ?? null)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Bills Created</div>
              <div className="font-bold text-xl">{previewQ.data?.billsCount ?? 0}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Payments Recorded</div>
              <div className="font-bold text-xl">{previewQ.data?.paymentsCount ?? 0}</div>
            </div>
          </div>
          {(previewQ.data?.totalBilled ?? 0) > 0 && (
            <div className="grid grid-cols-2 gap-4 mt-4 p-3 bg-muted/30 rounded-lg text-sm">
              <div>
                <div className="text-muted-foreground text-xs">Total Billed</div>
                <div className="font-bold">{inr(previewQ.data?.totalBilled ?? 0)}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Pending Dues</div>
                <div className={`font-bold ${(previewQ.data?.totalDue ?? 0) > 0 ? "text-amber-600" : "text-green-600"}`}>
                  {inr(previewQ.data?.totalDue ?? 0)}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reconcile form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet size={16} /> My Collections &amp; Close
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-5">
            {(["cash", "upi", "card", "cheque", "other"] as const).map((m) => {
              const exp = expected ? expected[m] : 0;
              const act = nv(actuals[m]);
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
                  <div className="text-xs mt-1 flex justify-between">
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
            <div>
              <div className="text-xs text-muted-foreground">Expected Total</div>
              <div className="text-lg font-bold">{inr(totalExpected)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Actual Total</div>
              <div className="text-lg font-bold">{inr(totalActual)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Variance</div>
              <div className={`text-lg font-bold ${
                variance === 0 ? "text-green-600" : variance < 0 ? "text-red-600" : "text-amber-600"
              }`}>
                {variance === 0 ? "Balanced" : `${variance < 0 ? "−" : "+"}${inr(Math.abs(variance))}`}
              </div>
            </div>
          </div>

          {variance !== 0 && (
            <div>
              <Label>Variance Note <span className="text-red-600">*</span></Label>
              <Textarea
                value={varianceNote}
                onChange={(e) => setVarianceNote(e.target.value)}
                placeholder="Explain the difference — e.g. ₹200 short, change given without entry."
                className="mt-1"
                rows={2}
              />
            </div>
          )}

          <div>
            <Label>
              Handover Notes{" "}
              <span className="text-muted-foreground text-xs">(optional — visible to owner)</span>
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Pending tasks, special instructions for the next shift…"
              className="mt-1"
              rows={2}
            />
          </div>

          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={() => setConfirmOpen(true)}
              disabled={previewQ.isLoading || (variance !== 0 && varianceNote.trim().length < 3)}
              className="bg-blue-700 hover:bg-blue-800"
            >
              <Lock size={16} className="mr-2" />
              Close My Day
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader><CardTitle className="text-base">My Past Closures</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground uppercase border-b">
              <tr>
                <th className="py-2">Date</th>
                <th>Closed At</th>
                <th>Bills</th>
                <th>Expected</th>
                <th>Actual</th>
                <th>Variance</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(historyQ.data ?? []).map((c) => {
                const v = nv(c.variance);
                return (
                  <tr key={c.id} className="border-b last:border-b-0">
                    <td className="py-2 font-medium">{c.closureDate}</td>
                    <td>{fmtIst(c.closedAt)}</td>
                    <td>{c.billsCount}</td>
                    <td>{inr(nv(c.totalExpected))}</td>
                    <td>{inr(nv(c.totalActual))}</td>
                    <td className={v === 0 ? "text-green-600" : v < 0 ? "text-red-600" : "text-amber-600"}>
                      {v === 0 ? "—" : `${v < 0 ? "−" : "+"}${inr(Math.abs(v))}`}
                    </td>
                    <td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setDetailOpen(c)}>View</Button>
                    </td>
                  </tr>
                );
              })}
              {!historyQ.isLoading && (historyQ.data?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground">
                    No closures yet — close your first day above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {variance === 0
                ? <CheckCircle2 className="text-green-600" />
                : <AlertTriangle className="text-amber-600" />}
              Confirm Close — {myName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Bills Created</span><strong>{previewQ.data?.billsCount ?? 0}</strong>
            </div>
            <div className="flex justify-between">
              <span>Total Billed</span><strong>{inr(previewQ.data?.totalBilled ?? 0)}</strong>
            </div>
            <div className="flex justify-between">
              <span>Expected Collected</span><strong>{inr(totalExpected)}</strong>
            </div>
            <div className="flex justify-between">
              <span>Actual Counted</span><strong>{inr(totalActual)}</strong>
            </div>
            <div className="flex justify-between">
              <span>Variance</span>
              <strong className={
                variance === 0 ? "text-green-600" : variance < 0 ? "text-red-600" : "text-amber-600"
              }>
                {variance === 0 ? "Balanced" : `${variance < 0 ? "−" : "+"}${inr(Math.abs(variance))}`}
              </strong>
            </div>
            {varianceNote && (
              <div className="p-2 bg-amber-50 dark:bg-amber-950/30 border rounded text-xs">
                {varianceNote}
              </div>
            )}
            <p className="text-muted-foreground text-xs pt-1">
              Bills created after this close will be counted from tomorrow onwards.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              onClick={() => closeMut.mutate()}
              disabled={closeMut.isPending}
              className="bg-blue-700 hover:bg-blue-800"
            >
              {closeMut.isPending ? "Closing…" : "Confirm & Close My Day"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!detailOpen} onOpenChange={(o) => !o && setDetailOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>My Closure #{detailOpen?.id} — {detailOpen?.closureDate}</DialogTitle>
          </DialogHeader>
          {detailOpen && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-muted-foreground text-xs">Closed At</div>
                  <div>{fmtIst(detailOpen.closedAt)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Bills</div>
                  <div>{detailOpen.billsCount}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Total Billed</div>
                  <div>{inr(nv(detailOpen.totalBilled))}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Pending Dues</div>
                  <div>{inr(nv(detailOpen.totalDue))}</div>
                </div>
              </div>
              <table className="w-full text-xs border-t">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left py-1">Method</th>
                    <th className="text-right">Expected</th>
                    <th className="text-right">Actual</th>
                    <th className="text-right">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {(["Cash", "Upi", "Card", "Cheque", "Other"] as const).map((m) => {
                    const e = nv(detailOpen[`expected${m}` as keyof MyClose] as string);
                    const a = nv(detailOpen[`actual${m}` as keyof MyClose] as string);
                    const v = a - e;
                    return (
                      <tr key={m} className="border-t">
                        <td className="py-1">{m}</td>
                        <td className="text-right">{inr(e)}</td>
                        <td className="text-right">{inr(a)}</td>
                        <td className={`text-right ${v < 0 ? "text-red-600" : v > 0 ? "text-amber-600" : ""}`}>
                          {v === 0 ? "—" : inr(v)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {detailOpen.varianceNote && (
                <div className="p-2 bg-amber-50 dark:bg-amber-950/30 border rounded text-xs">
                  <strong>Variance Note:</strong> {detailOpen.varianceNote}
                </div>
              )}
              {detailOpen.notes && (
                <div className="p-2 bg-muted/30 border rounded text-xs">
                  <strong>Handover Notes:</strong> {detailOpen.notes}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setDetailOpen(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
