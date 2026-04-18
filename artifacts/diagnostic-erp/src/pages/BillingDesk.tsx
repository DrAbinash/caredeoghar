import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  ChevronDown,
  ChevronRight,
  Package,
  Zap,
  Phone,
  RefreshCcw,
  Star,
  Printer,
  ExternalLink,
} from "lucide-react";

// ──────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────
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
type Pkg    = { id: number; packageCode: string; name: string; price: number; discountPct: number; isActive?: boolean; tests: Test[] };

type SelectedTest = { testId: number; name: string; price: number; category: string; source: "test" | "package" };
type PaySplit = { mode: string; amount: string };
type LastBill = {
  id: number;
  billNumber: string;
  patient: Patient;
  doctorName: string | null;
  tests: SelectedTest[];
  subtotal: number;
  discount: number;
  total: number;
  payments: PaySplit[];
  tokenNo?: number | null;
  tokenDate?: string | null;
};

// ──────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────
const PAYMENT_MODES  = ["cash", "card", "upi", "cheque", "insurance"];
const BLOOD_GROUPS   = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GENDERS        = ["male", "female", "other"];

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

const today = () => new Date().toLocaleDateString("en-IN", {
  weekday: "short", year: "numeric", month: "short", day: "numeric",
});

// ──────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────
function useDebounce<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ──────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────
type ClinicLite = { name?: string; tagline?: string; address?: string; phone?: string; logoDataUrl?: string | null } | undefined;
type PrinterCfg = { billPrinter?: string; barcodePrinter?: string; tokenPrinter?: string };

function openPrintWindow(html: string) {
  const w = window.open("", "_blank", "width=420,height=600");
  if (!w) {
    alert("Pop-up blocked. Please allow pop-ups for this site to print.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Defer print so resources (images / fonts) load first
  w.onload = () => {
    w.focus();
    w.print();
    setTimeout(() => w.close(), 400);
  };
}

async function getPrinterSettings(): Promise<PrinterCfg> {
  try {
    return await api.get<PrinterCfg>("/api/printers/settings");
  } catch {
    return {};
  }
}

function printerWindowFeatures(printerName?: string) {
  const name = (printerName || "").trim();
  return name ? `width=420,height=600,noopener,noreferrer` : "width=420,height=600,noopener,noreferrer";
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

async function printBill(b: LastBill, clinic: ClinicLite) {
  const p = await getPrinterSettings();
  const rows = b.tests.map((t) => `<tr><td>${escapeHtml(t.name)}</td><td style="text-align:right">₹${t.price.toFixed(2)}</td></tr>`).join("");
  const payRows = b.payments.map((p) => `<tr><td>${escapeHtml(p.mode.toUpperCase())}</td><td style="text-align:right">₹${Number(p.amount || 0).toFixed(2)}</td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Bill ${escapeHtml(b.billNumber)}</title>
    <style>
      @page { size: A5; margin: 8mm; }
      body { font-family: Arial, sans-serif; font-size: 11px; color:#000; margin:0; }
      h1 { margin:0; font-size:16px; text-align:center; }
      .clinic { text-align:center; border-bottom:2px solid #000; padding-bottom:6px; margin-bottom:8px; }
      .clinic p { margin:1px 0; font-size:10px; color:#444; }
      table { width:100%; border-collapse:collapse; }
      th, td { padding:3px 4px; border-bottom:1px solid #ddd; font-size:10px; }
      th { background:#f4f4f4; text-align:left; }
      .meta td { border:none; padding:1px 0; }
      .totals td { border:none; padding:2px 0; }
      .totals .grand td { border-top:1px solid #000; font-weight:700; padding-top:4px; }
      .token { margin-top:8px; padding:4px; border:1px dashed #000; text-align:center; font-weight:700; }
    </style></head><body>
    <div class="clinic">
      <h1>${escapeHtml(clinic?.name || "Diagnostic Centre")}</h1>
      ${clinic?.tagline ? `<p>${escapeHtml(clinic.tagline)}</p>` : ""}
      ${clinic?.address ? `<p>${escapeHtml(clinic.address)}</p>` : ""}
      ${clinic?.phone ? `<p>Ph: ${escapeHtml(clinic.phone)}</p>` : ""}
    </div>
    <table class="meta"><tbody>
      <tr><td><strong>Bill No</strong></td><td>: ${escapeHtml(b.billNumber)}</td><td><strong>Date</strong></td><td>: ${new Date().toLocaleDateString("en-IN")}</td></tr>
      <tr><td><strong>Patient</strong></td><td colspan="3">: ${escapeHtml(b.patient.firstName)} ${escapeHtml(b.patient.lastName)} (${escapeHtml(b.patient.patientId)})</td></tr>
      <tr><td><strong>Phone</strong></td><td>: ${escapeHtml(b.patient.phone || "")}</td>${b.doctorName ? `<td><strong>Ref. Dr</strong></td><td>: ${escapeHtml(b.doctorName)}</td>` : "<td></td><td></td>"}</tr>
    </tbody></table>
    <table style="margin-top:6px"><thead><tr><th>Test</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="totals" style="margin-top:6px"><tbody>
      <tr><td>Subtotal</td><td style="text-align:right">₹${b.subtotal.toFixed(2)}</td></tr>
      ${b.discount > 0 ? `<tr><td>Discount</td><td style="text-align:right">−₹${b.discount.toFixed(2)}</td></tr>` : ""}
      <tr class="grand"><td>Total</td><td style="text-align:right">₹${b.total.toFixed(2)}</td></tr>
    </tbody></table>
    ${payRows ? `<p style="margin:6px 0 2px;font-weight:600">Payments</p><table><tbody>${payRows}</tbody></table>` : ""}
    ${b.tokenNo != null ? `<div class="token">QUEUE TOKEN&nbsp;#${String(b.tokenNo).padStart(3, "0")}</div>` : ""}
  </body></html>`;
  const w = window.open("", "_blank", printerWindowFeatures(p.billPrinter));
  if (!w) return openPrintWindow(html);
  w.document.open(); w.document.write(html); w.document.close(); w.onload = () => { w.focus(); w.print(); setTimeout(() => w.close(), 400); };
}

function code128SVG(value: string): string {
  // Lightweight inline barcode renderer (Code 128 B subset, digits + uppercase + symbols).
  // For production accuracy use a library; this gives a scan-friendly visual barcode.
  const PATTERNS: string[] = ["11011001100","11001101100","11001100110","10010011000","10010001100","10001001100","10011001000","10011000100","10001100100","11001001000","11001000100","11000100100","10110011100","10011011100","10011001110","10111001100","10011101100","10011100110","11001110010","11001011100","11001001110","11011100100","11001110100","11101101110","11101001100","11100101100","11100100110","11101100100","11100110100","11100110010","11011011000","11011000110","11000110110","10100011000","10001011000","10001000110","10110001000","10001101000","10001100010","11010001000","11000101000","11000100010","10110111000","10110001110","10001101110","10111011000","10111000110","10001110110","11101110110","11010001110","11000101110","11011101000","11011100010","11011101110","11101011000","11101000110","11100010110","11101101000","11101100010","11100011010","11101111010","11001000010","11110001010","10100110000","10100001100","10010110000","10010000110","10000101100","10000100110","10110010000","10110000100","10011010000","10011000010","10000110100","10000110010","11000010010","11001010000","11110111010","11000010100","10001111010","10100111100","10010111100","10010011110","10111100100","10011110100","10011110010","11110100100","11110010100","11110010010","11011011110","11011110110","11110110110","10101111000","10100011110","10001011110","10111101000","10111100010","11110101000","11110100010","10111011110","10111101110","11101011110","11110101110","11010000100","11010010000","11010011100","1100011101011"];
  // 0..127 chars: ASCII offset 32 → index 0
  const data: number[] = [];
  for (const ch of value) data.push(Math.max(0, Math.min(94, ch.charCodeAt(0) - 32)));
  let checksum = 104; // START B
  data.forEach((c, i) => { checksum += c * (i + 1); });
  checksum = checksum % 103;
  const codes = [104, ...data, checksum, 106]; // START B + data + checksum + STOP
  let bars = "";
  let x = 0;
  const W = 1.6, H = 50;
  for (const code of codes) {
    const pat = PATTERNS[code];
    for (let i = 0; i < pat.length; i++) {
      if (pat[i] === "1") bars += `<rect x="${x.toFixed(2)}" y="0" width="${W}" height="${H}" fill="#000"/>`;
      x += W;
    }
  }
  const totalW = x;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${H}" width="${totalW}" height="${H}">${bars}</svg>`;
}

async function printBarcode(b: LastBill) {
  const p = await getPrinterSettings();
  const value = b.billNumber;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Barcode ${escapeHtml(value)}</title>
    <style>
      @page { size: 70mm 30mm; margin: 2mm; }
      body { font-family: Arial, sans-serif; margin:0; padding:4px; text-align:center; }
      .wrap { display:flex; flex-direction:column; align-items:center; gap:2px; }
      .name { font-size:11px; font-weight:600; }
      .meta { font-size:9px; color:#333; }
      svg { max-width:100%; height:auto; }
    </style></head><body>
    <div class="wrap">
      <div class="name">${escapeHtml(b.patient.firstName)} ${escapeHtml(b.patient.lastName)}</div>
      ${code128SVG(value)}
      <div style="font-family:monospace;font-size:10px;letter-spacing:1px">${escapeHtml(value)}</div>
      <div class="meta">${escapeHtml(b.patient.patientId)} · ${new Date().toLocaleDateString("en-IN")}</div>
    </div>
  </body></html>`;
  const w = window.open("", "_blank", printerWindowFeatures(p.barcodePrinter));
  if (!w) return openPrintWindow(html);
  w.document.open(); w.document.write(html); w.document.close(); w.onload = () => { w.focus(); w.print(); setTimeout(() => w.close(), 400); };
}

async function printToken(b: LastBill, clinic: ClinicLite) {
  const p = await getPrinterSettings();
  if (b.tokenNo == null) return;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Token #${b.tokenNo}</title>
    <style>
      @page { size: 80mm 100mm; margin: 4mm; }
      body { font-family: Arial, sans-serif; margin:0; padding:6px; text-align:center; color:#000; }
      .clinic { font-size:11px; font-weight:700; border-bottom:1px dashed #000; padding-bottom:4px; margin-bottom:6px; }
      .label { font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#444; }
      .num { font-size:64px; font-weight:900; line-height:1; margin:6px 0; }
      .row { font-size:11px; margin:2px 0; }
      .footer { margin-top:8px; padding-top:4px; border-top:1px dashed #000; font-size:9px; color:#555; }
    </style></head><body>
    <div class="clinic">${escapeHtml(clinic?.name || "Diagnostic Centre")}</div>
    <div class="label">Token</div>
    <div class="num">${String(b.tokenNo).padStart(3, "0")}</div>
    <div class="row"><strong>${escapeHtml(b.patient.firstName)} ${escapeHtml(b.patient.lastName)}</strong></div>
    <div class="row">${escapeHtml(b.patient.patientId)}</div>
    <div class="row">${escapeHtml(b.billNumber)}</div>
    ${b.doctorName ? `<div class="row">Ref: ${escapeHtml(b.doctorName)}</div>` : ""}
    <div class="footer">${new Date().toLocaleString("en-IN")}<br/>Please wait for your token to be called.</div>
  </body></html>`;
  const w = window.open("", "_blank", printerWindowFeatures(p.tokenPrinter));
  if (!w) return openPrintWindow(html);
  w.document.open(); w.document.write(html); w.document.close(); w.onload = () => { w.focus(); w.print(); setTimeout(() => w.close(), 400); };
}

export default function BillingDesk() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // ── Patient state ──────────────────────────────────
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [newPatient, setNewPatient] = useState({
    firstName: "", lastName: "", phone: "", gender: "male",
    age: "", email: "", address: "", bloodGroup: "",
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // ── Doctor search state ─────────────────────────────
  const [doctorId, setDoctorId] = useState<number | null>(null);
  const [doctorSearch, setDoctorSearch] = useState("");
  const [doctorSearchOpen, setDoctorSearchOpen] = useState(false);
  const doctorRef = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState("");

  // ── New patient form visibility ──────────────────────
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);

  // ── Test selection ─────────────────────────────────
  const [testSearch, setTestSearch]   = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedTests, setSelectedTests] = useState<SelectedTest[]>([]);
  const [pinnedTestIds, setPinnedTestIds] = useState<Set<number>>(() => {
    try {
      const stored = localStorage.getItem("billingDesk:pinnedTests");
      return new Set(stored ? JSON.parse(stored) : []);
    } catch { return new Set(); }
  });

  function togglePin(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    setPinnedTestIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem("billingDesk:pinnedTests", JSON.stringify([...next]));
      return next;
    });
  }
  const [showPackages, setShowPackages] = useState(false);

  // ── Billing ────────────────────────────────────────
  const [discountType, setDiscountType]   = useState<"amount" | "pct">("amount");
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState<string>("");
  const [discountNote, setDiscountNote]     = useState<string>("");
  const [payNow, setPayNow]               = useState(true);
  const [paymentSplits, setPaymentSplits] = useState<PaySplit[]>([{ mode: "cash", amount: "" }]);
  const [lastBill, setLastBill]           = useState<LastBill | null>(null);
  const [showBillToast, setShowBillToast] = useState(false);
  const [suggLoading, setSuggLoading]     = useState(false);
  const [suggestion, setSuggestion]       = useState<{ discount: number; rule: { name: string } | null } | null>(null);

  // ── Preview bill number ─────────────────────────────
  const { data: previewBillNo } = useQuery<{ next: string; ledgerId?: number }>({
    queryKey: ["bill-preview-no", doctorId],
    queryFn: () => api.get(doctorId ? `/api/bills/preview-number?doctorId=${doctorId}` : "/api/bills/preview-number"),
    retry: false,
  });

  // ── Data queries ────────────────────────────────────
  const debouncedSearch = useDebounce(patientSearch, 150);

  // Recent patients — loaded once, refreshed only on mount
  const { data: recentPatients } = useQuery<{ patients: Patient[] }>({
    queryKey: ["patients-recent"],
    queryFn: () => api.get<{ patients: Patient[] }>("/api/patients?limit=8&page=1"),
    staleTime: 10 * 60_000,  // 10 min
  });

  // Live search — event-driven, short stale is fine
  const { data: searchResults } = useQuery<{ patients: Patient[] }>({
    queryKey: ["patients-search", debouncedSearch],
    queryFn: () => api.get<{ patients: Patient[] }>(`/api/patients?search=${encodeURIComponent(debouncedSearch)}&limit=10`),
    enabled: debouncedSearch.length >= 1,
    staleTime: 30_000,
  });

  // Which list to show in the dropdown
  const patientResults = debouncedSearch.length >= 1 ? searchResults : recentPatients;

  // Static data — never auto-refresh during a billing session
  const { data: allTests = [] } = useQuery<Test[]>({
    queryKey: ["tests-all-popular"],
    queryFn: () => api.get<{ tests: Test[] }>("/api/tests?limit=500&sort=popular").then((d) => d.tests ?? []),
    staleTime: Infinity,
  });

  const { data: clinic } = useQuery<{
    name: string; tagline: string; address: string; email: string; phone: string;
    website: string; gstin: string; logoDataUrl: string | null; footerNote: string;
  }>({
    queryKey: ["clinic-settings"],
    queryFn: () => api.get("/api/clinic-settings"),
  });

  const { data: doctors = [] } = useQuery<Doctor[]>({
    queryKey: ["doctors-list"],
    queryFn: () => api.get<{ doctors: Doctor[] }>("/api/doctors").then((d) => d.doctors ?? []),
    staleTime: Infinity,
  });

  const { data: discountReasons = [] } = useQuery<{ id: number; label: string; isActive: boolean }[]>({
    queryKey: ["discount-reasons"],
    queryFn: () => api.get("/api/discount-reasons"),
  });

  const { data: packages = [] } = useQuery<Pkg[]>({
    queryKey: ["packages-active"],
    queryFn: () => api.get<Pkg[]>("/api/packages"),
    staleTime: Infinity,
    select: (d) => d.filter((p) => p.isActive !== false),
  });

  // ── Create mutations ───────────────────────────────
  const createPatientMut = useMutation({
    mutationFn: (body: typeof newPatient) => {
      // Convert age → approximate dateOfBirth (Jan 1 of birth year)
      const ageNum = Number(body.age);
      const birthYear = new Date().getFullYear() - ageNum;
      const dateOfBirth = ageNum > 0 ? `${birthYear}-01-01` : "";
      return api.post("/api/patients", { ...body, dateOfBirth, age: undefined });
    },
    onSuccess: (p: Patient) => {
      setSelectedPatient(p);
      setNewPatient({ firstName: "", lastName: "", phone: "", gender: "male", age: "", email: "", address: "", bloodGroup: "" });
      toast({ title: `Patient registered: ${p.patientId}` });
    },
    onError: () => toast({ title: "Failed to register patient", variant: "destructive" }),
  });

  const printAfterSaveRef = useRef(false);
  const generateMut = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) throw new Error("No patient selected");
      if (selectedTests.length === 0) throw new Error("No tests selected");

      // 1. Create order (with custom per-test prices to preserve package discounts)
      const order = await api.post<{ id: number; orderNumber: string }>("/api/orders", {
        patientId: selectedPatient.id,
        doctorId: doctorId ?? undefined,
        notes: notes || undefined,
        tests: selectedTests.map((t) => ({ testId: t.testId, price: t.price })),
      });

      // 2. Create bill
      const bill = await api.post<{ id: number; billNumber: string; token?: { tokenNo: number; tokenDate: string } | null }>("/api/bills", {
        orderId: order.id,
        discount: discountAmt,
        discountReason: discountAmt > 0 ? discountReason || null : null,
        discountReasonNote: discountAmt > 0 ? discountNote || null : null,
      });

      // 3. Record payment split(s)
      if (payNow) {
        const splits = paymentSplits.filter((s) => Number(s.amount) > 0);
        for (const split of splits) {
          await api.post("/api/payments", {
            billId: bill.id,
            amount: Number(split.amount),
            method: split.mode,
            reference: "",
          });
        }
      }

      return bill;
    },
    onSuccess: (bill) => {
      if (!selectedPatient) return;
      const doctor = doctors.find((d) => d.id === doctorId);
      setLastBill({
        id: bill.id,
        billNumber: bill.billNumber,
        patient: selectedPatient,
        doctorName: doctor?.name ?? null,
        tests: [...selectedTests],
        subtotal,
        discount: discountAmt,
        total,
        payments: paymentSplits.filter((p) => Number(p.amount) > 0),
        tokenNo: bill.token?.tokenNo ?? null,
        tokenDate: bill.token?.tokenDate ?? null,
      });
      setShowBillToast(true);
      window.setTimeout(() => setShowBillToast(false), 5000);
      if (printAfterSaveRef.current) {
        printAfterSaveRef.current = false;
        window.setTimeout(() => window.print(), 250);
      }
    },
    onError: (err: Error) => toast({ title: err.message || "Failed to generate bill", variant: "destructive" }),
  });

  // ── Derived values ──────────────────────────────────
  const categories  = ["all", ...Array.from(new Set(allTests.map((t) => t.category))).sort()];

  const selectedTestIds = new Set(selectedTests.map((s) => s.testId));

  const filteredTests = allTests
    .filter((t) => {
      if (selectedTestIds.has(t.id)) return false;
      const q = testSearch.trim().toLowerCase();
      const matchSearch = !q || String(t.id) === q || String(t.id).includes(q) || t.name.toLowerCase().includes(q) || (t.code ?? "").toLowerCase().includes(q);
      const matchCat    = categoryFilter === "all" || t.category === categoryFilter;
      return matchSearch && matchCat && t.isActive !== false;
    })
    .sort((a, b) => {
      const ap = pinnedTestIds.has(a.id) ? 0 : 1;
      const bp = pinnedTestIds.has(b.id) ? 0 : 1;
      return ap - bp; // pinned first; popularity order (from API) preserved within each group
    });

  const subtotal    = selectedTests.reduce((s, t) => s + t.price, 0);
  const discountAmt = discountType === "amount"
    ? Math.min(discountValue, subtotal)
    : Math.min((subtotal * discountValue) / 100, subtotal);
  const total       = Math.max(0, subtotal - discountAmt);
  const paidTotal   = payNow ? paymentSplits.reduce((s, p) => s + (Number(p.amount) || 0), 0) : 0;
  const balance     = Math.max(0, total - paidTotal);

  // ── Test actions ────────────────────────────────────
  function addTest(t: Test) {
    if (selectedTests.find((s) => s.testId === t.id && s.source === "test")) {
      toast({ title: "Test already added" });
      return;
    }
    setSelectedTests((prev) => [...prev, { testId: t.id, name: t.name, price: t.price, category: t.category, source: "test" }]);
    setTestSearch("");
  }

  function addPackage(pkg: Pkg) {
    const effective = pkg.price - (pkg.price * pkg.discountPct) / 100;
    // Add package as individual tests using effective price share
    const count = pkg.tests.length || 1;
    const perTest = effective / count;
    const toAdd: SelectedTest[] = pkg.tests
      .filter((t) => !selectedTests.find((s) => s.testId === t.id))
      .map((t) => ({ testId: t.id, name: t.name, price: perTest, category: t.category, source: "package" as const }));
    if (toAdd.length === 0) { toast({ title: "All tests in this package already added" }); return; }
    setSelectedTests((prev) => [...prev, ...toAdd]);
    toast({ title: `Package "${pkg.name}" added (${toAdd.length} tests)` });
  }

  function removeTest(testId: number) {
    setSelectedTests((prev) => prev.filter((t) => t.testId !== testId));
  }

  // ── Discount suggestion ─────────────────────────────
  async function fetchSuggestion() {
    if (selectedTests.length === 0) return;
    setSuggLoading(true);
    try {
      const result = await api.post<{ discount: number; rule: { name: string } | null }>("/api/discounts/apply", {
        tests: selectedTests.map((t) => ({ testId: t.testId, category: t.category, price: t.price })),
      });
      setSuggestion(result);
    } catch {
      setSuggestion(null);
    } finally {
      setSuggLoading(false);
    }
  }

  // ── Click outside patient search dropdown ──────────
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (doctorRef.current && !doctorRef.current.contains(e.target as Node)) {
        setDoctorSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Reset ───────────────────────────────────────────
  function resetAll() {
    setSelectedPatient(null);
    setPatientSearch("");
    setNewPatient({ firstName: "", lastName: "", phone: "", gender: "male", age: "", email: "", address: "", bloodGroup: "" });
    setDoctorId(null);
    setDoctorSearch("");
    setNotes("");
    setSelectedTests([]);
    setDiscountValue(0);
    setDiscountReason("");
    setDiscountNote("");
    setPayNow(true);
    setPaymentSplits([{ mode: "cash", amount: "" }]);
    setLastBill(null);
    setSuggestion(null);
  }

  const canGenerate = !!selectedPatient && selectedTests.length > 0;

  // ──────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── TOP BAR ── */}
      <div className="flex-shrink-0 bg-card border-b border-card-border px-3 sm:px-6 py-2 sm:py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Receipt size={18} className="text-primary" />
          <span className="font-bold text-base">Billing Desk</span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays size={13} />
          <span>{today()}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs sm:text-sm">
          <Hash size={13} className="text-muted-foreground" />
          <span className="font-mono text-primary font-semibold">
            {previewBillNo?.next ?? "BILL-…"}
          </span>
          <span className="hidden sm:inline text-xs text-muted-foreground">(next bill no.)</span>
        </div>
        <div className="ml-auto flex items-center gap-2 w-full sm:w-auto order-last sm:order-none">
          <div className="flex-1 sm:flex-none"><BillSearchBox /></div>
          <Button variant="ghost" size="sm" onClick={resetAll} className="text-muted-foreground hover:text-foreground flex-shrink-0">
            <RefreshCcw size={13} className="mr-1" /> <span className="hidden xs:inline sm:inline">New Bill</span>
          </Button>
        </div>
      </div>

      {/* ── MAIN LAYOUT ── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden overflow-y-auto">

        {/* ══════════════════════════════════════════════
            LEFT COLUMN — Patient + Doctor + Notes
        ══════════════════════════════════════════════ */}
        <div className="w-full lg:w-[50%] lg:border-r border-card-border flex flex-col lg:overflow-hidden">
          <div className="lg:flex-1 lg:overflow-y-auto p-3 space-y-3">

            {/* ── Patient Section — Search ── */}
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-card-border flex items-center justify-between bg-muted/20">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <User size={14} className="text-primary" /> Search Patient
                </div>
                {selectedPatient && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => { setSelectedPatient(null); setPatientSearch(""); }}>
                    <X size={11} className="mr-1" /> Change
                  </Button>
                )}
              </div>

              <div className="p-3 space-y-2">
                {/* Selected patient card */}
                {selectedPatient ? (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                        {selectedPatient.firstName[0]}{selectedPatient.lastName[0]}
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{selectedPatient.firstName} {selectedPatient.lastName}</div>
                        <div className="text-xs text-muted-foreground font-mono">{selectedPatient.patientId}</div>
                      </div>
                      <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="capitalize">{selectedPatient.gender}</span>
                        {selectedPatient.dateOfBirth && <span>{selectedPatient.dateOfBirth}</span>}
                      </div>
                    </div>
                    {selectedPatient.phone && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground pl-10">
                        <Phone size={10} /> {selectedPatient.phone}
                        {selectedPatient.bloodGroup && <span className="ml-2 bg-red-100 text-red-600 px-1.5 rounded font-medium">{selectedPatient.bloodGroup}</span>}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Search existing patient */
                  <div ref={searchRef}>
                    <div className="relative">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search by name, ID or phone…"
                        value={patientSearch}
                        onChange={(e) => { setPatientSearch(e.target.value); setSearchOpen(true); }}
                        onFocus={() => setSearchOpen(true)}
                        onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                        className="pl-9 text-sm"
                      />
                    </div>
                    {searchOpen && (
                      <div className="mt-1 border border-card-border rounded-lg bg-popover shadow-lg max-h-52 overflow-y-auto">
                        {patientSearch.length === 0 && (
                          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border">
                            Recent Patients
                          </div>
                        )}
                        {!patientResults?.patients?.length ? (
                          <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                            {patientSearch.length >= 1 ? "No patients found" : "No patients yet"}
                          </div>
                        ) : (
                          patientResults.patients.map((p) => (
                            <button
                              key={p.id}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { setSelectedPatient(p); setPatientSearch(""); setSearchOpen(false); }}
                            >
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                                {p.firstName[0]}{p.lastName[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium">{p.firstName} {p.lastName}</div>
                                <div className="text-xs text-muted-foreground">{p.patientId} · {p.phone}</div>
                              </div>
                              <span className="text-xs text-muted-foreground capitalize">{p.gender}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Add New Patient — Collapsible ── */}
            {!selectedPatient && (
              <div className="bg-card border border-card-border rounded-xl overflow-hidden">
                <button
                  className="w-full px-4 py-2.5 border-b border-card-border bg-muted/20 flex items-center gap-2 text-sm font-semibold hover:bg-muted/30 transition-colors"
                  onClick={() => setShowNewPatientForm(v => !v)}
                >
                  <UserPlus size={14} className="text-primary" />
                  <span>Register New Patient</span>
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    {showNewPatientForm ? "▲ collapse" : "▼ expand"}
                  </span>
                </button>
                {showNewPatientForm && (
                  <div className="p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">First Name *</Label>
                        <Input
                          value={newPatient.firstName}
                          onChange={(e) => setNewPatient({ ...newPatient, firstName: e.target.value })}
                          placeholder="First name"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Last Name *</Label>
                        <Input
                          value={newPatient.lastName}
                          onChange={(e) => setNewPatient({ ...newPatient, lastName: e.target.value })}
                          placeholder="Last name"
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1 col-span-1">
                        <Label className="text-xs">Phone *</Label>
                        <Input
                          value={newPatient.phone}
                          onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                          placeholder="10-digit"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Age *</Label>
                        <Input
                          type="number"
                          min={0}
                          max={120}
                          value={newPatient.age}
                          onChange={(e) => setNewPatient({ ...newPatient, age: e.target.value })}
                          placeholder="Years"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Gender *</Label>
                        <Select value={newPatient.gender} onValueChange={(v) => setNewPatient({ ...newPatient, gender: v })}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {GENDERS.map((g) => <SelectItem key={g} value={g} className="capitalize">{g}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Blood Group</Label>
                        <Select value={newPatient.bloodGroup || "none"} onValueChange={(v) => setNewPatient({ ...newPatient, bloodGroup: v === "none" ? "" : v })}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">—</SelectItem>
                            {BLOOD_GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Address</Label>
                        <Input
                          value={newPatient.address}
                          onChange={(e) => setNewPatient({ ...newPatient, address: e.target.value })}
                          placeholder="Address (optional)"
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!newPatient.firstName || !newPatient.lastName || !newPatient.phone || !newPatient.age || createPatientMut.isPending}
                      onClick={() => createPatientMut.mutate(newPatient)}
                    >
                      {createPatientMut.isPending ? "Registering…" : <><UserPlus size={13} className="mr-1.5" /> Register & Select</>}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ── Referral / Doctor — searchable ── */}
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-card-border bg-muted/20 flex items-center gap-2 text-sm font-semibold">
                <Stethoscope size={14} className="text-primary" /> Referral Doctor
                <span className="ml-auto text-xs font-normal text-muted-foreground">optional</span>
              </div>
              <div className="p-3" ref={doctorRef}>
                {/* Selected doctor chip */}
                {doctorId ? (
                  <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                    <span className="font-mono text-[11px] text-primary font-semibold bg-primary/10 px-1.5 py-0.5 rounded flex-shrink-0">
                      #{doctorId}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">
                        Dr. {doctors.find(d => d.id === doctorId)?.name}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1.5">
                        {doctors.find(d => d.id === doctorId)?.specialization}
                      </span>
                    </div>
                    <button
                      onClick={() => { setDoctorId(null); setDoctorSearch(""); }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="relative">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search doctor by name or specialization…"
                        value={doctorSearch}
                        onChange={(e) => { setDoctorSearch(e.target.value); setDoctorSearchOpen(true); }}
                        onFocus={() => setDoctorSearchOpen(true)}
                        onBlur={() => setTimeout(() => setDoctorSearchOpen(false), 150)}
                        className="pl-9 text-sm"
                      />
                    </div>
                    {doctorSearchOpen && (
                      <div className="mt-1 border border-card-border rounded-lg bg-popover shadow-lg max-h-48 overflow-y-auto">
                        <button
                          className="w-full text-left px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/50 border-b border-border italic"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setDoctorId(null); setDoctorSearch(""); setDoctorSearchOpen(false); }}
                        >
                          No referral
                        </button>
                        {(() => {
                          const q = doctorSearch.trim().toLowerCase();
                          const filtered = doctors.filter(d =>
                            !q ||
                            String(d.id) === q ||
                            String(d.id).includes(q) ||
                            d.name.toLowerCase().includes(q) ||
                            d.specialization.toLowerCase().includes(q)
                          );
                          return filtered.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-muted-foreground text-center">No doctors found</div>
                          ) : filtered.map(d => (
                            <button
                              key={d.id}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { setDoctorId(d.id); setDoctorSearch(""); setDoctorSearchOpen(false); }}
                            >
                              <div className="w-9 h-7 rounded bg-primary/10 flex items-center justify-center flex-shrink-0 font-mono text-[11px] text-primary font-semibold">
                                #{d.id}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium">Dr. {d.name}</div>
                                <div className="text-xs text-muted-foreground">{d.specialization}</div>
                              </div>
                            </button>
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Notes ── */}
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-card-border bg-muted/20 text-sm font-semibold">
                Clinical Notes
                <span className="ml-2 text-xs font-normal text-muted-foreground">optional</span>
              </div>
              <div className="p-3">
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Fasting sample, STAT, physician instructions…"
                  className="text-sm"
                />
              </div>
            </div>

          </div>
        </div>

        {/* ══════════════════════════════════════════════
            RIGHT COLUMN — Tests + Bill + Payment
        ══════════════════════════════════════════════ */}
        <div className="w-full lg:flex-1 flex flex-col lg:overflow-hidden">
          <div className="lg:flex-1 flex flex-col lg:overflow-hidden">

            {/* ── Test Search & Catalog ── */}
            <div className="flex-shrink-0 border-b border-card-border">
              <div className="px-4 py-2.5 bg-muted/20 border-b border-card-border flex items-center gap-2 text-sm font-semibold">
                <FlaskConical size={14} className="text-primary" /> Add Tests
              </div>
              <div className="p-3 space-y-2">
                {/* Search row */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search tests by name or code…"
                      value={testSearch}
                      onChange={(e) => setTestSearch(e.target.value)}
                      className="pl-9 h-8 text-sm"
                    />
                  </div>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c} className="capitalize">{c === "all" ? "All Categories" : c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Test list */}
                <div className="max-h-36 overflow-y-auto border border-card-border rounded-lg divide-y divide-card-border">
                  {filteredTests.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-muted-foreground text-center">No tests found</div>
                  ) : (
                    filteredTests.slice(0, 50).map((t) => {
                      const added   = !!selectedTests.find((s) => s.testId === t.id);
                      const pinned  = pinnedTestIds.has(t.id);
                      return (
                        <div key={t.id} className={`flex items-center ${added ? "bg-primary/5" : ""}`}>
                          {/* Pin star */}
                          <button
                            onClick={(e) => togglePin(t.id, e)}
                            className={`pl-2 pr-1 py-2 flex-shrink-0 transition-colors ${pinned ? "text-amber-400 hover:text-amber-500" : "text-muted-foreground/30 hover:text-amber-400"}`}
                          >
                            <Star size={11} fill={pinned ? "currentColor" : "none"} />
                          </button>
                          {/* Add row */}
                          <button
                            onClick={() => addTest(t)}
                            disabled={added}
                            className={`flex-1 flex items-center gap-2 pr-3 py-2 text-left text-sm transition-colors
                              ${added ? "text-muted-foreground cursor-default" : "hover:bg-muted/50"}`}
                          >
                            <FlaskConical size={11} className={added ? "text-primary" : "text-muted-foreground"} />
                            <span className="text-[10px] font-mono font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded flex-shrink-0">#{t.id}</span>
                            <span className="flex-1 font-medium truncate">{t.name}</span>
                            <span className="text-xs text-muted-foreground font-mono flex-shrink-0">{t.code}</span>
                            <span className={`text-xs font-semibold flex-shrink-0 ${added ? "text-primary" : ""}`}>{inr(t.price)}</span>
                            {added
                              ? <CheckCircle2 size={12} className="text-primary flex-shrink-0" />
                              : <Plus size={12} className="text-muted-foreground flex-shrink-0" />}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Packages toggle */}
                {packages.length > 0 && (
                  <button
                    className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                    onClick={() => setShowPackages(!showPackages)}
                  >
                    <Package size={11} />
                    <span>Quick-add from Packages</span>
                    {showPackages ? <ChevronDown size={11} className="ml-auto" /> : <ChevronRight size={11} className="ml-auto" />}
                  </button>
                )}
                {showPackages && (
                  <div className="max-h-28 overflow-y-auto border border-card-border rounded-lg divide-y divide-card-border">
                    {packages.map((pkg) => {
                      const effective = pkg.price - (pkg.price * pkg.discountPct) / 100;
                      return (
                        <button
                          key={pkg.id}
                          onClick={() => addPackage(pkg)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors"
                        >
                          <Package size={11} className="text-muted-foreground flex-shrink-0" />
                          <span className="flex-1 font-medium">{pkg.name}</span>
                          <span className="text-xs text-muted-foreground">{pkg.tests.length} tests</span>
                          {pkg.discountPct > 0 && (
                            <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">{pkg.discountPct}% off</span>
                          )}
                          <span className="text-xs font-semibold">{inr(effective)}</span>
                          <Plus size={12} className="text-muted-foreground flex-shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── Selected Tests ── */}
            <div className="lg:flex-1 lg:overflow-y-auto border-b border-card-border">
              <div className="px-4 py-2 bg-muted/10 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Selected Tests ({selectedTests.length})
                </span>
                {selectedTests.length > 0 && (
                  <button className="text-xs text-destructive hover:text-destructive/80" onClick={() => setSelectedTests([])}>
                    Clear all
                  </button>
                )}
              </div>
              {selectedTests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <FlaskConical size={24} className="mb-2 opacity-30" />
                  <p className="text-xs">No tests added yet</p>
                </div>
              ) : (
                <div className="divide-y divide-card-border">
                  {selectedTests.map((t) => (
                    <div key={t.testId} className="flex items-center gap-2 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{t.name}</div>
                        <div className="text-xs text-muted-foreground capitalize">{t.category}
                          {t.source === "package" && <span className="ml-1 text-orange-500">· pkg</span>}
                        </div>
                      </div>
                      <span className="text-sm font-semibold flex-shrink-0">{inr(t.price)}</span>
                      <button onClick={() => removeTest(t.testId)} className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Bill Summary ── */}
            <div className="flex-shrink-0 border-b border-card-border bg-card">
              <div className="px-4 py-2.5 border-b border-card-border bg-muted/20 flex items-center justify-between">
                <span className="text-sm font-semibold flex items-center gap-2">
                  <Receipt size={14} className="text-primary" /> Bill Summary
                </span>
                {selectedTests.length > 0 && (
                  <button
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={fetchSuggestion}
                    disabled={suggLoading}
                  >
                    <Zap size={11} className={suggLoading ? "animate-pulse text-yellow-500" : ""} />
                    {suggLoading ? "Checking…" : "Auto-discount"}
                  </button>
                )}
              </div>

              <div className="p-3 space-y-2">
                {/* Discount suggestion */}
                {suggestion && suggestion.discount > 0 && (
                  <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-2 text-xs">
                    <Zap size={11} className="text-green-600 flex-shrink-0" />
                    <span className="text-green-700 flex-1">
                      Discount rule: <strong>{suggestion.rule?.name}</strong> — {inr(suggestion.discount)} applicable
                    </span>
                    <button
                      className="text-green-700 font-semibold hover:underline"
                      onClick={() => { setDiscountType("amount"); setDiscountValue(suggestion.discount); setSuggestion(null); }}
                    >
                      Apply
                    </button>
                    <button onClick={() => setSuggestion(null)} className="text-muted-foreground hover:text-foreground">
                      <X size={10} />
                    </button>
                  </div>
                )}

                {/* Subtotal row */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{inr(subtotal)}</span>
                </div>

                {/* Discount row */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground w-16">Discount</span>
                  <div className="flex items-center border border-card-border rounded-lg overflow-hidden flex-shrink-0">
                    <button
                      onClick={() => setDiscountType("amount")}
                      className={`px-2 py-1 text-xs flex items-center gap-0.5 transition-colors ${discountType === "amount" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    >
                      <IndianRupee size={10} /> ₹
                    </button>
                    <button
                      onClick={() => setDiscountType("pct")}
                      className={`px-2 py-1 text-xs flex items-center gap-0.5 transition-colors ${discountType === "pct" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    >
                      <Percent size={10} /> %
                    </button>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={discountType === "pct" ? 100 : subtotal}
                    step="0.01"
                    value={discountValue || ""}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    placeholder="0"
                    className="h-7 text-sm flex-1"
                  />
                  {discountAmt > 0 && (
                    <span className="text-xs text-orange-600 font-medium flex-shrink-0">−{inr(discountAmt)}</span>
                  )}
                </div>

                {/* Discount reason (only when discount applied) */}
                {discountAmt > 0 && (
                  <div className="space-y-1.5 pl-[68px]">
                    <select
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      className="w-full h-7 text-xs border border-card-border rounded-md px-2 bg-background"
                    >
                      <option value="">— Select reason —</option>
                      {discountReasons.filter(r => r.isActive).map(r => (
                        <option key={r.id} value={r.label}>{r.label}</option>
                      ))}
                    </select>
                    <Input
                      placeholder="Custom note (optional)…"
                      value={discountNote}
                      onChange={(e) => setDiscountNote(e.target.value)}
                      className="h-7 text-xs"
                      maxLength={200}
                    />
                  </div>
                )}

                {/* Total */}
                <div className="flex items-center justify-between pt-1 border-t border-card-border">
                  <span className="font-semibold text-sm">Total</span>
                  <span className="text-lg font-bold text-primary">{inr(total)}</span>
                </div>
              </div>
            </div>

            {/* ── Payment ── */}
            <div className="flex-shrink-0 bg-card p-3 space-y-2 border-b border-card-border">
              {/* Toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPayNow(!payNow)}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors
                    ${payNow ? "bg-primary" : "bg-muted"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${payNow ? "translate-x-4" : "translate-x-0"}`} />
                </button>
                <span className="text-sm font-medium">Collect Payment Now</span>
              </div>

              {payNow && (
                <div className="space-y-2">
                  {/* Header row */}
                  <div className="grid grid-cols-[1fr_1fr_20px] gap-1.5 px-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mode</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Amount (₹)</span>
                    <span />
                  </div>

                  {/* Split rows */}
                  {paymentSplits.map((split, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_20px] gap-1.5 items-center">
                      <Select
                        value={split.mode}
                        onValueChange={(v) => setPaymentSplits((prev) => prev.map((s, i) => i === idx ? { ...s, mode: v } : s))}
                      >
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PAYMENT_MODES.map((m) => (
                            <SelectItem key={m} value={m} className="capitalize">{m.toUpperCase()}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder={idx === 0 ? total.toFixed(2) : "0.00"}
                        value={split.amount}
                        onChange={(e) => setPaymentSplits((prev) => prev.map((s, i) => i === idx ? { ...s, amount: e.target.value } : s))}
                        className="h-8 text-sm"
                      />
                      {paymentSplits.length > 1 ? (
                        <button
                          onClick={() => setPaymentSplits((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X size={13} />
                        </button>
                      ) : <span />}
                    </div>
                  ))}

                  {/* Add split link */}
                  {paymentSplits.length < PAYMENT_MODES.length && (
                    <button
                      onClick={() => setPaymentSplits((prev) => [...prev, { mode: "upi", amount: "" }])}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <Plus size={11} /> Add another payment method
                    </button>
                  )}

                  {/* Balance / paid status */}
                  <div className="pt-1 border-t border-card-border flex justify-between items-center text-xs">
                    {balance > 0 ? (
                      <>
                        <span className="text-muted-foreground">Balance due</span>
                        <span className="text-orange-600 font-semibold">{inr(balance)}</span>
                      </>
                    ) : paidTotal > 0 && total > 0 ? (
                      <span className="text-green-600 font-medium flex items-center gap-1 w-full justify-center">
                        <CheckCircle2 size={11} /> Fully paid — {inr(paidTotal)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Enter amount(s) above</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Generate Bill Button (always visible) ── */}
            <div className="flex-shrink-0 p-3 bg-card space-y-2">
              {!canGenerate && !lastBill && (
                <p className="text-xs text-muted-foreground text-center">
                  {!selectedPatient ? "← Select or register a patient" : "← Add at least one test"}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="h-11 text-sm font-semibold"
                  disabled={!canGenerate || generateMut.isPending}
                  onClick={() => { printAfterSaveRef.current = false; generateMut.mutate(); }}
                >
                  {generateMut.isPending && !printAfterSaveRef.current ? (
                    <><RefreshCcw size={15} className="mr-1.5 animate-spin" /> Saving…</>
                  ) : (
                    <><Receipt size={15} className="mr-1.5" /> Generate Bill</>
                  )}
                </Button>
                <Button
                  variant="secondary"
                  className="h-11 text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white border-0"
                  disabled={!canGenerate || generateMut.isPending}
                  onClick={() => { printAfterSaveRef.current = true; generateMut.mutate(); }}
                >
                  {generateMut.isPending && printAfterSaveRef.current ? (
                    <><RefreshCcw size={15} className="mr-1.5 animate-spin" /> Saving…</>
                  ) : (
                    <><Printer size={15} className="mr-1.5" /> Save & Print</>
                  )}
                </Button>
              </div>
            </div>

          </div>
        </div>
      </div>
      {/* ── Floating Bill-Generated Notification (auto-dismiss 5s) ── */}
      {lastBill && showBillToast && (
        <div className="fixed top-24 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[22rem] max-w-[22rem] bg-white dark:bg-card border-2 border-green-300 dark:border-green-700 rounded-lg shadow-2xl overflow-hidden animate-in slide-in-from-right-4 fade-in duration-300 print:hidden">
          <div className="flex items-start gap-2 px-3 py-2 bg-green-50 dark:bg-green-950/30 border-b border-green-200 dark:border-green-800">
            <CheckCircle2 size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-green-700 dark:text-green-400">Bill Generated</div>
              <div className="text-xs text-green-600 dark:text-green-500 font-mono truncate">{lastBill.billNumber}</div>
            </div>
            <button
              type="button"
              onClick={() => setShowBillToast(false)}
              className="text-muted-foreground hover:text-foreground text-xs leading-none p-1"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
          <div className="p-2 space-y-1.5">
            {lastBill.tokenNo != null && (
              <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
                <span className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400 font-semibold">Token</span>
                <span className="text-base font-bold text-amber-700 dark:text-amber-400 tabular-nums">#{String(lastBill.tokenNo).padStart(3, "0")}</span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-1.5">
              <Button size="sm" className="h-8 text-[11px] font-semibold" onClick={() => void printBill(lastBill, clinic)}>
                <Printer size={11} className="mr-1" /> Bill
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => void printBarcode(lastBill)}>
                <Printer size={11} className="mr-1" /> Barcode
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => void printToken(lastBill, clinic)} disabled={lastBill.tokenNo == null}>
                <Printer size={11} className="mr-1" /> Token
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <a href={`/billing/${lastBill.id}`} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="ghost" className="w-full h-8 text-[11px]">
                  <ExternalLink size={11} className="mr-1" /> View
                </Button>
              </a>
              <Button size="sm" variant="ghost" className="h-8 text-[11px]" onClick={resetAll}>
                <RefreshCcw size={11} className="mr-1" /> New
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hidden Print Receipt (shown only when printing) ── */}
      {lastBill && (
        <div className="billing-desk-receipt">
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              .billing-desk-receipt, .billing-desk-receipt * { visibility: visible !important; }
              .billing-desk-receipt {
                display: block !important;
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                padding: 20px !important;
              }
              @page { margin: 10mm; }
            }
            .billing-desk-receipt {
              display: none;
              font-family: Arial, sans-serif;
              font-size: 12px;
              color: #000;
              max-width: 700px;
              margin: 0 auto;
              padding: 24px;
            }
            .bdr-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 14px; }
            .bdr-header h1 { font-size: 20px; font-weight: 700; margin: 0 0 2px; }
            .bdr-header p  { margin: 1px 0; font-size: 11px; color: #444; }
            .bdr-title { text-align: center; font-size: 13px; font-weight: 700; letter-spacing: 1px; margin: 10px 0; text-transform: uppercase; border: 1px solid #000; padding: 4px; }
            .bdr-meta { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 11px; }
            .bdr-meta table td { padding: 1px 4px 1px 0; }
            .bdr-meta table td:first-child { font-weight: 600; color: #444; white-space: nowrap; }
            .bdr-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px; }
            .bdr-table th { background: #f5f5f5; text-align: left; padding: 5px 6px; border: 1px solid #ccc; font-weight: 600; }
            .bdr-table td { padding: 4px 6px; border: 1px solid #ccc; vertical-align: top; }
            .bdr-table .text-right { text-align: right; }
            .bdr-summary { margin-left: auto; width: 220px; font-size: 11px; margin-bottom: 12px; }
            .bdr-summary table { width: 100%; border-collapse: collapse; }
            .bdr-summary td { padding: 3px 6px; }
            .bdr-summary tr:last-child td { font-weight: 700; border-top: 1px solid #000; padding-top: 5px; }
            .bdr-payments { font-size: 11px; margin-bottom: 14px; }
            .bdr-payments table { width: 100%; border-collapse: collapse; }
            .bdr-payments th { text-align: left; border-bottom: 1px solid #ccc; padding: 3px 6px; font-weight: 600; }
            .bdr-payments td { padding: 3px 6px; border-bottom: 1px solid #eee; }
            .bdr-footer { text-align: center; font-size: 10px; color: #666; border-top: 1px solid #ccc; padding-top: 8px; margin-top: 8px; }
          `}</style>

          <div className="bdr-header" style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center", textAlign: "center" }}>
            {clinic?.logoDataUrl && (
              <img src={clinic.logoDataUrl} alt="Logo" style={{ maxHeight: 60, maxWidth: 100, objectFit: "contain" }} />
            )}
            <div>
              <h1 style={{ margin: 0 }}>{clinic?.name || "Diagnostic Centre"}</h1>
              {clinic?.tagline && <p style={{ margin: "2px 0", fontStyle: "italic", color: "#555" }}>{clinic.tagline}</p>}
              {clinic?.address && <p style={{ margin: "2px 0" }}>{clinic.address}</p>}
              <p style={{ margin: "2px 0" }}>
                {clinic?.phone && <>Ph: {clinic.phone}</>}
                {clinic?.phone && clinic?.email && " | "}
                {clinic?.email && <>Email: {clinic.email}</>}
              </p>
              {(clinic?.gstin || clinic?.website) && (
                <p style={{ margin: "2px 0", fontSize: 10 }}>
                  {clinic?.gstin && <>GSTIN: {clinic.gstin}</>}
                  {clinic?.gstin && clinic?.website && " | "}
                  {clinic?.website && <>{clinic.website}</>}
                </p>
              )}
            </div>
          </div>
          <div className="bdr-title">Tax Invoice</div>

          <div className="bdr-meta">
            <table>
              <tbody>
                <tr><td>Patient</td><td>: {lastBill.patient.firstName} {lastBill.patient.lastName}</td></tr>
                <tr><td>Patient ID</td><td>: {lastBill.patient.patientId}</td></tr>
                <tr><td>Phone</td><td>: {lastBill.patient.phone}</td></tr>
                {lastBill.patient.gender && <tr><td>Gender</td><td>: {lastBill.patient.gender}</td></tr>}
                {lastBill.doctorName && <tr><td>Ref. Doctor</td><td>: Dr. {lastBill.doctorName}</td></tr>}
              </tbody>
            </table>
            <table>
              <tbody>
                <tr><td>Bill No.</td><td>: {lastBill.billNumber}</td></tr>
                <tr><td>Date</td><td>: {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td></tr>
                <tr><td>Time</td><td>: {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</td></tr>
              </tbody>
            </table>
          </div>

          <table className="bdr-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Test Name</th>
                <th>Category</th>
                <th className="text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {lastBill.tests.map((t, i) => (
                <tr key={t.testId}>
                  <td>{i + 1}</td>
                  <td>{t.name}</td>
                  <td>{t.category}</td>
                  <td className="text-right">{t.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {(() => {
            const paidOnReceipt = lastBill.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
            const balanceOnReceipt = Math.max(0, lastBill.total - paidOnReceipt);
            return (
              <div className="bdr-summary">
                <table>
                  <tbody>
                    <tr><td>Subtotal</td><td style={{ textAlign: "right" }}>₹{lastBill.subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td></tr>
                    {lastBill.discount > 0 && <tr><td>Discount</td><td style={{ textAlign: "right", color: "green" }}>−₹{lastBill.discount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td></tr>}
                    <tr><td><strong>Total</strong></td><td style={{ textAlign: "right" }}><strong>₹{lastBill.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></td></tr>
                    <tr><td>Paid</td><td style={{ textAlign: "right", color: "green" }}>₹{paidOnReceipt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td></tr>
                    <tr>
                      <td><strong>Balance Due</strong></td>
                      <td style={{ textAlign: "right", color: balanceOnReceipt > 0 ? "#c62828" : "green", fontWeight: 700 }}>
                        ₹{balanceOnReceipt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        {balanceOnReceipt === 0 && " (PAID)"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()}

          {lastBill.payments.length > 0 && (
            <div className="bdr-payments">
              <strong>Payment Details</strong>
              <table>
                <thead>
                  <tr><th>Mode</th><th style={{ textAlign: "right" }}>Amount (₹)</th></tr>
                </thead>
                <tbody>
                  {lastBill.payments.map((p, i) => (
                    <tr key={i}>
                      <td style={{ textTransform: "capitalize" }}>{p.mode.replace(/_/g, " ")}</td>
                      <td style={{ textAlign: "right" }}>{Number(p.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="bdr-footer">
            <p>{clinic?.footerNote || "Thank you for choosing our diagnostic services."}</p>
            <p>This is a computer-generated invoice. No signature required.</p>
          </div>
        </div>
      )}
    </div>
  );
}

type BillSearchResult = {
  id: number;
  billNumber: string;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: string;
  patientName: string | null;
  patientId: string | null;
  phone: string | null;
};

function BillSearchBox() {
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [dueOnly, setDueOnly] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  const { data: results = [], isFetching } = useQuery<BillSearchResult[]>({
    queryKey: ["bill-search", q, dueOnly],
    queryFn: () => api.get(`/api/bills/search?q=${encodeURIComponent(q)}&dueOnly=${dueOnly ? 1 : 0}`),
    enabled: q.trim().length >= 2,
    staleTime: 5_000,
  });

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search bill # / patient name…"
          className="h-8 pl-7 pr-3 w-72 text-sm"
        />
      </div>
      {open && q.trim().length >= 2 && (
        <div className="absolute right-0 top-full mt-1 w-[420px] bg-card border border-card-border rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-card-border flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={dueOnly}
                onChange={(e) => setDueOnly(e.target.checked)}
                className="h-3 w-3"
              />
              <span className="text-muted-foreground">Dues only</span>
            </label>
            <span className="text-[10px] text-muted-foreground">
              {isFetching ? "Searching…" : `${results.length} match${results.length === 1 ? "" : "es"}`}
            </span>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-card-border">
            {results.length === 0 && !isFetching ? (
              <div className="px-4 py-6 text-xs text-muted-foreground text-center">No bills found</div>
            ) : (
              results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { setOpen(false); setQ(""); navigate(`/billing/${r.id}`); }}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors flex items-center gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-primary">{r.billNumber}</span>
                      {r.balanceAmount > 0 ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 font-medium">DUE</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 font-medium">PAID</span>
                      )}
                    </div>
                    <div className="text-xs text-foreground mt-0.5 truncate">
                      {r.patientName ?? "—"}
                      <span className="text-muted-foreground"> · {r.patientId ?? ""} {r.phone ? `· ${r.phone}` : ""}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs text-muted-foreground">Total {inr(r.totalAmount)}</div>
                    <div className={`text-sm font-semibold ${r.balanceAmount > 0 ? "text-orange-600" : "text-green-600"}`}>
                      Bal {inr(r.balanceAmount)}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
