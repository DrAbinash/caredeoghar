import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Package,
  Plus,
  Edit2,
  Trash2,
  FlaskConical,
  Search,
  IndianRupee,
  Percent,
  X,
  CheckSquare,
  Wand2,
  Calculator,
} from "lucide-react";

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

type Test = { id: number; name: string; code: string; price: string | number; category: string };
type PackageItem = {
  id: number;
  packageCode: string;
  name: string;
  description: string | null;
  price: number;
  discountPct: number;
  isActive: boolean;
  tests: Test[];
};

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  discountPct: "0",
  isActive: true,
  testIds: [] as number[],
  testSearch: "",
};

export default function Packages() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editPkg, setEditPkg] = useState<PackageItem | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  // When true, the MRP field tracks the sum of selected tests' prices. Flips
  // to false the moment the user edits MRP by hand, or when the user opens
  // an existing package for edit (we don't want to silently rewrite their
  // saved price). The user can re-enable it via the "Auto" button.
  const [mrpAuto, setMrpAuto] = useState(true);

  const { data: packages = [], isLoading } = useQuery<PackageItem[]>({
    queryKey: ["packages"],
    queryFn: () => api.get<PackageItem[]>("/api/packages"),
  });

  const { data: allTests = [] } = useQuery<Test[]>({
    queryKey: ["tests-list"],
    queryFn: () => api.get<{ tests: Test[] }>("/api/tests?limit=1000").then((d) => d.tests ?? []),
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/packages", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["packages"] });
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      toast({ title: "Package created" });
    },
    onError: () => toast({ title: "Failed to create package", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: Record<string, unknown>) =>
      api.patch(`/api/packages/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["packages"] });
      setEditPkg(null);
      toast({ title: "Package updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/packages/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["packages"] });
      toast({ title: "Package deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setMrpAuto(true);
    setShowForm(true);
  }

  function openEdit(pkg: PackageItem) {
    setEditPkg(pkg);
    setForm({
      name: pkg.name,
      description: pkg.description || "",
      price: String(pkg.price),
      discountPct: String(pkg.discountPct),
      isActive: pkg.isActive,
      testIds: pkg.tests.map((t) => t.id),
      testSearch: "",
    });
    // Don't override the saved MRP on edit — but if it happens to match the
    // current sum of test prices, treat it as still auto-tracking.
    const sum = pkg.tests.reduce((acc, t) => acc + Number(t.price ?? 0), 0);
    setMrpAuto(Math.abs(sum - Number(pkg.price)) < 0.005);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      name: form.name,
      description: form.description || null,
      price: Number(form.price),
      discountPct: Number(form.discountPct),
      isActive: form.isActive,
      testIds: form.testIds,
    };
    if (editPkg) {
      updateMut.mutate({ id: editPkg.id, ...body });
    } else {
      createMut.mutate(body);
    }
  }

  function toggleTest(testId: number) {
    setForm((prev) => ({
      ...prev,
      testIds: prev.testIds.includes(testId)
        ? prev.testIds.filter((id) => id !== testId)
        : [...prev.testIds, testId],
    }));
  }

  // Build a quick lookup so we don't scan the full tests list on every render.
  const testById = useMemo(() => {
    const m = new Map<number, Test>();
    for (const t of allTests) m.set(t.id, t);
    return m;
  }, [allTests]);

  const selectedTests = useMemo(
    () =>
      form.testIds
        .map((id) => testById.get(id))
        .filter((t): t is Test => Boolean(t)),
    [form.testIds, testById]
  );

  const sumOfTestPrices = useMemo(
    () => selectedTests.reduce((acc, t) => acc + Number(t.price ?? 0), 0),
    [selectedTests]
  );

  // When MRP is in auto mode, mirror the sum of selected tests into the price
  // field (rounded to 2 decimals to play nicely with the numeric input).
  // Skip the very first render when allTests hasn't loaded yet — otherwise
  // we'd flicker the field to "0".
  const prevSumRef = useRef<number | null>(null);
  useEffect(() => {
    if (!mrpAuto) {
      prevSumRef.current = sumOfTestPrices;
      return;
    }
    if (prevSumRef.current === sumOfTestPrices) return;
    prevSumRef.current = sumOfTestPrices;
    const formatted = sumOfTestPrices > 0 ? sumOfTestPrices.toFixed(2) : "";
    setForm((prev) => (prev.price === formatted ? prev : { ...prev, price: formatted }));
  }, [sumOfTestPrices, mrpAuto]);

  const filtered = packages.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.packageCode.toLowerCase().includes(search.toLowerCase())
  );

  const filteredTests = allTests.filter(
    (t) =>
      !form.testSearch ||
      t.name.toLowerCase().includes(form.testSearch.toLowerCase()) ||
      t.code.toLowerCase().includes(form.testSearch.toLowerCase())
  );

  const effectivePrice = (pkg: PackageItem) =>
    pkg.price - (pkg.price * pkg.discountPct) / 100;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Test Packages"
        subtitle="Bundle multiple tests into discounted packages"
        actions={
          <Button onClick={openCreate}>
            <Plus size={15} className="mr-1.5" /> New Package
          </Button>
        }
      />

      {/* Search */}
      <div className="relative w-72">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search packages…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-8 text-sm"
        />
      </div>

      {/* Packages Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Package size={40} className="mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm">No packages yet</p>
          <Button className="mt-4" size="sm" onClick={openCreate}>
            <Plus size={13} className="mr-1" /> Create First Package
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((pkg) => {
            const effective = effectivePrice(pkg);
            return (
              <div
                key={pkg.id}
                className={`bg-card border rounded-xl p-5 flex flex-col gap-3 ${
                  pkg.isActive ? "border-card-border" : "border-card-border opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{pkg.name}</span>
                      {!pkg.isActive && (
                        <Badge variant="outline" className="text-xs">Inactive</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">{pkg.packageCode}</div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(pkg)}>
                      <Edit2 size={12} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Delete package "${pkg.name}"?`)) deleteMut.mutate(pkg.id);
                      }}
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>

                {pkg.description && (
                  <p className="text-xs text-muted-foreground">{pkg.description}</p>
                )}

                {/* Tests */}
                <div className="flex flex-wrap gap-1">
                  {pkg.tests.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">No tests assigned</span>
                  ) : (
                    pkg.tests.map((t) => (
                      <span
                        key={t.id}
                        className="inline-flex items-center gap-0.5 text-xs bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded"
                      >
                        <FlaskConical size={9} />
                        {t.name}
                      </span>
                    ))
                  )}
                </div>

                {/* Pricing */}
                <div className="flex items-end justify-between mt-auto pt-2 border-t border-card-border">
                  <div>
                    <div className="text-xs text-muted-foreground">MRP</div>
                    <div className="font-semibold text-sm">{inr(pkg.price)}</div>
                  </div>
                  {pkg.discountPct > 0 && (
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground">Discount</div>
                      <div className="text-orange-600 font-medium text-sm">{pkg.discountPct}%</div>
                    </div>
                  )}
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Effective</div>
                    <div className="font-bold text-primary text-base">{inr(effective)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog
        open={showForm || !!editPkg}
        onOpenChange={(o) => {
          if (!o) { setShowForm(false); setEditPkg(null); }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editPkg ? "Edit Package" : "Create Package"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Package Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Full Body Checkup"
                  required
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Short description of this package"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label>MRP (₹) *</Label>
                  <button
                    type="button"
                    onClick={() => setMrpAuto((v) => !v)}
                    className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                      mrpAuto
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                    title={
                      mrpAuto
                        ? "MRP auto-tracks the sum of selected test prices. Click to enter a custom MRP."
                        : "Click to auto-fill MRP from the sum of selected test prices."
                    }
                  >
                    <Wand2 size={10} />
                    {mrpAuto ? "Auto" : "Manual"}
                  </button>
                </div>
                <div className="relative">
                  <IndianRupee size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => {
                      // Any manual edit drops out of auto mode.
                      if (mrpAuto) setMrpAuto(false);
                      setForm({ ...form, price: e.target.value });
                    }}
                    className={`pl-8 ${mrpAuto ? "bg-primary/5" : ""}`}
                    placeholder="0"
                    required
                  />
                </div>
                {selectedTests.length > 0 && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Calculator size={10} />
                    Sum of {selectedTests.length} test
                    {selectedTests.length === 1 ? "" : "s"}: {inr(sumOfTestPrices)}
                    {!mrpAuto && Math.abs(sumOfTestPrices - Number(form.price || 0)) >= 0.005 && (
                      <button
                        type="button"
                        onClick={() => {
                          setMrpAuto(true);
                          setForm((p) => ({ ...p, price: sumOfTestPrices.toFixed(2) }));
                        }}
                        className="ml-1 text-primary hover:underline"
                      >
                        use this
                      </button>
                    )}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Discount %</Label>
                <div className="relative">
                  <Percent size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.discountPct}
                    onChange={(e) => setForm({ ...form, discountPct: e.target.value })}
                    className="pl-8"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm({ ...form, isActive: v })}
                  id="pkg-active"
                />
                <Label htmlFor="pkg-active">Active</Label>
              </div>
            </div>

            {/* Effective price preview + savings vs sum-of-tests */}
            {form.price && (() => {
              const mrp = Number(form.price);
              const effective = mrp - (mrp * Number(form.discountPct || 0)) / 100;
              const savings = sumOfTestPrices - effective;
              const savingsPct = sumOfTestPrices > 0 ? (savings / sumOfTestPrices) * 100 : 0;
              return (
                <div className="bg-muted/30 rounded-lg p-3 text-sm flex flex-wrap items-center gap-x-4 gap-y-1">
                  <div>
                    <span className="text-muted-foreground">Effective price: </span>
                    <span className="font-bold text-primary">{inr(effective)}</span>
                  </div>
                  {sumOfTestPrices > 0 && savings > 0.005 && (
                    <div className="text-xs text-emerald-700 dark:text-emerald-400">
                      Customer saves {inr(savings)} ({savingsPct.toFixed(0)}%) vs buying tests individually
                    </div>
                  )}
                  {sumOfTestPrices > 0 && savings < -0.005 && (
                    <div className="text-xs text-orange-600">
                      Heads up: priced {inr(-savings)} above the sum of individual tests
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Test selection */}
            <div className="space-y-2">
              <Label>Tests Included ({form.testIds.length} selected)</Label>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search tests…"
                  value={form.testSearch}
                  onChange={(e) => setForm({ ...form, testSearch: e.target.value })}
                  className="pl-9 h-8 text-xs"
                />
              </div>
              <div className="border border-card-border rounded-lg max-h-52 overflow-y-auto divide-y divide-card-border">
                {filteredTests.map((t) => {
                  const selected = form.testIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTest(t.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors ${
                        selected ? "bg-primary/5" : "hover:bg-muted/50"
                      }`}
                    >
                      <CheckSquare
                        size={14}
                        className={selected ? "text-primary" : "text-muted-foreground/30"}
                      />
                      <span className="flex-1 font-medium">{t.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">{t.code}</span>
                      <span className="text-xs text-muted-foreground">{inr(Number(t.price))}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowForm(false); setEditPkg(null); }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {createMut.isPending || updateMut.isPending ? "Saving…" : editPkg ? "Update Package" : "Create Package"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
