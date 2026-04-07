import { Link } from "wouter";
import { useGetPatient, useGetPatientHistory } from "@workspace/api-client-react";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User, Phone, MapPin, Droplet } from "lucide-react";

export default function PatientDetail({ id }: { id: number }) {
  const { data: patient, isLoading } = useGetPatient(id);
  const { data: history } = useGetPatientHistory(id);

  if (isLoading) {
    return <div className="p-6 animate-pulse"><div className="h-8 bg-muted rounded w-64" /></div>;
  }
  if (!patient) {
    return <div className="p-6 text-muted-foreground">Patient not found.</div>;
  }

  const age = new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear();

  return (
    <div className="pb-8">
      <div className="px-6 pt-4">
        <Link href="/patients" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft size={14} /> Back to Patients
        </Link>
      </div>

      <PageHeader
        title={`${patient.firstName} ${patient.lastName}`}
        subtitle={patient.patientId}
        actions={
          <Link href={`/orders?patientId=${id}`} asChild>
            <Button size="sm">New Order</Button>
          </Link>
        }
      />

      <div className="px-6 space-y-5">
        {/* Patient info card */}
        <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Date of Birth</p>
              <p className="mt-1 text-sm font-medium">{patient.dateOfBirth} <span className="text-muted-foreground">({age}y)</span></p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Gender</p>
              <p className="mt-1 text-sm font-medium capitalize">{patient.gender}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Phone size={11} /> Phone</p>
              <p className="mt-1 text-sm font-medium">{patient.phone}</p>
            </div>
            {patient.bloodGroup && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Droplet size={11} /> Blood Group</p>
                <p className="mt-1 text-sm font-bold text-red-600 dark:text-red-400">{patient.bloodGroup}</p>
              </div>
            )}
            {patient.email && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Email</p>
                <p className="mt-1 text-sm font-medium">{patient.email}</p>
              </div>
            )}
            {patient.address && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1"><MapPin size={11} /> Address</p>
                <p className="mt-1 text-sm font-medium">{patient.address}</p>
              </div>
            )}
          </div>
        </div>

        {/* Order history */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Test Order History</h2>
          <div className="bg-card border border-card-border rounded-xl shadow-sm overflow-hidden">
            {!history?.orders?.length ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No orders yet</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border bg-muted/30">
                    <th className="px-4 py-3 font-medium">Order No.</th>
                    <th className="px-4 py-3 font-medium">Tests</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Amount</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {history.orders.map((order) => (
                    <tr key={order.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-primary">{order.orderNumber}</td>
                      <td className="px-4 py-3 text-muted-foreground">{order.tests?.length ?? 0} test(s)</td>
                      <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                      <td className="px-4 py-3 text-right font-medium">₹{Number(order.totalAmount).toFixed(2)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(order.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <Link href={`/orders/${order.id}`} className="text-xs text-primary hover:underline">View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
