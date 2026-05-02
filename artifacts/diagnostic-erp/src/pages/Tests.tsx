import { useState } from "react";
import {
  useListTests,
  useCreateTest,
  useUpdateTest,
  getListTestsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Pencil, Settings2, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";

type TestForm = {
  code: string;
  name: string;
  category: string;
  price: number;
  duration: string;
  description?: string;
  isActive: boolean;
  department?: string;
  roomNumber?: string;
};

const DEPARTMENT_OPTIONS = [
  "Pathology", "X-Ray", "USG", "MRI", "CT", "ECG",
  "Endoscopy", "Mammography", "Cardiology", "Dental", "Other",
];

type TestCategory = {
  id: number;
  name: string;
  isActive: boolean;
  testCount: number;
};

const TEST_CATEGORIES_KEY = ["test-categories"] as const;

function useTestCategories() {
  return useQuery<TestCategory[]>({
    queryKey: TEST_CATEGORIES_KEY,
    queryFn: () => api.get<TestCategory[]>("/api/test-categories"),
  });
}

export default function Tests() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [open, setOpen] = useState(false);
  const [editTest, setEditTest] = useState<{ id: number } & TestForm | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useListTests({ search: search || undefined, category: category || undefined });
  const { data: allCategories = [] } = useTestCategories();
  const activeCategories = allCategories.filter((c) => c.isActive);

  const createTest = useCreateTest({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTestsQueryKey() }); setOpen(false); reset(); },
    },
  });
  const updateTest = useUpdateTest({
    mutation: {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTestsQueryKey() }); setEditTest(null); },
    },
  });

  const { register, handleSubmit, reset, setValue, watch } = useForm<TestForm>({ defaultValues: { isActive: true } });

  const onSubmit = (data: TestForm) => {
    // Cast through unknown so the codegen'd zod doesn't reject the new
    // department/roomNumber fields. The server reads them off req.body.
    const payload = { ...data, price: Number(data.price) } as unknown as Parameters<typeof createTest.mutate>[0]["data"];
    if (editTest) {
      updateTest.mutate({ id: editTest.id, data: payload as unknown as Parameters<typeof updateTest.mutate>[0]["data"] });
    } else {
      createTest.mutate({ data: payload });
    }
  };

  const openEdit = (t: { id: number; code: string; name: string; category: string; price: number; duration: string; description?: string | null; isActive: boolean; department?: string; roomNumber?: string }) => {
    const tx = t as typeof t & { department?: string; roomNumber?: string };
    setEditTest({ id: t.id, code: t.code, name: t.name, category: t.category, price: t.price, duration: t.duration, description: t.description ?? "", isActive: t.isActive, department: tx.department, roomNumber: tx.roomNumber });
    setValue("code", t.code);
    setValue("name", t.name);
    setValue("category", t.category);
    setValue("price", t.price);
    setValue("duration", t.duration);
    setValue("description", t.description ?? "");
    setValue("isActive", t.isActive);
    setValue("department", tx.department ?? "Pathology");
    setValue("roomNumber", tx.roomNumber ?? "");
    setOpen(true);
  };

  return (
    <div className="pb-8">
      <PageHeader
        title="Test Catalog"
        subtitle={`${data?.total ?? 0} diagnostic tests`}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setManageOpen(true)}>
              <Settings2 size={14} className="mr-1" /> Categories
            </Button>
            <Button size="sm" onClick={() => { setEditTest(null); reset({ isActive: true }); setOpen(true); }}>
              <Plus size={14} className="mr-1" /> Add Test
            </Button>
          </div>
        }
      />

      <div className="px-6 space-y-4">
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search tests..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={category || "all"} onValueChange={(v) => setCategory(v === "all" ? "" : v)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {activeCategories.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/30">
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Test Name</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium text-right">Price</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-border/50 animate-pulse">
                      {[...Array(7)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded w-20" /></td>)}
                    </tr>
                  ))
                ) : data?.tests?.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No tests found</td></tr>
                ) : (
                  data?.tests?.map((t) => (
                    <tr key={t.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{t.code}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{t.name}</div>
                        {t.description && <div className="text-xs text-muted-foreground truncate max-w-xs">{t.description}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded text-xs">{t.category}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">₹{Number(t.price).toFixed(2)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{t.duration}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${t.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>
                          {t.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => openEdit(t)} className="text-muted-foreground hover:text-foreground"><Pencil size={14} /></button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditTest(null); reset({ isActive: true }); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTest ? "Edit Test" : "Add Diagnostic Test"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Test Code *</Label>
                <Input {...register("code", { required: true })} className="mt-1" placeholder="CBC" />
              </div>
              <div>
                <Label>Price (₹) *</Label>
                <Input type="number" step="0.01" {...register("price", { required: true, valueAsNumber: true })} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Test Name *</Label>
              <Input {...register("name", { required: true })} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category *</Label>
                <Select value={watch("category")} onValueChange={(v) => setValue("category", v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {activeCategories.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        No categories yet — click "Categories" to add one.
                      </div>
                    ) : (
                      activeCategories.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Duration *</Label>
                <Input {...register("duration", { required: true })} className="mt-1" placeholder="4-6 hours" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Department *</Label>
                <Select value={watch("department") ?? "Pathology"} onValueChange={(v) => setValue("department", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEPARTMENT_OPTIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">Drives which queue (e.g. USG room) this test routes to.</p>
              </div>
              <div>
                <Label>Room Number</Label>
                <Input {...register("roomNumber")} className="mt-1" placeholder="Room 4" />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Input {...register("description")} className="mt-1" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isActive" {...register("isActive")} className="rounded" />
              <Label htmlFor="isActive">Active</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createTest.isPending || updateTest.isPending}>
                {editTest ? "Save Changes" : "Add Test"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ManageCategoriesDialog open={manageOpen} onOpenChange={setManageOpen} />
    </div>
  );
}

function ManageCategoriesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data: categories = [], isLoading } = useTestCategories();

  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: TEST_CATEGORIES_KEY });
    qc.invalidateQueries({ queryKey: getListTestsQueryKey() });
  };

  const addCategory = useMutation({
    mutationFn: (name: string) => api.post("/api/test-categories", { name }),
    onSuccess: () => { invalidate(); setNewName(""); setError(null); },
    onError: (e: Error) => setError(e.message),
  });

  const updateCategory = useMutation({
    mutationFn: (body: { id: number; data: { name?: string; isActive?: boolean } }) =>
      api.patch(`/api/test-categories/${body.id}`, body.data),
    onSuccess: () => { invalidate(); setEditId(null); setError(null); },
    onError: (e: Error) => setError(e.message),
  });

  const deleteCategory = useMutation({
    mutationFn: (id: number) => api.delete(`/api/test-categories/${id}`),
    onSuccess: () => { invalidate(); setError(null); },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setError(null); setEditId(null); setNewName(""); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage Test Categories</DialogTitle>
          <DialogDescription>
            Add, rename, deactivate, or remove the categories that appear in the Test Catalog (e.g. Radiology, Hematology). Renaming a category updates every test currently in it. Categories that still contain tests can't be deleted — mark them inactive instead.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => { e.preventDefault(); const trimmed = newName.trim(); if (trimmed) addCategory.mutate(trimmed); }}
          className="flex gap-2"
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New category (e.g. Cytology)"
            className="flex-1"
          />
          <Button type="submit" disabled={!newName.trim() || addCategory.isPending}>
            <Plus size={14} className="mr-1" /> Add
          </Button>
        </form>

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="border border-card-border rounded-lg overflow-hidden max-h-[420px] overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : categories.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">No categories yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-card-border sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase text-muted-foreground w-20">Tests</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase text-muted-foreground w-24">Status</th>
                  <th className="px-4 py-2.5 w-28" />
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="border-b border-card-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2">
                      {editId === c.id ? (
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && editName.trim()) updateCategory.mutate({ id: c.id, data: { name: editName.trim() } });
                            if (e.key === "Escape") { setEditId(null); setError(null); }
                          }}
                          autoFocus
                          className="h-8"
                        />
                      ) : (
                        <span className="font-medium">{c.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{c.testCount}</td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => updateCategory.mutate({ id: c.id, data: { isActive: !c.isActive } })}
                        className={`text-xs px-2 py-1 rounded font-medium ${c.isActive ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" : "bg-muted text-muted-foreground"}`}
                      >
                        {c.isActive ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {editId === c.id ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={!editName.trim()}
                              onClick={() => updateCategory.mutate({ id: c.id, data: { name: editName.trim() } })}
                            >
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setEditId(null); setError(null); }}>✕</Button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => { setEditId(c.id); setEditName(c.name); setError(null); }}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                              title="Rename"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => {
                                if (c.testCount > 0) {
                                  setError(`"${c.name}" still has ${c.testCount} test${c.testCount === 1 ? "" : "s"} — reassign or remove them first, or just toggle the category off.`);
                                  return;
                                }
                                if (confirm(`Delete category "${c.name}"?`)) deleteCategory.mutate(c.id);
                              }}
                              className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                              title="Delete"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
