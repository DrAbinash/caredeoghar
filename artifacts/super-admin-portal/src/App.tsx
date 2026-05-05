import { useState, useEffect, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { ShieldAlert, LogOut, ExternalLink, Copy, CheckCheck, Eye, EyeOff, Lock, BookOpen, HandCoins, ListChecks, Wallet } from "lucide-react";
import { setSaToken } from "./lib/saApi";

const BooksManager     = lazy(() => import("./pages/Books"));
const CommissionRules  = lazy(() => import("./pages/CommissionRules"));
const CommissionReport = lazy(() => import("./pages/CommissionReport"));
const DoctorLedger     = lazy(() => import("./pages/DoctorLedger"));

function PageLoader() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

const queryClient = new QueryClient();

const BASE_URL = import.meta.env.BASE_URL ?? "/super-admin-portal/";
const API_BASE = "/api";

type LoginForm = {
  name: string;
  pin: string;
};

type Session = {
  token: string;
  userName: string;
  expiresAt: string;
};

function getErpBaseUrl(): string {
  return `${window.location.origin}/`;
}

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("Expired");
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setRemaining(`${h}h ${m}m ${s}s`);
    };
    update();
    const id = setInterval(update, 1_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return <span className="font-mono text-sm">{remaining}</span>;
}

function LoginScreen({ onLogin }: { onLogin: (session: Session) => void }) {
  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm<LoginForm>();
  const [apiError, setApiError] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);

  const onSubmit = async (data: LoginForm) => {
    setApiError(null);
    try {
      const res = await fetch(`${API_BASE}/super-admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name, pin: data.pin }),
      });
      const body = await res.json();
      if (!res.ok) {
        setApiError(body.error ?? "Login failed");
        return;
      }
      onLogin({ token: body.token, userName: body.userName, expiresAt: body.expiresAt });
    } catch {
      setApiError("Network error — please try again");
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <ShieldAlert className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Super Admin</h1>
          <p className="text-sm text-muted-foreground mt-1">Diagnostic Center Billing ERP</p>
        </div>

        {/* Login card */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xl shadow-black/20">
          <div className="flex items-center gap-2 mb-5 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
            <Lock size={12} className="text-primary" />
            <span>Use your super-admin name and PIN · 8-hour session</span>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="name" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Admin Name
              </Label>
              <Input
                id="name"
                {...register("name", { required: "Name is required" })}
                className="mt-1.5"
                placeholder="e.g. Dr Abinash Kumar"
                autoComplete="username"
              />
              {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <Label htmlFor="pin" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                PIN
              </Label>
              <div className="relative mt-1.5">
                <Input
                  id="pin"
                  type={showPin ? "text" : "password"}
                  {...register("pin", { required: "PIN is required" })}
                  className="pr-10 font-mono tracking-widest"
                  placeholder="4-digit PIN"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPin((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {errors.pin && <p className="text-xs text-destructive mt-1">{errors.pin.message}</p>}
            </div>

            {apiError && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-xs rounded-lg px-3 py-2">
                {apiError}
              </div>
            )}

            <Button
              type="submit"
              className="w-full mt-2"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Authenticating…" : "Authenticate"}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          All sessions are time-limited and fully audited.
        </p>
      </div>
    </div>
  );
}

function ActiveSessionScreen({
  session, onEject, onManageBooks, onCommissionReport, onCommissionRules, onDoctorLedger,
}: {
  session: Session;
  onEject: () => void;
  onManageBooks: () => void;
  onCommissionReport: () => void;
  onCommissionRules: () => void;
  onDoctorLedger: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const erpBaseUrl = getErpBaseUrl();

  const copyLink = async () => {
    await navigator.clipboard.writeText(erpBaseUrl);
    setCopied(true);
    toast({ title: "Link copied!", description: "Use the Open ERP button to activate super admin mode — the session is transferred securely." });
    setTimeout(() => setCopied(false), 3000);
  };

  const openERP = () => {
    const win = window.open(erpBaseUrl, "_blank");
    if (!win) {
      toast({ title: "Pop-up blocked", description: "Please allow pop-ups for this site and try again.", variant: "destructive" });
      return;
    }
    const token = session.token;
    const origin = window.location.origin;
    let attempts = 0;
    const MAX_ATTEMPTS = 20;
    const send = () => {
      if (win.closed || attempts >= MAX_ATTEMPTS) return;
      attempts++;
      win.postMessage({ type: "sa_token", token }, origin);
      setTimeout(send, 500);
    };
    setTimeout(send, 300);
  };

  const handleEject = async () => {
    try {
      await fetch(`${API_BASE}/super-admin/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: session.token }),
      });
    } catch { /* ignore */ }
    onEject();
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/30 mb-4">
            <ShieldAlert className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Session Active</h1>
          <p className="text-sm text-muted-foreground mt-1">Welcome, <span className="font-semibold text-foreground">{session.userName}</span></p>
        </div>

        {/* Session card */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xl shadow-black/20 space-y-5">
          {/* Status bar */}
          <div className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-medium text-green-400">ACTIVE</span>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Expires in</p>
              <CountdownTimer expiresAt={session.expiresAt} />
            </div>
          </div>

          {/* Session details */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Admin</span>
              <span className="font-semibold">{session.userName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expires</span>
              <span className="font-medium">{formatExpiry(session.expiresAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Token</span>
              <span className="font-mono text-xs text-muted-foreground">{session.token.slice(0, 16)}…</span>
            </div>
          </div>

          {/* ERP access section */}
          <div className="border-t border-border pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Open ERP with Super Admin Mode
            </p>
            <div className="bg-muted/40 rounded-lg px-3 py-2.5 text-xs text-muted-foreground break-all mb-3 border border-border">
              {erpBaseUrl}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyLink} className="flex-1">
                {copied ? <CheckCheck size={13} className="mr-1.5 text-green-500" /> : <Copy size={13} className="mr-1.5" />}
                {copied ? "Copied!" : "Copy URL"}
              </Button>
              <Button size="sm" onClick={openERP} className="flex-1">
                <ExternalLink size={13} className="mr-1.5" />
                Open ERP
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Click <strong>Open ERP</strong> to launch the ERP with super-admin mode active. The session is transferred securely — no token appears in the URL.
            </p>
          </div>

          {/* Compliance — Referral commission */}
          <div className="border-t border-border pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Referral Commission (Compliance)
            </p>
            <div className="grid grid-cols-1 gap-2">
              <Button variant="outline" className="w-full justify-start" onClick={onCommissionReport}>
                <HandCoins size={14} className="mr-2" />
                Commission Report
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={onCommissionRules}>
                <ListChecks size={14} className="mr-2" />
                Commission Rules
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={onDoctorLedger}>
                <Wallet size={14} className="mr-2" />
                Doctor Due / Payment Ledger
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              All referral-fee data is restricted to super admins per medical practice regulations.
            </p>
          </div>

          {/* Books / Ledgers */}
          <div className="border-t border-border pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Multi-Book Management
            </p>
            <Button variant="outline" className="w-full" onClick={onManageBooks}>
              <BookOpen size={14} className="mr-2" />
              Manage Books / Ledgers
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Partition bills & patients by referral doctor groups. Resetting a book deletes its bills and restarts numbering from bill #1.
            </p>
          </div>

          {/* Eject */}
          <div className="border-t border-border pt-4">
            <Button
              variant="outline"
              className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
              onClick={handleEject}
            >
              <LogOut size={14} className="mr-2" />
              Eject Session
            </Button>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Ejecting immediately revokes the session token and disables super admin access.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<"home" | "books" | "commission-report" | "commission-rules" | "doctor-ledger">("home");

  // Keep the saApi helper in sync with the active super-admin token so all
  // gated requests (commission, doctor-ledger) automatically include the
  // X-SA-Token header.
  useEffect(() => {
    setSaToken(session?.token ?? null);
  }, [session]);

  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<PageLoader />}>
        {!session ? (
          <LoginScreen onLogin={(s) => { setSession(s); setView("home"); }} />
        ) : view === "books" ? (
          <BooksManager token={session.token} onBack={() => setView("home")} />
        ) : view === "commission-report" ? (
          <CommissionReport onBack={() => setView("home")} />
        ) : view === "commission-rules" ? (
          <CommissionRules onBack={() => setView("home")} />
        ) : view === "doctor-ledger" ? (
          <DoctorLedger onBack={() => setView("home")} />
        ) : (
          <ActiveSessionScreen
            session={session}
            onEject={() => { setSession(null); setView("home"); }}
            onManageBooks={() => setView("books")}
            onCommissionReport={() => setView("commission-report")}
            onCommissionRules={() => setView("commission-rules")}
            onDoctorLedger={() => setView("doctor-ledger")}
          />
        )}
      </Suspense>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
