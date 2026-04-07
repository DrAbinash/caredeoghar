import { useState } from "react";
import { Link } from "wouter";
import { useGetBill, useCreatePayment, getGetBillQueryKey, getListBillsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus } from "lucide-react";
import { useForm } from "react-hook-form";

type PaymentForm = {
  amount: number;
  method: "cash" | "card" | "upi" | "insurance" | "cheque";
  referenceNumber?: string;
  notes?: string;
};

const PAYMENT_METHODS = ["cash", "card", "upi", "insurance", "cheque"];

export default function BillDetail({ id }: { id: number }) {
  const { data: bill, isLoading } = useGetBill(id);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const createPayment = useCreatePayment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBillQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() });
        setOpen(false);
        reset();
      },
    },
  });

  const { register, handleSubmit, reset, setValue, watch } = useForm<PaymentForm>({ defaultValues: { method: "cash" } });

  const onSubmit = (data: PaymentForm) => {
    createPayment.mutate({ data: { billId: id, amount: Number(data.amount), method: data.method, referenceNumber: data.referenceNumber || undefined, notes: data.notes || undefined } });
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

  if (isLoading) return <div className="p-6 animate-pulse"><div className="h-8 bg-muted rounded w-64" /></div>;
  if (!bill) return <div className="p-6 text-muted-foreground">Bill not found.</div>;

  return (
    <div className="pb-8">
      <div className="px-6 pt-4">
        <Link href="/billing" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft size={14} /> Back to Billing
        </Link>
      </div>

      <PageHeader
        title={bill.billNumber}
        subtitle={`Generated ${new Date(bill.createdAt).toLocaleString()}`}
        actions={
          bill.status !== "paid" && bill.status !== "cancelled" && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus size={14} className="mr-1" /> Add Payment
            </Button>
          )
        }
      />

      <div className="px-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Patient info */}
          <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Patient</h3>
            {bill.patient && (
              <div>
                <Link href={`/patients/${bill.patient.id}`} className="font-semibold text-primary hover:underline">{bill.patient.firstName} {bill.patient.lastName}</Link>
                <p className="text-xs text-muted-foreground mt-0.5">{bill.patient.patientId}</p>
                <p className="text-xs text-muted-foreground">{bill.patient.phone}</p>
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-border/50">
              <p className="text-xs text-muted-foreground">Status</p>
              <div className="mt-1"><StatusBadge status={bill.status} /></div>
            </div>
            {bill.dueDate && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground">Due Date</p>
                <p className="text-sm font-medium">{bill.dueDate}</p>
              </div>
            )}
          </div>

          {/* Financials */}
          <div className="md:col-span-2 bg-card border border-card-border rounded-xl p-5 shadow-sm">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Bill Summary</h3>
            <div className="space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(bill.subtotal)}</span>
              </div>
              {bill.discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="text-green-600">- {formatCurrency(bill.discount)}</span>
                </div>
              )}
              {bill.taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{formatCurrency(bill.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold border-t border-border pt-2">
                <span>Total</span>
                <span>{formatCurrency(bill.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                <span>Paid</span>
                <span>- {formatCurrency(bill.paidAmount)}</span>
              </div>
              <div className={`flex justify-between text-base font-bold border-t border-border pt-2 ${bill.balanceAmount > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                <span>Balance Due</span>
                <span>{formatCurrency(bill.balanceAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tests */}
        {bill.order?.tests && bill.order.tests.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold mb-3">Tests Billed</h2>
            <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/30">
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">Test</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.order.tests.map((ot) => (
                    <tr key={ot.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{ot.test?.code}</td>
                      <td className="px-4 py-3 font-medium">{ot.test?.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{ot.test?.category}</td>
                      <td className="px-4 py-3 text-right font-semibold">₹{Number(ot.price).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Payments */}
        <div>
          <h2 className="text-sm font-semibold mb-3">Payment History</h2>
          <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
            {!bill.payments?.length ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No payments recorded yet</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/30">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Method</th>
                    <th className="px-4 py-3 font-medium">Reference</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.payments.map((p) => (
                    <tr key={p.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(p.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3 capitalize">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded text-xs font-medium">{p.method}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.referenceNumber ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-green-600 dark:text-green-400">{formatCurrency(Number(p.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Add payment dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Amount (₹) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={String(bill.balanceAmount)}
                {...register("amount", { required: true, valueAsNumber: true })}
                className="mt-1"
                placeholder={`Max: ${formatCurrency(bill.balanceAmount)}`}
              />
            </div>
            <div>
              <Label>Payment Method *</Label>
              <Select value={watch("method")} onValueChange={(v) => setValue("method", v as PaymentForm["method"])}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reference Number</Label>
              <Input {...register("referenceNumber")} className="mt-1" placeholder="UPI/Card/Cheque reference" />
            </div>
            <div>
              <Label>Notes</Label>
              <Input {...register("notes")} className="mt-1" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createPayment.isPending}>
                {createPayment.isPending ? "Saving..." : "Record Payment"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
