import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  FlaskConical,
  ClipboardList,
  Receipt,
  CreditCard,
  BarChart3,
  Stethoscope,
  Menu,
  X,
  Moon,
  Sun,
  Activity,
  FilePen,
  Package,
  HandCoins,
  BookOpen,
  UserPlus,
  Settings2,
  Tag,
  Ticket,
  Monitor,
  CalendarDays,
  Boxes,
  TrendingDown,
  Zap,
  Fingerprint,
  Maximize2,
  Minimize2,
  FileText,
  LogOut,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { readStaffSession, clearStaffSession, canAccess } from "@/lib/staffSession";

const navItems = [
  { path: "/", icon: Zap, label: "Billing Desk" },
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/patients", icon: Users, label: "Patients" },
  { path: "/appointments", icon: CalendarDays, label: "Appointments" },
  { path: "/queue", icon: Ticket, label: "Queue Tokens" },
  { path: "/orders", icon: ClipboardList, label: "Orders" },
  { path: "/tests", icon: FlaskConical, label: "Test Catalog" },
  { path: "/packages", icon: Boxes, label: "Test Packages" },
  { path: "/billing", icon: Receipt, label: "Billing" },
  { path: "/dues", icon: AlertCircle, label: "Due Payments" },
  { path: "/payments", icon: CreditCard, label: "Payments" },
  { path: "/reports", icon: BarChart3, label: "Reports" },
  { path: "/report-generator", icon: FilePen, label: "Report Generator" },
  { path: "/inventory", icon: Package, label: "Inventory" },
  { path: "/expenses", icon: TrendingDown, label: "Expenses" },
  { path: "/staff", icon: Fingerprint, label: "Staff" },
  { path: "/referrals", icon: HandCoins, label: "Referrals" },
  { path: "/accounting", icon: BookOpen, label: "Accounting" },
  { path: "/discounts", icon: Tag, label: "Discounts" },
  { path: "/form-f", icon: FileText, label: "Form F (PCPNDT)" },
  { path: "/pacs", icon: Monitor, label: "PACS Viewer" },
  { path: "/settings", icon: Settings2, label: "Settings" },
];

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = () => {
    document.documentElement.classList.toggle("dark");
    setDark(!dark);
  };
  return (
    <button onClick={toggle} className="p-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors" title="Toggle theme">
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

function FullscreenToggle() {
  const [isFs, setIsFs] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement);

  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn("Fullscreen toggle failed:", err);
    }
  };

  return (
    <button
      onClick={toggle}
      className="p-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
      title={isFs ? "Exit full screen (F11)" : "Enter full screen (F11)"}
      aria-label={isFs ? "Exit full screen" : "Enter full screen"}
    >
      {isFs ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
    </button>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const session = readStaffSession();

  // Filter nav by permissions when a staff session exists.
  const visibleNav = navItems.filter((n) => canAccess(session, n.path));

  const onLogout = async () => {
    // Best-effort: tell the server to invalidate the portal session, and clear
    // BOTH the legacy portal-staff key and the new ERP session key.
    try {
      const token = session?.token;
      if (token) {
        await fetch("/api/portal/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => { /* network errors ignored — local cleanup still proceeds */ });
      }
    } catch { /* ignore */ }
    try { window.localStorage.removeItem("portal_staff_session"); } catch { /* ignore */ }
    clearStaffSession();
    // Land back on the public portal landing page.
    const base = (import.meta as { env: { BASE_URL: string } }).env.BASE_URL || "/";
    window.location.href = `${base}portal`.replace(/\/+/g, "/").replace(":/", "://");
  };

  const initials = session?.user.name
    ? session.user.name.split(/\s+/).map((p) => p.charAt(0)).slice(0, 2).join("").toUpperCase()
    : "";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-30 w-60 flex flex-col bg-sidebar border-r border-sidebar-border transition-transform duration-200",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border bg-gradient-to-br from-violet-600/30 via-indigo-600/20 to-fuchsia-600/20">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-indigo-500 to-fuchsia-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-500/30">
            <Activity size={20} className="text-white" />
          </div>
          <div>
            <div className="text-base font-bold text-sidebar-foreground leading-tight tracking-tight">DiagnoCenter</div>
            <div className="text-[11px] uppercase tracking-wider text-sidebar-foreground/60 font-medium">Billing ERP</div>
          </div>
          <button className="ml-auto lg:hidden text-sidebar-foreground" onClick={() => setSidebarOpen(false)}>
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {visibleNav.map(({ path, icon: Icon, label }) => {
            const isActive = path === "/" ? location === "/" : location.startsWith(path);
            return (
              <Link
                key={path}
                href={path}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                )}
              >
                <Icon size={15} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Signed-in user (only shown when a portal staff session exists) */}
        {session && (
          <div className="px-3 py-3 border-t border-sidebar-border">
            <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-sidebar-accent/40">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-sidebar-foreground truncate">{session.user.name}</p>
                <p className="text-[10px] text-sidebar-foreground/60 capitalize truncate">{session.user.role.replace("_", " ")}</p>
              </div>
              <button
                onClick={onLogout}
                title="Sign out"
                className="p-1.5 rounded-md text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors shrink-0"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-sidebar-border flex items-center justify-between">
          <span className="text-xs text-sidebar-foreground/40">v1.0.0</span>
          <div className="flex items-center gap-1">
            <FullscreenToggle />
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile/tablet) */}
        <header className="lg:hidden sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-foreground p-1.5 -ml-1.5 rounded-md hover:bg-muted active:bg-muted/80 transition-colors"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 via-indigo-500 to-fuchsia-500 flex items-center justify-center flex-shrink-0">
              <Activity size={14} className="text-white" />
            </div>
            <span className="font-semibold text-sm truncate">
              {visibleNav.find(n => n.path === "/" ? location === "/" : location.startsWith(n.path))?.label ?? "DiagnoCenter"}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {session && (
              <button onClick={onLogout} title="Sign out" className="p-2 rounded-md text-foreground hover:bg-muted transition-colors">
                <LogOut size={16} />
              </button>
            )}
            <FullscreenToggle />
            <ThemeToggle />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
