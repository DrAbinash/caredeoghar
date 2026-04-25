import { useState, useRef } from "react";
import { api } from "@/lib/fetchApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Search, Save, Printer, RefreshCcw, FileText, Database } from "lucide-react";

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
  procedure: string;
  procedurePurpose: string;
  invasiveProcedure: string;  // "notdone" | "done"
  invasiveProcedureDetail: string;
  complication: string;       // "nil" | "specify"
  complicationDetail: string;
  labTests: string;           // "notadvised" | "advised"
  labTestsDetail: string;
  prenatalResult: string;
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
    procedure: "Ultrasound - ULTRASONOGRAPHY",
    procedurePurpose: "Obstetric ultrasonography",
    invasiveProcedure: "notdone",
    invasiveProcedureDetail: "",
    complication: "nil",
    complicationDetail: "",
    labTests: "notadvised",
    labTestsDetail: "",
    prenatalResult: "Not applicable",
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
}

function FormFPrint({ form }: FormFPrintProps) {
  return (
    <div
      id="formf-print"
      style={{
        width: "210mm",
        minHeight: "297mm",
        maxHeight: "297mm",
        padding: "8mm 10mm 6mm 10mm",
        boxSizing: "border-box",
        fontFamily: "Arial, sans-serif",
        fontSize: 8,
        color: "#000",
        backgroundColor: "#fff",
        overflow: "hidden",
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
          <Row label="14(a). Pre-natal result">
            <BlankLine val={form.prenatalResult} width={180} />
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
          <BlankLine val={form.doctorName} width={100} />
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
    </div>
  );
}

export default function FormF() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormFData>(defaultForm());
  const printRef = useRef<HTMLDivElement>(null);

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

  async function saveFormF() {
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
        prenatalResult: form.prenatalResult,
        ultrasoundResult: form.ultrasoundResult === "normal" ? "Normal" : `Abnormal: ${form.abnormality}`,
        abnormality: form.abnormality,
        procedureDate: form.procedureDate,
        consentDate: form.consentDate,
        resultConveyed: form.resultConveyed,
        mtpAdvised: form.mtpAdvised === "no" ? "No" : "Yes",
        mtpDate: form.mtpDate,
        date: form.date,
        place: form.place,
      };
      await api.post("/api/form-f/save", payload);
      toast({ title: "Form F saved to database" });
    } catch {
      toast({ title: "Failed to save Form F", variant: "destructive" });
    } finally {
      setSaving(false);
    }
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
        <div className="flex-1 flex items-center gap-2 max-w-md">
          <Input
            placeholder="Bill No / UHID / Name to auto-fill…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchFromBilling()}
            className="h-8 text-xs flex-1"
          />
          <Button size="sm" onClick={fetchFromBilling} disabled={loading} className="h-8 text-xs flex-shrink-0">
            <Search size={12} className="mr-1" />{loading ? "…" : "Fetch"}
          </Button>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setForm(defaultForm())}>
            <RefreshCcw size={12} className="mr-1" /> Reset
          </Button>
          <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700" onClick={saveFormF} disabled={saving}>
            <Database size={12} className="mr-1" />{saving ? "Saving…" : "Save to DB"}
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={printForm}>
            <Printer size={12} className="mr-1" /> Print A4
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex gap-4 max-w-7xl mx-auto">

          {/* ── LEFT: Edit Form ── */}
          <div className="flex-1 bg-white border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
              <span className="text-sm font-bold text-gray-800">Edit Form Fields</span>
              <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">All fields editable</span>
            </div>

            <LabelRow label="Bill No. (auto)">
              <Input {...inp("billNumber")} placeholder="Auto-filled on Fetch" />
            </LabelRow>
            <LabelRow label="Patient Name *">
              <Input {...inp("patientName")} placeholder="Full name of patient" />
            </LabelRow>
            <div className="flex gap-3">
              <LabelRow label="Age *">
                <Input {...inp("age")} placeholder="Years" />
              </LabelRow>
              <LabelRow label="Tel. No.">
                <Input {...inp("mobile")} placeholder="Mobile" />
              </LabelRow>
            </div>
            <LabelRow label="Husband/Father Name *">
              <Input {...inp("husbandFatherName")} placeholder="Required for PCPNDT" />
            </LabelRow>
            <LabelRow label="Full Address *">
              <Input {...inp("address")} placeholder="Patient's full address" />
            </LabelRow>
            <LabelRow label="No. of children">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">Boy</span>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={form.boyCount}
                    onChange={(e) => set("boyCount", e.target.value)}
                    className="h-8 text-sm w-16 text-center"
                    placeholder="0"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-pink-700 bg-pink-50 border border-pink-200 rounded px-2 py-1">Girl</span>
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    value={form.girlCount}
                    onChange={(e) => set("girlCount", e.target.value)}
                    className="h-8 text-sm w-16 text-center"
                    placeholder="0"
                  />
                </div>
                <span className="text-xs text-muted-foreground">(enter count per gender)</span>
              </div>
            </LabelRow>
            <LabelRow label="Referred by">
              <div className="flex items-center gap-2 flex-wrap">
                <Radio name="referredBy" val="Self" label="Self" />
                <Radio name="referredBy" val="Doctor" label="Doctor" />
                {form.referredBy === "Doctor" && (
                  <Input {...inp("referredByName")} placeholder="Doctor name" className="h-7 text-xs w-40" />
                )}
              </div>
            </LabelRow>
            <LabelRow label="LMP / weeks">
              <Input {...inp("lmpWeeks")} placeholder="e.g. 12 weeks / 15-01-2026" />
            </LabelRow>
            <LabelRow label="Genetic history">
              <div className="space-y-1">
                <div>
                  <Radio name="geneticHistory" val="none" label="No significant history" />
                  <Radio name="geneticHistory" val="specify" label="Specify:" />
                  {form.geneticHistory === "specify" && (
                    <Input {...inp("geneticHistoryDetail")} placeholder="Details" className="h-7 text-xs mt-1" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Basis:</span>
                  <Check field="basisDiagnosisClinical" label="Clinical" />
                  <Check field="basisDiagnosisUsg" label="USG" />
                  <span className="text-xs">Other:</span>
                  <Input {...inp("basisDiagnosisOther")} placeholder="" className="h-7 text-xs w-28" />
                </div>
              </div>
            </LabelRow>
            <LabelRow label="10. Indication">
              <div className="space-y-1">
                <div className="flex flex-wrap gap-1">
                  <Radio name="indicationType" val="routine" label="Routine antenatal" />
                  <Radio name="indicationType" val="age" label="Adv. maternal age" />
                  <Radio name="indicationType" val="genetic" label="Genetic disease" />
                  <Radio name="indicationType" val="previous" label="Prev. child issue" />
                  <Radio name="indicationType" val="other" label="Other" />
                </div>
                {(form.indicationType === "previous" || form.indicationType === "other") && (
                  <Input {...inp("indicationDetail")} placeholder="Specify details" className="h-7 text-xs" />
                )}
                {form.indicationType === "previous" && (
                  <Input {...inp("previousChildIssue")} placeholder="Previous child details" className="h-7 text-xs" />
                )}
              </div>
            </LabelRow>
            <LabelRow label="11. Procedure">
              <Input {...inp("procedure")} placeholder="e.g. Ultrasound - ULTRASONOGRAPHY" />
            </LabelRow>
            <LabelRow label="Purpose">
              <Input {...inp("procedurePurpose")} placeholder="e.g. Obstetric ultrasonography" />
            </LabelRow>
            <LabelRow label="Doctor name">
              <Input {...inp("doctorName")} />
            </LabelRow>
            <LabelRow label="Invasive procedure">
              <Radio name="invasiveProcedure" val="notdone" label="Not done" />
              <Radio name="invasiveProcedure" val="done" label="Done:" />
              {form.invasiveProcedure === "done" && (
                <Input {...inp("invasiveProcedureDetail")} placeholder="Specify" className="h-7 text-xs mt-1" />
              )}
            </LabelRow>
            <LabelRow label="12. Complication">
              <Radio name="complication" val="nil" label="Nil" />
              <Radio name="complication" val="specify" label="Specify:" />
              {form.complication === "specify" && (
                <Input {...inp("complicationDetail")} placeholder="Details" className="h-7 text-xs mt-1" />
              )}
            </LabelRow>
            <LabelRow label="13. Lab tests">
              <Radio name="labTests" val="notadvised" label="Not advised" />
              <Radio name="labTests" val="advised" label="Advised:" />
              {form.labTests === "advised" && (
                <Input {...inp("labTestsDetail")} placeholder="Tests advised" className="h-7 text-xs mt-1" />
              )}
            </LabelRow>
            <LabelRow label="14(b). USG result">
              <Radio name="ultrasoundResult" val="normal" label="Normal" />
              <Radio name="ultrasoundResult" val="abnormal" label="Abnormal:" />
              {form.ultrasoundResult === "abnormal" && (
                <Input {...inp("abnormality")} placeholder="Abnormality details" className="h-7 text-xs mt-1" />
              )}
            </LabelRow>
            <LabelRow label="15. Procedure date">
              <Input type="date" {...inp("procedureDate")} />
            </LabelRow>
            <LabelRow label="17. Result conveyed">
              <Input {...inp("resultConveyed")} />
            </LabelRow>
            <LabelRow label="18. MTP advised">
              <Radio name="mtpAdvised" val="no" label="No" />
              <Radio name="mtpAdvised" val="yes" label="Yes" />
              {form.mtpAdvised === "yes" && (
                <Input type="date" {...inp("mtpDate")} className="h-7 text-xs mt-1 w-40" />
              )}
            </LabelRow>
            <LabelRow label="Date / Place">
              <div className="flex gap-2">
                <Input type="date" {...inp("date")} className="flex-1 h-7 text-xs" />
                <Input {...inp("place")} className="flex-1 h-7 text-xs" placeholder="Place" />
              </div>
            </LabelRow>
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
              <FormFPrint form={form} />
            </div>
            <div className="mt-3 flex gap-2 justify-center">
              <Button className="h-8 text-xs" onClick={saveFormF} disabled={saving}>
                <Database size={12} className="mr-1" />{saving ? "Saving…" : "Save to DB"}
              </Button>
              <Button variant="outline" className="h-8 text-xs" onClick={printForm}>
                <Printer size={12} className="mr-1" /> Print this form
              </Button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
