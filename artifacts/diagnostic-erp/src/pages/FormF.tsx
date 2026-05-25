import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/fetchApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, Printer, RefreshCcw, FileText, List, User, Phone, Users, BookOpen, Upload, Camera, CheckCircle2, AlertTriangle, MessageCircle, Stethoscope, X, ChevronDown } from "lucide-react";

type DoctorOption = { id: number; name: string; registrationNumber: string | null };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d: string) {
  if (!d) return "___________";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

type FormFData = {
  centreName: string;
  registrationNo: string;
  billNumber: string;
  patientName: string;
  age: string;
  boyCount: string;
  girlCount: string;
  husbandFatherName: string;
  address: string;
  mobile: string;
  referredBy: string;   // "Self" | "Doctor" | other
  referredByName: string;
  lmpWeeks: string;
  geneticHistory: string;   // "none" | "specify"
  geneticHistoryDetail: string;
  basisDiagnosisClinical: boolean;
  basisDiagnosisUsg: boolean;
  basisDiagnosisOther: string;
  indicationType: string;   // "routine" | "specify"
  indicationDetail: string;
  previousChildIssue: string;
  doctorName: string;
  doctorRegNo: string;
  procedure: string;
  procedurePurpose: string;
  invasiveProcedure: string;  // "notdone" | "done"
  invasiveProcedureDetail: string;
  complication: string;       // "nil" | "specify"
  complicationDetail: string;
  labTests: string;           // "notadvised" | "advised"
  labTestsDetail: string;
  gestationalAgeWeeks: string;
  gestationalAgeDays: string;
  ultrasoundResult: string;   // "normal" | "abnormal"
  abnormality: string;
  procedureDate: string;
  consentDate: string;
  resultConveyed: string;
  mtpAdvised: string;         // "no" | "yes"
  mtpDate: string;
  date: string;
  place: string;
};

function defaultForm(): FormFData {
  return {
    centreName: "CARE DIAGNOSTICS\nNear Bajla Mahila College, Saint Francis School Road, Castair's Town, Deoghar",
    registrationNo: "34/2020",
    billNumber: "",
    patientName: "",
    age: "",
    boyCount: "",
    girlCount: "",
    husbandFatherName: "",
    address: "",
    mobile: "",
    referredBy: "Self",
    referredByName: "",
    lmpWeeks: "",
    geneticHistory: "none",
    geneticHistoryDetail: "",
    basisDiagnosisClinical: true,
    basisDiagnosisUsg: true,
    basisDiagnosisOther: "",
    indicationType: "routine",
    indicationDetail: "",
    previousChildIssue: "",
    doctorName: "Dr. Sugandha Priyadarshini",
    doctorRegNo: "MCI/27962",
    procedure: "Ultrasound - ULTRASONOGRAPHY",
    procedurePurpose: "Obstetric ultrasonography",
    invasiveProcedure: "notdone",
    invasiveProcedureDetail: "",
    complication: "nil",
    complicationDetail: "",
    labTests: "notadvised",
    labTestsDetail: "",
    gestationalAgeWeeks: "",
    gestationalAgeDays: "",
    ultrasoundResult: "normal",
    abnormality: "",
    procedureDate: today(),
    consentDate: "",
    resultConveyed: "Patient / attendant — same day",
    mtpAdvised: "no",
    mtpDate: "",
    date: today(),
    place: "DEOGHAR",
  };
}

function Tick({ checked }: { checked: boolean }) {
  return (
    <span style={{ display: "inline-block", width: 11, height: 11, border: "1px solid #333", marginRight: 3, textAlign: "center", lineHeight: "11px", fontSize: 8, verticalAlign: "middle" }}>
      {checked ? "✓" : ""}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr style={{ borderBottom: "1px solid #ccc" }}>
      <td style={{ padding: "2px 4px", fontWeight: 600, fontSize: 8, width: "30%", verticalAlign: "top", whiteSpace: "nowrap" }}>{label}</td>
      <td style={{ padding: "2px 4px", fontSize: 8, verticalAlign: "top" }}>{children}</td>
    </tr>
  );
}

function BlankLine({ val, width = 120 }: { val: string; width?: number }) {
  return (
    <span style={{ display: "inline-block", borderBottom: "1px solid #333", minWidth: width, fontSize: 9, fontWeight: 500, paddingLeft: 2, verticalAlign: "bottom" }}>
      {val || "\u00A0"}
    </span>
  );
}

interface FormFPrintProps {
  form: FormFData;
  idCardImageUrl?: string;
}

function FormFPrint({ form, idCardImageUrl }: FormFPrintProps) {
  return (
    <div
      id="formf-print"
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "8mm 10mm 6mm 10mm",
        boxSizing: "border-box",
        fontFamily: "Arial, sans-serif",
        fontSize: 8,
        color: "#000",
        backgroundColor: "#fff",
      }}
    >
      {/* ── HEADER ── */}
      <div style={{ textAlign: "center", borderBottom: "1.5px solid #000", paddingBottom: 4, marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700, textDecoration: "underline", letterSpacing: 1 }}>FORM F</div>
        <div style={{ fontSize: 7, color: "#444" }}>[See Proviso to Section 4(3), Rule 9(4) and Rule 10(1A)]</div>
        <div style={{ fontSize: 8, fontWeight: 600, marginTop: 1 }}>
          FORM FOR MAINTENANCE OF RECORD IN RESPECT OF PREGNANT WOMAN<br />
          BY GENETIC CLINIC / ULTRASOUND CLINIC / IMAGING CENTRE
        </div>
      </div>

      {/* ── COLUMNS A + B ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 3 }}>
        <tbody>
          {/* Row 1: Centre + Reg No */}
          <tr style={{ borderBottom: "1px solid #ccc" }}>
            <td style={{ width: "55%", padding: "2px 4px", verticalAlign: "top", fontSize: 8 }}>
              <span style={{ fontWeight: 600 }}>1. Name &amp; address of Centre:&nbsp;</span>
              <span style={{ fontSize: 9, fontWeight: 700 }}>{form.centreName.replace(/\n/g, ", ")}</span>
            </td>
            <td style={{ padding: "2px 4px", verticalAlign: "top", fontSize: 8 }}>
              <span style={{ fontWeight: 600 }}>2. Reg. No.:&nbsp;</span>
              <BlankLine val={form.registrationNo} width={80} />
            </td>
          </tr>

          {/* Row 2: Patient + Age */}
          <tr style={{ borderBottom: "1px solid #ccc" }}>
            <td style={{ padding: "2px 4px", fontSize: 8 }}>
              <span style={{ fontWeight: 600 }}>3. Patient Name: </span>
              <BlankLine val={form.patientName} width={140} />
            </td>
            <td style={{ padding: "2px 4px", fontSize: 8 }}>
              <span style={{ fontWeight: 600 }}>Age: </span>
              <BlankLine val={form.age} width={50} />
              <span style={{ fontWeight: 600 }}> Yrs</span>
            </td>
          </tr>

          {/* Row 3: Husband/Father + Children */}
          <tr style={{ borderBottom: "1px solid #ccc" }}>
            <td style={{ padding: "2px 4px", fontSize: 8 }}>
              <span style={{ fontWeight: 600 }}>5. Husband's/Father's name: </span>
              <BlankLine val={form.husbandFatherName} width={120} />
            </td>
            <td style={{ padding: "2px 4px", fontSize: 8 }}>
              <span style={{ fontWeight: 600 }}>4. Children:&nbsp;</span>
              <span style={{ marginRight: 6 }}>
                Boy:&nbsp;
                <span style={{ display: "inline-block", border: "1px solid #333", width: 20, height: 12, textAlign: "center", fontSize: 9, lineHeight: "12px", verticalAlign: "middle" }}>
                  {form.boyCount || ""}
                </span>
              </span>
              <span>
                Girl:&nbsp;
                <span style={{ display: "inline-block", border: "1px solid #333", width: 20, height: 12, textAlign: "center", fontSize: 9, lineHeight: "12px", verticalAlign: "middle" }}>
                  {form.girlCount || ""}
                </span>
              </span>
            </td>
          </tr>

          {/* Row 4: Address + Phone */}
          <tr style={{ borderBottom: "1px solid #ccc" }}>
            <td style={{ padding: "2px 4px", fontSize: 8 }}>
              <span style={{ fontWeight: 600 }}>6. Address: </span>
              <BlankLine val={form.address} width={160} />
            </td>
            <td style={{ padding: "2px 4px", fontSize: 8 }}>
              <span style={{ fontWeight: 600 }}>Tel: </span>
              <BlankLine val={form.mobile} width={80} />
            </td>
          </tr>

          {/* Row 5: Referred by + LMP */}
          <tr style={{ borderBottom: "1px solid #ccc" }}>
            <td style={{ padding: "2px 4px", fontSize: 8 }}>
              <span style={{ fontWeight: 600 }}>7. Referred by:&nbsp;</span>
              <Tick checked={form.referredBy === "Self"} /> Self&nbsp;&nbsp;
              <Tick checked={form.referredBy === "Doctor"} /> Doctor: <BlankLine val={form.referredByName} width={80} />
            </td>
            <td style={{ padding: "2px 4px", fontSize: 8 }}>
              <span style={{ fontWeight: 600 }}>8. LMP/weeks: </span>
              <BlankLine val={form.lmpWeeks} width={80} />
            </td>
          </tr>

          {/* Row 6: Genetic history */}
          <tr style={{ borderBottom: "1px solid #ccc" }}>
            <td colSpan={2} style={{ padding: "2px 4px", fontSize: 8 }}>
              <span style={{ fontWeight: 600 }}>9. Genetic/medical history:&nbsp;</span>
              <Tick checked={form.geneticHistory === "none"} /> No significant history&nbsp;&nbsp;
              <Tick checked={form.geneticHistory === "specify"} /> Specify: <BlankLine val={form.geneticHistoryDetail} width={120} />
              &nbsp;&nbsp;<span style={{ fontWeight: 600 }}>Basis:&nbsp;</span>
              <Tick checked={form.basisDiagnosisClinical} /> Clinical&nbsp;
              <Tick checked={form.basisDiagnosisUsg} /> USG&nbsp;
              <Tick checked={!!form.basisDiagnosisOther} /> Other: <BlankLine val={form.basisDiagnosisOther} width={60} />
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── SECTION 10 ── */}
      <div style={{ fontWeight: 700, fontSize: 8, textDecoration: "underline", marginBottom: 2 }}>
        10. Indication for pre-natal diagnosis
      </div>
      <div style={{ fontSize: 8, marginBottom: 3 }}>
        <Tick checked={form.indicationType === "routine"} /> Routine antenatal / clinical indication&nbsp;&nbsp;
        <Tick checked={form.indicationType === "age"} /> Advanced maternal age&nbsp;&nbsp;
        <Tick checked={form.indicationType === "genetic"} /> Genetic disease&nbsp;&nbsp;
        <Tick checked={form.indicationType === "previous"} /> Previous child issue: <BlankLine val={form.previousChildIssue} width={80} />
        &nbsp;&nbsp;<Tick checked={form.indicationType === "other"} /> Other: <BlankLine val={form.indicationDetail} width={80} />
      </div>

      {/* ── SECTION 11 ── */}
      <div style={{ fontWeight: 700, fontSize: 8, textDecoration: "underline", marginBottom: 2 }}>
        11. Procedures carried out
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 3 }}>
        <tbody>
          <tr style={{ borderBottom: "1px solid #ccc" }}>
            <td style={{ padding: "2px 4px", fontSize: 8, width: "50%" }}>
              <span style={{ fontWeight: 600 }}>Doctor/Radiologist: </span>
              <BlankLine val={form.doctorName} width={130} />
            </td>
            <td style={{ padding: "2px 4px", fontSize: 8 }}>
              <span style={{ fontWeight: 600 }}>Non-invasive procedure: </span>
              <BlankLine val={form.procedure} width={100} />
            </td>
          </tr>
          <tr style={{ borderBottom: "1px solid #ccc" }}>
            <td style={{ padding: "2px 4px", fontSize: 8 }}>
              <span style={{ fontWeight: 600 }}>Purpose: </span>
              <BlankLine val={form.procedurePurpose} width={150} />
            </td>
            <td style={{ padding: "2px 4px", fontSize: 8 }}>
              <span style={{ fontWeight: 600 }}>Invasive procedure:&nbsp;</span>
              <Tick checked={form.invasiveProcedure === "notdone"} /> Not done&nbsp;
              <Tick checked={form.invasiveProcedure === "done"} /> Done: <BlankLine val={form.invasiveProcedureDetail} width={60} />
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── SECTIONS 12-19 ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 3 }}>
        <tbody>
          <Row label="12. Complication">
            <Tick checked={form.complication === "nil"} /> Nil&nbsp;&nbsp;
            <Tick checked={form.complication === "specify"} /> Specify: <BlankLine val={form.complicationDetail} width={100} />
          </Row>
          <Row label="13. Lab tests recommended">
            <Tick checked={form.labTests === "notadvised"} /> Not advised&nbsp;&nbsp;
            <Tick checked={form.labTests === "advised"} /> Advised: <BlankLine val={form.labTestsDetail} width={100} />
          </Row>
                  <Row label="14(a). Gestational Age">
            <span style={{ fontSize: 9 }}>{form.gestationalAgeWeeks || "___"} weeks,&nbsp;{form.gestationalAgeDays || "___"} days</span>
          </Row>
          <Row label="14(b). USG result">
            <Tick checked={form.ultrasoundResult === "normal"} /> Normal&nbsp;&nbsp;
            <Tick checked={form.ultrasoundResult === "abnormal"} /> Abnormal: <BlankLine val={form.abnormality} width={120} />
          </Row>
          <Row label="15. Date of procedure">
            <BlankLine val={formatDate(form.procedureDate)} width={80} />
          </Row>
          <Row label="16. Consent date (invasive)">
            <BlankLine val={form.consentDate ? formatDate(form.consentDate) : "N/A"} width={80} />
          </Row>
          <Row label="17. Result conveyed to/date">
            <BlankLine val={form.resultConveyed} width={180} />
          </Row>
          <Row label="18. MTP advised/conducted">
            <Tick checked={form.mtpAdvised === "no"} /> No&nbsp;&nbsp;
            <Tick checked={form.mtpAdvised === "yes"} /> Yes
          </Row>
          <Row label="19. Date MTP carried out">
            <BlankLine val={form.mtpDate ? formatDate(form.mtpDate) : "N/A"} width={80} />
          </Row>
        </tbody>
      </table>

      {/* Date / Place / Signature */}
      <div style={{ display: "flex", gap: 16, marginBottom: 4, fontSize: 8 }}>
        <div><span style={{ fontWeight: 600 }}>Date: </span><BlankLine val={formatDate(form.date)} width={70} /></div>
        <div><span style={{ fontWeight: 600 }}>Place: </span><BlankLine val={form.place} width={80} /></div>
        <div style={{ flex: 1, textAlign: "right" }}>
          <span style={{ fontWeight: 600 }}>Signature &amp; Reg. No. of Doctor: </span>
          <BlankLine
            val={form.doctorRegNo ? `${form.doctorName} (Reg. ${form.doctorRegNo})` : form.doctorName}
            width={140}
          />
        </div>
      </div>

      {/* ── DECLARATION SECTION ── 2 columns side by side */}
      <div style={{ display: "flex", gap: 8, borderTop: "1px solid #666", paddingTop: 4 }}>
        {/* Declaration of pregnant woman */}
        <div style={{ flex: 1, border: "0.5px solid #aaa", padding: "3px 5px", borderRadius: 2 }}>
          <div style={{ fontWeight: 700, fontSize: 8, textAlign: "center", textDecoration: "underline", marginBottom: 3 }}>
            DECLARATION OF PREGNANT WOMAN
          </div>
          <p style={{ fontSize: 7.5, lineHeight: 1.4, margin: 0 }}>
            I, Ms. <BlankLine val={form.patientName} width={90} /> declare that by undergoing
            ultrasonography/image scanning etc. I do not want to know the sex of my foetus.
          </p>
          <div style={{ marginTop: 10, fontSize: 7.5 }}>
            Signature / Thumb impression: ______________________
          </div>
        </div>

        {/* Declaration of doctor */}
        <div style={{ flex: 1, border: "0.5px solid #aaa", padding: "3px 5px", borderRadius: 2 }}>
          <div style={{ fontWeight: 700, fontSize: 8, textAlign: "center", textDecoration: "underline", marginBottom: 3 }}>
            DECLARATION OF DOCTOR / PERSON CONDUCTING USG
          </div>
          <p style={{ fontSize: 7.5, lineHeight: 1.4, margin: 0 }}>
            I, <BlankLine val={form.doctorName} width={80} /> declare that while conducting
            ultrasonography on Ms. <BlankLine val={form.patientName} width={80} />, I have neither
            detected nor disclosed the sex of her foetus to anybody in any manner.
          </p>
          <div style={{ marginTop: 4, fontSize: 7.5, fontWeight: 700, textAlign: "center" }}>
            {form.doctorName}
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div style={{ fontSize: 6.5, color: "#666", textAlign: "center", marginTop: 4 }}>
        *Strike out whichever is not applicable or not necessary* &nbsp;|&nbsp; Reg. No. {form.registrationNo}
        {form.billNumber ? ` | Bill No. ${form.billNumber}` : ""}
      </div>

      {/* ── ID Card Attachment (reduced) ── */}
      {idCardImageUrl && (
        <div style={{ marginTop: 6, borderTop: "1px dashed #ccc", paddingTop: 4 }}>
          <div style={{ fontSize: 7, fontWeight: 600, marginBottom: 2 }}>Attached ID Card:</div>
          <img
            src={idCardImageUrl}
            alt="Patient ID Card"
            style={{ maxHeight: "35mm", maxWidth: "55mm", border: "1px solid #ddd", borderRadius: 2 }}
          />
        </div>
      )}
    </div>
  );
}

type RecordRow = {
  id: number;
  billNumber?: string;
  patientName?: string;
  husbandFatherName?: string;
  mobile?: string;
  referredBy?: string;
  ultrasoundResult?: string;
  procedureDate?: string;
  date?: string;
  age?: string;
  address?: string;
  childrenDetails?: string;
  lmpWeeks?: string;
  geneticHistory?: string;
  basisDiagnosis?: string;
  indicationOther?: string;
  doctorName?: string;
  procedure?: string;
  procedurePurpose?: string;
  invasiveProcedure?: string;
  complication?: string;
  labTests?: string;
  gestationalAgeWeeks?: string;
  gestationalAgeDays?: string;
  abnormality?: string;
  consentDate?: string;
  resultConveyed?: string;
  mtpAdvised?: string;
  mtpDate?: string;
  place?: string;
  centreName?: string;
  registrationNo?: string;
  previousChildIssue?: string;
  createdAt?: string;
};

type PendingItem = {
  billId: number;
  billNumber: string;
  billDate: string;
  patientName: string;
  mobile: string;
  address: string;
  age: string;
  referredBy: string;
  referredByName: string;
  formFTests: string[];
};

export default function FormF() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"pending" | "form" | "records">("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [form, setForm] = useState<FormFData>(defaultForm());

  // ── Feature 2: ID Card Upload + AI OCR + Camera Scanner ──
  const [idCardImageUrl, setIdCardImageUrl] = useState("");
  const [idCardExtractedName, setIdCardExtractedName] = useState("");
  const [idCardExtractedAddress, setIdCardExtractedAddress] = useState("");
  const [idCardVerified, setIdCardVerified] = useState(false);
  const [idCardUploading, setIdCardUploading] = useState(false);
  const [idCardOcrResult, setIdCardOcrResult] = useState<{
    guardianName?: string; address?: string; documentType?: string; confidence?: string;
  } | null>(null);
  // Camera / scanner capture state
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── Feature 5: Send WhatsApp to patient requesting ID card ──
  const [waSending, setWaSending] = useState(false);

  // Module B: PCPNDT Form F now auto-fills the conducting doctor's medical-council
  // registration number. We fetch the small doctor list once and expose it via a
  // <datalist> so staff can pick a saved doctor and have the reg no fill itself.
  const { data: doctorList } = useQuery<{ doctors: DoctorOption[]; total: number }>({
    queryKey: ["formf-doctors"],
    queryFn: () => api.get("/api/doctors?limit=200"),
    staleTime: 60_000,
  });
  const doctorsForPick = doctorList?.doctors ?? [];
  const printRef = useRef<HTMLDivElement>(null);

  // Pending queue state
  const [pendingQueue, setPendingQueue] = useState<PendingItem[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingTestSearch, setPendingTestSearch] = useState("");
  const [pendingCategory, setPendingCategory] = useState("All Categories");
  const [pendingTests, setPendingTests] = useState<Array<{ id: number; name: string; code?: string | null; category?: string | null }>>([]);
  const [pendingTestsLoading, setPendingTestsLoading] = useState(false);

  // Records tab state
  const [listSearch, setListSearch] = useState("");
  const [listSearchBy, setListSearchBy] = useState<"patientName"|"husbandFatherName"|"mobile"|"referredBy">("patientName");
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [listLoading, setListLoading] = useState(false);

  async function fetchFromBilling() {
    if (!search.trim()) {
      toast({ title: "Enter Bill No or UHID", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const data = await api.get<Record<string, string>>(
        `/api/form-f/fetch-billing/${encodeURIComponent(search.trim())}`
      );
      setForm((prev) => ({
        ...prev,
        billNumber: data.billNumber ?? prev.billNumber,
        patientName: data.patientName ?? prev.patientName,
        age: data.age ?? prev.age,
        husbandFatherName: data.husbandFatherName ?? prev.husbandFatherName,
        address: data.address ?? prev.address,
        mobile: data.mobile ?? prev.mobile,
        referredBy: data.referredBy ?? prev.referredBy,
        referredByName: data.referredByName ?? prev.referredByName,
        procedureDate: data.billDate ?? prev.procedureDate,
        date: data.billDate ?? prev.date,
        ultrasoundResult: data.ultrasoundResult ?? prev.ultrasoundResult,
        procedurePurpose: data.procedurePurpose ?? prev.procedurePurpose,
      }));
      toast({ title: "Patient data loaded", description: `Bill: ${data.billNumber ?? search}` });
    } catch {
      toast({ title: "Not found", description: "No billing record matched", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function set<K extends keyof FormFData>(key: K, value: FormFData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function inp(key: keyof FormFData) {
    return {
      value: form[key] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value as FormFData[typeof key]),
      className: "h-7 text-xs border-gray-300 px-2",
    };
  }

  // ── ID card image processing (shared by upload + camera) ──
  async function processIdImage(file: File) {
    setIdCardUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = String(reader.result ?? "");
        const base64 = dataUrl.split(",")[1];
        if (!base64) { toast({ title: "Failed to read image", variant: "destructive" }); setIdCardUploading(false); return; }
        setIdCardImageUrl(dataUrl);
        const resp = await api.post<{
          ocr?: { guardianName?: string; address?: string; documentType?: string; confidence?: string; } | null;
          recordId?: number;
        }>("/api/form-f/upload-id", {
          formFId: 0,
          imageBase64: base64,
          mimeType: file.type,
        });
        setIdCardOcrResult(resp.ocr ?? null);
        if (resp.ocr?.guardianName) setIdCardExtractedName(resp.ocr.guardianName);
        if (resp.ocr?.address) setIdCardExtractedAddress(resp.ocr.address);
        toast({ title: resp.ocr ? `ID scanned: ${resp.ocr.documentType}` : "ID scanned (OCR unavailable)" });
        setIdCardUploading(false);
      };
      reader.readAsDataURL(file);
    } catch { toast({ title: "Upload failed", variant: "destructive" }); setIdCardUploading(false); }
  }

  // ── Camera / scanner capture helpers ──
  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      toast({ title: "Camera not available", description: "Check permissions or use Upload instead", variant: "destructive" });
      setCameraOpen(false);
    }
  }
  function stopCamera() {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }
  function captureFromCamera() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      stopCamera();
      setCameraOpen(false);
      const file = new File([blob], "scan.jpg", { type: "image/jpeg" });
      await processIdImage(file);
    }, "image/jpeg", 0.92);
  }

  const fetchPending = useCallback(async () => {
    setPendingLoading(true);
    try {
      const data = await api.get<PendingItem[]>("/api/form-f/pending");
      setPendingQueue(data);
    } catch {
      setPendingQueue([]);
    } finally {
      setPendingLoading(false);
    }
  }, []);

  const fetchPendingTests = useCallback(async (q = "") => {
    setPendingTestsLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      const data = await api.get<Array<{ id: number; name: string; code?: string | null; category?: string | null }>>(`/api/form-f/pending-tests?${params.toString()}`);
      setPendingTests(
        pendingCategory === "All Categories"
          ? data
          : data.filter((t) => (t.category ?? "Uncategorized") === pendingCategory)
      );
    } catch {
      setPendingTests([]);
    } finally {
      setPendingTestsLoading(false);
    }
  }, [pendingCategory]);

  const fetchRecords = useCallback(async (q?: string, by?: string) => {
    setListLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) { params.set("search", q); params.set("searchBy", by ?? "patientName"); }
      const data = await api.get<RecordRow[]>(`/api/form-f/list?${params.toString()}`);
      setRecords(data);
    } catch {
      setRecords([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "records") fetchRecords();
    if (activeTab === "pending") fetchPending();
  }, [activeTab, fetchRecords, fetchPending]);

  useEffect(() => { fetchPending(); }, [fetchPending]);
  useEffect(() => {
    if (activeTab === "pending") fetchPendingTests(pendingTestSearch);
  }, [activeTab, pendingTestSearch, fetchPendingTests]);

  // ── Start camera when scanner modal opens ──
  useEffect(() => {
    if (cameraOpen) {
      startCamera();
    }
    return () => { stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOpen]);

  function openFromQueue(item: PendingItem) {
    setForm({
      ...defaultForm(),
      billNumber: item.billNumber,
      patientName: item.patientName,
      age: item.age,
      address: item.address,
      mobile: item.mobile,
      referredBy: item.referredBy,
      referredByName: item.referredByName,
      procedurePurpose: item.formFTests.join(", ") || "Obstetric ultrasonography",
      procedureDate: item.billDate,
      date: item.billDate,
    });
    setLastSaved(null);
    setActiveTab("form");
    toast({ title: `Form F opened for ${item.patientName}`, description: "Fill remaining fields and print to save." });
  }

  function loadRecord(r: RecordRow) {
    const ref = r.referredBy ?? "Self";
    const isDoctor = ref.startsWith("Doctor");
    const doctorName = isDoctor ? ref.replace(/^Doctor:\s*/, "") : "";
    const children = r.childrenDetails ?? "";
    const boyMatch = children.match(/Boy:\s*(\d+)/i);
    const girlMatch = children.match(/Girl:\s*(\d+)/i);
    setForm({
      ...defaultForm(),
      centreName: r.centreName ?? defaultForm().centreName,
      registrationNo: r.registrationNo ?? defaultForm().registrationNo,
      billNumber: r.billNumber ?? "",
      patientName: r.patientName ?? "",
      age: r.age ?? "",
      boyCount: boyMatch ? boyMatch[1] : "",
      girlCount: girlMatch ? girlMatch[1] : "",
      husbandFatherName: r.husbandFatherName ?? "",
      address: r.address ?? "",
      mobile: r.mobile ?? "",
      referredBy: isDoctor ? "Doctor" : "Self",
      referredByName: doctorName,
      lmpWeeks: r.lmpWeeks ?? "",
      previousChildIssue: r.previousChildIssue ?? "",
      doctorName: r.doctorName ?? "",
      procedure: r.procedure ?? "",
      procedurePurpose: r.procedurePurpose ?? "",
      invasiveProcedure: r.invasiveProcedure === "Not done" ? "notdone" : "done",
      invasiveProcedureDetail: r.invasiveProcedure !== "Not done" ? (r.invasiveProcedure ?? "") : "",
      complication: r.complication === "Nil" ? "nil" : "specify",
      complicationDetail: r.complication !== "Nil" ? (r.complication ?? "") : "",
      labTests: r.labTests === "Not advised" ? "notadvised" : "advised",
      labTestsDetail: r.labTests !== "Not advised" ? (r.labTests ?? "") : "",
      gestationalAgeWeeks: r.gestationalAgeWeeks ?? "",
      gestationalAgeDays: r.gestationalAgeDays ?? "",
      ultrasoundResult: r.ultrasoundResult?.startsWith("Abnormal") ? "abnormal" : "normal",
      abnormality: r.abnormality ?? "",
      procedureDate: r.procedureDate ?? "",
      consentDate: r.consentDate ?? "",
      resultConveyed: r.resultConveyed ?? "",
      mtpAdvised: r.mtpAdvised === "Yes" ? "yes" : "no",
      mtpDate: r.mtpDate ?? "",
      date: r.date ?? "",
      place: r.place ?? "",
    });
    setActiveTab("form");
    toast({ title: "Record loaded into form" });
  }

  async function saveFormF(silent = false) {
    setSaving(true);
    try {
      const payload = {
        billNumber: form.billNumber,
        centreName: form.centreName,
        registrationNo: form.registrationNo,
        patientName: form.patientName,
        age: form.age,
        childrenDetails: [form.boyCount ? `Boy: ${form.boyCount}` : "", form.girlCount ? `Girl: ${form.girlCount}` : ""].filter(Boolean).join(", ") || "Not specified",
        husbandFatherName: form.husbandFatherName,
        address: form.address,
        mobile: form.mobile,
        referredBy: form.referredBy === "Doctor" ? `Doctor: ${form.referredByName}` : "Self",
        lmpWeeks: form.lmpWeeks,
        geneticHistory: form.geneticHistory === "none" ? "No significant history" : form.geneticHistoryDetail,
        basisDiagnosis: [form.basisDiagnosisClinical && "Clinical", form.basisDiagnosisUsg && "USG", form.basisDiagnosisOther].filter(Boolean).join(", "),
        previousChildIssue: form.previousChildIssue || "Not applicable",
        indicationOther: form.indicationType === "routine" ? "Routine antenatal" : form.indicationDetail,
        doctorName: form.doctorName,
        procedure: form.procedure,
        procedurePurpose: form.procedurePurpose,
        invasiveProcedure: form.invasiveProcedure === "notdone" ? "Not done" : form.invasiveProcedureDetail,
        complication: form.complication === "nil" ? "Nil" : form.complicationDetail,
        labTests: form.labTests === "notadvised" ? "Not advised" : form.labTestsDetail,
        gestationalAgeWeeks: form.gestationalAgeWeeks,
        gestationalAgeDays: form.gestationalAgeDays,
        ultrasoundResult: form.ultrasoundResult === "normal" ? "Normal" : `Abnormal: ${form.abnormality}`,
        abnormality: form.abnormality,
        procedureDate: form.procedureDate,
        consentDate: form.consentDate,
        resultConveyed: form.resultConveyed,
        mtpAdvised: form.mtpAdvised === "no" ? "No" : "Yes",
        mtpDate: form.mtpDate,
        date: form.date,
        place: form.place,
        idCardImageUrl: idCardImageUrl || null,
        idCardExtractedName: idCardExtractedName || null,
        idCardExtractedAddress: idCardExtractedAddress || null,
        idCardVerified: idCardVerified || false,
      };
      await api.post("/api/form-f/save", payload);
      const now = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      setLastSaved(now);
      if (!silent) toast({ title: "Form F saved to database" });
    } catch {
      if (!silent) toast({ title: "Failed to save Form F", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function printAndSave() {
    await saveFormF(true);
    printForm();
  }

  function printForm() {
    const printArea = document.getElementById("formf-print");
    if (!printArea) return;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { window.print(); return; }
    w.document.write(`
      <!DOCTYPE html><html><head>
      <title>Form F - PCPNDT</title>
      <style>
        @page { size: A4; margin: 0; }
        body { margin: 0; padding: 0; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      </style>
      </head><body>
      ${printArea.outerHTML}
      <script>window.onload=()=>{window.print();window.close();}<\/script>
      </body></html>`);
    w.document.close();
  }

  const LabelRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-start gap-2">
      <span className="text-[11px] font-semibold w-40 flex-shrink-0 text-gray-600 pt-1">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );

  const BigLabelRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-start gap-3">
      <span className="text-sm font-semibold w-44 flex-shrink-0 text-gray-700 pt-2">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );

  const Radio = ({ name, val, label }: { name: keyof FormFData; val: string; label: string }) => (
    <label className="inline-flex items-center gap-1 cursor-pointer mr-3">
      <input
        type="radio"
        checked={form[name] === val}
        onChange={() => set(name, val as FormFData[typeof name])}
        className="w-3 h-3"
      />
      <span className="text-xs">{label}</span>
    </label>
  );

  const Check = ({ field, label }: { field: keyof FormFData; label: string }) => (
    <label className="inline-flex items-center gap-1 cursor-pointer mr-3">
      <input
        type="checkbox"
        checked={!!form[field]}
        onChange={(e) => set(field, e.target.checked as FormFData[typeof field])}
        className="w-3 h-3"
      />
      <span className="text-xs">{label}</span>
    </label>
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50">
      {/* Top bar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-blue-600" />
          <div>
            <div className="font-bold text-sm">Form F — PCPNDT</div>
            <div className="text-[10px] text-gray-500">Record for Pregnant Woman (Ultrasound / Imaging Centre)</div>
          </div>
        </div>

        {/* Tab buttons */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors ${activeTab === "pending" ? "bg-orange-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            <Users size={12} />
            Pending Queue
            {pendingQueue.length > 0 && (
              <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${activeTab === "pending" ? "bg-white text-orange-600" : "bg-orange-500 text-white"}`}>
                {pendingQueue.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("form")}
            className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors border-l border-gray-200 ${activeTab === "form" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            <FileText size={12} /> Fill Form
          </button>
          <button
            onClick={() => setActiveTab("records")}
            className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors border-l border-gray-200 ${activeTab === "records" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            <List size={12} /> Saved Records
          </button>
        </div>

        {activeTab === "form" && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
              <span className="text-[10px] text-amber-700 font-medium">Incidental finding?</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Bill No / UHID / Name to fetch…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchFromBilling()}
                className="h-8 text-xs w-52"
              />
              <Button size="sm" onClick={fetchFromBilling} disabled={loading} className="h-8 text-xs flex-shrink-0">
                <Search size={12} className="mr-1" />{loading ? "…" : "Fetch"}
              </Button>
            </div>
          </div>
        )}

        {activeTab === "form" && (
          <div className="ml-auto flex items-center gap-2">
            {lastSaved && (
              <span className="text-[10px] text-green-600 bg-green-50 border border-green-200 rounded px-2 py-1">
                ✓ Auto-saved {lastSaved}
              </span>
            )}
            {activeTab === "form" && form.mobile && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs border-green-300 bg-green-50 hover:bg-green-100 text-green-700"
                disabled={waSending}
                onClick={async () => {
                  setWaSending(true);
                  try {
                    const resp = await api.post<{ ok: boolean; messageId?: string }>("/api/form-f/send-whatsapp", {
                      mobile: form.mobile,
                      patientName: form.patientName,
                    });
                    if (resp.ok) {
                      toast({ title: "WhatsApp sent", description: `Message sent to ${form.mobile}. Patient can reply with ID card photo.` });
                    } else {
                      toast({ title: "Send failed", description: "Could not send WhatsApp message.", variant: "destructive" });
                    }
                  } catch {
                    toast({ title: "Send failed", description: "Could not send WhatsApp message.", variant: "destructive" });
                  } finally {
                    setWaSending(false);
                  }
                }}
              >
                <MessageCircle size={12} className="mr-1" />{waSending ? "Sending…" : "Request ID Card"}
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setForm(defaultForm()); setLastSaved(null); setIdCardImageUrl(""); setIdCardExtractedName(""); setIdCardExtractedAddress(""); setIdCardVerified(false); setIdCardOcrResult(null); }}>
              <RefreshCcw size={12} className="mr-1" /> Reset
            </Button>
            <Button size="sm" className="h-8 text-xs" onClick={printAndSave} disabled={saving}>
              <Printer size={12} className="mr-1" /> {saving ? "Saving…" : "Print A4"}
            </Button>
          </div>
        )}
      </div>

      {/* ── PENDING QUEUE TAB ── */}
      {activeTab === "pending" && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-4xl mx-auto space-y-4">
            {/* Header */}
            <div className="flex flex-wrap items-end gap-3 justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-800">Pending Form F Queue</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Patients billed for PCPNDT-required tests who need a Form F filled. Click any row to open the form.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Search tests by name or code…"
                  value={pendingTestSearch}
                  onChange={(e) => setPendingTestSearch(e.target.value)}
                  className="h-8 text-xs w-56"
                />
                <Input
                  value={pendingCategory}
                  onChange={(e) => setPendingCategory(e.target.value)}
                  className="h-8 text-xs w-40"
                />
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={fetchPending} disabled={pendingLoading}>
                  <RefreshCcw size={12} className={`mr-1 ${pendingLoading ? "animate-spin" : ""}`} />
                  {pendingLoading ? "Refreshing…" : "Refresh"}
                </Button>
              </div>
            </div>

            {pendingLoading ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-400">
                Loading pending patients…
              </div>
            ) : pendingTestsLoading ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-400">
                Loading tests…
              </div>
            ) : pendingTests.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-400">
                No tests match.
              </div>
            ) : pendingQueue.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <div className="text-4xl mb-3">✓</div>
                <div className="font-semibold text-gray-700 text-sm">All caught up!</div>
                <div className="text-xs text-gray-400 mt-1">No pending Form F patients found.</div>
                <div className="text-xs text-gray-400 mt-1">
                  Make sure PCPNDT tests are marked in Settings → Form F Tests.
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-orange-50 border-b border-orange-100 px-4 py-2 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold">{pendingQueue.length}</span>
                  <span className="text-xs font-semibold text-orange-700">patients awaiting Form F</span>
                </div>
                <div className="border-b border-gray-100 px-4 py-3 flex flex-wrap gap-2">
                  {pendingTests.map((t) => (
                    <button
                      key={t.id}
                      className="px-3 py-1 rounded-full border border-gray-200 text-xs bg-white hover:bg-gray-50"
                    >
                      {t.code ? `${t.code} — ` : ""}
                      {t.name}
                    </button>
                  ))}
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Billing Date</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Patient Name</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Mobile</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600">PCPNDT Test(s)</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Bill No.</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-gray-600">Referred By</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingQueue.map((item, i) => (
                      <tr
                        key={item.billId}
                        onClick={() => openFromQueue(item)}
                        className={`border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors group ${i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}
                      >
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {item.billDate ? new Date(item.billDate).toLocaleDateString("en-IN") : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-800">{item.patientName || "—"}</div>
                          {item.age && <div className="text-[10px] text-gray-400">Age: {item.age} yrs</div>}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{item.mobile || "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {item.formFTests.map((t) => (
                              <span key={t} className="bg-purple-100 text-purple-700 text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-purple-200">
                                {t}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-[11px]">{item.billNumber}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {item.referredBy === "Doctor" ? (
                            <span className="bg-blue-50 text-blue-700 text-[10px] px-1.5 py-0.5 rounded border border-blue-100">Dr. {item.referredByName}</span>
                          ) : (
                            <span className="text-gray-400 text-[10px]">Self / Walk-in</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-blue-600 font-semibold text-xs group-hover:underline whitespace-nowrap">Fill Form →</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Incidental finding notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <span className="text-lg mt-0.5">💡</span>
              <div>
                <div className="text-xs font-semibold text-amber-800">Incidental pregnancy finding?</div>
                <div className="text-xs text-amber-700 mt-0.5">
                  If pregnancy was discovered during a routine test (e.g. USG Whole Abdomen) not in the list above,
                  click <button onClick={() => setActiveTab("form")} className="underline font-semibold">Fill Form</button> and use the Fetch option to load the patient by bill number or name.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RECORDS TAB ── */}
      {activeTab === "records" && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-5xl mx-auto">
            {/* Search bar */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold text-gray-700">Search records by:</span>
                <div className="flex gap-1">
                  {([
                    { val: "patientName",      label: "Patient",  icon: <User size={11} /> },
                    { val: "husbandFatherName",label: "Husband",  icon: <Users size={11} /> },
                    { val: "mobile",           label: "Mobile",   icon: <Phone size={11} /> },
                    { val: "referredBy",       label: "Ref. By",  icon: <BookOpen size={11} /> },
                  ] as const).map(({ val, label, icon }) => (
                    <button
                      key={val}
                      onClick={() => setListSearchBy(val)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${listSearchBy === val ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
                    >
                      {icon} {label}
                    </button>
                  ))}
                </div>
                <div className="flex-1 flex items-center gap-2 min-w-48">
                  <Input
                    placeholder={`Search by ${listSearchBy === "patientName" ? "patient name" : listSearchBy === "husbandFatherName" ? "husband/father name" : listSearchBy === "mobile" ? "mobile number" : "referred by"}…`}
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchRecords(listSearch, listSearchBy)}
                    className="h-8 text-xs"
                  />
                  <Button size="sm" className="h-8 text-xs" onClick={() => fetchRecords(listSearch, listSearchBy)} disabled={listLoading}>
                    <Search size={12} className="mr-1" />{listLoading ? "…" : "Search"}
                  </Button>
                  {listSearch && (
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setListSearch(""); fetchRecords(); }}>
                      Clear
                    </Button>
                  )}
                </div>
                <span className="text-xs text-gray-400">{records.length} record{records.length !== 1 ? "s" : ""}</span>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {listLoading ? (
                <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
              ) : records.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400">No records found. {listSearch ? "Try a different search." : "Save a Form F to see it here."}</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Date</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Patient Name</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Husband/Father</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Mobile</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Bill No.</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-gray-600">USG Result</th>
                      <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Referred By</th>
                      <th className="px-3 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r, i) => (
                      <tr
                        key={r.id}
                        className={`border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
                        onClick={() => loadRecord(r)}
                      >
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                          {r.procedureDate ? new Date(r.procedureDate).toLocaleDateString("en-IN") : r.date ? new Date(r.date).toLocaleDateString("en-IN") : "—"}
                        </td>
                        <td className="px-3 py-2 font-medium text-gray-800">{r.patientName || "—"}</td>
                        <td className="px-3 py-2 text-gray-600">{r.husbandFatherName || "—"}</td>
                        <td className="px-3 py-2 text-gray-600">{r.mobile || "—"}</td>
                        <td className="px-3 py-2 text-gray-500">{r.billNumber || "—"}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${r.ultrasoundResult?.startsWith("Abnormal") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                            {r.ultrasoundResult || "Normal"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600">{r.referredBy || "Self"}</td>
                        <td className="px-3 py-2 text-right">
                          <span className="text-blue-600 font-medium hover:underline">Open →</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "form" && <div className="flex-1 overflow-y-auto p-4">
        <div className="flex gap-4 max-w-7xl mx-auto">

          {/* ── LEFT: Edit Form (two sections) ── */}
          <div className="flex-1 space-y-3">
            {/* Section 0: PATIENT FROM BILL — auto-filled, mobile editable */}
            <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 pb-2 border-b border-indigo-100 mb-3">
                <User size={14} className="text-indigo-600" />
                <span className="text-sm font-bold text-indigo-800">Patient from Bill</span>
                <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Auto-filled from bill · Editable</span>
              </div>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <LabelRow label="Patient Name *">
                    <Input {...inp("patientName")} placeholder="Auto-filled from bill — editable for spelling correction" className="text-sm h-9" />
                  </LabelRow>
                  <LabelRow label="Age *">
                    <Input {...inp("age")} placeholder="Auto-filled — editable if wrong" className="text-sm h-9 w-28" />
                  </LabelRow>
                </div>
                <LabelRow label="Mobile *">
                  <div className="flex gap-2">
                    <Input {...inp("mobile")} placeholder="Mobile (editable — staff may enter dummy numbers)" className="text-sm h-9 flex-1" />
                    {form.mobile && !/^\d{10}$/.test(form.mobile.replace(/\D/g, "")) && (
                      <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1 self-center whitespace-nowrap">
                        Looks like dummy — verify
                      </span>
                    )}
                  </div>
                </LabelRow>
              </div>
            </div>

            {/* Section 1: CONDUCTING DOCTOR — separate card */}
            <div className="bg-teal-50/60 border border-teal-100 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 pb-2 border-b border-teal-100 mb-3">
                <Stethoscope size={14} className="text-teal-600" />
                <span className="text-sm font-bold text-teal-800">Conducting Doctor</span>
                <span className="text-[10px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">Auto-filled from bill · Editable</span>
              </div>
              <div className="space-y-3">
                <LabelRow label="Doctor Name">
                  <Input
                    value={form.doctorName}
                    list="formf-doctor-options"
                    onChange={(e) => {
                      const name = e.target.value;
                      const match = doctorsForPick.find((d) => d.name === name);
                      setForm((prev) => ({
                        ...prev,
                        doctorName: name,
                        doctorRegNo: match?.registrationNumber ?? prev.doctorRegNo,
                      }));
                    }}
                    placeholder="Type or pick a doctor"
                    className="text-sm h-9"
                  />
                  <datalist id="formf-doctor-options">
                    {doctorsForPick.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.registrationNumber ? `Reg. ${d.registrationNumber}` : "No reg. no on file"}
                      </option>
                    ))}
                  </datalist>
                </LabelRow>
                <LabelRow label="Doctor Reg. No.">
                  <Input {...inp("doctorRegNo")} placeholder="Auto-filled from selected doctor; editable" className="text-sm h-9" />
                </LabelRow>
              </div>
            </div>

            {/* Section 2: DETAILS TO FILL — BIG BOX, BIG FONTS */}
            <div className="bg-white border-2 border-orange-200 rounded-xl p-6 shadow-md">
              <div className="flex items-center gap-2 pb-3 border-b-2 border-orange-100 mb-4">
                <span className="text-base font-extrabold text-gray-900">Details to Fill</span>
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">Type these fields</span>
              </div>
              <div className="space-y-5">
                <BigLabelRow label="Husband / Father Name *">
                  <div className="flex gap-2">
                    <Input {...inp("husbandFatherName")} placeholder="Required for PCPNDT" className="flex-1 text-base h-11" />
                    {/* ── File upload (scanner / file picker) ── */}
                    <label className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-dashed border-orange-300 bg-orange-50 cursor-pointer text-sm font-medium transition-colors ${idCardUploading ? "opacity-60 cursor-wait" : "hover:bg-orange-100 text-orange-700"}`}>
                      <Upload size={14} className={idCardUploading ? "animate-pulse" : ""} />
                      <span>{idCardUploading ? "Scanning…" : "Upload ID"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          await processIdImage(file);
                        }}
                      />
                    </label>
                    {/* ── Camera / scanner capture (PC webcam / document scanner) ── */}
                    <button
                      type="button"
                      onClick={() => setCameraOpen(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-dashed border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium transition-colors"
                      title="Use scanner / webcam attached to this PC"
                    >
                      <Camera size={14} /> Scan
                    </button>
                  </div>
                </BigLabelRow>

                {/* ── AI-extracted ID card data review ── */}
                {(idCardOcrResult || idCardExtractedName || idCardExtractedAddress) && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle size={14} className="text-blue-600" />
                      <span className="text-sm font-semibold text-blue-800">AI-extracted ID card data — please verify</span>
                      {idCardOcrResult && (
                        <Badge variant="outline" className="text-xs h-5 ml-auto">
                          {idCardOcrResult.confidence} confidence
                        </Badge>
                      )}
                    </div>
                    {idCardExtractedName && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-blue-700 flex-1 truncate">
                          <span className="font-semibold">Guardian:</span> {idCardExtractedName}
                        </span>
                        <Button
                          size="sm" variant="ghost" className="h-7 text-xs px-3 py-0"
                          onClick={() => { set("husbandFatherName", idCardExtractedName); setIdCardVerified(true); toast({ title: "Guardian name accepted" }); }}
                        >
                          <CheckCircle2 size={12} className="mr-1" /> Use this
                        </Button>
                      </div>
                    )}
                    {idCardExtractedAddress && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-blue-700 flex-1 truncate">
                          <span className="font-semibold">Address:</span> {idCardExtractedAddress}
                        </span>
                        <Button
                          size="sm" variant="ghost" className="h-7 text-xs px-3 py-0"
                          onClick={() => { set("address", idCardExtractedAddress); setIdCardVerified(true); toast({ title: "Address accepted" }); }}
                        >
                          <CheckCircle2 size={12} className="mr-1" /> Use this
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <BigLabelRow label="Full Address *">
                  <Input {...inp("address")} placeholder="Patient's full address" className="text-base h-11" />
                </BigLabelRow>
                <BigLabelRow label="No. of children">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-1.5">Boy</span>
                      <Input type="number" min={0} max={20} value={form.boyCount} onChange={(e) => set("boyCount", e.target.value)} className="h-11 text-base w-20 text-center" placeholder="0" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-pink-700 bg-pink-50 border border-pink-200 rounded px-3 py-1.5">Girl</span>
                      <Input type="number" min={0} max={20} value={form.girlCount} onChange={(e) => set("girlCount", e.target.value)} className="h-11 text-base w-20 text-center" placeholder="0" />
                    </div>
                    <span className="text-sm text-muted-foreground">(enter count per gender)</span>
                  </div>
                </BigLabelRow>
                <BigLabelRow label="Referred by">
                  <div className="flex items-center gap-3 flex-wrap">
                    <label className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium cursor-pointer transition-colors ${form.referredBy === "Self" ? "border-teal-300 bg-teal-50 text-teal-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
                      <input
                        type="radio"
                        name="referredBy"
                        value="Self"
                        checked={form.referredBy === "Self"}
                        onChange={() => setForm((prev) => ({ ...prev, referredBy: "Self", referredByName: "" }))}
                        className="accent-teal-600"
                      />
                      <span>Self / Walk-in</span>
                    </label>
                    <label className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium cursor-pointer transition-colors ${form.referredBy === "Doctor" ? "border-teal-300 bg-teal-50 text-teal-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
                      <input
                        type="radio"
                        name="referredBy"
                        value="Doctor"
                        checked={form.referredBy === "Doctor"}
                        onChange={() => setForm((prev) => ({ ...prev, referredBy: "Doctor", referredByName: prev.referredByName || "" }))}
                        className="accent-teal-600"
                      />
                      <span>Doctor</span>
                    </label>
                    {form.referredBy === "Doctor" && (
                      <div className="relative">
                        <Input
                          value={form.referredByName}
                          onChange={(e) => {
                            setForm((prev) => ({
                              ...prev,
                              referredByName: e.target.value,
                            }));
                          }}
                          list="formf-referredby-doctor-options"
                          placeholder="Search doctor name..."
                          className="h-11 text-base w-72 pr-8"
                        />
                        <datalist id="formf-referredby-doctor-options">
                          {doctorsForPick.map((d) => (
                            <option key={d.id} value={d.name}>
                              {d.registrationNumber ? `Reg. ${d.registrationNumber}` : "No reg. no on file"}
                            </option>
                          ))}
                        </datalist>
                        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    )}
                  </div>
                </BigLabelRow>
                <BigLabelRow label="LMP / weeks">
                  <Input {...inp("lmpWeeks")} placeholder="e.g. 12 weeks / 15-01-2026" className="text-base h-11" />
                </BigLabelRow>
                <BigLabelRow label="Indication">
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Radio name="indicationType" val="routine" label="Routine antenatal" />
                      <Radio name="indicationType" val="age" label="Adv. maternal age" />
                      <Radio name="indicationType" val="genetic" label="Genetic disease" />
                      <Radio name="indicationType" val="previous" label="Prev. child issue" />
                      <Radio name="indicationType" val="other" label="Other" />
                    </div>
                    {(form.indicationType === "previous" || form.indicationType === "other") && (
                      <Input {...inp("indicationDetail")} placeholder="Specify details" className="h-11 text-base" />
                    )}
                    {form.indicationType === "previous" && (
                      <Input {...inp("previousChildIssue")} placeholder="Previous child details" className="h-11 text-base" />
                    )}
                  </div>
                </BigLabelRow>
                <BigLabelRow label="Invasive procedure">
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <Radio name="invasiveProcedure" val="notdone" label="Not done" />
                      <Radio name="invasiveProcedure" val="done" label="Done:" />
                    </div>
                    {form.invasiveProcedure === "done" && (
                      <Input {...inp("invasiveProcedureDetail")} placeholder="Specify" className="h-11 text-base" />
                    )}
                  </div>
                </BigLabelRow>
                <BigLabelRow label="Complication">
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <Radio name="complication" val="nil" label="Nil" />
                      <Radio name="complication" val="specify" label="Specify:" />
                    </div>
                    {form.complication === "specify" && (
                      <Input {...inp("complicationDetail")} placeholder="Details" className="h-11 text-base" />
                    )}
                  </div>
                </BigLabelRow>
                <BigLabelRow label="Lab tests">
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <Radio name="labTests" val="notadvised" label="Not advised" />
                      <Radio name="labTests" val="advised" label="Advised:" />
                    </div>
                    {form.labTests === "advised" && (
                      <Input {...inp("labTestsDetail")} placeholder="Tests advised" className="h-11 text-base" />
                    )}
                  </div>
                </BigLabelRow>
                <BigLabelRow label="Gestational Age (14a)">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={42}
                        value={form.gestationalAgeWeeks}
                        onChange={(e) => set("gestationalAgeWeeks", e.target.value)}
                        placeholder="Weeks"
                        className="h-11 text-base w-24 text-center"
                      />
                      <span className="text-sm font-medium text-gray-600">weeks</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={6}
                        value={form.gestationalAgeDays}
                        onChange={(e) => set("gestationalAgeDays", e.target.value)}
                        placeholder="Days"
                        className="h-11 text-base w-24 text-center"
                      />
                      <span className="text-sm font-medium text-gray-600">days</span>
                    </div>
                  </div>
                </BigLabelRow>
                <BigLabelRow label="USG result">
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <Radio name="ultrasoundResult" val="normal" label="Normal" />
                      <Radio name="ultrasoundResult" val="abnormal" label="Abnormal:" />
                    </div>
                    {form.ultrasoundResult === "abnormal" && (
                      <Input {...inp("abnormality")} placeholder="Abnormality details" className="h-11 text-base" />
                    )}
                  </div>
                </BigLabelRow>
                <BigLabelRow label="Procedure date">
                  <Input type="date" {...inp("procedureDate")} className="text-base h-11" />
                </BigLabelRow>
                <BigLabelRow label="Result conveyed">
                  <Input {...inp("resultConveyed")} className="text-base h-11" />
                </BigLabelRow>
                <BigLabelRow label="MTP advised">
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <Radio name="mtpAdvised" val="no" label="No" />
                      <Radio name="mtpAdvised" val="yes" label="Yes" />
                    </div>
                    {form.mtpAdvised === "yes" && (
                      <Input type="date" {...inp("mtpDate")} className="h-11 text-base w-56" />
                    )}
                  </div>
                </BigLabelRow>
              </div>
            </div>

            {/* Section B: AUTO-FILLED from Billing / Defaults — compact, muted */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 shadow-sm">
              <div className="flex items-center gap-2 pb-1 border-b border-gray-200 mb-2">
                <span className="text-xs font-bold text-gray-600">Auto-filled from Billing</span>
                <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">Pre-filled</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <span className="text-[11px] font-semibold text-gray-500 w-24 flex-shrink-0 pt-1">Bill No.</span>
                  <Input {...inp("billNumber")} placeholder="Auto-filled on Fetch" className="h-7 text-xs flex-1 bg-white" />
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[11px] font-semibold text-gray-500 w-24 flex-shrink-0 pt-1">Centre Name</span>
                  <textarea
                    value={form.centreName}
                    onChange={(e) => set("centreName", e.target.value)}
                    rows={2}
                    className="flex-1 text-xs border rounded-md px-2 py-1 bg-white resize-none focus:ring-1 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[11px] font-semibold text-gray-500 w-24 flex-shrink-0 pt-1">Reg. No.</span>
                  <Input {...inp("registrationNo")} className="h-7 text-xs w-40 bg-white" />
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[11px] font-semibold text-gray-500 w-24 flex-shrink-0 pt-1">Procedure</span>
                  <Input {...inp("procedure")} placeholder="e.g. Ultrasound - ULTRASONOGRAPHY" className="h-7 text-xs flex-1 bg-white" />
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[11px] font-semibold text-gray-500 w-24 flex-shrink-0 pt-1">Purpose</span>
                  <Input {...inp("procedurePurpose")} placeholder="e.g. Obstetric ultrasonography" className="h-7 text-xs flex-1 bg-white" />
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[11px] font-semibold text-gray-500 w-24 flex-shrink-0 pt-1">Genetic Hx</span>
                  <div className="flex-1 space-y-1">
                    <div className="flex gap-1">
                      <Radio name="geneticHistory" val="none" label="None" />
                      <Radio name="geneticHistory" val="specify" label="Specify:" />
                    </div>
                    {form.geneticHistory === "specify" && (
                      <Input {...inp("geneticHistoryDetail")} placeholder="Details" className="h-7 text-xs" />
                    )}
                    <div className="flex items-center gap-1 text-[11px] text-gray-500">
                      <span>Basis:</span>
                      <Check field="basisDiagnosisClinical" label="Clinical" />
                      <Check field="basisDiagnosisUsg" label="USG" />
                      <span>Other:</span>
                      <Input {...inp("basisDiagnosisOther")} placeholder="" className="h-7 text-xs w-24" />
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[11px] font-semibold text-gray-500 w-24 flex-shrink-0 pt-1">Date / Place</span>
                  <div className="flex gap-2 flex-1">
                    <Input type="date" {...inp("date")} className="h-7 text-xs flex-1 bg-white" />
                    <Input {...inp("place")} className="h-7 text-xs flex-1 bg-white" placeholder="Place" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT: A4 Preview ── */}
          <div className="flex-shrink-0" style={{ width: "220mm" }}>
            <div className="text-xs text-gray-500 mb-2 text-center font-medium">
              A4 Print Preview — fits one page
            </div>
            <div
              ref={printRef}
              style={{
                boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
                borderRadius: 4,
                overflow: "hidden",
                border: "1px solid #ddd",
              }}
            >
              <FormFPrint form={form} idCardImageUrl={idCardImageUrl} />
            </div>
            <div className="mt-3 flex gap-2 justify-center">
              <Button className="h-8 text-xs" onClick={printAndSave} disabled={saving}>
                <Printer size={12} className="mr-1" /> {saving ? "Saving…" : "Print A4 (auto-saves)"}
              </Button>
            </div>
          </div>

        </div>
      </div>}

      {/* ── Camera / Scanner Modal ── */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { stopCamera(); setCameraOpen(false); }}>
          <div className="bg-white rounded-xl shadow-2xl p-4 max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-900">Scan ID Card — Camera / Scanner</h3>
              <button type="button" onClick={() => { stopCamera(); setCameraOpen(false); }} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
                <Button size="sm" onClick={captureFromCamera} className="bg-white text-black hover:bg-gray-100 font-semibold">
                  <Camera size={14} className="mr-1" /> Capture
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">Position the ID card in front of the camera and click Capture</p>
          </div>
        </div>
      )}
    </div>
  );
}
