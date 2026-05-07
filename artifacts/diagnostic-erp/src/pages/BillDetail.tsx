import { useState, useEffect } from "react";
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
import { ArrowLeft, Plus, Pencil, History, Clock, ShieldAlert, Trash2, AlertTriangle, ExternalLink, Printer, Ban, Undo2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useSuperAdmin, getSuperAdminToken } from "@/hooks/useSuperAdmin";
import { readStaffSession } from "@/lib/staffSession";

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

type CancelForm = {
  performedBy: string;
  reason: string;
};

type RefundForm = {
  performedBy: string;
  reason: string;
  amount: number;
  method: "cash" | "card" | "upi" | "insurance" | "cheque";
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
  const [reprintOpen, setReprintOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundTab, setRefundTab] = useState<"cancel" | "refund">("cancel");
  const [reprintBy, setReprintBy] = useState<string>(() => localStorage.getItem("diagnosticErp:lastReprintBy") || "");
  const [reprintReason, setReprintReason] = useState<string>("");
  const [paperSize, setPaperSize] = useState<"A4" | "A5">(() => (localStorage.getItem("diagnosticErp:billPaperSize") as "A4" | "A5") || "A4");
  const queryClient = useQueryClient();
  const superAdmin = useSuperAdmin();

  useEffect(() => {
    localStorage.setItem("diagnosticErp:billPaperSize", paperSize);
  }, [paperSize]);

  // Clinic settings for the printed receipt header
  const { data: clinic } = useQuery<{
    name: string; tagline: string; address: string; email: string; phone: string;
    website: string; gstin: string; logoDataUrl: string | null; footerNote?: string;
    showTatOnBill?: boolean;
    billPrintCopies?: number;
  }>({
    queryKey: ["clinic-settings"],
    queryFn: () => api.get("/api/clinic-settings"),
    staleTime: 5 * 60_000,
  });

  const reprintLog = useMutation({
    mutationFn: (body: { reprintedBy: string; reason: string }) =>
      api.post(`/api/bills/${id}/reprint-log`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bill-audits", id] });
    },
  });

  const submitReprint = async () => {
    const by = reprintBy.trim();
    const why = reprintReason.trim();
    if (!by || !why) return;
    localStorage.setItem("diagnosticErp:lastReprintBy", by);
    try {
      await reprintLog.mutateAsync({ reprintedBy: by, reason: why });
    } catch (e) {
      // Logging failure should not block printing — user already authorised reprint.
      console.error("Reprint log failed:", e);
    }
    setReprintOpen(false);
    setReprintReason("");
    window.setTimeout(() => window.print(), 150);
  };

  useEffect(() => {
    if (!bill) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("print") !== "1") return;
    const timer = setTimeout(() => window.print(), 600);
    return () => clearTimeout(timer);
  }, [bill]);

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

  const cancelBill = useMutation({
    mutationFn: (body: CancelForm) => api.post(`/api/bills/${id}/cancel`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetBillQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() });
      refetchAudits();
      setRefundOpen(false);
      resetCancel();
    },
  });

  const refundBill = useMutation({
    mutationFn: (body: RefundForm) => api.post(`/api/bills/${id}/refund`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetBillQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() });
      refetchAudits();
      setRefundOpen(false);
      resetRefund();
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
  // Default the actor name to the signed-in staff user (from the portal session) when present.
  const defaultActor = readStaffSession()?.user.name ?? "";
  const { register: regCancel, handleSubmit: handleCancel, reset: resetCancel, formState: cancelState } = useForm<CancelForm>({
    defaultValues: { performedBy: defaultActor, reason: "" },
  });
  const { register: regRefund, handleSubmit: handleRefund, reset: resetRefund, watch: watchRefund, setValue: setRefundVal, formState: refundState } = useForm<RefundForm>({
    defaultValues: { performedBy: defaultActor, reason: "", amount: 0, method: "cash" },
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

  const onCancelSubmit = handleCancel((d) => {
    cancelBill.mutate({ performedBy: d.performedBy.trim(), reason: d.reason.trim() });
  });

  const onRefundSubmit = handleRefund((d) => {
    refundBill.mutate({
      performedBy: d.performedBy.trim(),
      reason: d.reason.trim(),
      amount: Number(d.amount),
      method: d.method,
    });
  });

  const openRefund = () => {
    if (!bill) return;
    // Pre-pick the most useful starting tab: refund if there's something to refund, cancel otherwise.
    const hasPaid = Number(bill.paidAmount) > 0;
    setRefundTab(hasPaid ? "refund" : "cancel");
    resetCancel({ performedBy: defaultActor, reason: "" });
    resetRefund({
      performedBy: defaultActor,
      reason: "",
      amount: Number(bill.paidAmount) > 0 ? Number(bill.paidAmount) : 0,
      method: "cash",
    });
    setRefundOpen(true);
  };

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
          <div className="flex gap-2 flex-wrap items-center">
            <div className="flex items-center gap-1 border border-border rounded-md px-1 py-0.5 text-xs">
              <span className="text-muted-foreground px-1">Paper:</span>
              <button
                type="button"
                onClick={() => setPaperSize("A4")}
                className={`px-2 py-0.5 rounded ${paperSize === "A4" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >A4</button>
              <button
                type="button"
                onClick={() => setPaperSize("A5")}
                className={`px-2 py-0.5 rounded ${paperSize === "A5" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >A5</button>
            </div>
            <Button size="sm" variant="outline" onClick={() => { setReprintReason(""); setReprintOpen(true); }}>
              <Printer size={14} className="mr-1" /> Re-print
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setAuditOpen(true); }}>
              <History size={14} className="mr-1" /> History
            </Button>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={openEdit}>
                <Pencil size={14} className="mr-1" /> Edit Bill
              </Button>
            )}
            {bill.status !== "cancelled" && (
              <Button size="sm" variant="outline" onClick={openRefund} className="border-orange-300 text-orange-700 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-700 dark:hover:bg-orange-950">
                <Undo2 size={14} className="mr-1" /> Refund / Cancel
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
      {/* Cancellation banner — only when bill is cancelled */}
      {bill.status === "cancelled" && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl p-4 flex items-start gap-3">
          <Ban size={20} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-red-700 dark:text-red-300">This bill has been cancelled</p>
            {(bill as { cancellationReason?: string | null }).cancellationReason && (
              <p className="text-red-700/90 dark:text-red-300/90 mt-1">
                <span className="font-medium">Reason:</span> {(bill as { cancellationReason?: string | null }).cancellationReason}
              </p>
            )}
            <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
              {(bill as { cancelledByName?: string | null }).cancelledByName ? `By ${(bill as { cancelledByName?: string | null }).cancelledByName}` : "By staff"}
              {(bill as { cancelledAt?: string | null }).cancelledAt ? ` on ${new Date((bill as { cancelledAt?: string | null }).cancelledAt as string).toLocaleString()}` : ""}
            </p>
          </div>
        </div>
      )}
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
              {Number((bill as { refundAmount?: number | string }).refundAmount ?? 0) > 0 && (
                <div className="flex justify-between text-sm text-orange-600 dark:text-orange-400">
                  <span>Refunded</span>
                  <span>{formatCurrency(Number((bill as { refundAmount?: number | string }).refundAmount ?? 0))}</span>
                </div>
              )}
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

        {superAdmin.isActive && (
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
        </div>
        )}
        {!superAdmin.isActive && (
          <div className="border border-dashed border-rose-200 dark:border-rose-900/50 rounded-xl p-4 bg-rose-50/30 dark:bg-rose-950/10">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert size={15} className="text-rose-600 dark:text-rose-400" />
              <span className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400">Super Admin Actions Locked</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Open the Super Admin Portal and generate a valid session token first. After the ERP receives the token, the delete and super-edit buttons will appear here.
            </p>
            <a
              href="/super-admin-portal/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex"
            >
              <Button size="sm" variant="outline" className="border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/30 whitespace-nowrap">
                <ExternalLink size={13} className="mr-1.5" /> Open Super Admin Portal
              </Button>
            </a>
          </div>
        )}
      </div>

      {/* ── Print Receipt (hidden on screen, visible when printing) ──
          Notes:
          - We don't use position:fixed: on some browsers it overflows the
            page and produces a blank trailing page. Plain block flow + the
            hide-everything-else rule prints exactly the receipt.
          - `text-transform: uppercase` on the wrapper forces ALL displayed
            patient/doctor/test text into capital case as required, regardless
            of the case the user typed in. */}
      <style>{`
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          /* Hide everything via visibility so the receipt's ancestors
             (#root, App layout) stay laid-out — using display:none on
             siblings of #root would hide the receipt itself. Then re-show
             only the receipt subtree and pull it to (0,0) with absolute
             positioning. position:absolute (not fixed!) avoids the
             "blank trailing page" bug Chrome had with position:fixed. */
          body * { visibility: hidden !important; }
          .print-receipt, .print-receipt * { visibility: visible !important; }
          .print-receipt {
            position: absolute !important;
            top: 0 !important; left: 0 !important; right: 0 !important;
            margin: 0 !important;
            padding: ${paperSize === "A5" ? "6px 10px" : "16px 22px"} !important;
            background: white !important;
            color: black !important;
            font-family: Arial, sans-serif !important;
            font-size: ${paperSize === "A5" ? "10.5px" : "12.5px"} !important;
            text-transform: uppercase !important;
          }
          .print-receipt .pr-keep-case { text-transform: none !important; }
          @page { size: ${paperSize}; margin: ${paperSize === "A5" ? "5mm 6mm" : "8mm 10mm"}; }
        }
        @media screen { .print-receipt { display: none; } }
      `}</style>

      {Array.from({ length: Math.max(1, Math.min(2, Number(clinic?.billPrintCopies ?? 1) || 1)) }).map((_, copyIdx) => (
      <div key={copyIdx} className="print-receipt" style={copyIdx > 0 ? { pageBreakBefore: "always" } : undefined}>
        {/* Clinic header — name + address on left, logo on right */}
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "16px",
          borderBottom: "2px solid #1e40af",
          paddingBottom: "10px",
          marginBottom: "12px",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: paperSize === "A5" ? "16px" : "20px", fontWeight: 800, color: "#1e40af", letterSpacing: "0.3px", lineHeight: 1.15 }}>
              {clinic?.name || "DiagnoCenter"}
            </div>
            {clinic?.tagline && (
              <div style={{ fontSize: "10.5px", color: "#666", marginTop: "1px", lineHeight: 1.2 }}>{clinic.tagline}</div>
            )}
            {clinic?.address && (
              <div style={{ fontSize: "10.5px", color: "#444", marginTop: "3px", lineHeight: 1.25 }}>
                {clinic.address.replace(/\s*\n\s*/g, ", ").trim()}
              </div>
            )}
            <div style={{ fontSize: "10.5px", color: "#444", marginTop: "2px", lineHeight: 1.25 }}>
              {[clinic?.phone && `Ph: ${clinic.phone}`, clinic?.email, clinic?.website]
                .filter(Boolean)
                .join("  •  ")}
            </div>
            {clinic?.gstin && (
              <div style={{ fontSize: "10px", color: "#666", marginTop: "1px" }}>GSTIN: {clinic.gstin}</div>
            )}
          </div>
          {clinic?.logoDataUrl && (
            <img
              src={clinic.logoDataUrl}
              alt="logo"
              style={{
                maxHeight: paperSize === "A5" ? "48px" : "64px",
                maxWidth: paperSize === "A5" ? "110px" : "150px",
                objectFit: "contain",
                flexShrink: 0,
              }}
            />
          )}
        </div>

        {/* Bill title + meta — bill number is shown as a pure number
            (the legacy `BILL-` prefix is stripped here). */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: "700", color: "#111" }}>INVOICE / RECEIPT</div>
            <div style={{ fontSize: "11.5px", color: "#444", marginTop: "2px" }}>
              Bill No: <strong>{String(bill.billNumber).replace(/^BILL-?/i, "").replace(/-/g, "")}</strong>
              {"   "}·{"   "}
              Date: {new Date(bill.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} {new Date(bill.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{
              display: "inline-block",
              padding: "3px 10px",
              borderRadius: "16px",
              fontSize: "10.5px",
              fontWeight: "700",
              background: bill.status === "paid" ? "#dcfce7" : bill.status === "cancelled" ? "#fee2e2" : "#fef9c3",
              color: bill.status === "paid" ? "#15803d" : bill.status === "cancelled" ? "#dc2626" : "#854d0e",
              border: `1px solid ${bill.status === "paid" ? "#86efac" : bill.status === "cancelled" ? "#fca5a5" : "#fde047"}`,
            }}>
              {bill.status}
            </div>
            {bill.order?.orderNumber && (
              <div style={{ fontSize: "10.5px", color: "#666", marginTop: "2px" }}>Order: {bill.order.orderNumber}</div>
            )}
          </div>
        </div>

        {/* Patient + Doctor info — compact 2-line block (no boxed bg, no
            grid) so an A5 bill fits on a single page. The wrapper's
            text-transform:uppercase rule capitalizes name / gender /
            doctor automatically. */}
        {bill.patient && (() => {
          const ageYrs = bill.patient.dateOfBirth
            ? Math.floor((Date.now() - new Date(bill.patient.dateOfBirth).getTime()) / (365.25 * 24 * 3600 * 1000))
            : null;
          const meta = [
            bill.patient.gender || null,
            ageYrs && ageYrs > 0 ? `${ageYrs} YRS` : null,
            bill.patient.phone ? `PH ${bill.patient.phone}` : null,
            `ID ${bill.patient.patientId}`,
          ].filter(Boolean).join("  ·  ");
          const ref = bill.order?.doctor
            ? `Dr. ${bill.order.doctor.name}${bill.order.doctor.specialization ? ` (${bill.order.doctor.specialization})` : ""}`
            : "Self / Walk-in";
          return (
            <div style={{ marginBottom: "10px", padding: "6px 8px", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", lineHeight: 1.35 }}>
              <div style={{ fontSize: "12.5px" }}>
                <strong>{bill.patient.firstName} {bill.patient.lastName}</strong>
                <span style={{ color: "#555", marginLeft: 8, fontWeight: 400 }}>{meta}</span>
              </div>
              <div style={{ fontSize: "11px", color: "#555" }}>
                Ref: <strong>{ref}</strong>
              </div>
            </div>
          );
        })()}

        {/* Tests table */}
        {bill.order?.tests && bill.order.tests.length > 0 && (
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "10px", fontWeight: "700", textTransform: "uppercase", color: "#64748b", marginBottom: "6px" }}>Tests / Services</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "#1e40af", color: "white" }}>
                  <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: "600" }}>Code</th>
                  <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: "600" }}>Test / Service</th>
                  <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: "600" }}>Category</th>
                  {clinic?.showTatOnBill && (
                    <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: "600" }}>TAT</th>
                  )}
                  <th style={{ padding: "7px 10px", textAlign: "right", fontWeight: "600" }}>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {bill.order.tests.map((ot, i) => (
                  <tr key={ot.id} style={{ background: i % 2 === 0 ? "#f8fafc" : "white", borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "6px 10px", fontFamily: "monospace", fontWeight: "700", color: "#1e40af" }}>{ot.test?.code}</td>
                    <td style={{ padding: "6px 10px", fontWeight: "500" }}>{ot.test?.name}</td>
                    <td style={{ padding: "6px 10px", color: "#666" }}>{ot.test?.category}</td>
                    {clinic?.showTatOnBill && (
                      <td style={{ padding: "6px 10px", color: "#444" }}>{ot.test?.duration || "—"}</td>
                    )}
                    <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: "600" }}>{Number(ot.price).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Financial summary */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
          <table style={{ width: "260px", fontSize: "12px", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ padding: "4px 10px", color: "#555" }}>Subtotal</td>
                <td style={{ padding: "4px 10px", textAlign: "right" }}>₹{Number(bill.subtotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
              </tr>
              {bill.discount > 0 && (
                <tr>
                  <td style={{ padding: "4px 10px", color: "#16a34a" }}>Discount</td>
                  <td style={{ padding: "4px 10px", textAlign: "right", color: "#16a34a" }}>- ₹{Number(bill.discount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                </tr>
              )}
              {bill.taxAmount > 0 && (
                <tr>
                  <td style={{ padding: "4px 10px", color: "#555" }}>Tax</td>
                  <td style={{ padding: "4px 10px", textAlign: "right" }}>₹{Number(bill.taxAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                </tr>
              )}
              <tr style={{ background: "#1e40af", color: "white", fontWeight: "700" }}>
                <td style={{ padding: "7px 10px", fontSize: "13px" }}>Total Amount</td>
                <td style={{ padding: "7px 10px", textAlign: "right", fontSize: "13px" }}>₹{Number(bill.totalAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr style={{ color: "#16a34a" }}>
                <td style={{ padding: "4px 10px" }}>Amount Paid</td>
                <td style={{ padding: "4px 10px", textAlign: "right" }}>- ₹{Number(bill.paidAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr style={{ fontWeight: "700", color: bill.balanceAmount > 0 ? "#dc2626" : "#16a34a", borderTop: "2px solid #e2e8f0" }}>
                <td style={{ padding: "6px 10px" }}>Balance Due</td>
                <td style={{ padding: "6px 10px", textAlign: "right" }}>₹{Number(bill.balanceAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Payment history */}
        {bill.payments && bill.payments.length > 0 && (
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "10px", fontWeight: "700", textTransform: "uppercase", color: "#64748b", marginBottom: "6px" }}>Payment History</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
              <thead>
                <tr style={{ background: "#f1f5f9", borderBottom: "1px solid #cbd5e1" }}>
                  <th style={{ padding: "5px 8px", textAlign: "left", color: "#475569" }}>Date &amp; Time</th>
                  <th style={{ padding: "5px 8px", textAlign: "left", color: "#475569" }}>Method</th>
                  <th style={{ padding: "5px 8px", textAlign: "left", color: "#475569" }}>Reference</th>
                  <th style={{ padding: "5px 8px", textAlign: "right", color: "#475569" }}>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {bill.payments.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "5px 8px", color: "#555" }}>{new Date(p.createdAt).toLocaleString("en-IN")}</td>
                    <td style={{ padding: "5px 8px", textTransform: "uppercase", fontWeight: "600", color: "#1e40af" }}>{p.method}</td>
                    <td style={{ padding: "5px 8px", color: "#555" }}>{p.referenceNumber || "—"}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: "600" }}>{Number(p.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: "1px dashed #cbd5e1", paddingTop: "12px", textAlign: "center" }}>
          {bill.balanceAmount <= 0 ? (
            <div style={{ fontSize: "12px", color: "#16a34a", fontWeight: "600", marginBottom: "6px" }}>✓ Payment Received in Full — Thank You!</div>
          ) : (
            <div style={{ fontSize: "12px", color: "#dc2626", fontWeight: "600", marginBottom: "6px" }}>Balance of ₹{Number(bill.balanceAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })} is pending</div>
          )}
          <div style={{ fontSize: "10px", color: "#94a3b8" }}>This is a computer-generated invoice. No signature required.</div>
          <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "2px" }}>Reports will be available as per turnaround time. For queries, please call us.</div>
        </div>
      </div>
      ))}

      {/* Re-print Dialog */}
      <Dialog open={reprintOpen} onOpenChange={setReprintOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer size={16} /> Re-print Bill — {bill.billNumber}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400">
              Re-prints are logged in the bill audit trail and a notification email is sent to admin & super-admin recipients.
            </div>
            <div>
              <Label>Your Name *</Label>
              <Input
                value={reprintBy}
                onChange={(e) => setReprintBy(e.target.value)}
                className="mt-1"
                placeholder="e.g., Anita (Reception)"
              />
            </div>
            <div>
              <Label>Reason for Re-print *</Label>
              <Input
                value={reprintReason}
                onChange={(e) => setReprintReason(e.target.value)}
                className="mt-1"
                placeholder="e.g., Patient lost original copy"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Paper size: <strong>{paperSize}</strong> · Change above the Re-print button.
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setReprintOpen(false)}>Cancel</Button>
              <Button
                type="button"
                onClick={submitReprint}
                disabled={!reprintBy.trim() || !reprintReason.trim() || reprintLog.isPending}
              >
                {reprintLog.isPending ? "Logging…" : "Log & Print"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
          <form onSubmit={onSuperEditSubmit} className="space-y-4">
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
          <form onSubmit={onDeleteSubmit} className="space-y-4">
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

      {/* Cancel / Refund Dialog with two tabs */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 size={16} className="text-orange-600" /> Refund or Cancel Bill
            </DialogTitle>
          </DialogHeader>

          {/* Tab switcher */}
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            <button
              type="button"
              onClick={() => setRefundTab("refund")}
              disabled={Number(bill.paidAmount) <= 0}
              className={`flex-1 text-sm font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                refundTab === "refund" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
              title={Number(bill.paidAmount) <= 0 ? "No payments to refund yet" : ""}
            >
              <Undo2 size={13} className="inline mr-1.5" />
              Issue Refund
            </button>
            <button
              type="button"
              onClick={() => setRefundTab("cancel")}
              className={`flex-1 text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
                refundTab === "cancel" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Ban size={13} className="inline mr-1.5" />
              Cancel Bill
            </button>
          </div>

          {refundTab === "refund" ? (
            <form onSubmit={onRefundSubmit} className="space-y-3 mt-2">
              <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
                <div className="flex justify-between"><span>Paid so far</span><span className="font-semibold text-foreground">{formatCurrency(bill.paidAmount)}</span></div>
                {Number((bill as { refundAmount?: number | string }).refundAmount ?? 0) > 0 && (
                  <div className="flex justify-between mt-1"><span>Already refunded</span><span className="font-semibold text-orange-600">{formatCurrency(Number((bill as { refundAmount?: number | string }).refundAmount ?? 0))}</span></div>
                )}
              </div>
              <div>
                <Label>Refund Amount (₹) <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={bill.paidAmount}
                  {...regRefund("amount", { required: true, valueAsNumber: true, min: 0.01, max: bill.paidAmount })}
                  className="mt-1"
                />
                {refundState.errors.amount && (
                  <p className="text-xs text-red-500 mt-1">Enter an amount between ₹0.01 and {formatCurrency(bill.paidAmount)}</p>
                )}
              </div>
              <div>
                <Label>Refund Method</Label>
                <Select value={watchRefund("method")} onValueChange={(v) => setRefundVal("method", v as RefundForm["method"])}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Refund Reason <span className="text-red-500">*</span></Label>
                <textarea
                  rows={3}
                  placeholder="e.g. Test cancelled by patient, duplicate payment, sample rejected…"
                  {...regRefund("reason", { required: true, minLength: 3 })}
                  className="mt-1 w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
                {refundState.errors.reason && (
                  <p className="text-xs text-red-500 mt-1">Please provide a clear reason (at least 3 characters)</p>
                )}
              </div>
              <div>
                <Label>Refunded By <span className="text-red-500">*</span></Label>
                <Input {...regRefund("performedBy", { required: true })} className="mt-1" placeholder="Your name" />
              </div>
              {refundBill.error && (
                <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-2.5 text-sm text-red-700 dark:text-red-300">
                  {(refundBill.error as Error).message}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setRefundOpen(false)}>Close</Button>
                <Button type="submit" disabled={refundBill.isPending} className="bg-orange-600 hover:bg-orange-700 text-white">
                  {refundBill.isPending ? "Processing…" : "Issue Refund"}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={onCancelSubmit} className="space-y-3 mt-2">
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3 flex gap-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  Cancelling marks this bill as void. Existing payments stay recorded — issue a refund separately if money needs to be returned.
                </span>
              </div>
              <div>
                <Label>Cancellation Reason <span className="text-red-500">*</span></Label>
                <textarea
                  rows={3}
                  placeholder="e.g. Wrong patient, duplicate bill, tests not performed…"
                  {...regCancel("reason", { required: true, minLength: 3 })}
                  className="mt-1 w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
                {cancelState.errors.reason && (
                  <p className="text-xs text-red-500 mt-1">Please provide a clear reason (at least 3 characters)</p>
                )}
              </div>
              <div>
                <Label>Cancelled By <span className="text-red-500">*</span></Label>
                <Input {...regCancel("performedBy", { required: true })} className="mt-1" placeholder="Your name" />
              </div>
              {cancelBill.error && (
                <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-2.5 text-sm text-red-700 dark:text-red-300">
                  {(cancelBill.error as Error).message}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setRefundOpen(false)}>Close</Button>
                <Button type="submit" disabled={cancelBill.isPending} className="bg-red-600 hover:bg-red-700 text-white">
                  {cancelBill.isPending ? "Cancelling…" : "Cancel Bill"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
