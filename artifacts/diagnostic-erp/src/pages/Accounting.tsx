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
import { useForm } from "react-hook-form";
import {
  Plus, Download, Landmark, FileText, BarChart3, Trash2,
  TrendingUp, TrendingDown, ArrowRightLeft, Receipt,
} from "lucide-react";

type Account = {
  id: number; name: string; type: string; code?: string;
  bankName?: string; accountNumber?: string; ifscCode?: string; isActive: boolean;
};
type Voucher = {
  id: number; voucherNumber: string; type: string; date: string;
  creditAccountId: string; debitAccountId: string; amount: number;
  particular: string; remark?: string; performedBy?: string; reference?: string;
  createdAt: string;
};
type LedgerEntry = {
  account: Account; dr: number; cr: number; balance: number;
  entries: { date: string; particular: string; dr: number; cr: number; balance: number; voucherNumber: string }[];
};

const ACCOUNT_TYPES = ["cash", "bank", "income", "expense", "liability", "asset"];
const VOUCHER_TYPES = [
  { value: "payment", label: "Payment Voucher", icon: TrendingDown },
  { value: "receipt", label: "Receipt Voucher", icon: TrendingUp },
  { value: "bank_transfer", label: "Bank Transfer", icon: ArrowRightLeft },
  { value: "journal", label: "Journal Entry", icon: FileText },
];
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Accounting() {
  const qc = useQueryClient();
  const [accOpen, setAccOpen] = useState(false);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [voucherType, setVoucherType] = useState("payment");
  const [expandedLedger, setExpandedLedger] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState({ type: "all", from: "", to: "", q: "" });

  const { data: accounts = [], isLoading: accLoading } = useQuery<Account[]>({
    queryKey: ["accounts"],
    queryFn: () => api.get("/api/accounting/accounts"),
  });
  const { data: vouchers = [], isLoading: vLoading } = useQuery<Voucher[]>({
    queryKey: ["vouchers", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.type !== "all") params.set("type", filters.type);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.q) params.set("q", filters.q);
      return api.get(`/api/accounting/vouchers?${params}`);
    },
  });
  const { data: ledger = [] } = useQuery<LedgerEntry[]>({
    queryKey: ["ledger"],
    queryFn: () => api.get("/api/accounting/ledger"),
  });

  const createAccount = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/accounting/accounts", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounts"] }); qc.invalidateQueries({ queryKey: ["ledger"] }); setAccOpen(false); resetAcc(); },
  });
  const createVoucher = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/accounting/vouchers", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vouchers"] }); qc.invalidateQueries({ queryKey: ["ledger"] }); setVoucherOpen(false); resetV(); },
  });
  const deleteVoucher = useMutation({
    mutationFn: (id: number) => api.delete(`/api/accounting/vouchers/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vouchers"] }); qc.invalidateQueries({ queryKey: ["ledger"] }); },
  });

  const { register: regAcc, handleSubmit: subAcc, reset: resetAcc, setValue: setAccVal, watch: watchAcc } = useForm<Record<string, string>>();
  const { register: regV, handleSubmit: subV, reset: resetV, setValue: setVVal } = useForm<Record<string, string>>();
  const accType = watchAcc("type");

  const activeAccounts = accounts.filter(a => a.isActive);
  const accountName = (id: string) => accounts.find(a => a.id.toString() === id)?.name || id;

  const vBadge = (type: string) => {
    const colors: Record<string, string> = {
      payment: "bg-red-100 text-red-700",
      receipt: "bg-green-100 text-green-700",
      bank_transfer: "bg-blue-100 text-blue-700",
      journal: "bg-purple-100 text-purple-700",
    };
    const labels: Record<string, string> = { payment: "Payment", receipt: "Receipt", bank_transfer: "Bank Transfer", journal: "Journal" };
    return <Badge className={`${colors[type] || "bg-gray-100 text-gray-700"} text-xs`}>{labels[type] || type}</Badge>;
  };

  const totalDr = ledger.reduce((s, l) => s + l.dr, 0);
  const totalCr = ledger.reduce((s, l) => s + l.cr, 0);

  return (
    <div className="pb-8">
      <PageHeader title="Accounting" subtitle="Vouchers, ledgers, and Tally export" />

      <div className="px-6">
        <Tabs defaultValue="vouchers">
          <TabsList className="mb-4">
            <TabsTrigger value="vouchers">Vouchers</TabsTrigger>
            <TabsTrigger value="accounts">Chart of Accounts</TabsTrigger>
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
            <TabsTrigger value="export">Tally Export</TabsTrigger>
          </TabsList>

          {/* ── Vouchers Tab ── */}
          <TabsContent value="vouchers" className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <div className="flex flex-wrap gap-2">
                <Select onValueChange={v => setFilters(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="w-36"><SelectValue placeholder="All Types" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {VOUCHER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} className="w-36" placeholder="From" />
                <Input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} className="w-36" placeholder="To" />
                <Input value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} className="w-40" placeholder="Search…" />
              </div>
              <div className="flex gap-2">
                {VOUCHER_TYPES.map(t => (
                  <Button key={t.value} size="sm" variant="outline" onClick={() => { setVoucherType(t.value); resetV({ type: t.value, date: new Date().toISOString().split("T")[0] }); setVoucherOpen(true); }}>
                    <t.icon size={13} className="mr-1" /> {t.label.split(" ")[0]}
                  </Button>
                ))}
              </div>
            </div>

            {vLoading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}</div>
            ) : vouchers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No vouchers found</div>
            ) : (
              <div className="bg-card border border-card-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b border-card-border">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Voucher #</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Particular</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Debit</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Credit</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">Amount</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {vouchers.map((v) => (
                      <tr key={v.id} className="border-b border-card-border last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3 font-mono text-xs">{v.voucherNumber}</td>
                        <td className="px-4 py-3 text-muted-foreground">{v.date}</td>
                        <td className="px-4 py-3">{vBadge(v.type)}</td>
                        <td className="px-4 py-3 max-w-[180px] truncate">{v.particular}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{accountName(v.debitAccountId)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{accountName(v.creditAccountId)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{inr(v.amount)}</td>
                        <td className="px-4 py-3">
                          <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive" onClick={() => deleteVoucher.mutate(v.id)}>
                            <Trash2 size={13} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-card-border bg-muted/30">
                    <tr>
                      <td colSpan={6} className="px-4 py-3 text-sm font-semibold text-right">Total</td>
                      <td className="px-4 py-3 text-right font-bold">{inr(vouchers.reduce((s, v) => s + v.amount, 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </TabsContent>

          {/* ── Accounts Tab ── */}
          <TabsContent value="accounts" className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { setAccOpen(true); resetAcc(); }}>
                <Plus size={14} className="mr-1" /> Add Account
              </Button>
            </div>

            {accLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{[...Array(6)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
            ) : accounts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No accounts. Add your first account to get started.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {accounts.map((acc) => (
                  <div key={acc.id} className={`bg-card border rounded-xl p-4 ${!acc.isActive ? "opacity-60" : "border-card-border"}`}>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Landmark size={15} className="text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm">{acc.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{acc.type}{acc.code ? ` · ${acc.code}` : ""}</p>
                        {acc.bankName && <p className="text-xs text-muted-foreground mt-0.5">{acc.bankName} {acc.accountNumber ? `· ${acc.accountNumber}` : ""}</p>}
                      </div>
                      {!acc.isActive && <Badge className="bg-gray-100 text-gray-500 text-xs ml-auto">Inactive</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Ledger Tab ── */}
          <TabsContent value="ledger" className="space-y-4">
            <div className="grid grid-cols-3 gap-4 mb-2">
              <div className="bg-card border border-card-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground">Total Debits</p>
                <p className="text-lg font-bold text-foreground">{inr(totalDr)}</p>
              </div>
              <div className="bg-card border border-card-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground">Total Credits</p>
                <p className="text-lg font-bold text-foreground">{inr(totalCr)}</p>
              </div>
              <div className="bg-card border border-card-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground">Net Balance</p>
                <p className={`text-lg font-bold ${totalDr - totalCr >= 0 ? "text-green-600" : "text-red-500"}`}>{inr(Math.abs(totalDr - totalCr))} {totalDr - totalCr >= 0 ? "Dr" : "Cr"}</p>
              </div>
            </div>

            {ledger.filter(l => l.dr + l.cr > 0).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No ledger entries yet</div>
            ) : (
              <div className="space-y-2">
                {ledger.filter(l => l.dr + l.cr > 0).map((l) => {
                  const expanded = expandedLedger.has(l.account.id);
                  return (
                    <div key={l.account.id} className="bg-card border border-card-border rounded-xl overflow-hidden">
                      <div
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/20"
                        onClick={() => setExpandedLedger(prev => {
                          const next = new Set(prev);
                          expanded ? next.delete(l.account.id) : next.add(l.account.id);
                          return next;
                        })}
                      >
                        <div>
                          <p className="font-semibold text-sm">{l.account.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{l.account.type}</p>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Dr</p>
                            <p className="font-medium">{inr(l.dr)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Cr</p>
                            <p className="font-medium">{inr(l.cr)}</p>
                          </div>
                          <div className="text-right min-w-[90px]">
                            <p className="text-xs text-muted-foreground">Balance</p>
                            <p className={`font-bold ${l.balance >= 0 ? "text-green-600" : "text-red-500"}`}>
                              {inr(Math.abs(l.balance))} {l.balance >= 0 ? "Dr" : "Cr"}
                            </p>
                          </div>
                        </div>
                      </div>
                      {expanded && l.entries.length > 0 && (
                        <div className="border-t border-card-border">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="text-left px-4 py-2 text-muted-foreground">Date</th>
                                <th className="text-left px-4 py-2 text-muted-foreground">Voucher</th>
                                <th className="text-left px-4 py-2 text-muted-foreground">Particular</th>
                                <th className="text-right px-4 py-2 text-muted-foreground">Dr</th>
                                <th className="text-right px-4 py-2 text-muted-foreground">Cr</th>
                                <th className="text-right px-4 py-2 text-muted-foreground">Balance</th>
                              </tr>
                            </thead>
                            <tbody>
                              {l.entries.map((e, i) => (
                                <tr key={i} className="border-t border-card-border">
                                  <td className="px-4 py-2 text-muted-foreground">{e.date}</td>
                                  <td className="px-4 py-2 font-mono">{e.voucherNumber}</td>
                                  <td className="px-4 py-2">{e.particular}</td>
                                  <td className="px-4 py-2 text-right">{e.dr ? inr(e.dr) : "—"}</td>
                                  <td className="px-4 py-2 text-right">{e.cr ? inr(e.cr) : "—"}</td>
                                  <td className={`px-4 py-2 text-right font-medium ${e.balance >= 0 ? "text-green-600" : "text-red-500"}`}>
                                    {inr(Math.abs(e.balance))} {e.balance >= 0 ? "Dr" : "Cr"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Tally Export Tab ── */}
          <TabsContent value="export" className="space-y-6">
            <div className="bg-card border border-card-border rounded-xl p-6 max-w-lg">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Download size={22} className="text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-base">Export to Tally XML</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Downloads all ledger masters and vouchers in Tally-compatible XML format.
                    Import this file in Tally ERP 9 / TallyPrime via <strong>Gateway of Tally → Import Data</strong>.
                  </p>
                  <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                    <p>• {accounts.length} account masters</p>
                    <p>• {vouchers.length} vouchers (unfiltered)</p>
                  </div>
                  <Button
                    className="mt-4"
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = "/api/accounting/export/tally";
                      a.download = "tally-export.xml";
                      a.click();
                    }}
                  >
                    <Download size={15} className="mr-2" /> Download Tally XML
                  </Button>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 max-w-lg text-sm text-amber-800">
              <p className="font-semibold mb-1">Import Instructions (TallyPrime)</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Open TallyPrime → Go to <strong>Gateway of Tally</strong></li>
                <li>Press <strong>Alt + O</strong> (or click Import)</li>
                <li>Select <strong>Data</strong> and choose the downloaded XML file</li>
                <li>Tally will import all ledgers and vouchers automatically</li>
              </ol>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Account Dialog */}
      <Dialog open={accOpen} onOpenChange={setAccOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Account</DialogTitle></DialogHeader>
          <form onSubmit={subAcc((d) => createAccount.mutate(d))} className="space-y-4">
            <div><Label>Account Name *</Label><Input {...regAcc("name", { required: true })} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type *</Label>
                <Select onValueChange={(v) => setAccVal("type", v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Code</Label><Input {...regAcc("code")} className="mt-1" placeholder="e.g. 1001" /></div>
            </div>
            {(accType === "bank") && (
              <>
                <div><Label>Bank Name</Label><Input {...regAcc("bankName")} className="mt-1" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Account No.</Label><Input {...regAcc("accountNumber")} className="mt-1" /></div>
                  <div><Label>IFSC</Label><Input {...regAcc("ifscCode")} className="mt-1" /></div>
                </div>
              </>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAccOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createAccount.isPending}>{createAccount.isPending ? "Saving…" : "Add Account"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Voucher Dialog */}
      <Dialog open={voucherOpen} onOpenChange={setVoucherOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{VOUCHER_TYPES.find(t => t.value === voucherType)?.label || "New Voucher"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={subV((d) => createVoucher.mutate({ ...d, type: voucherType, amount: Number(d.amount) }))}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date *</Label>
                <Input type="date" {...regV("date", { required: true })} className="mt-1" defaultValue={new Date().toISOString().split("T")[0]} />
              </div>
              <div>
                <Label>Amount (₹) *</Label>
                <Input type="number" step="0.01" {...regV("amount", { required: true })} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>{voucherType === "bank_transfer" ? "From Account (Credit)" : "Credit Account"} *</Label>
              <Select onValueChange={(v) => setVVal("creditAccountId", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select account…" /></SelectTrigger>
                <SelectContent>
                  {activeAccounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{voucherType === "bank_transfer" ? "To Account (Debit)" : "Debit Account"} *</Label>
              <Select onValueChange={(v) => setVVal("debitAccountId", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select account…" /></SelectTrigger>
                <SelectContent>
                  {activeAccounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Particular *</Label><Input {...regV("particular", { required: true })} className="mt-1" placeholder="e.g., Lab supplies purchase" /></div>
            <div><Label>Remark</Label><Input {...regV("remark")} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Performed By</Label><Input {...regV("performedBy")} className="mt-1" /></div>
              <div><Label>Reference</Label><Input {...regV("reference")} className="mt-1" placeholder="Bill#, Order#…" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setVoucherOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createVoucher.isPending}>{createVoucher.isPending ? "Saving…" : "Create Voucher"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
