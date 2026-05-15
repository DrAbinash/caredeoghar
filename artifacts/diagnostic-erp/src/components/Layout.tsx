import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  ShieldAlert,
  Usb,
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
  AlertCircle,
  Server,
  Radio,
  Wrench,
  Globe,
  Download,
  ChevronRight,
  ShoppingCart,
  BarChart2,
  Building2,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  WifiOff,
  ScanSearch,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { api } from "@/lib/fetchApi";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { readStaffSession, clearStaffSession, canAccess, FULL_ACCESS_ROLES } from "@/lib/staffSession";
import { useUserTheme, clearUserTheme } from "@/lib/userTheme";
import {
  getStoredUsbKey,
  storeUsbKey,
  clearUsbKey,
  verifyUsbKey,
  fetchUsbGateEnforced,
  onUsbKeyChange,
  readKeyFile,
  isFsAccessSupported,
  hasPairedPenDrive,
  pairPenDrive,
  unpairPenDrive,
  tryReadKeyFromPairedDir,
  ensurePairedDirPermission,
} from "@/lib/usbKey";
import { SIDEBAR_THEMES, DEFAULT_THEME, resolveTheme } from "@/lib/sidebarThemes";

type NavLeaf = { path: string; icon: typeof Zap; label: string; ownerOnly?: boolean };
type NavGroup = { id: string; icon: typeof Zap; label: string; children: NavLeaf[] };
type NavEntry = NavLeaf | NavGroup;

const isGroup = (n: NavEntry): n is NavGroup => "children" in n;

// Sidebar layout — flat items + collapsible groups. Routes/permissions are
// unchanged; only the visual grouping is consolidated to reduce clutter.
const navItems: NavEntry[] = [
  { path: "/", icon: Zap, label: "Billing Desk" },
  { path: "/dashboard", icon: LayoutDashboard, label: "Owner Dashboard", ownerOnly: true },
  { path: "/my-daily-summary", icon: BarChart2, label: "My Daily Summary" },
  { path: "/patients", icon: Users, label: "Patients" },
  { path: "/appointments", icon: CalendarDays, label: "Appointments" },
  { path: "/online-bookings", icon: ShoppingCart, label: "Online Bookings" },
  { path: "/queue", icon: Ticket, label: "Queue Tokens" },
  {
    id: "radiology-grp",
    icon: Radio,
    label: "Radiology",
    children: [
      { path: "/radiology", icon: Radio, label: "Study Workflow" },
      { path: "/radiology/worklist", icon: ScanSearch, label: "PACS Worklist" },
      { path: "/radiology/pacs-dashboard", icon: Monitor, label: "PACS Dashboard" },
      { path: "/radiology/pacs-settings", icon: Settings2, label: "PACS Settings" },
      { path: "/radiology/pacs-logs", icon: FileText, label: "PACS Logs" },
    ],
  },
  {
    id: "billing-grp",
    icon: Receipt,
    label: "Billing & Payments",
    children: [
      { path: "/billing", icon: Receipt, label: "Bills" },
      { path: "/dues", icon: AlertCircle, label: "Due Payments" },
      { path: "/payments", icon: CreditCard, label: "Payments" },
      { path: "/orders", icon: ClipboardList, label: "Orders" },
    ],
  },
  { path: "/reports", icon: BarChart3, label: "Reports" },
  { path: "/report-generator", icon: FilePen, label: "Report Generator" },
  { path: "/report-hub", icon: FileText, label: "Report Hub" },
  { path: "/expenses", icon: TrendingDown, label: "Expenses" },
  {
    id: "staff-grp",
    icon: Fingerprint,
    label: "Staff",
    children: [
      { path: "/staff", icon: Fingerprint, label: "Staff Directory" },
      { path: "/hr-forms", icon: FilePen, label: "HR Forms" },
    ],
  },
  { path: "/accounting", icon: BookOpen, label: "Accounting" },
  { path: "/day-close", icon: Lock, label: "Day Close", ownerOnly: true },
  { path: "/books-sanity", icon: ShieldCheck, label: "Books Sanity (CA)", ownerOnly: true },
  { path: "/form-f", icon: FileText, label: "Form F (PCPNDT)" },
  { path: "/website", icon: Globe, label: "Website Builder" },
  {
    id: "imaging-grp",
    icon: Monitor,
    label: "Imaging",
    children: [
      { path: "/pacs", icon: Monitor, label: "PACS Viewer" },
      { path: "/dicom-nodes", icon: Server, label: "DICOM Nodes" },
    ],
  },
  { path: "/machines", icon: Wrench, label: "Machines" },
  {
    id: "settings-grp",
    icon: Settings2,
    label: "Settings",
    children: [
      { path: "/settings", icon: Settings2, label: "General Settings" },
      { path: "/tests", icon: FlaskConical, label: "Test Catalog" },
      { path: "/outsourced-labs", icon: Building2, label: "Outsourced Labs" },
      { path: "/packages", icon: Boxes, label: "Packages" },
      { path: "/inventory", icon: Package, label: "Inventory" },
      { path: "/discounts", icon: Tag, label: "Discounts" },
      { path: "/referrals", icon: Stethoscope, label: "Doctors" },
      { path: "/system-update", icon: Download, label: "System Update" },
    ],
  },
];

// Flat list of every leaf path (used for the mobile header label lookup).
const flatNavLeaves = (items: NavEntry[]): NavLeaf[] =>
  items.flatMap((n) => (isGroup(n) ? n.children : [n]));

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
  // Module B: clinic name centralization — pull from /api/clinic-settings so the
  // sidebar branding matches every other clinic-aware surface (BillDetail, Display, FormF).
  const { data: clinic } = useQuery<{ name?: string; tagline?: string; sidebarTheme?: string }>({
    queryKey: ["clinic-settings-public"],
    queryFn: () => api.get("/api/clinic-settings"),
    staleTime: 60_000,
  });

  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();
  const [autoMinimise] = useState(() => localStorage.getItem("sidebarAutoMinimise") === "1");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebarAutoMinimise") === "1");
  const session = readStaffSession();

  // Pass the login-time DB value so the hook seeds localStorage on a fresh device.
  // Effective theme reads purely from localStorage (via userTheme) after seeding so
  // changes and resets take effect immediately without re-login.
  const { userTheme, setTheme: setUserTheme } = useUserTheme(session?.user.id, session?.user.sidebarTheme);
  const effectiveThemeId = userTheme ?? clinic?.sidebarTheme ?? "navy";
  const theme = resolveTheme(effectiveThemeId);

  const { updateAvailable, dismiss: dismissUpdate } = useVersionCheck();
  const isOnline = useOnlineStatus();

  // Mini sidebar theme picker state
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const themePickerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!themePickerOpen) return;
    const close = (e: MouseEvent) => {
      if (themePickerRef.current && !themePickerRef.current.contains(e.target as Node)) {
        setThemePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [themePickerOpen]);

  // Filter nav by permissions when a staff session exists. For groups, drop
  // children the user can't access; hide the group entirely if nothing left.
  const visibleNav: NavEntry[] = navItems.flatMap<NavEntry>((n) => {
    if (isGroup(n)) {
      const kids = n.children.filter((c) => canAccess(session, c.path));
      return kids.length ? [{ ...n, children: kids }] : [];
    }
    // Owner-only items are only visible to admin / super_admin.
    if (n.ownerOnly && !FULL_ACCESS_ROLES.has(session?.user.role ?? "")) return [];
    return canAccess(session, n.path) ? [n] : [];
  });

  // Auto-expand any group containing the active route; let user toggle others.
  // The "Imaging" group is always default-open so DICOM Nodes / PACS Viewer
  // remain visible at a glance — they're easy to overlook when nested.
  const initialOpen: Record<string, boolean> = {};
  for (const n of visibleNav) {
    if (isGroup(n)) {
      const active = n.children.some((c) =>
        c.path === "/" ? location === "/" : location === c.path || location.startsWith(c.path + "/"),
      );
      initialOpen[n.id] = active || n.id === "imaging-grp";
    }
  }
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(initialOpen);
  // Re-expand active group on navigation.
  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const n of navItems) {
        if (!isGroup(n)) continue;
        const active = n.children.some((c) =>
          c.path === "/" ? location === "/" : location === c.path || location.startsWith(c.path + "/"),
        );
        if (active) next[n.id] = true;
      }
      return next;
    });
  }, [location]);

  // ── Super-admin USB pen-drive gate ──────────────────────────────────────
  // ZERO visible affordance. The Super Admin link only appears when:
  //   (a) the operator previously paired the pen-drive root via the hidden
  //       Ctrl+Alt+U combo (one-time per browser profile), AND
  //   (b) the pen drive is currently plugged in and `superadmin.key` reads
  //       successfully and matches the server secret.
  // Polled every 4s; on read failure the key is cleared and the link
  // disappears — so unplugging the drive logs the operator out instantly.
  const [usbKeyPresent, setUsbKeyPresent] = useState<boolean>(() => getStoredUsbKey() !== null);
  const [usbGateEnforced, setUsbGateEnforced] = useState<boolean>(true);
  const [pairDialog, setPairDialog] = useState<null | { busy: boolean; error: string | null; mode: "fs" | "file" }>(null);
  const usbFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void fetchUsbGateEnforced().then(setUsbGateEnforced);
    const off = onUsbKeyChange(() => setUsbKeyPresent(getStoredUsbKey() !== null));
    return off;
  }, []);

  // Auto-detect loop: re-read superadmin.key from the paired pen drive every
  // few seconds. Cleanly hides the Super Admin link when the drive is pulled.
  useEffect(() => {
    if (!usbGateEnforced) return;
    let stopped = false;
    let lastKey: string | null = null;
    const tick = async () => {
      if (stopped) return;
      const key = await tryReadKeyFromPairedDir();
      if (stopped) return;
      if (!key) {
        if (getStoredUsbKey() !== null) clearUsbKey();
        lastKey = null;
        return;
      }
      if (key === lastKey && getStoredUsbKey() !== null) return;
      const ok = await verifyUsbKey(key);
      if (stopped) return;
      if (ok) { storeUsbKey(key); lastKey = key; }
      else { if (getStoredUsbKey() !== null) clearUsbKey(); lastKey = null; }
    };
    void tick();
    const id = window.setInterval(() => { void tick(); }, 4000);
    return () => { stopped = true; window.clearInterval(id); };
  }, [usbGateEnforced]);

  // Hidden pairing trigger: Ctrl+Alt+U opens the one-time setup modal.
  // Operators who don't know the combo can't see anything related to USB.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && (e.key === "u" || e.key === "U")) {
        e.preventDefault();
        setPairDialog({ busy: false, error: null, mode: isFsAccessSupported() ? "fs" : "file" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onPairFs = async () => {
    setPairDialog((p) => p ? { ...p, busy: true, error: null } : p);
    try {
      const alreadyPaired = await hasPairedPenDrive();
      if (alreadyPaired) {
        const ok = await ensurePairedDirPermission();
        if (!ok) {
          setPairDialog((p) => p ? { ...p, busy: false, error: "Permission denied. Try Re-pair." } : p);
          return;
        }
      } else {
        await pairPenDrive();
      }
      const key = await tryReadKeyFromPairedDir();
      if (!key) { setPairDialog((p) => p ? { ...p, busy: false, error: "superadmin.key not found on the chosen folder." } : p); return; }
      const ok = await verifyUsbKey(key);
      if (!ok) { setPairDialog((p) => p ? { ...p, busy: false, error: "Key file does not match the server secret." } : p); return; }
      storeUsbKey(key);
      setPairDialog(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Pairing failed.";
      setPairDialog((p) => p ? { ...p, busy: false, error: msg } : p);
    }
  };

  const onUnpair = async () => {
    setPairDialog((p) => p ? { ...p, busy: true, error: null } : p);
    await unpairPenDrive();
    setPairDialog((p) => p ? { ...p, busy: false, error: "Pen drive unpaired. Pair again to continue." } : p);
  };

  const onUsbFileChosen = async (file: File) => {
    setPairDialog((p) => p ? { ...p, busy: true, error: null } : p);
    try {
      const key = await readKeyFile(file);
      if (!key) { setPairDialog((p) => p ? { ...p, busy: false, error: "Empty key file." } : p); return; }
      const ok = await verifyUsbKey(key);
      if (!ok) { setPairDialog((p) => p ? { ...p, busy: false, error: "Invalid USB key." } : p); return; }
      storeUsbKey(key);
      setPairDialog(null);
    } finally {
      if (usbFileRef.current) usbFileRef.current.value = "";
    }
  };

  const openSuperAdmin = () => {
    const url = `${window.location.origin}/super-admin-portal/`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

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
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Desktop sidebar — hidden on mobile via conditional render so there's
          no Tailwind display-utility conflict between "flex" and "hidden" */}
      {!isMobile && (
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-30 flex flex-col border-r border-sidebar-border transition-all duration-200 relative overflow-hidden",
          sidebarCollapsed ? "w-14" : "w-60",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        style={{ background: theme.gradient }}
      >
        {/* Soft top glow orb */}
        <div className="absolute top-0 left-0 w-full h-48 pointer-events-none z-0"
          style={{ background: theme.glow }} />
        {/* Subtle bottom color hint */}
        <div className="absolute bottom-0 left-0 w-full h-32 pointer-events-none z-0"
          style={{ background: theme.bottomHint }} />

        {/* Logo */}
        <div className={cn("flex items-center border-b border-sidebar-border relative z-10", sidebarCollapsed ? "justify-center px-0 py-4 flex-col gap-2" : "gap-3 px-5 py-5")} style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)", boxShadow: "0 4px 14px rgba(59,130,246,0.4)" }}>
            <Activity size={20} className="text-white" />
          </div>
          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-base font-bold text-sidebar-foreground leading-tight tracking-tight truncate">{clinic?.name || "DiagnoCenter"}</div>
              <div className="text-[11px] uppercase tracking-wider text-sidebar-foreground/60 font-medium">{clinic?.tagline || "Billing ERP"}</div>
            </div>
          )}
          {/* Collapse toggle — desktop only */}
          <button
            className={cn("hidden lg:flex items-center justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-white/10 transition-colors rounded-md p-1", sidebarCollapsed ? "" : "ml-auto")}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setSidebarCollapsed((c) => !c)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
          <button className={cn("lg:hidden text-sidebar-foreground", sidebarCollapsed ? "" : "ml-auto")} onClick={() => setSidebarOpen(false)}>
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className={cn("flex-1 py-4 space-y-0.5 overflow-y-auto relative z-10", sidebarCollapsed ? "px-1" : "px-3")}>
          {visibleNav.map((entry) => {
            if (!isGroup(entry)) {
              const { path, icon: Icon, label } = entry;
              const isActive = path === "/" ? location === "/" : location === path || location.startsWith(path + "/");
              return (
                <Link
                  key={path}
                  href={path}
                  title={sidebarCollapsed ? label : undefined}
                  onClick={() => { setSidebarOpen(false); if (autoMinimise) setSidebarCollapsed(true); }}
                  className={cn(
                    "flex items-center rounded-lg text-sm font-medium transition-all cursor-pointer",
                    sidebarCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                    isActive
                      ? "text-white font-semibold"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-white/10",
                  )}
                  style={isActive ? { background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" } : { border: "1px solid transparent" }}
                >
                  <Icon size={15} />
                  {!sidebarCollapsed && label}
                  {!sidebarCollapsed && isActive && <div className="ml-auto w-1.5 h-4 rounded-full" style={{ background: theme.accent, boxShadow: `0 0 6px ${theme.accent}b0` }} />}
                </Link>
              );
            }

            const { id, icon: GroupIcon, label, children } = entry;
            const groupActive = children.some((c) =>
              c.path === "/" ? location === "/" : location === c.path || location.startsWith(c.path + "/"),
            );
            const open = openGroups[id] ?? groupActive;

            if (sidebarCollapsed) {
              // Collapsed: show each child as an icon-only link (no group header)
              return (
                <div key={id} className="space-y-0.5">
                  {children.map(({ path, icon: ChildIcon, label: childLabel }) => {
                    const isActive = path === "/" ? location === "/" : location === path || location.startsWith(path + "/");
                    return (
                      <Link
                        key={path}
                        href={path}
                        title={childLabel}
                        onClick={() => { setSidebarOpen(false); if (autoMinimise) setSidebarCollapsed(true); }}
                        className={cn(
                          "flex items-center justify-center px-0 py-2 rounded-md transition-all cursor-pointer",
                          isActive ? "text-white font-semibold" : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-white/10",
                        )}
                        style={isActive ? { background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" } : { border: "1px solid transparent" }}
                      >
                        <ChildIcon size={13} />
                      </Link>
                    );
                  })}
                </div>
              );
            }

            return (
              <div key={id}>
                <button
                  type="button"
                  onClick={() => setOpenGroups((prev) => ({ ...prev, [id]: !open }))}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer",
                    groupActive
                      ? "text-white"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-white/10",
                  )}
                  style={groupActive ? { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" } : { border: "1px solid transparent" }}
                  aria-expanded={open}
                >
                  <GroupIcon size={15} />
                  <span className="flex-1 text-left">{label}</span>
                  <ChevronRight
                    size={13}
                    className={cn("transition-transform duration-150", open && "rotate-90")}
                  />
                </button>
                {open && (
                  <div className="mt-0.5 ml-4 pl-2 border-l space-y-0.5" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
                    {children.map(({ path, icon: ChildIcon, label: childLabel }) => {
                      const isActive = path === "/" ? location === "/" : location === path || location.startsWith(path + "/");
                      return (
                        <Link
                          key={path}
                          href={path}
                          onClick={() => { setSidebarOpen(false); if (autoMinimise) setSidebarCollapsed(true); }}
                          className={cn(
                            "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer",
                            isActive
                              ? "text-white font-semibold"
                              : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-white/10",
                          )}
                          style={isActive ? { background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" } : { border: "1px solid transparent" }}
                        >
                          <ChildIcon size={13} />
                          {childLabel}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Super-admin USB gate — appears ONLY when the paired pen drive is
            currently plugged in and superadmin.key validates. There is no
            "insert" button: the auto-detect loop handles everything. */}
        {usbGateEnforced && usbKeyPresent && (
          <div className="px-3 py-2 border-t border-sidebar-border relative z-10" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
            <button
              onClick={openSuperAdmin}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-200 hover:bg-amber-500/25 transition-colors"
              title="Open Super Admin Portal in a new tab"
            >
              <ShieldAlert size={13} />
              Super Admin
              <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-amber-300/80">
                <Usb size={10} /> KEY
              </span>
            </button>
          </div>
        )}

        {/* Signed-in user profile block — theme picker lives here when logged in */}
        {session && (
          <div className={cn("py-3 border-t relative z-10", sidebarCollapsed ? "px-1" : "px-3")} ref={themePickerRef} style={{ borderColor: "rgba(255,255,255,0.1)" }}>
            <div className={cn("flex items-center rounded-lg", sidebarCollapsed ? "flex-col gap-1 px-0 py-1" : "gap-2.5 px-2 py-2")} style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)", boxShadow: "0 0 10px rgba(59,130,246,0.35)" }}>
                {initials}
              </div>
              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-sidebar-foreground truncate">{session.user.name}</p>
                  <p className="text-[10px] text-sidebar-foreground/60 capitalize truncate">{session.user.role.replace("_", " ")}</p>
                </div>
              )}
              {/* Per-user theme swatch — visible to all staff; click to open picker */}
              <button
                onClick={() => setThemePickerOpen((o) => !o)}
                className="w-5 h-5 rounded-full shrink-0 ring-2 ring-white/30 hover:ring-white/70 transition-all cursor-pointer"
                style={{ background: theme.gradient }}
                title="My sidebar color — click to change"
                aria-label="Pick my sidebar theme"
              />
              <button
                onClick={onLogout}
                title="Sign out"
                className="p-1.5 rounded-md text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors shrink-0"
              >
                <LogOut size={14} />
              </button>
            </div>
            {/* Theme picker popup — positioned above the profile block */}
            {themePickerOpen && (
              <div
                className="absolute bottom-full left-3 right-3 mb-2 z-50 rounded-xl border border-white/20 p-3 shadow-2xl"
                style={{ background: "rgba(15,20,40,0.96)", backdropFilter: "blur(10px)" }}
              >
                <p className="text-[11px] font-semibold text-sidebar-foreground/60 uppercase tracking-wider mb-2 px-1">My Sidebar Color</p>
                <div className="grid grid-cols-3 gap-2">
                  {SIDEBAR_THEMES.map((preset) => {
                    const active = effectiveThemeId === preset.id;
                    const isPersonal = userTheme === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        title={preset.label}
                        onClick={() => { setUserTheme(preset.id); setThemePickerOpen(false); }}
                        className="relative rounded-lg overflow-hidden focus:outline-none"
                        style={{ border: active ? "2px solid rgba(255,255,255,0.8)" : "2px solid rgba(255,255,255,0.15)", transition: "border-color 0.15s" }}
                      >
                        <div className="h-10 w-full" style={{ background: preset.gradient }} />
                        <div className="py-1 px-1 text-center" style={{ background: "rgba(0,0,0,0.4)" }}>
                          <span className="text-[9px] font-medium text-white/80 truncate block leading-tight">{preset.label}</span>
                          {isPersonal && <span className="text-[8px] text-blue-300 leading-tight block">mine</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {userTheme && (
                  <button
                    type="button"
                    onClick={() => { clearUserTheme(session.user.id); setThemePickerOpen(false); }}
                    className="mt-2 w-full text-[10px] text-sidebar-foreground/50 hover:text-sidebar-foreground/80 transition-colors text-center"
                  >
                    Reset to clinic default
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className={cn("py-3 border-t flex items-center relative z-10", sidebarCollapsed ? "px-1 justify-center" : "px-4 justify-between")} style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          {!sidebarCollapsed && <span className="text-xs text-sidebar-foreground/40">v1.0.0</span>}
          <div className="flex items-center gap-1">
            {/* Palette button shown in footer only when no session (profile block has it when logged in) */}
            {!session && (
              <div className="relative" ref={themePickerRef}>
                <button
                  onClick={() => setThemePickerOpen((o) => !o)}
                  className="p-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                  title="My sidebar theme"
                  aria-label="Pick my sidebar theme"
                >
                  <Palette size={16} />
                </button>
                {themePickerOpen && (
                  <div
                    className="absolute bottom-full mb-2 right-0 z-50 rounded-xl border border-white/20 p-3 shadow-2xl"
                    style={{ background: "rgba(15,20,40,0.96)", backdropFilter: "blur(10px)", minWidth: 220 }}
                  >
                    <p className="text-[11px] font-semibold text-sidebar-foreground/60 uppercase tracking-wider mb-2 px-1">Sidebar Color</p>
                    <div className="grid grid-cols-3 gap-2">
                      {SIDEBAR_THEMES.map((preset) => {
                        const active = effectiveThemeId === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            title={preset.label}
                            onClick={() => { setThemePickerOpen(false); }}
                            className="relative rounded-lg overflow-hidden focus:outline-none"
                            style={{ border: active ? "2px solid rgba(255,255,255,0.8)" : "2px solid rgba(255,255,255,0.15)", transition: "border-color 0.15s" }}
                          >
                            <div className="h-10 w-full" style={{ background: preset.gradient }} />
                            <div className="py-1 px-1 text-center" style={{ background: "rgba(0,0,0,0.4)" }}>
                              <span className="text-[9px] font-medium text-white/80 truncate block leading-tight">{preset.label}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            <FullscreenToggle />
            <ThemeToggle />
          </div>
        </div>
      </aside>
      )}

      {isMobile && (
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-sidebar-border transition-transform duration-200 overflow-hidden w-60",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
          style={{ background: theme.gradient }}
        >
          <div className="absolute top-0 left-0 w-full h-48 pointer-events-none z-0" style={{ background: theme.glow }} />
          <div className="absolute bottom-0 left-0 w-full h-32 pointer-events-none z-0" style={{ background: theme.bottomHint }} />
          <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border relative z-10" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)", boxShadow: "0 4px 14px rgba(59,130,246,0.4)" }}>
              <Activity size={20} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base font-bold text-sidebar-foreground leading-tight tracking-tight truncate">{clinic?.name || "DiagnoCenter"}</div>
              <div className="text-[11px] uppercase tracking-wider text-sidebar-foreground/60 font-medium">{clinic?.tagline || "Billing ERP"}</div>
            </div>
            <button className="text-sidebar-foreground ml-auto" onClick={() => setSidebarOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <nav className="flex-1 py-4 space-y-0.5 overflow-y-auto relative z-10 px-3">
            {visibleNav.map((entry) => {
              if (!isGroup(entry)) {
                const { path, icon: Icon, label } = entry;
                const isActive = path === "/" ? location === "/" : location === path || location.startsWith(path + "/");
                return (
                  <Link
                    key={path}
                    href={path}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer",
                      isActive ? "text-white font-semibold" : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-white/10"
                    )}
                    style={isActive ? { background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" } : { border: "1px solid transparent" }}
                  >
                    <Icon size={15} />
                    {label}
                  </Link>
                );
              }

              const { id, icon: GroupIcon, label, children } = entry;
              const groupActive = children.some((c) =>
                c.path === "/" ? location === "/" : location === c.path || location.startsWith(c.path + "/"),
              );
              const open = openGroups[id] ?? groupActive;

              return (
                <div key={id}>
                  <button
                    type="button"
                    onClick={() => setOpenGroups((prev) => ({ ...prev, [id]: !open }))}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer",
                      groupActive ? "text-white" : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-white/10",
                    )}
                    style={groupActive ? { background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" } : { border: "1px solid transparent" }}
                    aria-expanded={open}
                  >
                    <GroupIcon size={15} />
                    <span className="flex-1 text-left">{label}</span>
                    <ChevronRight size={13} className={cn("transition-transform duration-150", open && "rotate-90")} />
                  </button>
                  {open && (
                    <div className="mt-0.5 ml-4 pl-2 border-l space-y-0.5" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
                      {children.map(({ path, icon: ChildIcon, label: childLabel }) => {
                        const isActive = path === "/" ? location === "/" : location === path || location.startsWith(path + "/");
                        return (
                          <Link
                            key={path}
                            href={path}
                            onClick={() => setSidebarOpen(false)}
                            className={cn(
                              "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-all cursor-pointer",
                              isActive ? "text-white font-semibold" : "text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-white/10",
                            )}
                            style={isActive ? { background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" } : { border: "1px solid transparent" }}
                          >
                            <ChildIcon size={13} />
                            {childLabel}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile/tablet) */}
        <header className={cn(!isMobile && "hidden", "sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80")}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-foreground p-1.5 -ml-1.5 rounded-md hover:bg-muted active:bg-muted/80 transition-colors"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}>
              <Activity size={14} className="text-white" />
            </div>
            <span className="font-semibold text-sm truncate">
              {flatNavLeaves(visibleNav).find(n => n.path === "/" ? location === "/" : location === n.path || location.startsWith(n.path + "/"))?.label ?? "DiagnoCenter"}
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

        {/* Offline indicator — shown when the browser loses network connectivity.
            Data is still visible from the service-worker cache; writes are blocked. */}
        {!isOnline && (
          <div className="flex items-center gap-2 bg-slate-800 dark:bg-slate-900 border-b border-slate-600 px-4 py-2 text-sm text-slate-100">
            <WifiOff size={14} className="shrink-0 text-slate-300" />
            <span className="font-medium">You are offline.</span>
            <span className="text-slate-300 text-xs hidden sm:inline">
              Cached data is shown — changes will not save until the connection is restored.
            </span>
          </div>
        )}

        {/* New-version notification bar — shown when a deployment has been pushed
            since the user opened this tab. Soft prompt, never auto-reloads. */}
        {updateAvailable && (
          <div className="flex items-center justify-between gap-3 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-sm">
            <span className="text-amber-800 dark:text-amber-200 font-medium">
              A new version of the ERP is available.
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => window.location.reload()}
                className="rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1 transition-colors"
              >
                Reload now
              </button>
              <button
                onClick={dismissUpdate}
                className="rounded-md border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-xs px-3 py-1 transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Hidden pen-drive pairing dialog (Ctrl+Alt+U). Not announced anywhere
          in the UI. Re-pair flow lives here too. */}
      {pairDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !pairDialog.busy && setPairDialog(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert size={18} className="text-amber-500" />
              <h2 className="text-sm font-semibold">Pair super-admin pen drive</h2>
            </div>
            {pairDialog.mode === "fs" ? (
              <>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  Plug in the pen drive, then pick its root folder. The folder
                  is remembered on this PC only — the Super Admin link will
                  appear automatically while the drive is plugged in, and
                  disappear when you remove it.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={onPairFs} disabled={pairDialog.busy} className="flex-1">
                    {pairDialog.busy ? "Working…" : "Pick pen-drive folder"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={onUnpair} disabled={pairDialog.busy}>
                    Re-pair
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  This browser doesn't support auto-detect. Pick
                  <code className="mx-1 px-1 rounded bg-muted">superadmin.key</code>
                  from the pen drive each session.
                </p>
                <input
                  ref={usbFileRef}
                  type="file"
                  accept=".key,text/plain,application/octet-stream"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onUsbFileChosen(f);
                  }}
                />
                <Button size="sm" onClick={() => usbFileRef.current?.click()} disabled={pairDialog.busy} className="w-full">
                  {pairDialog.busy ? "Verifying…" : "Choose superadmin.key"}
                </Button>
              </>
            )}
            {pairDialog.error && (
              <p className="text-[11px] text-destructive mt-3">{pairDialog.error}</p>
            )}
            <button
              onClick={() => !pairDialog.busy && setPairDialog(null)}
              className="mt-4 w-full text-[11px] text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
