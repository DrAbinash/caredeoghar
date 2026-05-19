import { useSyncStatus, incrementPendingSyncCount } from "@/hooks/useSyncStatus";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { RefreshCw, WifiOff, CloudOff, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCallback, useState } from "react";

export function SyncPanel() {
  const isOnline = useOnlineStatus();
  const { pendingCount, lastSyncedAt, isSyncing, lastError, triggerSync } = useSyncStatus();
  const [justTriggered, setJustTriggered] = useState(false);

  const handleSync = useCallback(() => {
    setJustTriggered(true);
    triggerSync();
    setTimeout(() => setJustTriggered(false), 2000);
  }, [triggerSync]);

  const lastSyncText = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "Never";

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2.5 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isOnline ? (
            <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
          ) : (
            <CloudOff size={14} className="text-slate-400 shrink-0" />
          )}
          <span className="font-medium">
            {isOnline ? "Cloud connected" : "Offline mode"}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Clock size={11} />
          Last sync: {lastSyncText}
        </span>
      </div>

      {!isOnline && pendingCount > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2.5 py-2 text-xs">
          <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-medium text-amber-800 dark:text-amber-200">
              {pendingCount} change{pendingCount === 1 ? "" : "s"} queued locally
            </p>
            <p className="text-amber-700 dark:text-amber-300/80">
              Bills, orders, and tests will sync automatically when you reconnect.
            </p>
          </div>
        </div>
      )}

      {lastError && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-2.5 py-2 text-xs text-red-700 dark:text-red-300">
          <WifiOff size={13} className="shrink-0 mt-0.5" />
          <span className="font-medium">Sync failed:</span> {lastError}
        </div>
      )}

      <button
        onClick={handleSync}
        disabled={!isOnline || isSyncing || justTriggered}
        className={cn(
          "w-full flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors",
          !isOnline || isSyncing || justTriggered
            ? "bg-muted text-muted-foreground cursor-not-allowed"
            : "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80"
        )}
      >
        <RefreshCw size={13} className={cn(isSyncing && "animate-spin")} />
        {isSyncing ? "Syncing…" : justTriggered ? "Sync requested" : "Sync now"}
      </button>
    </div>
  );
}

/**
 * Compact inline badge showing pending sync count.
 */
export function SyncBadge() {
  const { pendingCount, isSyncing } = useSyncStatus();
  if (pendingCount === 0 && !isSyncing) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        isSyncing
          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
          : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
      )}
      title={isSyncing ? "Syncing…" : `${pendingCount} pending change${pendingCount === 1 ? "" : "s"}`}
    >
      <RefreshCw size={10} className={cn(isSyncing && "animate-spin")} />
      {isSyncing ? "Syncing" : pendingCount}
    </span>
  );
}
