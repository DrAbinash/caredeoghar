import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { fetchApi } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  ScanSearch,
  Calendar,
  User,
  RefreshCw,
  ChevronRight,
  Activity,
  Search,
  Stethoscope,
  ArrowLeft,
} from "lucide-react";
import { useLocation as useWouterLocation } from "wouter";

interface WorklistEntry {
  id: number;
  studyInstanceUID: string | null;
  accessionNumber: string | null;
  patientName: string | null;
  patientId: string | null;
  studyDate: string | null;
  studyDescription: string | null;
  modality: string | null;
  status: string | null;
  referringPhysicianName: string | null;
  bodyPartExamined: string | null;
  numberOfSeries: number | null;
  numberOfInstances: number | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending:     "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300",
  in_progress: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300",
  completed:   "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300",
  reported:    "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300",
  cancelled:   "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400",
};

export default function UsgWorklist() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: allWorklist = [], isLoading, refetch } = useQuery<WorklistEntry[]>({
    queryKey: ["usg-worklist", refreshKey],
    queryFn: () => fetchApi("/api/radiology/worklist?limit=200"),
    staleTime: 30_000,
    select: (rows) => (Array.isArray(rows) ? rows : []).filter(
      (r) => r.modality === "US" || r.modality === "USG"
    ),
  });

  const filtered = allWorklist.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (r.patientName ?? "").toLowerCase().includes(q) ||
      (r.accessionNumber ?? "").toLowerCase().includes(q) ||
      (r.studyDescription ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="USG Worklist"
        subtitle="Ultrasound studies available for measurement extraction and reporting"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/usg")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> USG Dashboard
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => { setRefreshKey((k) => k + 1); void refetch(); }}
            >
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search patient / accession / description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Badge variant="outline" className="text-xs">
          {filtered.length} {filtered.length === 1 ? "study" : "studies"}
        </Badge>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Stethoscope className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground font-medium">No USG studies found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Studies with modality US/USG will appear here as they arrive from the PACS.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {filtered.map((entry) => (
          <Card
            key={entry.id}
            className="cursor-pointer group hover:border-primary/50 hover:shadow-md transition-all duration-150"
            onClick={() => {
              if (entry.studyInstanceUID) {
                navigate(`/usg/measurements/${entry.studyInstanceUID}`);
              }
            }}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-bold text-foreground text-sm group-hover:text-primary transition-colors">
                        {entry.patientName ?? "Unknown Patient"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {entry.studyDescription ?? "Ultrasound Study"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {entry.status && (
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${STATUS_COLORS[entry.status] ?? STATUS_COLORS.pending}`}>
                          {entry.status.replace(/_/g, " ").toUpperCase()}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    {entry.accessionNumber && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ScanSearch className="h-3 w-3" />
                        {entry.accessionNumber}
                      </span>
                    )}
                    {entry.studyDate && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {entry.studyDate}
                      </span>
                    )}
                    {entry.referringPhysicianName && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        {entry.referringPhysicianName}
                      </span>
                    )}
                    {entry.numberOfInstances && (
                      <span className="text-xs text-muted-foreground">
                        {entry.numberOfInstances} frames
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
