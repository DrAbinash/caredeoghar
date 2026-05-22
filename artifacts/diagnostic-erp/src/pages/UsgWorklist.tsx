import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { fetchApi } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  ScanSearch, Calendar, User, RefreshCw, ChevronRight, Activity,
  Search, Stethoscope, ArrowLeft, Monitor, ExternalLink, FileText,
} from "lucide-react";

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
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [launching, setLaunching] = useState<string | null>(null);

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

  async function launchViewer(studyUid: string, viewer: "ohif" | "weasis") {
    setLaunching(`${studyUid}:${viewer}`);
    try {
      const data = await fetchApi<{ ohifUrl?: string | null; weasisUrl?: string | null; error?: string }>(
        `/api/radiology/studies/${encodeURIComponent(studyUid)}/${viewer}-launch`
      );
      if (data.error) {
        toast({ title: `${viewer.toUpperCase()} not configured`, description: data.error, variant: "destructive" });
        return;
      }
      const url = viewer === "ohif" ? data.ohifUrl : data.weasisUrl;
      if (!url) {
        toast({ title: `${viewer.toUpperCase()} launch failed`, description: "No URL returned.", variant: "destructive" });
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast({ title: `Failed to launch ${viewer.toUpperCase()}`, variant: "destructive" });
    } finally {
      setLaunching(null);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="USG Worklist"
        subtitle="Ultrasound studies — launch OHIF/Weasis, extract measurements, draft reports"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/usg")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> USG Dashboard
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setRefreshKey((k) => k + 1); void refetch(); }}>
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search patient / accession / description…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
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
        {filtered.map((entry) => {
          const uid = entry.studyInstanceUID;
          return (
            <Card key={entry.id} className="group hover:border-primary/50 hover:shadow-md transition-all duration-150">
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
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                      {entry.accessionNumber && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ScanSearch className="h-3 w-3" /> {entry.accessionNumber}
                        </span>
                      )}
                      {entry.studyDate && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" /> {entry.studyDate}
                        </span>
                      )}
                      {entry.referringPhysicianName && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" /> {entry.referringPhysicianName}
                        </span>
                      )}
                      {entry.numberOfInstances && (
                        <span className="text-xs text-muted-foreground">{entry.numberOfInstances} frames</span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 mt-3">
                      <Button size="sm" variant="default"
                        disabled={!uid}
                        onClick={() => uid && navigate(`/usg/measurements/${uid}`)}
                      >
                        <ScanSearch className="h-3.5 w-3.5 mr-1.5" /> Measurements
                        <ChevronRight className="h-3.5 w-3.5 ml-1 opacity-60" />
                      </Button>
                      <Button size="sm" variant="outline"
                        disabled={!uid || launching === `${uid}:ohif`}
                        onClick={() => uid && launchViewer(uid, "ohif")}
                      >
                        <Monitor className="h-3.5 w-3.5 mr-1.5" /> OHIF
                        <ExternalLink className="h-3 w-3 ml-1 opacity-60" />
                      </Button>
                      <Button size="sm" variant="outline"
                        disabled={!uid || launching === `${uid}:weasis`}
                        onClick={() => uid && launchViewer(uid, "weasis")}
                      >
                        <Monitor className="h-3.5 w-3.5 mr-1.5" /> Weasis
                        <ExternalLink className="h-3 w-3 ml-1 opacity-60" />
                      </Button>
                      <Button size="sm" variant="ghost"
                        onClick={() => navigate("/usg/reporting")}
                      >
                        <FileText className="h-3.5 w-3.5 mr-1.5" /> Draft Report
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
