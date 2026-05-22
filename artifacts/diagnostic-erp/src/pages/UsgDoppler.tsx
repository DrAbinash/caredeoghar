import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { fetchApi } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { readStaffSession, FULL_ACCESS_ROLES } from "@/lib/staffSession";
import {
  Stethoscope,
  ScanSearch,
  FileText,
  Image,
  Activity,
  Settings2,
  ChevronRight,
  Waves,
  AlertCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface UsgStats {
  pendingWorklist: number;
  pendingMeasurements: number;
  approvedMeasurements: number;
  draftReports: number;
  finalizedReports: number;
  keyImages: number;
  pendingDoppler: number;
}

interface ModuleCard {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  path: string;
  gradient: string;
  iconBg: string;
  badgeKey?: keyof UsgStats;
  badgeLabel?: string;
  badgeVariant?: "default" | "destructive" | "secondary" | "outline";
  ownerOnly?: boolean;
}

const CARDS: ModuleCard[] = [
  {
    id: "worklist",
    title: "USG Worklist",
    description: "Pending ultrasound studies awaiting reporting, measurement extraction, and review.",
    icon: Stethoscope,
    path: "/usg/worklist",
    gradient: "from-indigo-50 via-blue-50 to-sky-50 dark:from-indigo-950/40 dark:via-blue-950/40 dark:to-sky-950/40",
    iconBg: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300",
    badgeKey: "pendingWorklist",
    badgeLabel: "Pending",
  },
  {
    id: "measurements",
    title: "USG Measurements",
    description: "AI-extracted measurements from DICOM SR and OCR — BPD, HC, FL, AFI, organ sizes and more.",
    icon: ScanSearch,
    path: "/usg/measurements",
    gradient: "from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-950/40 dark:via-teal-950/40 dark:to-cyan-950/40",
    iconBg: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300",
    badgeKey: "pendingMeasurements",
    badgeLabel: "Awaiting Review",
  },
  {
    id: "reporting",
    title: "USG Reporting",
    description: "Draft and finalize USG reports for OB, Pelvis, Abdomen, KUB, Thyroid with auto-fill from approved measurements.",
    icon: FileText,
    path: "/usg/reporting",
    gradient: "from-amber-50 via-orange-50 to-yellow-50 dark:from-amber-950/40 dark:via-orange-950/40 dark:to-yellow-950/40",
    iconBg: "bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-300",
    badgeKey: "draftReports",
    badgeLabel: "Drafts",
  },
  {
    id: "key-images",
    title: "USG Key Images",
    description: "Curated key frames selected by the sonologist for inclusion in the final report.",
    icon: Image,
    path: "/usg/key-images",
    gradient: "from-violet-50 via-purple-50 to-fuchsia-50 dark:from-violet-950/40 dark:via-purple-950/40 dark:to-fuchsia-950/40",
    iconBg: "bg-violet-100 text-violet-600 dark:bg-violet-900/50 dark:text-violet-300",
    badgeKey: "keyImages",
    badgeLabel: "Images",
    badgeVariant: "secondary",
  },
  {
    id: "doppler",
    title: "Doppler Reporting",
    description: "Structured Doppler velocimetry — PSV, EDV, RI, PI, S/D ratio per vessel with confidence scoring.",
    icon: Activity,
    path: "/usg/doppler",
    gradient: "from-rose-50 via-pink-50 to-red-50 dark:from-rose-950/40 dark:via-pink-950/40 dark:to-red-950/40",
    iconBg: "bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-300",
    badgeKey: "pendingDoppler",
    badgeLabel: "Pending",
  },
  {
    id: "settings",
    title: "USG Extraction Settings",
    description: "Configure AI pipeline — OCR, SR priority, confidence thresholds, auto-reject, machine profiles.",
    icon: Settings2,
    path: "/usg/settings",
    gradient: "from-slate-50 via-gray-50 to-zinc-50 dark:from-slate-950/40 dark:via-gray-950/40 dark:to-zinc-950/40",
    iconBg: "bg-slate-100 text-slate-600 dark:bg-slate-900/50 dark:text-slate-300",
    ownerOnly: true,
  },
];

export default function UsgDoppler() {
  const [, navigate] = useLocation();
  const session = readStaffSession();
  const isOwner = FULL_ACCESS_ROLES.has(session?.user.role ?? "");

  const { data: stats } = useQuery<UsgStats>({
    queryKey: ["usg-stats"],
    queryFn: () => fetchApi("/api/usg-extraction/stats"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const visibleCards = CARDS.filter((c) => !c.ownerOnly || isOwner);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="USG / DOPPLER"
        subtitle="Ultrasound & Doppler imaging workflow — AI extraction, measurement review, and report generation"
        actions={
          <div className="flex items-center gap-2">
            <Waves className="h-5 w-5 text-cyan-500" />
            <span className="text-sm text-muted-foreground font-medium">Module Dashboard</span>
          </div>
        }
      />

      {/* Summary strip */}
      {stats && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-1.5 rounded-full px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-semibold">
            <Clock className="h-3.5 w-3.5" />
            {stats.pendingMeasurements} measurements awaiting review
          </div>
          <div className="flex items-center gap-1.5 rounded-full px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {stats.approvedMeasurements} approved
          </div>
          {(stats.pendingWorklist > 0) && (
            <div className="flex items-center gap-1.5 rounded-full px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
              <AlertCircle className="h-3.5 w-3.5" />
              {stats.pendingWorklist} studies in worklist
            </div>
          )}
        </div>
      )}

      {/* Module cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {visibleCards.map((card) => {
          const Icon = card.icon;
          const count = card.badgeKey && stats ? stats[card.badgeKey] : undefined;

          return (
            <button
              key={card.id}
              onClick={() => navigate(card.path)}
              className={`
                group relative flex flex-col gap-4 p-5 rounded-2xl border border-border/60
                bg-gradient-to-br ${card.gradient}
                text-left cursor-pointer
                transition-all duration-200
                hover:shadow-lg hover:shadow-black/8 hover:scale-[1.015] hover:border-border
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
              `}
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${card.iconBg} shadow-sm`}>
                  <Icon className="h-5 w-5" />
                </div>

                {count !== undefined && count > 0 && (
                  <Badge
                    variant={card.badgeVariant ?? "default"}
                    className="text-xs font-bold flex-shrink-0"
                  >
                    {count} {card.badgeLabel}
                  </Badge>
                )}
                {count !== undefined && count === 0 && (
                  <Badge variant="outline" className="text-xs flex-shrink-0 text-muted-foreground">
                    {card.badgeLabel}: 0
                  </Badge>
                )}
              </div>

              <div className="space-y-1">
                <h3 className="font-bold text-foreground text-base leading-tight group-hover:text-primary transition-colors">
                  {card.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                  {card.description}
                </p>
              </div>

              <div className="flex items-center justify-end mt-auto">
                <span className="text-xs font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  Open <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>

              {/* Decorative background pulse on hover */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/[0.02] group-hover:to-primary/[0.04] transition-all duration-200 pointer-events-none" />
            </button>
          );
        })}
      </div>

      {/* Info footer */}
      <div className="rounded-xl border border-cyan-200/60 dark:border-cyan-800/40 bg-cyan-50/50 dark:bg-cyan-950/20 p-4">
        <div className="flex gap-3">
          <Waves className="h-5 w-5 text-cyan-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">USG / DOPPLER Module</p>
            <p>
              This module provides end-to-end ultrasound and Doppler workflow — from DICOM auto-extraction
              to measurement review, report drafting, and key image management.
              All extracted measurements require human approval before use in reports.
            </p>
            <p className="text-cyan-600 dark:text-cyan-400">
              Confidence coding: <span className="font-semibold text-green-600">Green = DICOM SR (high)</span> ·{" "}
              <span className="font-semibold text-yellow-600">Yellow = OCR (medium)</span> ·{" "}
              <span className="font-semibold text-red-600">Red = uncertain (low)</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
