import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Landmark, RefreshCw, Plus, Trash2, ArrowUpRight, ArrowDownLeft,
  CreditCard, Activity, CheckCircle, Unlink,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PROVIDERS = [
  { value: "mock", label: "Mock / Test" },
  { value: "icici", label: "ICICI Bank" },
  { value: "hdfc", label: "HDFC Bank" },
  { value: "axis", label: "Axis Bank" },
  { value: "sbi", label: "SBI" },
  { value: "kotak", label: "Kotak Mahindra" },
  { value: "generic", label: "Generic / Other" },
];

const ENV_OPTIONS = [
  { value: "sandbox", label: "Sandbox" },
  { value: "production", label: "Production" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" },
];

interface BankAccount {
  id: number;
  provider: string;
  bankName: string;
  accountNickname: string | null;
  maskedAccountNumber: string;
  ifsc: string | null;
  branch: string | null;
  environment: string;
  status: string;
}

interface BankTxn {
  id: number;
  provider: string;
  transactionDate: string;
  description: string | null;
  amount: string;
  type: string;
  utr: string | null;
  reconciliationStatus: string;
}

interface BankingSummary {
  totalAccounts: number;
  unreconciledTransactions: number;
  pendingPayments: number;
  webhooks24h: number;
}

export default function Banking() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState("accounts");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [viewTxOpen, setViewTxOpen] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState<number | null>(null);

  const [form, setForm] = useState({
    provider: "mock",
    bankName: "",
    accountNickname: "",
    maskedAccountNumber: "",
    ifsc: "",
    branch: "",
    environment: "sandbox" as const,
    status: "active" as const,
    credentialKey: "",
  });

  const accountsQuery = useQuery<BankAccount[]>({
    queryKey: ["banking", "accounts"],
    queryFn: () => api.get("/api/banking/accounts"),
  });

  const summaryQuery = useQuery<BankingSummary>({
    queryKey: ["banking", "summary"],
    queryFn: () => api.get("/api/banking/summary"),
  });

  const transactionsQuery = useQuery<BankTxn[]>({
    queryKey: ["banking", "transactions", { accountId: selectedAccount }],
    queryFn: () => api.get(`/api/banking/transactions?accountId=${selectedAccount}&limit=100`),
    enabled: viewTxOpen && selectedAccount !== null,
  });

  const createAccount = useMutation({
    mutationFn: (body: unknown) => api.post("/api/banking/accounts", body),
    onSuccess: () => {
      toast({ title: "Bank account added", variant: "default" });
      setAddOpen(false);
      setForm({
        provider: "mock", bankName: "", accountNickname: "", maskedAccountNumber: "",
        ifsc: "", branch: "", environment: "sandbox", status: "active", credentialKey: "",
      });
      qc.invalidateQueries({ queryKey: ["banking"] });
    },
    onError: (e: Error) => toast({ title: "Failed to add account", description: e.message, variant: "destructive" }),
  });

  const deleteAccount = useMutation({
    mutationFn: (id: number) => api.delete(`/api/banking/accounts/${id}`),
    onSuccess: () => {
      toast({ title: "Account removed", variant: "default" });
      qc.invalidateQueries({ queryKey: ["banking"] });
    },
    onError: (e: Error) => toast({ title: "Remove failed", description: e.message, variant: "destructive" }),
  });

  async function fetchBalance(accountId: number) {
    setBalanceLoading(accountId);
    try {
      const data = await api.get<{ account: BankAccount; balance: { available: number; currency: string } }>(`/api/banking/accounts/${accountId}/balance`);
      toast({ title: "Balance", description: `${data.account.bankName}: ${data.balance.available.toLocaleString("en-IN")} ${data.balance.currency}` });
    } catch (e: any) {
      toast({ title: "Balance fetch failed", description: e?.message || "Provider error", variant: "destructive" });
    } finally {
      setBalanceLoading(null);
    }
  }

  async function importTxns(accountId: number) {
    try {
      const data = await api.post<{ imported: number }>(`/api/banking/accounts/${accountId}/transactions/import`, {});
      toast({ title: "Import complete", description: `${data.imported} transactions imported` });
      qc.invalidateQueries({ queryKey: ["banking", "transactions"] });
    } catch (e: any) {
      toast({ title: "Import failed", description: e?.message || "Error", variant: "destructive" });
    }
  }

  const accounts = accountsQuery.data ?? [];
  const summary = summaryQuery.data ?? { totalAccounts: 0, unreconciledTransactions: 0, pendingPayments: 0, webhooks24h: 0 };
  const transactions = transactionsQuery.data ?? [];

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Landmark className="w-6 h-6 text-primary" />
          Banking
        </h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add Account
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary.totalAccounts || accounts.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unreconciled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary.unreconciledTransactions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary.pendingPayments}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Webhooks (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary.webhooks24h}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bank</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Environment</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.bankName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase">{a.provider}</Badge>
                      </TableCell>
                      <TableCell>
                        {a.accountNickname || a.maskedAccountNumber}
                        {a.ifsc && <div className="text-xs text-muted-foreground">IFSC: {a.ifsc}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn(
                          a.status === "active" && "bg-green-100 text-green-800",
                          a.status === "inactive" && "bg-gray-100 text-gray-800",
                          a.status === "suspended" && "bg-red-100 text-red-800",
                        )}>{a.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{a.environment}</Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="sm" variant="outline" onClick={() => fetchBalance(a.id)} disabled={balanceLoading === a.id}>
                          <Wallet className="w-3 h-3 mr-1" />
                          {balanceLoading === a.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Balance"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setSelectedAccount(a.id); setViewTxOpen(true); }}>
                          <Activity className="w-3 h-3 mr-1" /> Txns
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => importTxns(a.id)}>
                          <ArrowDownLeft className="w-3 h-3 mr-1" /> Import
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteAccount.mutate(a.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {accounts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No bank accounts configured. Add your first account to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>UTR</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{new Date(t.transactionDate).toLocaleDateString("en-IN")}</TableCell>
                      <TableCell className="max-w-xs truncate">{t.description || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={t.type === "credit" ? "default" : "secondary"}>
                          {t.type === "credit" ? <ArrowDownLeft className="w-3 h-3 mr-1" /> : <ArrowUpRight className="w-3 h-3 mr-1" />}
                          {t.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono">{parseFloat(t.amount).toLocaleString("en-IN")}</TableCell>
                      <TableCell className="font-mono text-xs">{t.utr || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          t.reconciliationStatus === "matched" && "bg-green-50 text-green-700",
                          t.reconciliationStatus === "unreconciled" && "bg-yellow-50 text-yellow-700",
                        )}>
                          {t.reconciliationStatus === "matched" ? <CheckCircle className="w-3 h-3 mr-1" /> : <Unlink className="w-3 h-3 mr-1" />}
                          {t.reconciliationStatus}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {transactions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No transactions. Select an account and import transactions from the provider.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>Payment Requests</CardTitle>
            </CardHeader>
            <CardContent className="text-center text-muted-foreground py-12">
              <CreditCard className="w-8 h-8 mx-auto mb-2" />
              Use the Payments tab to initiate payments and check their status via your bank provider.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Account Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Bank Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Provider</Label>
              <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Bank Name</Label>
              <Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="e.g. HDFC Bank" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Account Number</Label>
                <Input value={form.maskedAccountNumber} onChange={(e) => setForm({ ...form, maskedAccountNumber: e.target.value })} placeholder="XXX1234" />
              </div>
              <div>
                <Label>Nickname (optional)</Label>
                <Input value={form.accountNickname} onChange={(e) => setForm({ ...form, accountNickname: e.target.value })} placeholder="e.g. Main Current" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>IFSC (optional)</Label>
                <Input value={form.ifsc} onChange={(e) => setForm({ ...form, ifsc: e.target.value })} />
              </div>
              <div>
                <Label>Branch (optional)</Label>
                <Input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Environment</Label>
                <Select value={form.environment} onValueChange={(v: any) => setForm({ ...form, environment: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ENV_OPTIONS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Credential Key (env prefix)</Label>
              <Input value={form.credentialKey} onChange={(e) => setForm({ ...form, credentialKey: e.target.value })} placeholder="e.g. HDFC, ICICI" />
              <p className="text-xs text-muted-foreground mt-1">
                The provider reads credentials from env vars like <code>{form.credentialKey || "PROVIDER"}_API_KEY</code>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => createAccount.mutate(form)} disabled={!form.bankName || !form.maskedAccountNumber}>
              Save Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Transactions Dialog */}
      <Dialog open={viewTxOpen} onOpenChange={setViewTxOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Transactions</DialogTitle>
          </DialogHeader>
          {transactions.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No transactions found for this account.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>UTR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{new Date(t.transactionDate).toLocaleDateString("en-IN")}</TableCell>
                    <TableCell className="max-w-xs truncate">{t.description || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={t.type === "credit" ? "default" : "secondary"}>
                        {t.type === "credit" ? <ArrowDownLeft className="w-3 h-3 mr-1" /> : <ArrowUpRight className="w-3 h-3 mr-1" />}
                        {t.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">{parseFloat(t.amount).toLocaleString("en-IN")}</TableCell>
                    <TableCell className="font-mono text-xs">{t.utr || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
