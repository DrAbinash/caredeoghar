import { useState } from "react";
import {
  useListDoctors,
  useCreateDoctor,
  getListDoctorsQueryKey,
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Stethoscope, Phone, Building2, Mail, IndianRupee, Percent } from "lucide-react";
import { useForm } from "react-hook-form";

type DoctorForm = {
  name: string;
  specialization: string;
  phone?: string;
  email?: string;
  hospitalAffiliation?: string;
  defaultCommissionType: string;
  defaultCommission: string;
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

export default function Doctors() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useListDoctors({ search: search || undefined });
  const createDoctor = useCreateDoctor({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDoctorsQueryKey() });
        setOpen(false);
        reset();
      },
    },
  });

  const { register, handleSubmit, reset, setValue, watch } = useForm<DoctorForm>({
    defaultValues: { defaultCommissionType: "percentage", defaultCommission: "0" },
  });
  const commType = watch("defaultCommissionType");

  const onSubmit = (data: DoctorForm) => {
    createDoctor.mutate({
      data: {
        ...data,
        defaultCommission: data.defaultCommission || "0",
      } as Parameters<typeof createDoctor.mutate>[0]["data"],
    });
  };

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
              const defComm = Number((d as unknown as Record<string, string>).defaultCommission ?? 0);
              const defType = (d as unknown as Record<string, string>).defaultCommissionType ?? "percentage";
              return (
                <div key={d.id} className="bg-card border border-card-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Stethoscope size={18} className="text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground truncate">{d.name}</p>
                      <p className="text-xs text-primary font-medium mt-0.5">{d.specialization}</p>
                      {d.phone && (
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                          <Phone size={11} /> {d.phone}
                        </div>
                      )}
                      {(d as unknown as Record<string, string>).email && (
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <Mail size={11} /> {(d as unknown as Record<string, string>).email}
                        </div>
                      )}
                      {d.hospitalAffiliation && (
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <Building2 size={11} /> {d.hospitalAffiliation}
                        </div>
                      )}
                      {defComm > 0 && (
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-600 font-medium">
                          {defType === "percentage" ? <Percent size={11} /> : <IndianRupee size={11} />}
                          Default: {defType === "percentage" ? `${defComm}%` : inr(defComm)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
    </div>
  );
}
