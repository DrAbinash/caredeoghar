/**
 * Radiology Command Center — Phase 12
 * Dark enterprise UI, glass cards, animated live status indicators.
 * Aggregates all real-time metrics from /api/radiology-workflow/command-center
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Activity, Clock, AlertTriangle, Cpu, Wifi, WifiOff,
  Database, Users, BarChart3, AlertOctagon, Send, Zap,
  HardDrive, Gauge, Bell, RefreshCw, ShieldCheck, ArrowUpRight,
} from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

function useCommandCenter() {
  return useQuery({
    queryKey: ["command-center"],
    queryFn: () => api.get("/api/radiology-workflow/command-center"),
    refetchInterval: 5000,
  });
}

export default function RadiologyCommandCenter() {
  const { data, isLoading, refetch } = useCommandCenter();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const d = data;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-950 text-slate-100">
      <div className="px-6 py-5">
        <div className="flex items-center justify-between mb-6">
          <PageHeader
            title="Radiology Command Center"
            subtitle="Real-time RIS/PACS operations overview"
            icon={<Activity className="w-5 h-5 text-teal-400" />}
          />
          <Button variant="outline" size="sm" onClick={() => refetch()} className="border-slate-700 text-slate-300 hover:bg-slate-800">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Top KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <GlassCard label="Pending Reports" value={d?.pendingReports ?? "—"} icon={<Clock className="w-5 h-5 text-amber-400" />} tint="amber" />
          <GlassCard label="Critical Alerts" value={d?.criticalAlerts ?? "—"} icon={<AlertOctagon className="w-5 h-5 text-rose-400" />} tint="rose" />
          <GlassCard label="Studies Today" value={d?.studiesToday ?? "—"} icon={<Activity className="w-5 h-5 text-emerald-400" />} tint="emerald" />
          <GlassCard label="AI Queued" value={d?.aiQueue?.queued ?? "—"} icon={<Cpu className="w-5 h-5 text-cyan-400" />} tint="cyan" />
          <GlassCard label="AI Processing" value={d?.aiQueue?.processing ?? "—"} icon={<Zap className="w-5 h-5 text-violet-400" />} tint="violet" />
          <GlassCard label="Failed TX" value={d?.failedTransfers ?? "—"} icon={<AlertTriangle className="w-5 h-5 text-rose-400" />} tint="rose" />
        </div>

        {/* Second row: modalities + storage + users */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Live Modalities */}
          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Wifi className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-slate-200">Live Modalities</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {d?.modalities?.map((m: any) => (
                <ModalityTile key={m.modality} modality={m} />
              )) ?? (
                <span className="text-slate-500 text-sm col-span-full">No modality data</span>
              )}
            </div>
          </div>

          {/* Storage Snapshot */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Database className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-200">Storage</h3>
            </div>
            {d?.storage ? (
              <div className="space-y-3">
                <StorageBar label="Hot" value={d.storage.hot} total={d.storage.total} color="bg-emerald-500" />
                <StorageBar label="Archive" value={d.storage.archive} total={d.storage.total} color="bg-cyan-500" />
                <StorageBar label="Orphans" value={d.storage.orphans} total={d.storage.total} color="bg-amber-500" />
              </div>
            ) : (
              <span className="text-slate-500 text-sm">No storage data</span>
            )}
            <Button variant="ghost" size="sm" className="mt-3 text-cyan-400 hover:text-cyan-300" onClick={() => navigate("/radiology/storage-lifecycle")}>
              Manage Storage <ArrowUpRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </div>

        {/* Bottom: quick action tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickActionTile icon={<Cpu className="w-5 h-5" />} label="AI Pipeline" path="/radiology/ai-pipeline" navigate={navigate} />
          <QuickActionTile icon={<HardDrive className="w-5 h-5" />} label="Acquisition Gateway" path="/radiology/acquisition-gateway" navigate={navigate} />
          <QuickActionTile icon={<Clock className="w-5 h-5" />} label="MWL Manager" path="/radiology/mwl-manager" navigate={navigate} />
          <QuickActionTile icon={<AlertTriangle className="w-5 h-5" />} label="Critical Alerts" path="/radiology/critical-alerts" navigate={navigate} />
        </div>
      </div>
    </div>
  );
}

function GlassCard({ label, value, icon, tint }: any) {
  const glowMap: Record<string, string> = {
    amber: "shadow-amber-500/10",
    rose: "shadow-rose-500/10",
    emerald: "shadow-emerald-500/10",
    cyan: "shadow-cyan-500/10",
    violet: "shadow-violet-500/10",
  };
  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm p-4 shadow-lg ${glowMap[tint] ?? ""}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold text-slate-100">{value}</div>
    </div>
  );
}

function ModalityTile({ modality }: any) {
  const online = modality.online > 0;
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 flex flex-col items-center gap-1">
      <div className={`w-2.5 h-2.5 rounded-full ${online ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`} />
      <span className="text-xs font-bold text-slate-200">{modality.modality}</span>
      <span className="text-[10px] text-slate-500">{modality.online}/{modality.total}</span>
    </div>
  );
}

function StorageBar({ label, value, total, color }: any) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-300">{value}</span>
      </div>
      <div className="h-2 rounded bg-slate-800 overflow-hidden">
        <div className={`h-full rounded ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function QuickActionTile({ icon, label, path, navigate }: any) {
  return (
    <button
      onClick={() => navigate(path)}
      className="rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm p-4 text-left hover:bg-slate-800/80 transition-colors flex items-center gap-3"
    >
      <div className="text-slate-400">{icon}</div>
      <span className="text-sm font-medium text-slate-300">{label}</span>
    </button>
  );
}
