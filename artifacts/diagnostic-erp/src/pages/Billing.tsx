import { useState } from "react";
import { Link } from "wouter";
import {
  useListBills,
  useCreateBill,
  useListOrders,
  getListBillsQueryKey,
} from "@workspace/api-client-react";
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
import { Plus, ChevronRight } from "lucide-react";
import { useForm } from "react-hook-form";

type BillForm = {
  orderId: number;
  discount?: number;
  dueDate?: string;
};

const STATUSES = ["draft", "pending", "partial", "paid", "cancelled"];

export default function Billing() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useListBills({ status: (status || undefined) as typeof status, page, limit: 20 });
  const { data: orders } = useListOrders({ status: "completed", limit: 100 });

  const createBill = useCreateBill({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() });
        setOpen(false);
        reset();
      },
    },
  });

  const { register, handleSubmit, reset, setValue, watch } = useForm<BillForm>();

  const onSubmit = (data: BillForm) => {
    createBill.mutate({ data: { orderId: Number(data.orderId), discount: data.discount ? Number(data.discount) : undefined, dueDate: data.dueDate || undefined } });
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

  return (
    <div className="pb-8">
      <PageHeader
        title="Billing"
        subtitle={`${data?.total ?? 0} bills`}
        actions={
          <Button size="sm" onClick={() => { setOpen(true); reset(); }}>
            <Plus size={14} className="mr-1" /> New Bill
          </Button>
        }
      />

      <div className="px-6 space-y-4">
        <div className="flex gap-3">
          <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/30">
                  <th className="px-4 py-3 font-medium">Bill No.</th>
                  <th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium text-right">Paid</th>
                  <th className="px-4 py-3 font-medium text-right">Balance</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-border/50 animate-pulse">
                      {[...Array(9)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded w-20" /></td>)}
                    </tr>
                  ))
                ) : data?.bills?.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">No bills found</td></tr>
                ) : (
                  data?.bills?.map((b) => (
                    <tr key={b.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-primary">{b.billNumber}</td>
                      <td className="px-4 py-3">
                        {b.patient && (
                          <div>
                            <div className="font-medium">{b.patient.firstName} {b.patient.lastName}</div>
                            <div className="text-xs text-muted-foreground">{b.patient.patientId}</div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{b.order?.orderNumber}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatCurrency(b.totalAmount)}</td>
                      <td className="px-4 py-3 text-right text-green-600 dark:text-green-400 font-medium">{formatCurrency(b.paidAmount)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={b.balanceAmount > 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}>
                          {formatCurrency(b.balanceAmount)}
                        </span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <Link href={`/billing/${b.id}`} className="text-muted-foreground hover:text-foreground inline-flex">
                          <ChevronRight size={16} />
                        </Link>
                      </td>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate Bill</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Select Order *</Label>
              <Select onValueChange={(v) => setValue("orderId", Number(v))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select completed order..." /></SelectTrigger>
                <SelectContent>
                  {orders?.orders?.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.orderNumber} — {o.patient?.firstName} {o.patient?.lastName} (₹{Number(o.totalAmount).toFixed(0)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Discount (₹)</Label>
                <Input type="number" step="0.01" min="0" {...register("discount", { valueAsNumber: true })} className="mt-1" placeholder="0" />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" {...register("dueDate")} className="mt-1" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createBill.isPending}>
                {createBill.isPending ? "Generating..." : "Generate Bill"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
