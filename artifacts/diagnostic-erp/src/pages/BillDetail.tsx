import { useState, useEffect } from "react";
import QRCode from "qrcode";
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
import { ArrowLeft, Plus, Pencil, History, Clock, ShieldAlert, Trash2, AlertTriangle, ExternalLink, Printer, Ban, Undo2, XCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { useSuperAdmin, getSuperAdminToken } from "@/hooks/useSuperAdmin";
import { readStaffSession } from "@/lib/staffSession";
import { useToast } from "@/hooks/use-toast";
import { getAutoBillPaperSize, getBillPaperSize, getBillPrintLayout, getLayoutStyles, setBillPaperSize } from "@/lib/billPrintLayout";

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

type CancelRefundForm = {
  performedBy: string;
  reason: string;
  refundAmount: number;
  refundMethod: "cash" | "card" | "upi" | "insurance" | "cheque";
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
  const [refundTab, setRefundTab] = useState<"cancel" | "refund" | "cancel-refund">("cancel");
  const [reprintBy, setReprintBy] = useState<string>(() => readStaffSession()?.user.name || localStorage.getItem("diagnosticErp:lastReprintBy") || "");
  const [reprintReason, setReprintReason] = useState<string>("");
  const [isReprint, setIsReprint] = useState(false);
  const [paperSize, setPaperSize] = useState<"A4" | "A5">(() => getBillPaperSize());
  const [paperMode, setPaperMode] = useState<"auto" | "manual">("auto");
  const billPrintLayout = getBillPrintLayout();
  const ls = getLayoutStyles(billPrintLayout);
  const queryClient = useQueryClient();
  const superAdmin = useSuperAdmin();

  useEffect(() => {
    if (paperMode === "manual") setBillPaperSize(paperSize);
  }, [paperMode, paperSize]);
  const autoPaperSize = getAutoBillPaperSize((bill?.order?.tests?.length ?? 0), paperMode === "manual" ? paperSize : undefined);
  const effectivePaperSize = paperMode === "manual" ? paperSize : autoPaperSize;

  // Clinic settings for the printed receipt header
  const { data: clinic } = useQuery<{
    name: string; tagline: string; address: string; email: string; phone: string;
    website: string; gstin: string; logoDataUrl: string | null; footerNote?: string;
    showTatOnBill?: boolean;
    billPrintCopies?: number;
    qrOnBillEnabled?: boolean;
    billShowCode?: boolean;
    billShowCategory?: boolean;
  }>({
    queryKey: ["clinic-settings"],
    queryFn: () => api.get("/api/clinic-settings"),
    staleTime: 5 * 60_000,
  });

  const { data: printerSettings } = useQuery<{ billPrinterType?: string }>({
    queryKey: ["printer-settings"],
    queryFn: () => api.get("/api/printers/settings"),
    staleTime: 5 * 60_000,
  });
  const isBW = printerSettings?.billPrinterType === "bw";
  const isCancelled = bill?.status === "cancelled";

  // Inline QR for the printed receipt — shares the same encoding as
  // BillingDesk so the verify URL stays consistent across surfaces.
  const buildBillVerifyUrl = (billNumber: string) =>
    // Public api-server route — works in dev (proxied /api) and production
    // (unified serve). See artifacts/api-server/src/routes/verify.ts.
    `${window.location.origin}/api/verify/bill/${encodeURIComponent(billNumber)}`;

  // Real scannable QR (PNG data URL) generated via the qrcode library
  // when the bill loads. Empty string until generation completes; the
  // <img> below skips rendering until the data URL is ready.
  const [billQrDataUrl, setBillQrDataUrl] = useState<string>("");
  const [reprintReady, setReprintReady] = useState(false);
  useEffect(() => {
    if (!bill?.billNumber) { setBillQrDataUrl(""); return; }
    let cancelled = false;
    QRCode.toDataURL(buildBillVerifyUrl(bill.billNumber), {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 256,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => { if (!cancelled) setBillQrDataUrl(url); })
      .catch(() => { if (!cancelled) setBillQrDataUrl(""); });
    return () => { cancelled = true; };
  }, [bill?.billNumber]);

  useEffect(() => {
    if (!bill || !clinic) return;
    if (!isReprint) {
      setReprintReady(false);
      return;
    }
    const timer = setTimeout(() => window.print(), 150);
    return () => clearTimeout(timer);
  }, [bill, clinic, isReprint]);

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
    setIsReprint(true);
  };

  useEffect(() => {
    if (!bill || !clinic) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("print") !== "1") return;
    const timer = setTimeout(() => window.print(), 300);
    return () => clearTimeout(timer);
  }, [bill, clinic]);

  const { data: audits = [], refetch: refetchAudits } = useQuery<BillAudit[]>({
    queryKey: ["bill-audits", id],
    queryFn: () => api.get(`/api/bills/${id}/audits`),
    enabled: auditOpen,
  });

  const { data: reprintHistory = [] } = useQuery<BillAudit[]>({
    queryKey: ["bill-reprint-history", id],
    queryFn: () => api.get(`/api/bills/${id}/audits`),
    select: (data: BillAudit[]) => data.filter((a) => a.changeType === "reprint"),
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
  const { register: regCR, handleSubmit: handleCR, reset: resetCR, watch: watchCR, setValue: setCRVal, formState: crState } = useForm<CancelRefundForm>({
    defaultValues: { performedBy: defaultActor, reason: "", refundAmount: 0, refundMethod: "cash" },
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

  const onCancelRefundSubmit = handleCR(async (d) => {
    await refundBill.mutateAsync({
      performedBy: d.performedBy.trim(),
      reason: d.reason.trim(),
      amount: Number(d.refundAmount),
      method: d.refundMethod,
    });
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
    const hasPaid = Number(bill.paidAmount) > 0;
    // Default: "Refund & Cancel" when money was paid (one-step), plain cancel otherwise.
    setRefundTab(hasPaid ? "cancel-refund" : "cancel");
    resetCancel({ performedBy: defaultActor, reason: "" });
    resetRefund({
      performedBy: defaultActor,
      reason: "",
      amount: Number(bill.paidAmount) > 0 ? Number(bill.paidAmount) : 0,
      method: "cash",
    });
    resetCR({
      performedBy: defaultActor,
      reason: "",
      refundAmount: Number(bill.paidAmount) > 0 ? Number(bill.paidAmount) : 0,
      refundMethod: "cash",
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

  const calcAge = (dob?: string | null) => {
    if (!dob) return null;
    const years = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
    return years > 0 ? `${years} Yrs` : null;
  };

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
                onClick={() => { setPaperMode("manual"); setPaperSize("A4"); }}
                className={`px-2 py-0.5 rounded ${paperSize === "A4" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >A4</button>
              <button
                type="button"
                onClick={() => { setPaperMode("manual"); setPaperSize("A5"); }}
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
              {!isCancelled && (
                <div className={`flex justify-between text-base font-bold border-t border-border pt-2 ${bill.balanceAmount > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                  <span>Balance Due</span>
                  <span>{formatCurrency(bill.balanceAmount)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tests */}
        {bill.order?.tests && bill.order.tests.length > 0 && (
          <TestsTable
            bill={bill as Parameters<typeof TestsTable>[0]["bill"]}
            billId={id}
            onUpdated={() => {
              queryClient.invalidateQueries({ queryKey: getGetBillQueryKey(id) });
              queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() });
            }}
          />
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
        {reprintHistory.length > 0 && (
          <div className="border border-amber-200 dark:border-amber-800/60 rounded-xl p-4 bg-amber-50/40 dark:bg-amber-950/20">
            <div className="flex items-center gap-2 mb-3">
              <Printer size={14} className="text-amber-600 dark:text-amber-400" />
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">Reprint History</span>
              <span className="ml-auto text-xs text-muted-foreground">{reprintHistory.length} reprint{reprintHistory.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="space-y-1.5">
              {reprintHistory.map((r, i) => (
                <div key={r.id ?? i} className="flex items-start gap-3 text-xs text-muted-foreground">
                  <span className="font-mono shrink-0">{new Date(r.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="text-foreground font-medium shrink-0">{r.editedBy || "—"}</span>
                  <span className="truncate">{r.reason ?? "—"}</span>
                </div>
              ))}
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
          body * { visibility: hidden !important; }
          .print-receipt, .print-receipt * { visibility: visible !important; }
          .print-receipt {
            position: absolute !important;
            top: 0 !important; left: 0 !important; right: 0 !important;
            margin: 0 !important;
            padding: ${effectivePaperSize === "A5" ? "0 4px" : "8px 12px"} !important;
            background: white !important;
            color: black !important;
            font-family: Arial, sans-serif !important;
            font-size: ${effectivePaperSize === "A5" ? "9.5px" : "12.5px"} !important;
            text-transform: uppercase !important;
          }
          .print-receipt .pr-keep-case { text-transform: none !important; }
          @page { size: ${effectivePaperSize}; margin: ${effectivePaperSize === "A5" ? "2mm 3mm" : "4mm 6mm"}; }
          ${isBW ? `
          /* ── B&W mode: high-contrast print for monochrome laser printers ── */
          .print-receipt-bw {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            filter: grayscale(1) contrast(1.35) !important;
          }
          ` : ""}
        }
        @media screen { .print-receipt { display: none; } }
      `}</style>

      {Array.from({ length: Math.max(1, Math.min(2, Number(clinic?.billPrintCopies ?? 1) || 1)) }).map((_, copyIdx) => (
      <div key={copyIdx} className={`print-receipt${isBW ? " print-receipt-bw" : ""}`} style={copyIdx > 0 ? { pageBreakBefore: "always" } : undefined}>
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
            <div style={{ fontSize: effectivePaperSize === "A5" ? "15px" : "20px", fontWeight: 800, color: "#1e40af", letterSpacing: "0.3px", lineHeight: 1.15 }}>
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
                maxHeight: effectivePaperSize === "A5" ? "48px" : "64px",
                maxWidth: effectivePaperSize === "A5" ? "110px" : "150px",
                objectFit: "contain",
                flexShrink: 0,
              }}
            />
          )}
        </div>

      </div>
      ))}

      {/* ── Billing Desk-style compact receipt — Re-print only ──
          Rendered as a sibling OUTSIDE the print-receipt loop so its own
          @media print rules take exclusive control without fighting the
          print-receipt visibility rules above. */}
      {isReprint && (
        <div className="billing-desk-receipt">
          <style>{`
            @media print {
              html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
              body * { visibility: hidden !important; }
              .billing-desk-receipt, .billing-desk-receipt * { visibility: visible !important; }
              .billing-desk-receipt {
                display: block !important;
                position: absolute !important;
                top: 0 !important; left: 0 !important; right: 0 !important;
                margin: 0 !important;
                padding: 0 1.5mm !important;
                max-width: none !important;
                text-transform: uppercase;
              }
              .billing-desk-receipt .bdr-keep-case { text-transform: none !important; }
              @page { size: ${effectivePaperSize}; margin: 1.5mm 1.5mm; }
            }
            .billing-desk-receipt { display: none; font-family: Arial, sans-serif; font-size: 10.5px; color: #000; max-width: 700px; margin: 0 auto; padding: 0; }
            @media print { .billing-desk-receipt { display: block !important; } }
            .bdr-patient { border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; padding: 2px 2px; margin-bottom: 5px; font-size: 10px; line-height: 1.22; }
            .bdr-patient-line { display: flex; justify-content: space-between; gap: 12px; }
            .bdr-patient-line strong { font-weight: 700; }
            .bdr-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 2px; margin-bottom: 2px; }
            .bdr-header h1 { font-size: 17px; font-weight: 800; margin: 0 0 0.5px; line-height: 1; }
            .bdr-header p { margin: 0.5px 0; font-size: 9.5px; color: #444; }
            .bdr-title { text-align: center; font-size: 10.5px; font-weight: 700; letter-spacing: 0.6px; margin: 2px 0 4px; text-transform: uppercase; }
            .bdr-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; font-size: 10px; }
            .bdr-table th { background: #f5f5f5; text-align: left; padding: 3px 5px; border: 1px solid #ccc; font-weight: 700; }
            .bdr-table td { padding: 2px 5px; border: 1px solid #ccc; vertical-align: top; }
            .bdr-table .bdr-right { text-align: right; }
            .bdr-bottom-row { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 4px; }
            .bdr-payments { font-size: 10px; flex: 1; }
            .bdr-payments strong { display: block; margin-bottom: 1px; border-bottom: 1px solid #ccc; padding-bottom: 1px; font-size: 10px; }
            .bdr-payments table { width: 100%; border-collapse: collapse; }
            .bdr-payments td { padding: 1px 4px 1px 0; border: none; }
            .bdr-summary { min-width: 170px; font-size: 10px; }
            .bdr-summary table { width: 100%; border-collapse: collapse; }
            .bdr-summary td { padding: 0.5px 3px; }
            .bdr-summary tr.bdr-grand td { font-weight: 700; border-top: 1px solid #000; padding-top: 3px; }
            .bdr-footer { text-align: center; font-size: 9px; color: #666; border-top: 1px solid #ccc; padding-top: 3px; margin-top: 3px; }
          `}</style>

          {/* Clinic header */}
          <div className="bdr-header" style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between", paddingBottom: 1, marginBottom: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "center", minWidth: 0 }}>
              {clinic?.logoDataUrl && <img src={clinic.logoDataUrl} alt="Logo" style={{ maxHeight: 48, maxWidth: 84, objectFit: "contain" }} />}
              <div>
                <h1 style={{ margin: 0, fontSize: 17, lineHeight: 1 }}>{clinic?.name || "Diagnostic Centre"}</h1>
                {clinic?.tagline && <p style={{ margin: "1px 0", fontStyle: "italic", color: "#555", fontSize: 9.5 }}>{clinic.tagline}</p>}
                {clinic?.address && <p style={{ margin: "1px 0", fontSize: 9.5 }}>{clinic.address.replace(/\s*\n\s*/g, ", ").trim()}</p>}
                <p style={{ margin: "1px 0", fontSize: 9.5 }}>
                  {clinic?.phone && <>Ph: {clinic.phone}</>}
                  {clinic?.phone && clinic?.email && " | "}
                  {clinic?.email && <>Email: {clinic.email}</>}
                </p>
                {(clinic?.gstin || clinic?.website) && (
                  <p style={{ margin: "1px 0", fontSize: 9 }}>
                    {clinic?.gstin && <>GSTIN: {clinic.gstin}</>}
                    {clinic?.gstin && clinic?.website && " | "}
                    {clinic?.website && <>{clinic.website}</>}
                  </p>
                )}
              </div>
            </div>
            {clinic?.qrOnBillEnabled !== false && billQrDataUrl && (
              <div className="bdr-keep-case" style={{ flexShrink: 0, textAlign: "center", fontSize: 7.5, color: "#444", lineHeight: 1.05 }}>
                <img src={billQrDataUrl} alt="Verify QR" style={{ width: 42, height: 42, display: "block" }} />
                <div style={{ marginTop: 2 }}>Scan to verify</div>
              </div>
            )}
          </div>

          <div className="bdr-title" style={{ margin: "1px 0 2px" }}>Invoice / Receipt</div>

          {/* Patient block */}
          <div className="bdr-patient" style={{ marginBottom: 3 }}>
            <div className="bdr-patient-line">
              <div>
                <strong style={{ fontSize: 13, fontWeight: 900, lineHeight: 1.05 }}>
                  {bill.patient.firstName} {bill.patient.lastName}
                </strong>
                <div style={{ fontSize: 10.5, fontWeight: 800, marginTop: 1 }}>
                  {[calcAge(bill.patient.dateOfBirth), bill.patient.gender].filter(Boolean).join(" / ")}
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: 10, lineHeight: 1.3 }}>
                {bill.patient.phone && <div>Ph: {bill.patient.phone}</div>}
                <div>ID: {bill.patient.patientId}</div>
              </div>
            </div>
            <div className="bdr-patient-line" style={{ marginTop: 2 }}>
              <span>Ref: <strong>{bill.order?.doctor ? `Dr. ${bill.order.doctor.name}` : "Self / Walk-in"}</strong></span>
              <span>
                Bill No: <strong>{String(bill.billNumber).replace(/^BILL-?/i, "").replace(/-/g, "")}</strong>
                {"  ·  "}
                {new Date(bill.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                {" "}
                {new Date(bill.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>

          {/* Tests table */}
          <table className="bdr-table" style={{ fontSize: 9 }}>
            <thead>
              <tr style={{ background: ls.tableHeaderBg, color: ls.tableHeaderColor, borderBottom: ls.tableRowBorderBottom }}>
                <th style={{ padding: ls.tableHeaderPad }}>#</th>
                <th style={{ padding: ls.tableHeaderPad }}>Test Name</th>
                {(clinic?.billShowCategory ?? true) && <th style={{ padding: ls.tableHeaderPad }}>Category</th>}
                <th className="bdr-right" style={{ padding: ls.tableHeaderPad }}>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {bill.order?.tests?.filter((t) => (t.status ?? "active") === "active").map((t, i) => (
                <tr key={t.id ?? i} style={{ background: ls.tableRowAltBg(i), borderBottom: ls.tableRowBorderBottom }}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{t.test?.name}</td>
                  {(clinic?.billShowCategory ?? true) && <td>{t.test?.category}</td>}
                  <td className="bdr-right">₹{Number(t.price ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Payments + Summary row */}
          <div className="bdr-bottom-row" style={{ alignItems: "stretch", gap: 8, marginBottom: 2 }}>
            <div className="bdr-payments">
              <strong>Payment Details</strong>
              <table>
                <tbody>
                  {(bill.payments ?? []).map((p, i) => (
                    <tr key={i}>
                      <td style={{ textTransform: "capitalize" }}>{p.method}</td>
                      <td style={{ textAlign: "right" }}>₹{Number(p.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                  {!(bill.payments ?? []).length && (
                    <tr><td colSpan={2} style={{ color: "#888" }}>No payments recorded</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="bdr-summary" style={{ minWidth: 150, flex: 0.7 }}>
              <table>
                <tbody>
                  <tr>
                    <td>Subtotal</td>
                    <td style={{ textAlign: "right" }}>₹{Number(bill.subtotal ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  </tr>
                  {Number(bill.discount) > 0 && (
                    <tr>
                      <td>Discount</td>
                      <td style={{ textAlign: "right", color: "green" }}>−₹{Number(bill.discount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  )}
                  <tr>
                    <td><strong>Total</strong></td>
                    <td style={{ textAlign: "right" }}><strong>₹{Number(bill.totalAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></td>
                  </tr>
                  <tr>
                    <td>Paid</td>
                    <td style={{ textAlign: "right", color: "green" }}>₹{Number(bill.paidAmount ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr className="bdr-grand">
                    <td><strong>Balance Due</strong></td>
                    <td style={{ textAlign: "right", color: Number(bill.balanceAmount ?? 0) > 0 ? "#c62828" : "green" }}>
                      ₹{Number(bill.balanceAmount ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      {Number(bill.balanceAmount ?? 0) === 0 && " (PAID)"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="bdr-footer" style={{ marginTop: 8, paddingTop: 8 }}>
            <p className="bdr-keep-case">{clinic?.footerNote || "Thank you for choosing our diagnostic services."}</p>
            <p className="bdr-keep-case">
              {readStaffSession()?.user?.name ? `Billed by: ${readStaffSession()?.user?.name}` : ""}
              {" · "}Computer-generated — No signature required
            </p>
          </div>
        </div>
      )}

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
            Paper size: <strong>{paperMode === "manual" ? paperSize : `AUTO (${effectivePaperSize})`}</strong> · Change above the Re-print button.
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

      {/* Cancel / Refund Dialog with three tabs */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 size={16} className="text-orange-600" /> Refund or Cancel Bill
            </DialogTitle>
          </DialogHeader>

          {/* Tab switcher */}
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            {Number(bill.paidAmount) > 0 && (
              <button
                type="button"
                onClick={() => setRefundTab("cancel-refund")}
                className={`flex-1 text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
                  refundTab === "cancel-refund" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Undo2 size={13} className="inline mr-1" />
                Refund &amp; Cancel
              </button>
            )}
            <button
              type="button"
              onClick={() => setRefundTab("refund")}
              disabled={Number(bill.paidAmount) <= 0}
              className={`flex-1 text-sm font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                refundTab === "refund" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
              title={Number(bill.paidAmount) <= 0 ? "No payments to refund yet" : ""}
            >
              Refund Only
            </button>
            <button
              type="button"
              onClick={() => setRefundTab("cancel")}
              className={`flex-1 text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
                refundTab === "cancel" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Ban size={13} className="inline mr-1" />
              Cancel Only
            </button>
          </div>

          {refundTab === "cancel-refund" ? (
            <form onSubmit={onCancelRefundSubmit} className="space-y-3 mt-2">
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3 text-xs text-blue-800 dark:text-blue-300 space-y-1">
                <p className="font-semibold">This will issue a refund AND cancel the bill in one step.</p>
                <p>The refund is recorded first, then the bill is marked as cancelled.</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
                <div className="flex justify-between"><span>Paid so far</span><span className="font-semibold text-foreground">{formatCurrency(bill.paidAmount)}</span></div>
                {Number((bill as { refundAmount?: number | string }).refundAmount ?? 0) > 0 && (
                  <div className="flex justify-between mt-1"><span>Already refunded</span><span className="font-semibold text-orange-600">{formatCurrency(Number((bill as { refundAmount?: number | string }).refundAmount ?? 0))}</span></div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Refund Amount (₹) <span className="text-red-500">*</span></Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={bill.paidAmount}
                    {...regCR("refundAmount", { required: true, valueAsNumber: true, min: 0.01, max: bill.paidAmount })}
                    className="mt-1"
                  />
                  {crState.errors.refundAmount && (
                    <p className="text-xs text-red-500 mt-1">Required</p>
                  )}
                </div>
                <div>
                  <Label>Refund Via</Label>
                  <Select value={watchCR("refundMethod")} onValueChange={(v) => setCRVal("refundMethod", v as CancelRefundForm["refundMethod"])}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Reason <span className="text-red-500">*</span></Label>
                <textarea
                  rows={3}
                  placeholder="e.g. Test cancelled by patient, sample rejected, duplicate bill…"
                  {...regCR("reason", { required: true, minLength: 3 })}
                  className="mt-1 w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
                {crState.errors.reason && (
                  <p className="text-xs text-red-500 mt-1">Please provide a reason (at least 3 characters)</p>
                )}
              </div>
              <div>
                <Label>Performed By <span className="text-red-500">*</span></Label>
                <Input {...regCR("performedBy", { required: true })} className="mt-1" placeholder="Your name" />
              </div>
              {(refundBill.error || cancelBill.error) && (
                <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg p-2.5 text-sm text-red-700 dark:text-red-300">
                  {((refundBill.error ?? cancelBill.error) as Error)?.message}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setRefundOpen(false)}>Close</Button>
                <Button
                  type="submit"
                  disabled={refundBill.isPending || cancelBill.isPending}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {refundBill.isPending ? "Refunding…" : cancelBill.isPending ? "Cancelling…" : "Refund & Cancel"}
                </Button>
              </div>
            </form>
          ) : refundTab === "refund" ? (
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
                <Input value={reprintBy} readOnly tabIndex={-1} className="mt-1 bg-muted/50" />
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
                  Cancelling marks this bill as void. Existing payments stay recorded — use "Refund &amp; Cancel" above if money needs to be returned.
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
                <Input value={reprintBy} readOnly tabIndex={-1} className="mt-1 bg-muted/50" />
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

// ─── TestsTable (per-test cancel) ──────────────────────────────────────────

type OrderTest = {
  id: number;
  testId: number;
  price: number;
  status?: string | null;
  cancelledAt?: string | null;
  cancelledByName?: string | null;
  cancellationReason?: string | null;
  test?: { code?: string; name?: string; category?: string } | null;
};

type BillForTestsTable = {
  status?: string;
  order?: { tests?: OrderTest[] } | null;
};

function TestsTable({
  bill,
  billId,
  onUpdated,
}: {
  bill: BillForTestsTable;
  billId: number;
  onUpdated: () => void;
}) {
  const { toast } = useToast();
  const [cancelTestId, setCancelTestId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [cancelBy, setCancelBy] = useState<string>(
    () => readStaffSession()?.user.name || ""
  );

  const cancelTest = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      if (!cancelTestId) throw new Error("No test selected");
      return api.post(`/api/bills/${billId}/cancel-test`, {
        orderTestId: cancelTestId,
        reason,
        performedBy: cancelBy,
      });
    },
    onSuccess: () => {
      toast({ title: "Test cancelled", description: "The test has been removed from this bill." });
      setCancelTestId(null);
      setReason("");
      onUpdated();
    },
    onError: (e) => {
      toast({ title: "Failed to cancel test", description: e.message, variant: "destructive" });
    },
  });

  const tests = bill.order?.tests ?? [];
  const activeTests = tests.filter((t) => (t.status ?? "active") === "active");
  const isBillCancelled = bill.status === "cancelled";

  return (
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
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium w-10" />
            </tr>
          </thead>
          <tbody>
            {tests.map((ot) => {
              const isCancelled = (ot.status ?? "active") === "cancelled";
              return (
                <tr
                  key={ot.id}
                  className={`border-b border-border/50 last:border-0 ${isCancelled ? "opacity-50" : ""}`}
                >
                  <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{ot.test?.code}</td>
                  <td className="px-4 py-3 font-medium">
                    {ot.test?.name}
                    {isCancelled && ot.cancelledByName && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Cancelled by {ot.cancelledByName}
                        {ot.cancellationReason ? ` — ${ot.cancellationReason}` : ""}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{ot.test?.category}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${isCancelled ? "line-through text-muted-foreground" : ""}`}>
                    ₹{Number(ot.price).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    {isCancelled ? (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">
                        Cancelled
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!isCancelled && !isBillCancelled && activeTests.length > 1 && (
                      <button
                        title="Cancel this test"
                        onClick={() => { setCancelTestId(ot.id); setReason(""); }}
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-600"
                      >
                        <XCircle size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cancel-test dialog */}
      <Dialog open={cancelTestId !== null} onOpenChange={(o) => { if (!o) setCancelTestId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Test</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">
              Cancelling this test will remove it from the bill and recalculate the total. The bill stays open for remaining tests.
            </p>
            {activeTests.length <= 1 && (
              <div className="flex gap-2 items-start rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>This is the last active test. Use "Cancel Bill" instead to void the entire bill.</span>
              </div>
            )}
            <div>
              <Label>Reason <span className="text-red-500">*</span></Label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Test not performed, patient refused…"
                className="mt-1 w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
            <div>
              <Label>Cancelled By</Label>
              <Input className="mt-1" value={cancelBy} onChange={(e) => setCancelBy(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setCancelTestId(null)}>Close</Button>
              <Button
                disabled={!reason.trim() || !cancelBy.trim() || cancelTest.isPending}
                onClick={() => cancelTest.mutate()}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {cancelTest.isPending ? "Cancelling…" : "Cancel Test"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
