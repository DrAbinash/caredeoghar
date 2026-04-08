import { useState } from "react";
import { Link } from "wouter";
import { useGetPatient, useGetPatientHistory } from "@workspace/api-client-react";
import { api } from "@/lib/fetchApi";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, User, Phone, MapPin, Droplet, Sparkles,
  Copy, CheckCheck, MessageSquare, FileText,
} from "lucide-react";

type AIType = "clinical-note" | "patient-message";
type MessageType = "followup" | "results" | "payment";

export default function PatientDetail({ id }: { id: number }) {
  const { data: patient, isLoading } = useGetPatient(id);
  const { data: history } = useGetPatientHistory(id);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiType, setAiType] = useState<AIType>("clinical-note");
  const [msgType, setMsgType] = useState<MessageType>("followup");
  const [aiResult, setAiResult] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateAI = async (type: AIType, mtype?: MessageType) => {
    setAiType(type);
    setAiResult("");
    setAiOpen(true);
    setAiLoading(true);
    try {
      if (type === "clinical-note") {
        const res = await api.post("/api/ai/clinical-note", { patientId: id });
        setAiResult(res.note);
      } else {
        const res = await api.post("/api/ai/patient-message", { patientId: id, type: mtype ?? msgType });
        setAiResult(res.message);
      }
    } catch {
      setAiResult("Failed to generate. Please try again.");
    } finally {
      setAiLoading(false);
    }
  };

  const copyResult = () => {
    navigator.clipboard.writeText(aiResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => { setMsgType("followup"); generateAI("patient-message", "followup"); }}>
              <MessageSquare size={14} className="mr-1.5" />AI Message
            </Button>
            <Button size="sm" variant="outline" onClick={() => generateAI("clinical-note")}>
              <Sparkles size={14} className="mr-1.5" />Clinical Note
            </Button>
            <Link href={`/orders?patientId=${id}`} asChild>
              <Button size="sm">New Order</Button>
            </Link>
          </div>
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

        {/* AI Message quick buttons */}
        <div className="bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-950/20 dark:to-blue-950/20 border border-violet-200 dark:border-violet-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={15} className="text-violet-600" />
            <p className="text-sm font-semibold text-violet-800 dark:text-violet-300">AI Patient Communication</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              { type: "followup" as MessageType, label: "Follow-up Reminder" },
              { type: "results" as MessageType, label: "Results Ready" },
              { type: "payment" as MessageType, label: "Payment Reminder" },
            ]).map(({ type, label }) => (
              <Button key={type} size="sm" variant="outline"
                className="border-violet-300 text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:text-violet-300"
                onClick={() => { setMsgType(type); generateAI("patient-message", type); }}>
                {label}
              </Button>
            ))}
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

      {/* AI Result Dialog */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles size={16} className="text-violet-500" />
              {aiType === "clinical-note" ? "AI Clinical Note" : `AI Message — ${msgType.replace("-", " ").replace(/\b\w/g, c => c.toUpperCase())}`}
            </DialogTitle>
          </DialogHeader>
          {aiLoading ? (
            <div className="space-y-2 animate-pulse py-4">
              <div className="h-4 bg-muted rounded w-full" />
              <div className="h-4 bg-muted rounded w-5/6" />
              <div className="h-4 bg-muted rounded w-4/6" />
              <p className="text-xs text-center text-muted-foreground mt-3">Generating with AI…</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-muted/40 rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap">{aiResult}</div>
              <div className="flex justify-between items-center">
                <Button size="sm" variant="outline" onClick={copyResult}>
                  {copied ? <><CheckCheck size={13} className="mr-1.5 text-green-600" />Copied!</> : <><Copy size={13} className="mr-1.5" />Copy</>}
                </Button>
                {aiType === "patient-message" && (
                  <div className="flex gap-1.5">
                    {(["followup", "results", "payment"] as MessageType[]).map(t => (
                      <Button key={t} size="sm" variant={msgType === t ? "default" : "outline"}
                        onClick={() => { setMsgType(t); generateAI("patient-message", t); }}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </Button>
                    ))}
                  </div>
                )}
                {aiType === "clinical-note" && (
                  <Button size="sm" variant="outline" onClick={() => generateAI("clinical-note")}>Regenerate</Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
