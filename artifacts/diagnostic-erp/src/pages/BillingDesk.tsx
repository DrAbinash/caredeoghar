import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { api } from "@/lib/fetchApi";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  User,
  UserPlus,
  FlaskConical,
  Receipt,
  Stethoscope,
  X,
  Plus,
  CheckCircle2,
  Percent,
  IndianRupee,
  CalendarDays,
  Hash,
  Package,
  Zap,
  Phone,
  RefreshCcw,
  Star,
  Printer,
  ExternalLink,
  AlertTriangle,
  Pencil,
} from "lucide-react";

type Patient = {
  id: number;
  patientId: string;
  firstName: string;
  lastName: string;
  phone: string;
  gender: string;
  dateOfBirth: string;
  email?: string;
  bloodGroup?: string;
  address?: string;
};

type Doctor = { id: number; name: string; specialization: string };
type Test   = { id: number; name: string; code: string; price: number; category: string; isActive?: boolean };
type PkgTest = Test & { discountPct?: number; discountAmount?: number };
type Pkg    = { id: number; packageCode: string; name: string; price: number; discountPct: number; discountAmount?: number; isActive?: boolean; tests: PkgTest[] };

type SelectedTest = { testId: number; name: string; price: number; category: string; source: "test" | "package" };
type SelectedPackage = { packageId: number; name: string; testIds: number[] };
type PaySplit = { mode: string; amount: string };
type LastBill = {
  id: number; billNumber: string; patient: Patient; doctorName: string | null;
  tests: SelectedTest[]; subtotal: number; discount: number; total: number; payments: PaySplit[];
  tokenNo?: number | null; tokenDate?: string | null;
};

type ClinicLite = {
  id: number; name: string; tagline?: string | null; address?: string | null; phone?: string | null;
  email?: string | null; logoDataUrl?: string | null; footerNote?: string | null;
  billPrintCopies?: number | null; qrOnBillEnabled?: boolean | null; showTatOnBill?: boolean | null;
};

type BillItem = { id: number; name: string; code: string | null; category: string; price: number; source: "test" | "package" };

const GENDERS = ["male", "female", "other"] as const;
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
const PAYMENT_MODES = ["cash", "upi", "card", "online"] as const;

function inr(n: number) { return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function escapeHtml(s: string) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)); }
function buildBillVerifyUrl(billNumber: string) { return `${window.location.origin}/api/verify/bill/${encodeURIComponent(billNumber)}`; }
function qrSvgDataUrl(text: string) {
  const safe = escapeHtml(text);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180"><rect width="180" height="180" fill="#fff"/><rect x="12" y="12" width="156" height="156" rx="8" fill="none" stroke="#111" stroke-width="4"/><text x="90" y="88" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#111">VERIFY</text><text x="90" y="112" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#444">${safe}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export default function BillingDesk() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [newPatient, setNewPatient] = useState({ firstName: "", lastName: "", phone: "", gender: "male", age: "", email: "", address: "", bloodGroup: "" });
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [doctorId, setDoctorId] = useState<number | null>(null);
  const [doctorMode, setDoctorMode] = useState<"self" | "doctor">("self");
  const [doctorSearch, setDoctorSearch] = useState("");
  const [doctorSearchOpen, setDoctorSearchOpen] = useState(false);
  const doctorRef = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState("");
  const [testSearch, setTestSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedTests, setSelectedTests] = useState<SelectedTest[]>([]);
  const [selectedPackages, setSelectedPackages] = useState<SelectedPackage[]>([]);
  const [packageSearch, setPackageSearch] = useState("");
  const [pinnedTestIds, setPinnedTestIds] = useState<Set<number>>(() => { try { const stored = localStorage.getItem("billingDesk:pinnedTests"); return new Set(stored ? JSON.parse(stored) : []); } catch { return new Set(); } });
  const [discountType, setDiscountType] = useState<"amount" | "pct">("amount");
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState<string>("");
  const [discountNote, setDiscountNote] = useState<string>("");
  const [payNow, setPayNow] = useState(true);
  const [paymentSplits, setPaymentSplits] = useState<PaySplit[]>([{ mode: "cash", amount: "" }]);
  const [lastBill, setLastBill] = useState<LastBill | null>(null);
  const [billQrDataUrl, setBillQrDataUrl] = useState<string>("");
  const [showBillToast, setShowBillToast] = useState(false);
  const [suggLoading, setSuggLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<{ discount: number; rule: { name: string } | null } | null>(null);
  const queryClient = useQueryClient();
  const printAfterSaveRef = useRef(false);

  const { data: clinic } = useQuery<ClinicLite>({ queryKey: ["clinic-settings"], queryFn: () => api.get("/api/clinic-settings"), staleTime: 5 * 60_000 });
  const { data: doctors = [] } = useQuery<Doctor[]>({ queryKey: ["doctors-list"], queryFn: () => api.get<{ doctors: Doctor[] }>("/api/doctors").then((d) => d.doctors ?? []), staleTime: Infinity });
  const { data: discountReasons = [] } = useQuery<{ id: number; label: string; isActive: boolean }[]>({ queryKey: ["discount-reasons"], queryFn: () => api.get("/api/discount-reasons") });
  const { data: packages = [] } = useQuery<Pkg[]>({ queryKey: ["packages-active"], queryFn: () => api.get<Pkg[]>("/api/packages"), staleTime: Infinity, select: (d) => d.filter((p) => p.isActive !== false) });

  const createPatientMut = useMutation({
    mutationFn: (body: typeof newPatient) => {
      const ageNum = Number(body.age);
      const birthYear = new Date().getFullYear() - ageNum;
      const dateOfBirth = ageNum > 0 ? `${birthYear}-01-01` : "";
      return api.post("/api/patients", { ...body, dateOfBirth, age: undefined });
    },
    onSuccess: (p: Patient) => { setSelectedPatient(p); setNewPatient({ firstName: "", lastName: "", phone: "", gender: "male", age: "", email: "", address: "", bloodGroup: "" }); toast({ title: `Patient registered: ${p.patientId}` }); },
    onError: () => toast({ title: "Failed to register patient", variant: "destructive" }),
  });

  const generateMut = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) throw new Error("No patient selected");
      if (selectedTests.length === 0) throw new Error("No tests selected");
      const order = await api.post<{ id: number; orderNumber: string }>("/api/orders", { patientId: selectedPatient.id, doctorId: doctorId ?? undefined, notes: notes || undefined, tests: selectedTests.map((t) => ({ testId: t.testId, price: t.price })) });
      const bill = await api.post<{ id: number; billNumber: string; token?: { tokenNo: number; tokenDate: string } | null }>("/api/bills", { orderId: order.id, discount: discountAmt, discountReason: discountAmt > 0 ? discountReason || null : null, discountReasonNote: discountAmt > 0 ? discountNote || null : null });
      if (payNow) {
        const splits = paymentSplits.filter((s) => Number(s.amount) > 0);
        for (const split of splits) {
          await api.post("/api/payments", { billId: bill.id, amount: Number(split.amount), method: split.mode, reference: "" });
        }
      }
      return bill;
    },
    onSuccess: (bill) => {
      if (!selectedPatient) return;
      const doctor = doctors.find((d) => d.id === doctorId);
      setLastBill({ id: bill.id, billNumber: bill.billNumber, patient: selectedPatient, doctorName: doctor?.name ?? null, tests: [...selectedTests], subtotal, discount: discountAmt, total, payments: paymentSplits.filter((p) => Number(p.amount) > 0), tokenNo: bill.token?.tokenNo ?? null, tokenDate: bill.token?.tokenDate ?? null });
      setShowBillToast(true);
      window.setTimeout(() => setShowBillToast(false), 5000);
      queryClient.invalidateQueries({ queryKey: ["recent-bills-today"] });
      queryClient.invalidateQueries({ queryKey: ["bill-preview-no"] });
      if (printAfterSaveRef.current) {
        printAfterSaveRef.current = false;
        void queryClient.fetchQuery({ queryKey: ["clinic-settings"], queryFn: () => api.get("/api/clinic-settings") }).catch(() => {}).then(() => { window.setTimeout(() => window.print(), 500); });
      }
    },
    onError: (err: Error) => toast({ title: err.message || "Failed to generate bill", variant: "destructive" }),
  });

  const subtotal = selectedTests.reduce((s, t) => s + t.price, 0);
  const discountAmt = discountType === "pct" ? (subtotal * discountValue) / 100 : discountValue;
  const total = Math.max(0, subtotal - discountAmt);
  const paidTotal = paymentSplits.reduce((s, p) => s + Number(p.amount || 0), 0);
  const balance = Math.max(0, total - paidTotal);
  const needsFormF = false;
  const husbandName = "";
  const patientAddress = "";
  const selectedDoctor = doctorId ? doctors.find((d) => d.id === doctorId) ?? null : null;
  const doctorLabel = doctorMode === "self" ? "Walk-in / Self" : selectedDoctor ? `Dr. ${selectedDoctor.name}` : "Walk-in / Self";

  useEffect(() => { if (!lastBill) { setBillQrDataUrl(""); return; } let cancelled = false; QRCode.toDataURL(buildBillVerifyUrl(lastBill.billNumber), { errorCorrectionLevel: "M", margin: 1, width: 256, color: { dark: "#000000", light: "#ffffff" } }).then((url) => { if (!cancelled) setBillQrDataUrl(url); }).catch(() => { if (!cancelled) setBillQrDataUrl(""); }); return () => { cancelled = true; }; }, [lastBill]);

  return (
    <div className="space-y-4">
      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-card-border bg-muted/20 flex items-center gap-2 text-sm font-semibold">
          <Stethoscope size={14} className="text-primary" /> Referral Doctor
          <span className="ml-auto text-xs font-normal text-muted-foreground">optional</span>
        </div>
        <div className="p-3" ref={doctorRef}>
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              onClick={() => { setDoctorMode("self"); setDoctorId(null); setDoctorSearch(""); setDoctorSearchOpen(false); }}
              className={`px-3 py-1.5 rounded-md text-sm border ${doctorMode === "self" ? "border-primary bg-primary/5 text-primary font-medium" : "border-card-border text-muted-foreground hover:bg-muted/30"}`}
            >
              Walk-in / Self
            </button>
            <button
              type="button"
              onClick={() => { setDoctorMode("doctor"); setDoctorSearchOpen((v) => !v); }}
              className={`px-3 py-1.5 rounded-md text-sm border ${doctorMode === "doctor" ? "border-primary bg-primary/5 text-primary font-medium" : "border-card-border text-muted-foreground hover:bg-muted/30"}`}
            >
              {doctorId ? doctorLabel : "Select Referral Doctor"}
            </button>
          </div>
          {doctorSearchOpen && (
            <div className="border border-card-border rounded-lg bg-popover shadow-lg max-h-48 overflow-y-auto">
              <button className="w-full text-left px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/50 border-b border-border italic" onMouseDown={(e) => e.preventDefault()} onClick={() => { setDoctorMode("self"); setDoctorId(null); setDoctorSearch(""); setDoctorSearchOpen(false); }}>
                Walk-in / Self (no referral)
              </button>
              {doctors.map((d) => (
                <button key={d.id} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left" onMouseDown={(e) => e.preventDefault()} onClick={() => { setDoctorMode("doctor"); setDoctorId(d.id); setDoctorSearch(""); setDoctorSearchOpen(false); }}>
                  <div className="w-9 h-7 rounded bg-primary/10 flex items-center justify-center flex-shrink-0 font-mono text-[11px] text-primary font-semibold">#{d.id}</div>
                  <div className="flex-1 min-w-0"><div className="text-sm font-medium">Dr. {d.name}</div><div className="text-xs text-muted-foreground">{d.specialization}</div></div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="bdr-patient-line"><span>Ref: <strong>{doctorLabel}</strong></span></div>
    </div>
  );
}
