import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import { useToast } from "@/hooks/use-toast";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Zap, ClipboardCheck, Copy, Trash2 } from "lucide-react";

interface NormalTemplate {
  id: number;
  name: string;
  modality: string;
  bodyPart: string | null;
  findings: string;
  impression: string;
  technique: string | null;
  clinicalHistory: string | null;
  comparison: string | null;
  sortOrder: number;
}

export default function NormalReportTemplates() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [modalityFilter, setModalityFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [applyItem, setApplyItem] = useState<NormalTemplate | null>(null);
  const [worklistId, setWorklistId] = useState("");
  const [appliedText, setAppliedText] = useState("");
  const [form, setForm] = useState({
    name: "", modality: "", bodyPart: "", findings: "", impression: "", technique: "", clinicalHistory: "", comparison: "", sortOrder: "",
  });

  const { data = [], isLoading } = useQuery({
    queryKey: ["normalTemplates", modalityFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (modalityFilter) params.set("modality", modalityFilter);
      return await api.get<NormalTemplate[]>(`/api/ai-reporting/normal-templates?${params.toString()}`);
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      return await api.post<{ id: number }>("/api/ai-reporting/normal-templates", {
        name: form.name, modality: form.modality, bodyPart: form.bodyPart || undefined,
        findings: form.findings, impression: form.impression,
        technique: form.technique || undefined, clinicalHistory: form.clinicalHistory || undefined,
        comparison: form.comparison || undefined, sortOrder: form.sortOrder ? Number(form.sortOrder) : 0,
      });
    },
    onSuccess: () => {
      toast({ title: "Template saved" });
      qc.invalidateQueries({ queryKey: ["normalTemplates"] });
      setModalOpen(false);
      setForm({ name: "", modality: "", bodyPart: "", findings: "", impression: "", technique: "", clinicalHistory: "", comparison: "", sortOrder: "" });
    },
    onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await api.delete<{ ok: boolean }>(`/api/ai-reporting/normal-templates/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Deleted" });
      qc.invalidateQueries({ queryKey: ["normalTemplates"] });
    },
    onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }),
  });

  const applyMutation = useMutation({
    mutationFn: async ({ id, wlId }: { id: number; wlId: string }) => {
      return await api.post<{ reportText: string; templateName: string }>(`/api/ai-reporting/normal-templates/${id}/apply`, { worklistId: wlId });
    },
    onSuccess: (res) => {
      toast({ title: `Applied: ${res.templateName}` });
      setAppliedText(res.reportText);
    },
    onError: (e) => toast({ title: "Error", description: String(e), variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="One-Click Normal Report Templates"
        subtitle="Phase 26 — Pre-built normal templates for common studies. Click to apply, edit, and finalize."
      />
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Label className="text-sm">Modality</Label>
          <Input placeholder="Filter: MRI / CT / USG / X-Ray" value={modalityFilter} onChange={(e) => setModalityFilter(e.target.value)} />
        </div>
        <Button onClick={() => setModalOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add Template</Button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {data.map((t) => (
          <Card key={t.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{t.modality}</Badge>
                  <span className="font-semibold">{t.name}</span>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setApplyItem(t); setWorklistId(""); setAppliedText(""); }}>
                    <Zap className="w-4 h-4 text-blue-500" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(t.id)} disabled={deleteMutation.isPending}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">{t.bodyPart ?? "—"}</div>
              <div className="text-sm bg-muted p-2 rounded whitespace-pre-wrap">{t.findings}</div>
              <div className="text-sm font-medium">Impression: {t.impression}</div>
            </CardContent>
          </Card>
        ))}
        {isLoading && <div className="col-span-2 text-center py-6 text-muted-foreground">Loading…</div>}
        {!isLoading && data.length === 0 && <div className="col-span-2 text-center py-6 text-muted-foreground">No templates. Add one to start.</div>}
      </div>
      {/* Apply dialog */}
      <Dialog open={!!applyItem} onOpenChange={() => { setApplyItem(null); setAppliedText(""); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Apply: {applyItem?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label>Worklist ID</Label>
                <Input value={worklistId} onChange={(e) => setWorklistId(e.target.value)} placeholder="Enter worklist ID" />
              </div>
              <Button className="mt-6" onClick={() => applyItem && worklistId && applyMutation.mutate({ id: applyItem.id, wlId: worklistId })} disabled={applyMutation.isPending || !worklistId}>
                <Zap className="w-4 h-4 mr-1" /> Apply
              </Button>
            </div>
            {appliedText && (
              <div>
                <Label className="text-sm font-medium">Generated Report</Label>
                <div className="relative mt-1">
                  <pre className="text-sm whitespace-pre-wrap bg-muted p-3 rounded pr-10">{appliedText}</pre>
                  <Button size="sm" variant="ghost" className="absolute top-1 right-1" onClick={() => { navigator.clipboard.writeText(appliedText); toast({ title: "Copied" }); }}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <Badge variant="outline" className="mt-2">AI Draft – Requires Radiologist Review</Badge>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setApplyItem(null); setAppliedText(""); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Create dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Add Normal Template</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. MRI Brain – Normal" /></div>
              <div><Label>Modality</Label><Input value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })} placeholder="MRI / CT / USG / X-Ray" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Body Part</Label><Input value={form.bodyPart} onChange={(e) => setForm({ ...form, bodyPart: e.target.value })} /></div>
              <div><Label>Sort Order</Label><Input value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} placeholder="0, 1, 2…" /></div>
            </div>
            <div><Label>Findings</Label><Textarea value={form.findings} onChange={(e) => setForm({ ...form, findings: e.target.value })} rows={4} placeholder="Normal findings text…" /></div>
            <div><Label>Impression</Label><Input value={form.impression} onChange={(e) => setForm({ ...form, impression: e.target.value })} placeholder="e.g. Normal MRI brain." /></div>
            <div><Label>Technique</Label><Input value={form.technique} onChange={(e) => setForm({ ...form, technique: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Clinical History</Label><Input value={form.clinicalHistory} onChange={(e) => setForm({ ...form, clinicalHistory: e.target.value })} /></div>
              <div><Label>Comparison</Label><Input value={form.comparison} onChange={(e) => setForm({ ...form, comparison: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.name || !form.modality || !form.findings || !form.impression}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
