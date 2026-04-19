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
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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
  { path: "/payments", icon: CreditCard, label: "Payments" },
  { path: "/reports", icon: BarChart3, label: "Reports" },
  { path: "/report-generator", icon: FilePen, label: "Report Generator" },
  { path: "/inventory", icon: Package, label: "Inventory" },
  { path: "/expenses", icon: TrendingDown, label: "Expenses" },
  { path: "/staff", icon: Fingerprint, label: "Staff" },
  { path: "/referrals", icon: HandCoins, label: "Referrals" },
  { path: "/accounting", icon: BookOpen, label: "Accounting" },
  { path: "/discounts", icon: Tag, label: "Discounts" },
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
    <button onClick={toggle} className="p-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
          {navItems.map(({ path, icon: Icon, label }) => {
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

        {/* Footer */}
        <div className="px-4 py-3 border-t border-sidebar-border flex items-center justify-between">
          <span className="text-xs text-sidebar-foreground/40">v1.0.0</span>
          <ThemeToggle />
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
              {navItems.find(n => n.path === "/" ? location === "/" : location.startsWith(n.path))?.label ?? "DiagnoCenter"}
            </span>
          </div>
          <div className="ml-auto">
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
