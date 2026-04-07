import { useState } from "react";
import {
  useListTests,
  useCreateTest,
  useUpdateTest,
  getListTestsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Pencil } from "lucide-react";
import { useForm } from "react-hook-form";

type TestForm = {
  code: string;
  name: string;
  category: string;
  price: number;
  duration: string;
  description?: string;
  isActive: boolean;
};

const CATEGORIES = ["Hematology", "Biochemistry", "Serology", "Pathology", "Radiology", "Cardiology", "Endocrinology", "Microbiology", "Immunology", "Other"];

export default function Tests() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [open, setOpen] = useState(false);
  const [editTest, setEditTest] = useState<{ id: number } & TestForm | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useListTests({ search: search || undefined, category: category || undefined });
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
    if (editTest) {
      updateTest.mutate({ id: editTest.id, data });
    } else {
      createTest.mutate({ data: { ...data, price: Number(data.price) } });
    }
  };

  const openEdit = (t: NonNullable<ReturnType<typeof useListTests>["data"]>["tests"][number]) => {
    setEditTest({ id: t.id, code: t.code, name: t.name, category: t.category, price: t.price, duration: t.duration, description: t.description ?? "", isActive: t.isActive });
    setValue("code", t.code);
    setValue("name", t.name);
    setValue("category", t.category);
    setValue("price", t.price);
    setValue("duration", t.duration);
    setValue("description", t.description ?? "");
    setValue("isActive", t.isActive);
    setOpen(true);
  };

  return (
    <div className="pb-8">
      <PageHeader
        title="Test Catalog"
        subtitle={`${data?.total ?? 0} diagnostic tests`}
        actions={
          <Button size="sm" onClick={() => { setEditTest(null); reset({ isActive: true }); setOpen(true); }}>
            <Plus size={14} className="mr-1" /> Add Test
          </Button>
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
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Duration *</Label>
                <Input {...register("duration", { required: true })} className="mt-1" placeholder="4-6 hours" />
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
    </div>
  );
}
