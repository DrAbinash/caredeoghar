// Phase 8: Teaching Research Mode
// Track research candidates, publications, and conference submissions.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  FlaskConical, ArrowLeft, FileText, ExternalLink, Calendar,
  CheckCircle2, Clock, AlertCircle, Plus, Search, BookOpen,
} from "lucide-react";

interface ResearchCase {
  id: number;
  title: string;
  diagnosis: string | null;
  category: string;
  modality: string | null;
  bodyPart: string | null;
  researchStatus: string | null;
  publicationReference: string | null;
  conferenceName: string | null;
  createdByName: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  candidate: "Research Candidate",
  in_review: "In Review",
  submitted: "Submitted",
  accepted: "Accepted",
  published: "Published",
  rejected: "Rejected",
  deferred: "Deferred",
};

const STATUS_COLORS: Record<string, string> = {
  candidate: "bg-blue-100 text-blue-700",
  in_review: "bg-yellow-100 text-yellow-700",
  submitted: "bg-purple-100 text-purple-700",
  accepted: "bg-green-100 text-green-700",
  published: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  deferred: "bg-gray-100 text-gray-700",
};

export default function TeachingResearchMode() {
  const { toast } = useToast();
  const [_, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["teaching-research"],
    queryFn: async () => {
      return api.get<{ cases: ResearchCase[] }>("/teaching-cases/research");
    },
  });

  const cases: ResearchCase[] = data?.cases ?? [];
  const filtered = cases.filter((c) => {
    const matchesSearch = !search || c.title.toLowerCase().includes(search.toLowerCase()) || (c.diagnosis?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesStatus = !selectedStatus || c.researchStatus === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: cases.length,
    candidates: cases.filter((c: ResearchCase) => c.researchStatus === "candidate").length,
    submitted: cases.filter((c: ResearchCase) => c.researchStatus === "submitted").length,
    published: cases.filter((c: ResearchCase) => c.researchStatus === "published").length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Research Mode"
        subtitle="Track research candidates, publications, and conference submissions"
      />

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => navigate("/teaching-cases")}>
          <ArrowLeft size={16} className="mr-2" /> Teaching Files
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Total Cases</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.candidates}</div>
          <div className="text-xs text-muted-foreground">Candidates</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-purple-600">{stats.submitted}</div>
          <div className="text-xs text-muted-foreground">Submitted</div>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">{stats.published}</div>
          <div className="text-xs text-muted-foreground">Published</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-card border border-card-border rounded-lg px-3 py-2 flex-1 max-w-md">
          <Search size={16} className="text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search cases..." className="border-0 focus-visible:ring-0 bg-transparent p-0 h-auto" />
        </div>
        <div className="flex gap-2">
          <button className={`px-3 py-1 rounded-full text-xs font-medium border ${selectedStatus === null ? "bg-primary text-white" : "bg-muted text-muted-foreground border-card-border"}`} onClick={() => setSelectedStatus(null)}>
            All
          </button>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <button key={key} className={`px-3 py-1 rounded-full text-xs font-medium border ${selectedStatus === key ? "bg-primary text-white" : "bg-muted text-muted-foreground border-card-border"}`} onClick={() => setSelectedStatus(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Case list */}
      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr,1fr,auto,auto,auto,auto] gap-2 px-4 py-3 bg-muted/50 text-xs font-medium text-muted-foreground">
          <span>Title</span>
          <span>Diagnosis</span>
          <span>Modality</span>
          <span>Status</span>
          <span>Created</span>
          <span>Actions</span>
        </div>
        {filtered.map((c: ResearchCase) => (
          <div key={c.id} className="grid grid-cols-[1fr,1fr,auto,auto,auto,auto] gap-2 px-4 py-3 border-t border-card-border items-center hover:bg-muted/20 cursor-pointer" onClick={() => navigate(`/teaching-cases/${c.id}`)}>
            <span className="font-medium text-sm truncate">{c.title}</span>
            <span className="text-sm text-muted-foreground truncate">{c.diagnosis || "—"}</span>
            <Badge variant="outline">{c.modality || "—"}</Badge>
            <Badge className={STATUS_COLORS[c.researchStatus || "candidate"] || "bg-gray-100"} variant="outline">
              {STATUS_LABELS[c.researchStatus || "candidate"]}
            </Badge>
            <span className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</span>
            <div className="flex items-center gap-1">
              {c.publicationReference && <ExternalLink size={14} className="text-primary" />}
              {c.conferenceName && <Calendar size={14} className="text-primary" />}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <FlaskConical size={48} className="mx-auto mb-3 opacity-50" />
            <p>No research cases found. Mark teaching cases as research candidates to see them here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
