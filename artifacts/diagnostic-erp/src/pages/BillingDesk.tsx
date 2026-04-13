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
  const [payNow, setPayNow]               = useState(true);
  const [paymentMode, setPaymentMode]     = useState("cash");
  const [partialAmount, setPartialAmount] = useState<number | "">("");
  const [suggLoading, setSuggLoading]     = useState(false);
  const [suggestion, setSuggestion]       = useState<{ discount: number; rule: { name: string } | null } | null>(null);

  // ── Preview bill number ─────────────────────────────
  const { data: previewBillNo } = useQuery<{ next: string }>({
    queryKey: ["bill-preview-no"],
    queryFn: () => api.get("/api/bills/preview-number"),
    retry: false,
  });

  // ── Data queries ────────────────────────────────────
  const debouncedSearch = useDebounce(patientSearch, 150);

  // Recent patients — loaded once on mount, shown when search field is focused but empty
  const { data: recentPatients } = useQuery<{ patients: Patient[] }>({
    queryKey: ["patients-recent"],
    queryFn: () => api.get<{ patients: Patient[] }>("/api/patients?limit=8&page=1"),
    staleTime: 60_000,
  });

  // Live search — fires from the very first character
  const { data: searchResults } = useQuery<{ patients: Patient[] }>({
    queryKey: ["patients-search", debouncedSearch],
    queryFn: () => api.get<{ patients: Patient[] }>(`/api/patients?search=${encodeURIComponent(debouncedSearch)}&limit=10`),
    enabled: debouncedSearch.length >= 1,
    staleTime: 5_000,
  });

  // Which list to show in the dropdown
  const patientResults = debouncedSearch.length >= 1 ? searchResults : recentPatients;

  const { data: allTests = [] } = useQuery<Test[]>({
    queryKey: ["tests-all-popular"],
    queryFn: () => api.get<{ tests: Test[] }>("/api/tests?limit=500&sort=popular").then((d) => d.tests ?? []),
  });

  const { data: doctors = [] } = useQuery<Doctor[]>({
    queryKey: ["doctors-list"],
    queryFn: () => api.get<{ doctors: Doctor[] }>("/api/doctors").then((d) => d.doctors ?? []),
  });

  const { data: packages = [] } = useQuery<Pkg[]>({
    queryKey: ["packages-active"],
    queryFn: () => api.get<Pkg[]>("/api/packages"),
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

  const generateMut = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) throw new Error("No patient selected");
      if (selectedTests.length === 0) throw new Error("No tests selected");

      // 1. Create order
      const order = await api.post<{ id: number; orderNumber: string }>("/api/orders", {
        patientId: selectedPatient.id,
        doctorId: doctorId ?? undefined,
        notes: notes || undefined,
        tests: selectedTests.map((t) => ({ testId: t.testId, price: t.price })),
      });

      // 2. Create bill
      const bill = await api.post<{ id: number; billNumber: string }>("/api/bills", {
        orderId: order.id,
        discount: discountAmt,
      });

      // 3. Record payment
      if (payNow) {
        const paidAmt = partialAmount !== "" ? Number(partialAmount) : total;
        if (paidAmt > 0) {
          await api.post("/api/payments", {
            billId: bill.id,
            amount: paidAmt,
            method: paymentMode,
            reference: "",
          });
        }
      }

      return bill;
    },
    onSuccess: (bill) => {
      toast({ title: `Bill ${bill.billNumber} generated!` });
      navigate(`/billing/${bill.id}`);
    },
    onError: (err: Error) => toast({ title: err.message || "Failed to generate bill", variant: "destructive" }),
  });

  // ── Derived values ──────────────────────────────────
  const categories  = ["all", ...Array.from(new Set(allTests.map((t) => t.category))).sort()];

  const selectedTestIds = new Set(selectedTests.map((s) => s.testId));

  const filteredTests = allTests
    .filter((t) => {
      if (selectedTestIds.has(t.id)) return false;
      const matchSearch = !testSearch || t.name.toLowerCase().includes(testSearch.toLowerCase()) || (t.code ?? "").toLowerCase().includes(testSearch.toLowerCase());
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
  const payAmt      = partialAmount !== "" ? Number(partialAmount) : total;
  const balance     = Math.max(0, total - (payNow ? payAmt : 0));

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
    setPayNow(true);
    setPartialAmount("");
    setSuggestion(null);
  }

  const canGenerate = !!selectedPatient && selectedTests.length > 0;

  // ──────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── TOP BAR ── */}
      <div className="flex-shrink-0 bg-card border-b border-card-border px-6 py-3 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Receipt size={18} className="text-primary" />
          <span className="font-bold text-base">Billing Desk</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays size={13} />
          <span>{today()}</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <Hash size={13} className="text-muted-foreground" />
          <span className="font-mono text-primary font-semibold">
            {previewBillNo?.next ?? "BILL-…"}
          </span>
          <span className="text-xs text-muted-foreground">(next bill no.)</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={resetAll} className="text-muted-foreground hover:text-foreground">
            <RefreshCcw size={13} className="mr-1" /> New Bill
          </Button>
        </div>
      </div>

      {/* ── MAIN LAYOUT ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ══════════════════════════════════════════════
            LEFT COLUMN — Patient + Doctor + Notes
        ══════════════════════════════════════════════ */}
        <div className="w-[52%] border-r border-card-border flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

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

            {/* ── Add New Patient — Always Visible ── */}
            {!selectedPatient && (
              <div className="bg-card border border-card-border rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-card-border bg-muted/20 flex items-center gap-2 text-sm font-semibold">
                  <UserPlus size={14} className="text-primary" /> Add New Patient
                </div>
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
                    <Stethoscope size={13} className="text-primary flex-shrink-0" />
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
                          const filtered = doctors.filter(d =>
                            !doctorSearch ||
                            d.name.toLowerCase().includes(doctorSearch.toLowerCase()) ||
                            d.specialization.toLowerCase().includes(doctorSearch.toLowerCase())
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
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <Stethoscope size={12} className="text-primary" />
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
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">

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
            <div className="flex-1 overflow-y-auto border-b border-card-border">
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

                {/* Total */}
                <div className="flex items-center justify-between pt-1 border-t border-card-border">
                  <span className="font-semibold text-sm">Total</span>
                  <span className="text-lg font-bold text-primary">{inr(total)}</span>
                </div>
              </div>
            </div>

            {/* ── Payment ── */}
            <div className="flex-shrink-0 bg-card p-3 space-y-2 border-b border-card-border">
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
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Payment Mode</Label>
                      <Select value={paymentMode} onValueChange={setPaymentMode}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PAYMENT_MODES.map((m) => (
                            <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Amount Collected (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder={String(total.toFixed(2))}
                        value={partialAmount}
                        onChange={(e) => setPartialAmount(e.target.value === "" ? "" : Number(e.target.value))}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  {balance > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Balance due</span>
                      <span className="text-orange-600 font-semibold">{inr(balance)}</span>
                    </div>
                  )}
                  {balance === 0 && payNow && total > 0 && (
                    <div className="text-xs text-green-600 font-medium flex items-center gap-1">
                      <CheckCircle2 size={11} /> Fully paid
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Generate Bill Button ── */}
            <div className="flex-shrink-0 p-3 bg-card">
              {!canGenerate && (
                <p className="text-xs text-muted-foreground text-center mb-2">
                  {!selectedPatient ? "← Select or register a patient" : "← Add at least one test"}
                </p>
              )}
              <Button
                className="w-full h-11 text-base font-semibold"
                disabled={!canGenerate || generateMut.isPending}
                onClick={() => generateMut.mutate()}
              >
                {generateMut.isPending ? (
                  <><RefreshCcw size={16} className="mr-2 animate-spin" /> Generating…</>
                ) : (
                  <><Receipt size={16} className="mr-2" /> Generate Bill</>
                )}
              </Button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
