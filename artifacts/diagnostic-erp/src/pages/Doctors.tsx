import { useState } from "react";
import {
  useListDoctors,
  useCreateDoctor,
  getListDoctorsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
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
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Stethoscope, Phone, Building2, Mail, IndianRupee, Percent, Pencil, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";

type DoctorForm = {
  name: string;
  specialization: string;
  phone?: string;
  email?: string;
  hospitalAffiliation?: string;
  defaultCommissionType: string;
  defaultCommission: string;
  ledgerId?: string;
};

type Book = { id: number; name: string; isDefault: boolean };

type Doctor = {
  id: number;
  name: string;
  specialization: string;
  phone?: string | null;
  email?: string | null;
  hospitalAffiliation?: string | null;
  defaultCommission?: string | number | null;
  defaultCommissionType?: string | null;
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

export default function Doctors() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [deletingDoctor, setDeletingDoctor] = useState<Doctor | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useListDoctors({ search: search || undefined });
  const { data: books = [] } = useQuery<Book[]>({
    queryKey: ["ledgers"],
    queryFn: () => api.get<Book[]>("/api/ledgers"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListDoctorsQueryKey() });

  const createDoctor = useCreateDoctor({
    mutation: { onSuccess: () => { invalidate(); setOpen(false); reset(); } },
  });

  const updateDoctor = useMutation({
    mutationFn: (body: DoctorForm & { id: number }) => {
      const { id, ...rest } = body;
      return api.patch(`/api/doctors/${id}`, rest);
    },
    onSuccess: () => { invalidate(); setEditingDoctor(null); },
  });

  const deleteDoctor = useMutation({
    mutationFn: (id: number) => api.delete(`/api/doctors/${id}`),
    onSuccess: () => { invalidate(); setDeletingDoctor(null); },
  });

  const { register, handleSubmit, reset, setValue, watch } = useForm<DoctorForm>({
    defaultValues: { defaultCommissionType: "percentage", defaultCommission: "0" },
  });

  const { register: regEdit, handleSubmit: handleEditSubmit, reset: resetEdit, setValue: setEditVal, watch: watchEdit } = useForm<DoctorForm>({
    defaultValues: { defaultCommissionType: "percentage", defaultCommission: "0" },
  });

  const commType = watch("defaultCommissionType");
  const editCommType = watchEdit("defaultCommissionType");

  const onSubmit = (data: DoctorForm) => {
    createDoctor.mutate({
      data: { ...data, defaultCommission: data.defaultCommission || "0" } as Parameters<typeof createDoctor.mutate>[0]["data"],
    });
  };

  const openEdit = (doc: Doctor) => {
    setEditingDoctor(doc);
    resetEdit({
      name: doc.name,
      specialization: doc.specialization,
      phone: doc.phone ?? "",
      email: doc.email ?? "",
      hospitalAffiliation: doc.hospitalAffiliation ?? "",
      defaultCommissionType: (doc.defaultCommissionType as string) ?? "percentage",
      defaultCommission: doc.defaultCommission != null ? String(doc.defaultCommission) : "0",
    });
  };

  const onEditSubmit = handleEditSubmit((d) => {
    if (!editingDoctor) return;
    updateDoctor.mutate({ id: editingDoctor.id, ...d });
  });

  return (
    <div className="pb-8">
      <PageHeader
        title="Referring Doctors"
        subtitle={`${data?.total ?? 0} doctors`}
        actions={
          <Button size="sm" onClick={() => { setOpen(true); reset(); }}>
            <Plus size={14} className="mr-1" /> Add Doctor
          </Button>
        }
      />

      <div className="px-6 space-y-4">
        <div className="relative max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search doctors..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : data?.doctors?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No doctors found</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data?.doctors?.map((d) => {
              const doc = d as unknown as Doctor;
              const defComm = Number(doc.defaultCommission ?? 0);
              const defType = doc.defaultCommissionType ?? "percentage";
              return (
                <div key={doc.id} className="bg-card border border-card-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Stethoscope size={18} className="text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground truncate">{doc.name}</p>
                      <p className="text-xs text-primary font-medium mt-0.5">{doc.specialization}</p>
                      {doc.phone && (
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                          <Phone size={11} /> {doc.phone}
                        </div>
                      )}
                      {doc.email && (
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <Mail size={11} /> {doc.email}
                        </div>
                      )}
                      {doc.hospitalAffiliation && (
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <Building2 size={11} /> {doc.hospitalAffiliation}
                        </div>
                      )}
                      {defComm > 0 && (
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-600 font-medium">
                          {defType === "percentage" ? <Percent size={11} /> : <IndianRupee size={11} />}
                          Default: {defType === "percentage" ? `${defComm}%` : inr(defComm)}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => openEdit(doc)}>
                        <Pencil size={13} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-red-600" onClick={() => setDeletingDoctor(doc)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Doctor Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Referring Doctor</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Full Name *</Label>
              <Input {...register("name", { required: true })} className="mt-1" placeholder="Dr. Full Name" />
            </div>
            <div>
              <Label>Specialization *</Label>
              <Input {...register("specialization", { required: true })} className="mt-1" placeholder="e.g. Cardiologist" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <Input {...register("phone")} className="mt-1" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" {...register("email")} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Hospital / Clinic Affiliation</Label>
              <Input {...register("hospitalAffiliation")} className="mt-1" />
            </div>
            <div className="border border-dashed border-input rounded-lg p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Default Commission</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select defaultValue="percentage" onValueChange={(v) => setValue("defaultCommissionType", v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{commType === "percentage" ? "%" : "₹"} Value</Label>
                  <Input type="number" step="any" min="0" {...register("defaultCommission")} className="mt-1" defaultValue="0" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createDoctor.isPending}>
                {createDoctor.isPending ? "Saving..." : "Add Doctor"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Doctor Dialog */}
      <Dialog open={!!editingDoctor} onOpenChange={(v) => { if (!v) setEditingDoctor(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Doctor — {editingDoctor?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onEditSubmit} className="space-y-4">
            <div>
              <Label>Full Name *</Label>
              <Input {...regEdit("name", { required: true })} className="mt-1" />
            </div>
            <div>
              <Label>Specialization *</Label>
              <Input {...regEdit("specialization", { required: true })} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <Input {...regEdit("phone")} className="mt-1" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" {...regEdit("email")} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Hospital / Clinic Affiliation</Label>
              <Input {...regEdit("hospitalAffiliation")} className="mt-1" />
            </div>
            <div className="border border-dashed border-input rounded-lg p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Default Commission</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={editCommType} onValueChange={(v) => setEditVal("defaultCommissionType", v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{editCommType === "percentage" ? "%" : "₹"} Value</Label>
                  <Input type="number" step="any" min="0" {...regEdit("defaultCommission")} className="mt-1" />
                </div>
              </div>
            </div>
            {updateDoctor.isError && (
              <p className="text-xs text-red-600">{(updateDoctor.error as Error)?.message ?? "Failed to update"}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditingDoctor(null)}>Cancel</Button>
              <Button type="submit" disabled={updateDoctor.isPending}>
                {updateDoctor.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingDoctor} onOpenChange={(v) => { if (!v) setDeletingDoctor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deletingDoctor?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the doctor from the system. Existing orders and commission records linked to this doctor will retain their historical data but the doctor cannot be re-selected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deletingDoctor && deleteDoctor.mutate(deletingDoctor.id)}
            >
              {deleteDoctor.isPending ? "Deleting..." : "Delete Doctor"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
