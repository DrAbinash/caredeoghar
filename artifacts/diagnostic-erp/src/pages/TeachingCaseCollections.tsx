// Phase 8: Teaching Case Collections
// Manage curated collections of teaching cases.

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
  Layers, BookOpen, Plus, Trash2, ArrowLeft, Lock, Unlock,
  GraduationCap, Star, Eye, Folder,
} from "lucide-react";

interface Collection {
  id: number;
  name: string;
  description: string | null;
  isPublic: boolean;
  createdByName: string | null;
  caseCount: number;
  createdAt: string;
  updatedAt: string;
}

export default function TeachingCaseCollections() {
  const { toast } = useToast();
  const [_, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  const { data } = useQuery({
    queryKey: ["teaching-collections"],
    queryFn: async () => {
      return api.get<{ collections: Collection[] }>("/teaching-cases/collections");
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: { name: string; description: string; isPublic: boolean }) => {
      return api.post<{ collection: Collection }>("/teaching-cases/collections", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teaching-collections"] });
      setShowNew(false);
      setName("");
      setDesc("");
      setIsPublic(false);
      toast({ title: "Collection created", description: "Your teaching case collection has been created." });
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not create collection.", variant: "destructive" });
    },
  });

  const collections = data?.collections ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teaching Collections"
        subtitle="Organize and share curated groups of teaching cases"
      />

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => navigate("/teaching-cases")}>
          <ArrowLeft size={16} className="mr-2" /> Back to Teaching Files
        </Button>
        <Button onClick={() => setShowNew(!showNew)}>
          <Plus size={16} className="mr-2" /> New Collection
        </Button>
      </div>

      {showNew && (
        <div className="bg-card border border-card-border rounded-xl p-5 space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Folder size={16} /> New Collection
          </h3>
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., MRI Brain Tumors" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Brief description..." />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            Public (visible to all staff)
          </label>
          <div className="flex gap-2">
            <Button onClick={() => createMutation.mutate({ name, description: desc, isPublic })} disabled={!name.trim() || createMutation.isPending}>
              Create
            </Button>
            <Button variant="outline" onClick={() => setShowNew(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {collections.map((col: Collection) => (
          <div key={col.id} className="bg-card border border-card-border rounded-xl p-5 hover:shadow-md transition cursor-pointer" onClick={() => navigate(`/teaching-collections/${col.id}`)}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Folder size={20} className="text-primary" />
                <h3 className="font-semibold">{col.name}</h3>
              </div>
              {col.isPublic ? <Unlock size={14} className="text-muted-foreground" /> : <Lock size={14} className="text-muted-foreground" />}
            </div>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{col.description || "No description"}</p>
            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><BookOpen size={12} /> {col.caseCount} cases</span>
              <span className="flex items-center gap-1"><Eye size={12} /> {col.createdByName}</span>
            </div>
          </div>
        ))}
        {collections.length === 0 && !showNew && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <Layers size={48} className="mx-auto mb-3 opacity-50" />
            <p>No collections yet. Create one to organize teaching cases.</p>
          </div>
        )}
      </div>
    </div>
  );
}
