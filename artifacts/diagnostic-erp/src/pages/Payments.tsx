import { useState } from "react";
import { Link } from "wouter";
import { useListPayments } from "@workspace/api-client-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";

const METHOD_COLORS: Record<string, string> = {
  cash: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  card: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  upi: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  insurance: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  cheque: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
};

export default function Payments() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useListPayments({ page, limit: 20 });

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

  return (
    <div className="pb-8">
      <PageHeader title="Payments" subtitle={`${data?.total ?? 0} transactions`} />

      <div className="px-6">
        <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/30">
                  <th className="px-4 py-3 font-medium">Date & Time</th>
                  <th className="px-4 py-3 font-medium">Bill</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Notes</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(8)].map((_, i) => (
                    <tr key={i} className="border-b border-border/50 animate-pulse">
                      {[...Array(6)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded w-24" /></td>)}
                    </tr>
                  ))
                ) : data?.payments?.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No payments recorded yet</td></tr>
                ) : (
                  data?.payments?.map((p) => (
                    <tr key={p.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <Link href={`/billing/${p.billId}`} className="font-mono text-xs text-primary hover:underline">Bill #{p.billId}</Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${METHOD_COLORS[p.method] ?? "bg-gray-100 text-gray-700"}`}>
                          {p.method.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.referenceNumber ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.notes ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-600 dark:text-green-400">{formatCurrency(Number(p.amount))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {data && data.total > 20 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-muted-foreground">Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, data.total)} of {data.total}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</Button>
                <Button variant="outline" size="sm" disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
