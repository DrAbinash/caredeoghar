import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Hourglass, PlayCircle, CheckCircle2, SkipForward, RefreshCw, Ticket } from "lucide-react";

type Token = {
  id: number;
  tokenNo: number;
  tokenDate: string;
  status: "waiting" | "serving" | "done" | "skipped";
  billId: number | null;
  patientId: number | null;
  patientName: string | null;
  patientCode: string | null;
  createdAt: string;
};

type Ledger = { id: number; name: string };

const STATUSES: { id: Token["status"]; label: string; color: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: "waiting", label: "Waiting", color: "bg-amber-100 text-amber-800 border-amber-300", icon: Hourglass },
  { id: "serving", label: "Serving", color: "bg-blue-100 text-blue-800 border-blue-300", icon: PlayCircle },
  { id: "done", label: "Done", color: "bg-emerald-100 text-emerald-800 border-emerald-300", icon: CheckCircle2 },
  { id: "skipped", label: "Skipped", color: "bg-zinc-200 text-zinc-700 border-zinc-300", icon: SkipForward },
];

export default function QueuePage() {
  const qc = useQueryClient();
  const [ledgerId, setLedgerId] = useState<number>(1);

  const { data: ledgers = [] } = useQuery<Ledger[]>({
    queryKey: ["ledgers"],
    queryFn: () => api.get("/api/ledgers"),
  });

  const { data: tokens = [], isFetching, refetch } = useQuery<Token[]>({
    queryKey: ["tokens-today", ledgerId],
    queryFn: () => api.get(`/api/tokens/today?ledgerId=${ledgerId}`),
    refetchInterval: 10_000,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: Token["status"] }) =>
      api.patch(`/api/tokens/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tokens-today", ledgerId] }),
  });

  const counts = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s.id] = tokens.filter(t => t.status === s.id).length;
    return acc;
  }, {});

  const groups = STATUSES.map(s => ({
    ...s,
    items: tokens.filter(t => t.status === s.id).sort((a, b) => a.tokenNo - b.tokenNo),
  }));

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader title="Queue Tokens" subtitle={`Today's tokens · ${tokens.length} total`} />

      <div className="bg-card border border-card-border rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Book / Ledger</span>
          <Select value={String(ledgerId)} onValueChange={(v) => setLedgerId(Number(v))}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ledgers.map(l => (
                <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2 ml-auto">
          {STATUSES.map(s => (
            <div key={s.id} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${s.color}`}>
              {s.label}: {counts[s.id] ?? 0}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={`mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {groups.map(g => {
          const Icon = g.icon;
          return (
            <div key={g.id} className="bg-card border border-card-border rounded-xl flex flex-col min-h-[300px]">
              <div className={`px-4 py-3 border-b border-card-border flex items-center justify-between rounded-t-xl ${g.color}`}>
                <span className="font-semibold flex items-center gap-2"><Icon size={16} /> {g.label}</span>
                <span className="text-xs font-bold">{g.items.length}</span>
              </div>
              <div className="flex-1 p-3 space-y-2 overflow-y-auto max-h-[70vh]">
                {g.items.length === 0 && (
                  <div className="text-center text-xs text-muted-foreground py-8">No tokens</div>
                )}
                {g.items.map(t => (
                  <TokenCard
                    key={t.id}
                    token={t}
                    onChange={(status) => updateStatus.mutate({ id: t.id, status })}
                    busy={updateStatus.isPending}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TokenCard({ token, onChange, busy }: { token: Token; onChange: (s: Token["status"]) => void; busy: boolean }) {
  const next: Record<Token["status"], { label: string; status: Token["status"] }[]> = {
    waiting: [
      { label: "Call", status: "serving" },
      { label: "Skip", status: "skipped" },
    ],
    serving: [
      { label: "Done", status: "done" },
      { label: "Back", status: "waiting" },
    ],
    done: [{ label: "Re-open", status: "waiting" }],
    skipped: [{ label: "Restore", status: "waiting" }],
  };
  return (
    <div className="border border-card-border rounded-lg p-3 bg-background hover:shadow-sm transition">
      <div className="flex items-center justify-between">
        <span className="text-2xl font-extrabold tabular-nums">#{token.tokenNo}</span>
        {token.patientCode && (
          <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {token.patientCode}
          </span>
        )}
      </div>
      <div className="text-sm font-medium truncate mt-1">{token.patientName ?? "—"}</div>
      {token.billId && (
        <div className="text-[11px] text-muted-foreground">Bill #{token.billId}</div>
      )}
      <div className="flex gap-1.5 mt-2">
        {next[token.status].map(n => (
          <Button
            key={n.status}
            size="sm"
            variant={n.status === "done" || n.status === "serving" ? "default" : "outline"}
            className="flex-1 h-7 text-xs"
            disabled={busy}
            onClick={() => onChange(n.status)}
          >
            {n.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
