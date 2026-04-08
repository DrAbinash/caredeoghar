import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useGetBill, useCreatePayment, getGetBillQueryKey, getListBillsQueryKey } from "@workspace/api-client-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Pencil, History, Clock, ShieldAlert, Trash2, AlertTriangle, ExternalLink } from "lucide-react";
import { useForm } from "react-hook-form";
import { useSuperAdmin, getSuperAdminToken } from "@/hooks/useSuperAdmin";

type PaymentForm = {
  amount: number;
  method: "cash" | "card" | "upi" | "insurance" | "cheque";
  referenceNumber?: string;
  notes?: string;
};

type EditForm = {
  discount: number;
  status: string;
  editedBy: string;
  reason: string;
};

type SuperEditForm = {
  subtotal: number;
  discount: number;
  taxAmount: number;
  reason: string;
};

type DeleteForm = {
  reason: string;
  confirmText: string;
};

type BillAudit = {
  id: number;
  billId: number;
  editedBy: string;
  reason: string;
  changeType: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
};

const PAYMENT_METHODS = ["cash", "card", "upi", "insurance", "cheque"];
const BILL_STATUSES = ["pending", "partial", "paid", "cancelled"];

export default function BillDetail({ id }: { id: number }) {
  const [, navigate] = useLocation();
  const { data: bill, isLoading } = useGetBill(id);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [superEditOpen, setSuperEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const queryClient = useQueryClient();
  const superAdmin = useSuperAdmin();

  const { data: audits = [], refetch: refetchAudits } = useQuery<BillAudit[]>({
    queryKey: ["bill-audits", id],
    queryFn: () => api.get(`/api/bills/${id}/audits`),
    enabled: auditOpen,
  });

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

  const updateBill = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.put(`/api/bills/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetBillQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() });
      refetchAudits();
      setEditOpen(false);
      resetEdit();
    },
  });

  const superEditBill = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/api/bills/${id}/super-edit`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetBillQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() });
      refetchAudits();
      setSuperEditOpen(false);
      resetSuperEdit();
    },
  });

  const deleteBill = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.delete(`/api/bills/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() });
      navigate("/billing");
    },
  });

  const { register, handleSubmit, reset, setValue, watch } = useForm<PaymentForm>({ defaultValues: { method: "cash" } });
  const { register: regEdit, handleSubmit: handleEdit, reset: resetEdit, setValue: setEditVal, watch: watchEdit } = useForm<EditForm>({
    defaultValues: { discount: 0, status: "pending", editedBy: "", reason: "" },
  });
  const { register: regSuperEdit, handleSubmit: handleSuperEdit, reset: resetSuperEdit, watch: watchSuperEdit } = useForm<SuperEditForm>({
    defaultValues: { subtotal: 0, discount: 0, taxAmount: 0, reason: "" },
  });
  const { register: regDelete, handleSubmit: handleDelete, reset: resetDelete, watch: watchDelete } = useForm<DeleteForm>({
    defaultValues: { reason: "", confirmText: "" },
  });

  const onSubmit = (data: PaymentForm) => {
    createPayment.mutate({ data: { billId: id, amount: Number(data.amount), method: data.method, referenceNumber: data.referenceNumber || undefined, notes: data.notes || undefined } });
  };

  const onEditSubmit = handleEdit((d) => {
    updateBill.mutate({
      discount: Number(d.discount),
      status: d.status,
      editedBy: d.editedBy,
      reason: d.reason,
    });
  });

  const onSuperEditSubmit = handleSuperEdit((d) => {
    const token = getSuperAdminToken();
    superEditBill.mutate({
      subtotal: Number(d.subtotal),
      discount: Number(d.discount),
      taxAmount: Number(d.taxAmount),
      token,
      reason: d.reason,
    });
  });

  const onDeleteSubmit = handleDelete((d) => {
    if (d.confirmText !== bill?.billNumber) return;
    const token = getSuperAdminToken();
    deleteBill.mutate({ token, reason: d.reason });
  });

  const openEdit = () => {
    if (!bill) return;
    resetEdit({ discount: bill.discount, status: bill.status, editedBy: "", reason: "" });
    setEditOpen(true);
  };

  const openSuperEdit = () => {
    if (!bill) return;
    resetSuperEdit({
      subtotal: Number(bill.subtotal),
      discount: Number(bill.discount),
      taxAmount: Number(bill.taxAmount),
      reason: "",
    });
    setSuperEditOpen(true);
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

  if (isLoading) return <div className="p-6 animate-pulse"><div className="h-8 bg-muted rounded w-64" /></div>;
  if (!bill) return <div className="p-6 text-muted-foreground">Bill not found.</div>;

  const canEdit = bill.status !== "paid" && bill.status !== "cancelled";
  const superSub = watchSuperEdit("subtotal");
  const superDisc = watchSuperEdit("discount");
  const superTax = watchSuperEdit("taxAmount");
  const projectedTotal = (Number(superSub) || 0) - (Number(superDisc) || 0) + (Number(superTax) || 0);
  const confirmVal = watchDelete("confirmText");

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
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => { setAuditOpen(true); }}>
              <History size={14} className="mr-1" /> History
            </Button>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={openEdit}>
                <Pencil size={14} className="mr-1" /> Edit Bill
              </Button>
            )}
            {bill.status !== "paid" && bill.status !== "cancelled" && (
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus size={14} className="mr-1" /> Add Payment
              </Button>
            )}
          </div>
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
            {bill.order?.doctor && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground">Referring Doctor</p>
                <p className="text-sm font-medium">{bill.order.doctor.name}</p>
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

        {/* Super Admin Actions */}
        <div className="border border-rose-200 dark:border-rose-900/50 rounded-xl p-4 bg-rose-50/50 dark:bg-rose-950/20">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert size={15} className="text-rose-600 dark:text-rose-400" />
            <span className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400">Super Admin Actions</span>
            {superAdmin.isActive && (
              <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                {superAdmin.userName}
              </span>
            )}
          </div>
          {superAdmin.isActive ? (
            <>
              <p className="text-xs text-muted-foreground mb-3">
                Authenticated as <span className="font-semibold">{superAdmin.userName}</span>. These actions are irreversible and fully audited.
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30" onClick={openSuperEdit}>
                  <Pencil size={13} className="mr-1.5" /> Super Edit Amounts
                </Button>
                <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30" onClick={() => { resetDelete(); setDeleteOpen(true); }}>
                  <Trash2 size={13} className="mr-1.5" /> Delete Bill
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Super admin session required. Open the Super Admin Portal to authenticate, then use the generated link.
              </p>
              <a
                href="/super-admin-portal/"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-3 flex-shrink-0"
              >
                <Button size="sm" variant="outline" className="border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/30 whitespace-nowrap">
                  <ExternalLink size={13} className="mr-1.5" /> Open Portal
                </Button>
              </a>
            </div>
          )}
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

      {/* Edit Bill Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Bill — {bill.billNumber}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onEditSubmit} className="space-y-4">
            <div>
              <Label>Discount (₹)</Label>
              <Input
                type="number"
                min="0"
                max={bill.subtotal}
                step="0.01"
                {...regEdit("discount", { valueAsNumber: true })}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Current: {formatCurrency(bill.discount)}</p>
            </div>
            <div>
              <Label>Bill Status</Label>
              <Select defaultValue={bill.status} onValueChange={(v) => setEditVal("status", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BILL_STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Edit Reason (Required for audit)</p>
              <div>
                <Label>Edited By *</Label>
                <Input {...regEdit("editedBy", { required: true })} className="mt-1" placeholder="Your name or ID" />
              </div>
              <div>
                <Label>Reason for Edit *</Label>
                <Input {...regEdit("reason", { required: true })} className="mt-1" placeholder="e.g., Applied loyalty discount, Status correction" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={updateBill.isPending}>
                {updateBill.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Super Edit Dialog */}
      <Dialog open={superEditOpen} onOpenChange={setSuperEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert size={16} className="text-amber-600" />
              Super Edit — {bill.billNumber}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSuperEdit(onSuperEditSubmit)} className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400">
              Editing amounts will recalculate the total and balance. All changes are permanently logged.
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Subtotal (₹)</Label>
                <Input type="number" step="0.01" min="0" {...regSuperEdit("subtotal", { valueAsNumber: true })} className="mt-1" />
                <p className="text-xs text-muted-foreground mt-0.5">Was: {formatCurrency(bill.subtotal)}</p>
              </div>
              <div>
                <Label>Discount (₹)</Label>
                <Input type="number" step="0.01" min="0" {...regSuperEdit("discount", { valueAsNumber: true })} className="mt-1" />
                <p className="text-xs text-muted-foreground mt-0.5">Was: {formatCurrency(bill.discount)}</p>
              </div>
              <div>
                <Label>Tax (₹)</Label>
                <Input type="number" step="0.01" min="0" {...regSuperEdit("taxAmount", { valueAsNumber: true })} className="mt-1" />
                <p className="text-xs text-muted-foreground mt-0.5">Was: {formatCurrency(bill.taxAmount)}</p>
              </div>
            </div>
            <div className="bg-muted/40 rounded-lg px-4 py-2 text-sm flex justify-between items-center">
              <span className="text-muted-foreground">New Total</span>
              <span className="font-bold text-base">{formatCurrency(projectedTotal)}</span>
            </div>
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Authorized as <strong>{superAdmin.userName}</strong> via session token
              </div>
              <div>
                <Label>Reason *</Label>
                <Input {...regSuperEdit("reason", { required: true })} className="mt-1" placeholder="e.g., Billing correction — test price error" />
              </div>
            </div>
            {superEditBill.isError && (
              <p className="text-xs text-red-600">{(superEditBill.error as Error)?.message ?? "Authorization failed. Token may have expired."}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setSuperEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={superEditBill.isPending} className="bg-amber-600 hover:bg-amber-700 text-white">
                {superEditBill.isPending ? "Saving…" : "Apply Super Edit"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Bill Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle size={16} /> Delete Bill — {bill.billNumber}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleDelete(onDeleteSubmit)} className="space-y-4">
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 text-xs text-red-700 dark:text-red-400 space-y-1">
              <p className="font-semibold">This action cannot be undone.</p>
              <p>Deleting this bill will:</p>
              <ul className="list-disc list-inside space-y-0.5 pl-1">
                <li>Permanently remove all payment records</li>
                <li>Reset the linked order status to "pending"</li>
                <li>Renumber subsequent bills in {bill.billNumber.slice(0, 12)}</li>
              </ul>
            </div>
            <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Authorized as <strong>{superAdmin.userName}</strong> via session token
            </div>
            <div>
              <Label>Reason for Deletion *</Label>
              <Input {...regDelete("reason", { required: true })} className="mt-1" placeholder="e.g., Duplicate bill — created in error" />
            </div>
            <div>
              <Label>Type <span className="font-mono font-bold text-red-600">{bill.billNumber}</span> to confirm</Label>
              <Input
                {...regDelete("confirmText", { required: true })}
                className="mt-1 font-mono"
                placeholder={bill.billNumber}
              />
            </div>
            {deleteBill.isError && (
              <p className="text-xs text-red-600">{(deleteBill.error as Error)?.message ?? "Authorization failed. Token may have expired."}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button
                type="submit"
                disabled={deleteBill.isPending || confirmVal !== bill.billNumber}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteBill.isPending ? "Deleting…" : "Permanently Delete"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Audit History Dialog */}
      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History size={16} /> Edit History — {bill.billNumber}
            </DialogTitle>
          </DialogHeader>
          {audits.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              <Clock size={32} className="mx-auto mb-2 opacity-30" />
              No edits recorded for this bill
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {audits.map(a => (
                <div key={a.id} className="border border-card-border rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${
                      a.changeType === "deleted" ? "bg-red-100 text-red-700" :
                      a.changeType === "discount" ? "bg-blue-100 text-blue-700" :
                      a.changeType === "subtotal" || a.changeType === "taxAmount" || a.changeType === "totalAmount" ? "bg-amber-100 text-amber-700" :
                      "bg-orange-100 text-orange-700"
                    }`}>
                      {a.changeType}
                    </span>
                    <span className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="font-medium">{a.editedBy}</p>
                  <p className="text-muted-foreground text-xs">{a.reason}</p>
                  <div className="flex gap-4 mt-2 text-xs">
                    <span className="text-red-500">Before: {a.oldValue ?? "—"}</span>
                    <span className="text-green-600">After: {a.newValue ?? "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
