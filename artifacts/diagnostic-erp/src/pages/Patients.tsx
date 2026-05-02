import { useState } from "react";
import { Link } from "wouter";
import {
  useListPatients,
  useCreatePatient,
  getListPatientsQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, ChevronRight, Upload, X, User, Pencil } from "lucide-react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { readStaffSession, FULL_ACCESS_ROLES } from "@/lib/staffSession";

type PatientForm = {
  firstName: string;
  lastName: string;
  age: number;
  gender: "male" | "female" | "other";
  phone: string;
  email?: string;
  address?: string;
  bloodGroup?: string;
};

type ClinicSettingsLite = { patientPhotoEnabled?: boolean };

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function Patients() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState("");
  const [editPatient, setEditPatient] = useState<{ id: number; firstName: string; lastName: string; age: number | null; gender: string; phone: string; email: string | null; address: string | null; bloodGroup: string | null } | null>(null);
  const queryClient = useQueryClient();

  // Edit access: open ERP (no session) OR admin/super_admin role.
  const session = readStaffSession();
  const canEdit = !session || FULL_ACCESS_ROLES.has(session.user.role);

  const { data: clinicSettings } = useQuery<ClinicSettingsLite>({
    queryKey: ["clinic-settings"],
    queryFn: () => api.get("/api/clinic-settings"),
  });
  const photoEnabled = !!clinicSettings?.patientPhotoEnabled;

  const { data, isLoading } = useListPatients({ search: search || undefined, page, limit: 20 });
  const createPatient = useCreatePatient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
        setOpen(false);
        setPhotoDataUrl(null);
        setPhotoErr("");
        reset();
      },
    },
  });

  const { register, handleSubmit, reset, setValue, watch } = useForm<PatientForm>({
    defaultValues: { gender: "male" },
  });

  const onPhotoChange = (file: File | null) => {
    setPhotoErr("");
    if (!file) return;
    if (!file.type.startsWith("image/")) { setPhotoErr("Please upload an image file"); return; }
    if (file.size > 1_500_000) { setPhotoErr("Image too large (max 1.5 MB)"); return; }
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const onSubmit = (data: PatientForm) => {
    const birthYear = new Date().getFullYear() - Number(data.age);
    const dateOfBirth = `${birthYear}-01-01`;
    const { age, ...rest } = data;
    const payload: Record<string, unknown> = { ...rest, dateOfBirth };
    if (photoEnabled && photoDataUrl) payload.photoDataUrl = photoDataUrl;
    createPatient.mutate({ data: payload as unknown as Parameters<typeof createPatient.mutate>[0]["data"] });
  };

  const bloodGroups = BLOOD_GROUPS;

  return (
    <div className="pb-8">
      <PageHeader
        title="Patients"
        subtitle={`${data?.total ?? 0} registered patients`}
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus size={14} className="mr-1" /> New Patient
          </Button>
        }
      />

      <div className="px-6 space-y-4">
        {/* Search */}
        <div className="relative max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, ID, or phone..."
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        {/* Table */}
        <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/30">
                  {photoEnabled && <th className="px-4 py-3 font-medium w-12"></th>}
                  <th className="px-4 py-3 font-medium">Patient ID</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Age</th>
                  <th className="px-4 py-3 font-medium">Gender</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Blood Group</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-border/50 animate-pulse">
                      {[...Array(photoEnabled ? 8 : 7)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded w-24" /></td>)}
                    </tr>
                  ))
                ) : data?.patients?.length === 0 ? (
                  <tr><td colSpan={photoEnabled ? 8 : 7} className="px-4 py-12 text-center text-muted-foreground">No patients found</td></tr>
                ) : (
                  data?.patients?.map((p) => {
                    const age = p.dateOfBirth
                      ? new Date().getFullYear() - new Date(p.dateOfBirth).getFullYear()
                      : null;
                    const photo = (p as { photoDataUrl?: string | null }).photoDataUrl;
                    return (
                      <tr key={p.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                        {photoEnabled && (
                          <td className="px-4 py-2">
                            {photo ? (
                              <img src={photo} alt="" className="w-9 h-9 rounded-full object-cover border border-border" />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                                <User size={14} />
                              </div>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 font-mono text-xs font-medium text-primary">{p.patientId}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{p.firstName} {p.lastName}</td>
                        <td className="px-4 py-3 text-muted-foreground">{age !== null ? `${age} yrs` : "—"}</td>
                        <td className="px-4 py-3 capitalize text-muted-foreground">{p.gender}</td>
                        <td className="px-4 py-3 text-muted-foreground">{p.phone}</td>
                        <td className="px-4 py-3">
                          {p.bloodGroup ? (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded text-xs font-medium">{p.bloodGroup}</span>
                          ) : (
                            <span className="text-muted-foreground/50 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => {
                                  // Codegen Patient may expose age via DOB only; fall back to derived `age` if no direct field.
                                  const px = p as typeof p & { age?: number };
                                  setEditPatient({
                                    id: p.id,
                                    firstName: p.firstName,
                                    lastName: p.lastName,
                                    age: typeof px.age === "number" ? px.age : (age ?? null),
                                    gender: p.gender,
                                    phone: p.phone,
                                    email: p.email ?? null,
                                    address: p.address ?? null,
                                    bloodGroup: p.bloodGroup ?? null,
                                  });
                                }}
                                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary"
                                title="Edit patient"
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                            <Link href={`/patients/${p.id}`} className="text-muted-foreground hover:text-foreground inline-flex p-1.5 rounded hover:bg-muted">
                              <ChevronRight size={16} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.total > 20 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, data.total)} of {data.total}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</Button>
                <Button variant="outline" size="sm" disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Register New Patient</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>First Name *</Label>
                <Input {...register("firstName", { required: true })} className="mt-1" />
              </div>
              <div>
                <Label>Last Name *</Label>
                <Input {...register("lastName", { required: true })} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Age (years) *</Label>
                <Input
                  type="number"
                  min={0}
                  max={150}
                  placeholder="e.g. 35"
                  {...register("age", { required: true, min: 0, max: 150, valueAsNumber: true })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Gender *</Label>
                <Select value={watch("gender")} onValueChange={(v) => setValue("gender", v as "male" | "female" | "other")}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Phone *</Label>
                <Input {...register("phone", { required: true })} className="mt-1" />
              </div>
              <div>
                <Label>Blood Group</Label>
                <Select onValueChange={(v) => setValue("bloodGroup", v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {bloodGroups.map((bg) => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" {...register("email")} className="mt-1" />
            </div>
            <div>
              <Label>Address</Label>
              <Input {...register("address")} className="mt-1" />
            </div>
            {photoEnabled && (
              <div>
                <Label>Patient Photo</Label>
                <div className="mt-1 flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                    {photoDataUrl ? (
                      <img src={photoDataUrl} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <User size={22} className="text-muted-foreground/60" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        capture="user"
                        id="patient-photo-input"
                        className="hidden"
                        onChange={(e) => onPhotoChange(e.target.files?.[0] ?? null)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById("patient-photo-input")?.click()}
                      >
                        <Upload size={13} className="mr-1.5" />
                        {photoDataUrl ? "Change" : "Upload Photo"}
                      </Button>
                      {photoDataUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => { setPhotoDataUrl(null); setPhotoErr(""); }}
                        >
                          <X size={13} className="mr-1" /> Remove
                        </Button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">JPG/PNG, &lt; 1.5 MB. Optional.</p>
                    {photoErr && <p className="text-xs text-destructive">{photoErr}</p>}
                  </div>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createPatient.isPending}>
                {createPatient.isPending ? "Saving..." : "Register Patient"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {editPatient && (
        <EditPatientDialog
          patient={editPatient}
          onClose={() => setEditPatient(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
            setEditPatient(null);
          }}
        />
      )}
    </div>
  );
}

type EditForm = {
  firstName: string;
  lastName: string;
  age: number;
  gender: "male" | "female" | "other";
  phone: string;
  email?: string;
  address?: string;
  bloodGroup?: string;
};

function EditPatientDialog({
  patient, onClose, onSaved,
}: {
  patient: { id: number; firstName: string; lastName: string; age: number | null; gender: string; phone: string; email: string | null; address: string | null; bloodGroup: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { register, handleSubmit, setValue, watch } = useForm<EditForm>({
    defaultValues: {
      firstName: patient.firstName,
      lastName: patient.lastName,
      age: patient.age ?? 0,
      gender: (patient.gender as EditForm["gender"]) || "male",
      phone: patient.phone,
      email: patient.email ?? "",
      address: patient.address ?? "",
      bloodGroup: patient.bloodGroup ?? "",
    },
  });
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (data: EditForm) =>
      api.put(`/api/patients/${patient.id}`, {
        ...data,
        email: data.email || null,
        address: data.address || null,
        bloodGroup: data.bloodGroup || null,
      }),
    onSuccess: onSaved,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <Dialog open={true} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Patient — {patient.firstName} {patient.lastName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => save.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>First Name *</Label><Input {...register("firstName", { required: true })} className="mt-1" /></div>
            <div><Label>Last Name *</Label><Input {...register("lastName", { required: true })} className="mt-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Age (years) *</Label>
              <Input type="number" min={0} max={150} {...register("age", { required: true, min: 0, max: 150, valueAsNumber: true })} className="mt-1" />
            </div>
            <div>
              <Label>Gender *</Label>
              <Select value={watch("gender")} onValueChange={(v) => setValue("gender", v as EditForm["gender"])}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Phone *</Label><Input {...register("phone", { required: true })} className="mt-1" /></div>
            <div>
              <Label>Blood Group</Label>
              <Select value={watch("bloodGroup") || undefined} onValueChange={(v) => setValue("bloodGroup", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {BLOOD_GROUPS.map((bg) => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Email</Label><Input type="email" {...register("email")} className="mt-1" /></div>
          <div><Label>Address</Label><Input {...register("address")} className="mt-1" /></div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
