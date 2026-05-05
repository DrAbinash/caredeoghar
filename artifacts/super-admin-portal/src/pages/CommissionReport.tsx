import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Printer, Stethoscope } from "lucide-react";
import {
  useListDoctors,
  useGetDetailedCommissionReport,
  type CommissionTestGroupRow,
  type CommissionDoctorEntry,
} from "@workspace/api-client-react";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ALPHA = ["a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p"];

export default function CommissionReport({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);

  const [reportDoctorId, setReportDoctorId] = useState<number | null>(null);
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0];
  });
  const [to, setTo] = useState(new Date().toISOString().split("T")[0]);

  const { data: doctorsData } = useListDoctors();
  const doctors = doctorsData?.doctors ?? [];

  const { data, isLoading, error: reportError } = useGetDetailedCommissionReport({
    from,
    to,
    groupBy: "test",
    ...(reportDoctorId !== null ? { doctorId: reportDoctorId } : {}),
  });

  useEffect(() => {
    if (reportError) {
      toast({ title: "Failed to load report", description: String(reportError), variant: "destructive" });
    }
  }, [reportError, toast]);

  const report = data?.report ?? [];
  const grandTotal = data?.grandTotal ?? { doctors: 0, orders: 0, revenue: 0, commission: 0 };

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

  return (
    <div className="min-h-screen w-full bg-background">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-2 -ml-2">
            <ArrowLeft size={14} className="mr-1" /> Back
          </Button>
          <h1 className="text-2xl font-bold">Commission Report</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Per-doctor referral commission breakdown by test
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-end justify-between bg-card border border-border rounded-xl p-4">
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
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
            <Printer size={14} /> Print
          </Button>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Doctors with Referrals", value: String(grandTotal.doctors), amber: false },
            { label: "Total Orders",           value: String(grandTotal.orders),  amber: false },
            { label: "Total Revenue",          value: inr(grandTotal.revenue),    amber: false },
            { label: "Commission Payable",     value: inr(grandTotal.commission), amber: true  },
          ].map(c => (
            <div key={c.label} className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
              <p className={`text-xl font-bold ${c.amber ? "text-amber-600" : ""}`}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* Report body */}
        <div ref={printRef}>
          <div style={{ display: "none" }}>
            <h1>Referral Commission Report</h1>
            <p className="meta">Date Range: {from} &nbsp;to&nbsp; {to}</p>
            <p className="meta">Doctor: {reportDoctorId ? doctors.find(d => d.id === reportDoctorId)?.name ?? "—" : "All"}</p>
            <p className="meta">Generated: {new Date().toLocaleString("en-IN")}</p>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />)}
            </div>
          ) : report.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm bg-card border border-border rounded-xl">
              No referral data for the selected period / doctor
            </div>
          ) : (
            <div className="space-y-6">
              {report.map((entry, idx) => (
                <CommissionTable key={entry.doctor.id} entry={entry} index={idx} />
              ))}
              {report.length > 1 && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-center justify-between dark:bg-amber-900/20 dark:border-amber-700">
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
      </div>
    </div>
  );
}

function CommissionTable({ entry, index }: { entry: CommissionDoctorEntry; index: number }) {
  const label = ALPHA[index] ?? String(index + 1);
  const rows: CommissionTestGroupRow[] = Array.isArray(entry.grouped) ? entry.grouped : [];

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border bg-muted/30">
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
            <tr className="border-b border-border bg-muted/20">
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
                className={`border-b border-border last:border-0 ${i % 2 === 1 ? "bg-muted/10" : ""}`}
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
            <tr className="border-t-2 border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700">
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
