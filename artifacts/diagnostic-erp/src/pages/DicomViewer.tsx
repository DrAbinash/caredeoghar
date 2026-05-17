import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLink, MonitorPlay, Download, ArrowLeft, AlertTriangle, Settings,
  Tv2, ZoomIn,
} from "lucide-react";

interface ViewerLaunchData {
  studyInstanceUID: string;
  patientName?: string | null;
  accessionNumber?: string | null;
  viewerType: "OHIF" | "WEASIS";
  ohifUrl?: string | null;
  weasisUrl?: string | null;
  fallbackDicomWebUrl?: string | null;
  dicomWebBaseUrl?: string | null;
  wadoBaseUrl?: string | null;
  pacsType?: string;
  error?: string;
}

interface ViewerSettingsData {
  viewerMode?: string;
  defaultViewer?: string;
  weasisEnabled?: string;
  ohifEnabled?: string;
  viewerOpenMode?: string;
}

function WeasisInstallHint() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold text-amber-800 dark:text-amber-300">Weasis not detected</p>
          <p className="text-amber-700 dark:text-amber-400 mt-1">
            Install <strong>Weasis Viewer</strong> on this computer to open DICOM images.
          </p>
          <a
            href="https://weasis.org/en/getting-started/download/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-amber-700 underline font-medium"
          >
            Download Weasis <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}

export default function DicomViewer() {
  const { studyInstanceUID } = useParams<{ studyInstanceUID: string }>();
  const [, navigate] = useLocation();

  const ohifQuery = useQuery<ViewerLaunchData>({
    queryKey: ["ohif-launch", studyInstanceUID],
    queryFn: () => api.get(`/api/radiology/studies/${studyInstanceUID}/ohif-launch`),
    enabled: !!studyInstanceUID,
    staleTime: 60_000,
  });

  const weasisQuery = useQuery<ViewerLaunchData>({
    queryKey: ["weasis-launch", studyInstanceUID],
    queryFn: () => api.get(`/api/radiology/studies/${studyInstanceUID}/weasis-launch`),
    enabled: !!studyInstanceUID,
    staleTime: 60_000,
  });

  // Fetch viewer settings to determine display mode
  const settingsQuery = useQuery<Record<string, string>>({
    queryKey: ["pacs-viewer-settings"],
    queryFn: async () => {
      const rows = await api.get<{ key: string; value: string; category: string }[]>("/api/radiology/pacs-settings");
      const map: Record<string, string> = {};
      for (const r of rows) if (r.category === "viewer") map[r.key] = r.value;
      return map;
    },
    staleTime: 60_000,
  });

  const ohif = ohifQuery.data;
  const weasis = weasisQuery.data;
  const settings = settingsQuery.data ?? {};

  const viewerMode = settings["viewer_mode"] ?? "BOTH";
  const defaultViewer = settings["default_viewer"] ?? "OHIF";
  const ohifEnabled = settings["ohif_enabled"] !== "false";
  const weasisEnabled = settings["weasis_enabled"] !== "false";
  const openMode = settings["viewer_open_mode"] ?? "NEW_TAB";
  const allowEmbedded = openMode === "EMBEDDED";

  const patientName = ohif?.patientName ?? weasis?.patientName ?? null;
  const accessionNumber = ohif?.accessionNumber ?? weasis?.accessionNumber ?? null;

  const openOhif = () => {
    if (!ohif?.ohifUrl) return;
    window.open(ohif.ohifUrl, "_blank");
  };

  const openWeasis = () => {
    if (!weasis?.weasisUrl) return;
    window.open(weasis.weasisUrl, "_blank");
  };

  const loading = ohifQuery.isLoading || weasisQuery.isLoading;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="DICOM Viewer"
        subtitle={studyInstanceUID}
        actions={
          <Button variant="outline" size="sm" onClick={() => window.history.back()}>
            <ArrowLeft size={14} /> Back
          </Button>
        }
      />

      {/* Study metadata */}
      {(patientName || accessionNumber) && (
        <div className="rounded-xl border bg-card p-4 flex flex-wrap gap-4 text-sm">
          {patientName && (
            <div>
              <p className="text-xs text-muted-foreground">Patient</p>
              <p className="font-semibold uppercase">{patientName}</p>
            </div>
          )}
          {accessionNumber && (
            <div>
              <p className="text-xs text-muted-foreground">Accession #</p>
              <p className="font-mono font-semibold">{accessionNumber}</p>
            </div>
          )}
          {ohif?.pacsType && (
            <div>
              <p className="text-xs text-muted-foreground">PACS</p>
              <Badge variant="outline">{ohif.pacsType}</Badge>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border p-8 text-center text-muted-foreground text-sm">
          Loading viewer configuration…
        </div>
      )}

      {!loading && (
        <div className="space-y-4">
          {/* Primary action buttons */}
          <div className="flex flex-wrap gap-3">
            {/* OHIF button */}
            {ohifEnabled && (viewerMode === "OHIF" || viewerMode === "BOTH") && (
              <div className="flex flex-col gap-1">
                {ohif?.ohifUrl ? (
                  <>
                    <Button onClick={openOhif} className="gap-2 h-10 px-5" variant={defaultViewer === "OHIF" ? "default" : "outline"}>
                      <MonitorPlay size={16} />
                      {defaultViewer === "OHIF" ? "Open Viewer (OHIF)" : "Open in OHIF"}
                      <ExternalLink size={13} />
                    </Button>
                    {allowEmbedded && ohif.ohifUrl && (
                      <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={openOhif}>
                        <ZoomIn size={12} /> Open Full Screen
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground max-w-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle size={14} className="text-amber-500" />
                      <span className="font-medium">OHIF not configured</span>
                    </div>
                    <p className="text-xs">{ohif?.error ?? "Configure OHIF Base URL in PACS Settings → Viewer Settings."}</p>
                    <a href="/erp/radiology/pacs-settings" className="text-xs underline text-primary mt-1 inline-block">
                      Open PACS Settings <Settings size={10} className="inline" />
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Weasis button */}
            {weasisEnabled && (viewerMode === "WEASIS" || viewerMode === "BOTH") && (
              <div className="flex flex-col gap-1">
                {weasis?.weasisUrl && !weasis.error ? (
                  <Button onClick={openWeasis} className="gap-2 h-10 px-5" variant={defaultViewer === "WEASIS" ? "default" : "outline"}>
                    <Tv2 size={16} />
                    {defaultViewer === "WEASIS" ? "Open Viewer (Weasis)" : "Open in Weasis"}
                    <ExternalLink size={13} />
                  </Button>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground max-w-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle size={14} className="text-amber-500" />
                      <span className="font-medium">Weasis not configured</span>
                    </div>
                    <p className="text-xs">{weasis?.error ?? "Configure WADO URL in PACS Settings → Viewer Settings."}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Weasis install hint if no URL but Weasis is enabled */}
          {weasisEnabled && weasis?.weasisUrl && (
            <WeasisInstallHint />
          )}

          {/* Embedded OHIF iframe */}
          {allowEmbedded && ohif?.ohifUrl && (
            <div className="rounded-xl border overflow-hidden shadow-sm">
              <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">OHIF Viewer (embedded)</span>
                <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={openOhif}>
                  <ExternalLink size={11} /> Full Screen
                </Button>
              </div>
              <iframe
                src={ohif.ohifUrl}
                title="OHIF Viewer"
                className="w-full"
                style={{ height: "70vh", border: "none" }}
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-presentation"
              />
            </div>
          )}

          {/* Study UID technical info */}
          <div className="rounded-xl border bg-muted/20 p-4 text-xs space-y-1">
            <p className="font-semibold text-muted-foreground mb-2">Study Details</p>
            <p><span className="text-muted-foreground w-40 inline-block">Study Instance UID</span>
              <code className="bg-muted px-1 rounded">{studyInstanceUID}</code></p>
            {ohif?.dicomWebBaseUrl && (
              <p><span className="text-muted-foreground w-40 inline-block">DICOMweb Base URL</span>
                <code className="bg-muted px-1 rounded">{ohif.dicomWebBaseUrl}</code></p>
            )}
            {weasis?.wadoBaseUrl && (
              <p><span className="text-muted-foreground w-40 inline-block">WADO Base URL</span>
                <code className="bg-muted px-1 rounded">{weasis.wadoBaseUrl}</code></p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
