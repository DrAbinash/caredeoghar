import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useListTests } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import {
  Plus, AlertTriangle, ArrowDown, ArrowUp, Settings2,
  Package, Trash2, History, SlidersHorizontal,
} from "lucide-react";

type Item = {
  id: number; name: string; unit: string; category: string;
  currentStock: number; minStock: number; costPrice: number; isActive: boolean;
};
type TxnRow = {
  id: number; type: string; quantity: string; stockBefore: string;
  stockAfter: string; reason?: string; reference?: string; performedBy?: string;
  createdAt: string;
};
type ConsumptionRule = {
  id: number; testId: number; itemId: number; quantity: string;
  testName?: string; itemName?: string; itemUnit?: string;
};

const CATEGORIES = ["consumable", "reagent", "equipment", "stationery", "other"];

function fmt(n: number) { return n.toLocaleString("en-IN"); }
function isLow(item: Item) { return item.currentStock <= item.minStock; }

export default function Inventory() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [stockDialog, setStockDialog] = useState<{ item: Item; mode: "in" | "out" | "adjust" } | null>(null);
  const [historyItem, setHistoryItem] = useState<Item | null>(null);
  const [ruleOpen, setRuleOpen] = useState(false);

  const { data: items = [], isLoading } = useQuery<Item[]>({
    queryKey: ["inventory"],
    queryFn: () => api.get("/api/inventory"),
  });
  const { data: lowStock = [] } = useQuery<Item[]>({
    queryKey: ["inventory-low"],
    queryFn: () => api.get("/api/inventory/low-stock"),
  });
  const { data: rules = [] } = useQuery<ConsumptionRule[]>({
    queryKey: ["consumption-rules"],
    queryFn: () => api.get("/api/inventory/consumption-rules"),
  });
  const { data: history = [] } = useQuery<TxnRow[]>({
    queryKey: ["inventory-history", historyItem?.id],
    queryFn: () => api.get(`/api/inventory/${historyItem!.id}/history`),
    enabled: !!historyItem,
  });
  const { data: testsData } = useListTests({});

  const addItem = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/inventory", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory"] }); setAddOpen(false); resetAdd(); },
  });
  const stockIn = useMutation({
    mutationFn: (d: { id: number; body: Record<string, unknown> }) => api.post(`/api/inventory/${d.id}/stock-in`, d.body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory"] }); qc.invalidateQueries({ queryKey: ["inventory-low"] }); setStockDialog(null); resetStock(); },
  });
  const stockOut = useMutation({
    mutationFn: (d: { id: number; body: Record<string, unknown> }) => api.post(`/api/inventory/${d.id}/stock-out`, d.body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory"] }); qc.invalidateQueries({ queryKey: ["inventory-low"] }); setStockDialog(null); resetStock(); },
  });
  const adjust = useMutation({
    mutationFn: (d: { id: number; body: Record<string, unknown> }) => api.post(`/api/inventory/${d.id}/adjust`, d.body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory"] }); qc.invalidateQueries({ queryKey: ["inventory-low"] }); setStockDialog(null); resetStock(); },
  });
  const deleteRule = useMutation({
    mutationFn: (id: number) => api.delete(`/api/inventory/consumption-rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["consumption-rules"] }),
  });
  const addRule = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/inventory/consumption-rules", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["consumption-rules"] }); setRuleOpen(false); resetRule(); },
  });

  const { register: regAdd, handleSubmit: subAdd, reset: resetAdd, setValue: setAddVal } = useForm<Record<string, string>>();
  const { register: regStock, handleSubmit: subStock, reset: resetStock } = useForm<Record<string, string>>();
  const { register: regRule, handleSubmit: subRule, reset: resetRule, setValue: setRuleVal } = useForm<Record<string, string>>();

  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase())
  );

  const typeBadge = (type: string) => {
    if (type === "in") return <Badge className="bg-green-100 text-green-700 text-xs">Stock In</Badge>;
    if (type === "out") return <Badge className="bg-red-100 text-red-700 text-xs">Stock Out</Badge>;
    return <Badge className="bg-blue-100 text-blue-700 text-xs">Adjustment</Badge>;
  };

  return (
    <div className="pb-8">
      <PageHeader
        title="Inventory"
        subtitle={`${items.length} items · ${lowStock.length} low stock`}
        actions={
          <Button size="sm" onClick={() => { setAddOpen(true); resetAdd(); }}>
            <Plus size={14} className="mr-1" /> Add Item
          </Button>
        }
      />

      <div className="px-6">
        <Tabs defaultValue="items">
          <TabsList className="mb-4">
            <TabsTrigger value="items">
              Items
              {lowStock.length > 0 && (
                <span className="ml-2 bg-red-500 text-white rounded-full text-xs px-1.5 py-0.5">{lowStock.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="rules">Consumption Rules</TabsTrigger>
          </TabsList>

          {/* ── Items Tab ── */}
          <TabsContent value="items" className="space-y-4">
            {lowStock.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-amber-800 text-sm">Low Stock Alert</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {lowStock.map(i => `${i.name} (${fmt(i.currentStock)} ${i.unit})`).join(", ")} — reorder needed
                  </p>
                </div>
              </div>
            )}

            <Input
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => <div key={i} className="h-36 bg-muted rounded-xl animate-pulse" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No items found</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((item) => (
                  <div key={item.id} className={`bg-card border rounded-xl p-5 shadow-sm transition-shadow hover:shadow-md ${isLow(item) ? "border-amber-300" : "border-card-border"}`}>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Package size={15} className="text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{item.category}</p>
                        </div>
                      </div>
                      {isLow(item) && <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                      <div className="bg-muted/50 rounded-lg p-2">
                        <p className="text-muted-foreground">Current</p>
                        <p className={`font-bold text-sm ${isLow(item) ? "text-amber-600" : "text-foreground"}`}>
                          {fmt(item.currentStock)} <span className="font-normal text-muted-foreground">{item.unit}</span>
                        </p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-2">
                        <p className="text-muted-foreground">Min Stock</p>
                        <p className="font-semibold text-sm">{fmt(item.minStock)} <span className="font-normal text-muted-foreground">{item.unit}</span></p>
                      </div>
                    </div>

                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={() => { setStockDialog({ item, mode: "in" }); resetStock(); }}>
                        <ArrowDown size={11} className="mr-1 text-green-600" /> Stock In
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={() => { setStockDialog({ item, mode: "out" }); resetStock(); }}>
                        <ArrowUp size={11} className="mr-1 text-red-500" /> Stock Out
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-7 px-2" title="Adjust" onClick={() => { setStockDialog({ item, mode: "adjust" }); resetStock(); }}>
                        <SlidersHorizontal size={11} />
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-7 px-2" title="History" onClick={() => setHistoryItem(item)}>
                        <History size={11} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Consumption Rules Tab ── */}
          <TabsContent value="rules" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Define which consumables are used per test</p>
              <Button size="sm" onClick={() => { setRuleOpen(true); resetRule(); }}>
                <Plus size={14} className="mr-1" /> Add Rule
              </Button>
            </div>

            {rules.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No consumption rules defined yet</div>
            ) : (
              <div className="bg-card border border-card-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-card-border">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-xs uppercase text-muted-foreground">Test</th>
                      <th className="text-left px-4 py-3 font-semibold text-xs uppercase text-muted-foreground">Item</th>
                      <th className="text-right px-4 py-3 font-semibold text-xs uppercase text-muted-foreground">Qty / Order</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((r) => (
                      <tr key={r.id} className="border-b border-card-border last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">{r.testName || r.testId}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.itemName || r.itemId}</td>
                        <td className="px-4 py-3 text-right">{r.quantity} {r.itemUnit}</td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive" onClick={() => deleteRule.mutate(r.id)}>
                            <Trash2 size={13} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Item Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Inventory Item</DialogTitle></DialogHeader>
          <form onSubmit={subAdd((d) => addItem.mutate(d))} className="space-y-4">
            <div><Label>Item Name *</Label><Input {...regAdd("name", { required: true })} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Unit *</Label><Input {...regAdd("unit", { required: true })} className="mt-1" placeholder="pcs, ml, box…" /></div>
              <div>
                <Label>Category</Label>
                <Select onValueChange={(v) => setAddVal("category", v)} defaultValue="consumable">
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Opening Stock</Label><Input type="number" step="any" {...regAdd("currentStock")} className="mt-1" defaultValue="0" /></div>
              <div><Label>Min Stock</Label><Input type="number" step="any" {...regAdd("minStock")} className="mt-1" defaultValue="0" /></div>
              <div><Label>Cost (₹)</Label><Input type="number" step="any" {...regAdd("costPrice")} className="mt-1" defaultValue="0" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addItem.isPending}>{addItem.isPending ? "Saving…" : "Add Item"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Stock In / Out / Adjust Dialog */}
      {stockDialog && (
        <Dialog open onOpenChange={() => setStockDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>
                {stockDialog.mode === "in" ? "Stock In" : stockDialog.mode === "out" ? "Stock Out" : "Adjust Stock"} — {stockDialog.item.name}
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={subStock((d) => {
                const id = stockDialog.item.id;
                if (stockDialog.mode === "in") stockIn.mutate({ id, body: d });
                else if (stockDialog.mode === "out") stockOut.mutate({ id, body: d });
                else adjust.mutate({ id, body: { newQuantity: d.newQuantity, reason: d.reason, performedBy: d.performedBy } });
              })}
              className="space-y-4"
            >
              <div className="bg-muted/50 rounded-lg px-4 py-2 text-sm">
                Current: <strong>{fmt(stockDialog.item.currentStock)} {stockDialog.item.unit}</strong>
              </div>
              {stockDialog.mode === "adjust" ? (
                <div>
                  <Label>New Quantity ({stockDialog.item.unit}) *</Label>
                  <Input type="number" step="any" {...regStock("newQuantity", { required: true })} className="mt-1" />
                </div>
              ) : (
                <div>
                  <Label>Quantity ({stockDialog.item.unit}) *</Label>
                  <Input type="number" step="any" min="0.01" {...regStock("quantity", { required: true })} className="mt-1" />
                </div>
              )}
              <div><Label>Reason</Label><Input {...regStock("reason")} className="mt-1" /></div>
              <div><Label>Reference (Order#, Bill#)</Label><Input {...regStock("reference")} className="mt-1" /></div>
              <div><Label>Performed By</Label><Input {...regStock("performedBy")} className="mt-1" /></div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setStockDialog(null)}>Cancel</Button>
                <Button type="submit">{stockDialog.mode === "adjust" ? "Adjust" : stockDialog.mode === "in" ? "Add Stock" : "Deduct Stock"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Transaction History Dialog */}
      {historyItem && (
        <Dialog open onOpenChange={() => setHistoryItem(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Stock History — {historyItem.name}</DialogTitle></DialogHeader>
            {history.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">No transactions yet</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-card-border text-xs text-muted-foreground uppercase">
                    <th className="text-left py-2">Date</th>
                    <th className="text-left py-2">Type</th>
                    <th className="text-right py-2">Qty</th>
                    <th className="text-right py-2">After</th>
                    <th className="text-left py-2 pl-4">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b border-card-border last:border-0">
                      <td className="py-2 text-muted-foreground">{new Date(h.createdAt).toLocaleDateString("en-IN")}</td>
                      <td className="py-2">{typeBadge(h.type)}</td>
                      <td className={`py-2 text-right font-medium ${h.type === "in" ? "text-green-600" : h.type === "out" ? "text-red-500" : "text-blue-600"}`}>
                        {h.type === "out" ? "-" : h.type === "in" ? "+" : "→"}{Math.abs(Number(h.quantity))} {historyItem.unit}
                      </td>
                      <td className="py-2 text-right">{Number(h.stockAfter).toLocaleString("en-IN")}</td>
                      <td className="py-2 pl-4 text-muted-foreground">{h.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Add Consumption Rule */}
      <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Consumption Rule</DialogTitle></DialogHeader>
          <form onSubmit={subRule((d) => addRule.mutate({ ...d, quantity: d.quantity || "1" }))} className="space-y-4">
            <div>
              <Label>Test *</Label>
              <Select onValueChange={(v) => setRuleVal("testId", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select test…" /></SelectTrigger>
                <SelectContent>
                  {testsData?.tests?.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Inventory Item *</Label>
              <Select onValueChange={(v) => setRuleVal("itemId", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select item…" /></SelectTrigger>
                <SelectContent>
                  {items.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.name} ({i.unit})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Quantity per Order</Label><Input type="number" step="any" {...regRule("quantity")} className="mt-1" defaultValue="1" /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setRuleOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addRule.isPending}>Add Rule</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
