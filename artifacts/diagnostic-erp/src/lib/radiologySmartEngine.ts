// ── Phase 5: Structured Smart Reporting Engine ──
// Deterministic, rules-based text generation. NO AI.
// All generated text is fully editable, auditable, and explainable.

// ============================================================================
// 1. BUILDER DEFINITIONS
// ============================================================================

export interface SmartBuilderField {
  id: string;
  label: string;
  type: "select" | "multiselect" | "number" | "text" | "checkbox";
  options?: string[];
  required?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  unit?: string;
}

export interface SmartBuilderSection {
  id: string;
  label: string;
  fields: SmartBuilderField[];
}

export interface SmartBuilder {
  type: string;
  label: string;
  studyType: string;
  sections: SmartBuilderSection[];
}

export const MRI_BRAIN_BUILDER: SmartBuilder = {
  type: "mri_brain",
  label: "MRI Brain",
  studyType: "MRI Brain",
  sections: [
    {
      id: "white_matter",
      label: "A. White Matter Disease",
      fields: [
        { id: "whiteMatter", type: "select", label: "White Matter", options: ["Normal", "Chronic Microangiopathic Changes", "Fazekas Grade 1", "Fazekas Grade 2", "Fazekas Grade 3"], required: true },
      ],
    },
    {
      id: "infarct",
      label: "B. Infarct",
      fields: [
        { id: "infarctPresent", type: "checkbox", label: "Infarct Present" },
        { id: "infarctType", type: "select", label: "Type", options: ["Acute", "Subacute", "Chronic", "Lacunar"], required: false },
        { id: "infarctLocation", type: "select", label: "Location", options: ["MCA Territory", "ACA Territory", "PCA Territory", "Basal Ganglia", "Thalamus", "Brainstem", "Cerebellum", "Custom Location"], required: false },
        { id: "infarctSide", type: "select", label: "Side", options: ["Right", "Left", "Bilateral"], required: false },
        { id: "infarctCustom", type: "text", label: "Custom Location", placeholder: "Enter custom location...", required: false },
      ],
    },
    {
      id: "hemorrhage",
      label: "C. Hemorrhage",
      fields: [
        { id: "hemorrhagePresent", type: "checkbox", label: "Hemorrhage Present" },
        { id: "hemorrhageType", type: "select", label: "Type", options: ["EDH", "SDH", "SAH", "IPH", "IVH"], required: false },
        { id: "hemorrhageLocation", type: "text", label: "Location", placeholder: "e.g., Right parietal", required: false },
        { id: "hemorrhageSide", type: "select", label: "Side", options: ["Right", "Left", "Bilateral"], required: false },
        { id: "hemorrhageThickness", type: "number", label: "Thickness", placeholder: "mm", min: 0, unit: "mm", required: false },
        { id: "midlineShift", type: "number", label: "Midline Shift", placeholder: "mm", min: 0, unit: "mm", required: false },
      ],
    },
    {
      id: "atrophy",
      label: "D. Brain Atrophy",
      fields: [
        { id: "atrophy", type: "select", label: "Atrophy", options: ["None", "Mild", "Moderate", "Severe"], required: true },
      ],
    },
    {
      id: "hydrocephalus",
      label: "E. Hydrocephalus",
      fields: [
        { id: "hydrocephalus", type: "select", label: "Hydrocephalus", options: ["None", "Mild", "Moderate", "Severe"], required: true },
      ],
    },
  ],
};

export const MRI_CERVICAL_SPINE_BUILDER: SmartBuilder = {
  type: "mri_cervical_spine",
  label: "MRI Cervical Spine",
  studyType: "MRI Cervical Spine",
  sections: [
    {
      id: "level_findings",
      label: "Level Findings",
      fields: [
        {
          id: "levels",
          type: "multiselect",
          label: "Levels",
          options: ["C2-C3", "C3-C4", "C4-C5", "C5-C6", "C6-C7", "C7-T1"],
          required: true,
        },
        {
          id: "findings",
          type: "multiselect",
          label: "Findings",
          options: [
            "Disc Desiccation",
            "Reduced Disc Height",
            "Diffuse Disc Bulge",
            "Posterocentral Protrusion",
            "Posterolateral Protrusion",
            "Disc Osteophyte Complex",
            "Facet Arthropathy",
            "Ligamentum Flavum Hypertrophy",
            "Cord Compression",
            "Foraminal Narrowing",
          ],
          required: true,
        },
      ],
    },
    {
      id: "canal",
      label: "Canal Diameter",
      fields: [
        { id: "canalDiameter", type: "number", label: "AP Canal Diameter", placeholder: "mm", min: 0, unit: "mm", required: false },
      ],
    },
  ],
};

export const MRI_LUMBAR_SPINE_BUILDER: SmartBuilder = {
  type: "mri_lumbar_spine",
  label: "MRI Lumbar Spine",
  studyType: "MRI Lumbar Spine",
  sections: [
    {
      id: "level_findings",
      label: "Level Findings",
      fields: [
        {
          id: "levels",
          type: "multiselect",
          label: "Levels",
          options: ["L1-L2", "L2-L3", "L3-L4", "L4-L5", "L5-S1"],
          required: true,
        },
        {
          id: "findings",
          type: "multiselect",
          label: "Findings",
          options: [
            "Disc Desiccation",
            "Diffuse Bulge",
            "Protrusion",
            "Extrusion",
            "Annular Tear",
            "Nerve Root Compression",
            "Facet Hypertrophy",
            "Ligamentum Flavum Hypertrophy",
            "Canal Stenosis",
            "Foraminal Stenosis",
          ],
          required: true,
        },
      ],
    },
    {
      id: "canal",
      label: "Canal Diameter",
      fields: [
        { id: "canalDiameter", type: "number", label: "AP Canal Diameter", placeholder: "mm", min: 0, unit: "mm", required: false },
      ],
    },
  ],
};

export const USG_ABDOMEN_BUILDER: SmartBuilder = {
  type: "usg_abdomen",
  label: "USG Abdomen",
  studyType: "USG Abdomen",
  sections: [
    {
      id: "liver",
      label: "A. Liver",
      fields: [
        { id: "fattyLiver", type: "select", label: "Fatty Liver", options: ["Normal", "Grade 1", "Grade 2", "Grade 3"], required: true },
      ],
    },
    {
      id: "gallbladder",
      label: "B. Gall Bladder",
      fields: [
        { id: "gallbladder", type: "select", label: "Gall Bladder", options: ["Normal", "Sludge", "Single Calculus", "Multiple Calculi", "Wall Thickening"], required: true },
      ],
    },
    {
      id: "kidney",
      label: "C. Kidney",
      fields: [
        { id: "kidney", type: "select", label: "Kidney", options: ["Normal", "Calculus", "Hydronephrosis", "Cortical Thinning"], required: true },
      ],
    },
    {
      id: "obstetric",
      label: "D. Obstetric (if applicable)",
      fields: [
        { id: "cr", type: "number", label: "CRL", placeholder: "mm", min: 0, unit: "mm", required: false },
        { id: "bpd", type: "number", label: "BPD", placeholder: "mm", min: 0, unit: "mm", required: false },
        { id: "hc", type: "number", label: "HC", placeholder: "mm", min: 0, unit: "mm", required: false },
        { id: "ac", type: "number", label: "AC", placeholder: "mm", min: 0, unit: "mm", required: false },
        { id: "fl", type: "number", label: "FL", placeholder: "mm", min: 0, unit: "mm", required: false },
      ],
    },
  ],
};

export const ALL_BUILDERS: SmartBuilder[] = [
  MRI_BRAIN_BUILDER,
  MRI_CERVICAL_SPINE_BUILDER,
  MRI_LUMBAR_SPINE_BUILDER,
  USG_ABDOMEN_BUILDER,
];

export function getBuilderForStudyType(studyType: string): SmartBuilder | undefined {
  return ALL_BUILDERS.find((b) => b.studyType.toLowerCase() === studyType.toLowerCase());
}

export function getBuilderForType(builderType: string): SmartBuilder | undefined {
  return ALL_BUILDERS.find((b) => b.type === builderType);
}

export function detectBuilderType(modality: string, studyDescription?: string | null): string | null {
  const desc = (studyDescription ?? "").toLowerCase();
  const mod = (modality ?? "").toLowerCase();

  if (mod === "mr" || mod === "mri") {
    if (desc.includes("brain")) return "mri_brain";
    if (desc.includes("cervical")) return "mri_cervical_spine";
    if (desc.includes("lumbar") || desc.includes("lumbo") || desc.includes("lumbosacral")) return "mri_lumbar_spine";
  }
  if (mod === "us" || mod === "ultrasound" || mod === "usg") {
    if (desc.includes("abdomen") || desc.includes("abdominal")) return "usg_abdomen";
  }
  return null;
}

// ============================================================================
// 2. REPORT GENERATION
// ============================================================================

export interface GeneratedReport {
  findings: string;
  impression: string;
  severity: string;
  priority: string;
  recommendations: string[];
  matchedRules: string[];
  isEmpty: boolean;
}

export interface ImpressionRule {
  id: string;
  name: string;
  conditions: RuleCondition[];
  text: string;
  severity: string;
  priority: string;
}

export interface RuleCondition {
  field: string;
  operator: string;
  value: string | string[] | number;
}

function evaluateRule(condition: RuleCondition, selections: Record<string, unknown>): boolean {
  const val = selections[condition.field];
  if (condition.operator === "equals") return val === condition.value;
  if (condition.operator === "not_equals") return val !== condition.value;
  if (condition.operator === "includes") {
    if (Array.isArray(val)) return (condition.value as string[]).some((v) => val.includes(v));
    return String(val).includes(condition.value as string);
  }
  if (condition.operator === "not_includes") {
    if (Array.isArray(val)) return !(condition.value as string[]).some((v) => val.includes(v));
    return !String(val).includes(condition.value as string);
  }
  if (condition.operator === "greater_than") return Number(val) > Number(condition.value);
  if (condition.operator === "less_than") return Number(val) < Number(condition.value);
  if (condition.operator === "greater_equal") return Number(val) >= Number(condition.value);
  if (condition.operator === "less_equal") return Number(val) <= Number(condition.value);
  return false;
}

export function evaluateImpressionRules(
  selections: Record<string, unknown>,
  rules: ImpressionRule[]
): { matched: ImpressionRule[]; severity: string; priority: string } {
  const matched = rules.filter((r) => r.conditions.every((c) => evaluateRule(c, selections)));
  const severities = matched.map((r) => r.severity);
  const priorities = matched.map((r) => r.priority);
  const severityRank = { critical: 4, severe: 3, urgent: 2, moderate: 1, normal: 0 };
  const severity = severities.sort((a, b) => (severityRank[b as keyof typeof severityRank] ?? 0) - (severityRank[a as keyof typeof severityRank] ?? 0))[0] ?? "normal";
  const priority = priorities.sort((a, b) => (severityRank[b as keyof typeof severityRank] ?? 0) - (severityRank[a as keyof typeof severityRank] ?? 0))[0] ?? "normal";
  return { matched, severity, priority };
}

export const DEFAULT_SEED_RULES: ImpressionRule[] = [
  { id: "acute_infarct_mca", name: "Acute Infarct MCA", conditions: [{ field: "infarctType", operator: "equals", value: "Acute" }, { field: "infarctLocation", operator: "equals", value: "MCA Territory" }], text: "Acute infarct involving the MCA territory.", severity: "critical", priority: "critical" },
  { id: "edh", name: "EDH", conditions: [{ field: "hemorrhageType", operator: "equals", value: "EDH" }], text: "Extradural hematoma with associated mass effect.", severity: "critical", priority: "critical" },
  { id: "grade3_fatty", name: "Grade 3 Fatty Liver", conditions: [{ field: "fattyLiver", operator: "equals", value: "Grade 3" }], text: "Severe fatty infiltration of liver.", severity: "severe", priority: "urgent" },
  { id: "bulge_nerve", name: "Bulge + Nerve Root Compression", conditions: [{ field: "findings", operator: "includes", value: ["Diffuse Bulge", "Nerve Root Compression"] }], text: "Diffuse disc bulge causing compression upon bilateral exiting nerve roots.", severity: "moderate", priority: "urgent" },
  { id: "severe_stenosis", name: "Severe Canal Stenosis", conditions: [{ field: "canalDiameter", operator: "less_than", value: "5" }], text: "Severe spinal canal stenosis.", severity: "critical", priority: "critical" },
  { id: "cord_compression", name: "Cord Compression", conditions: [{ field: "findings", operator: "includes", value: "Cord Compression" }], text: "Spinal cord compression — urgent neurosurgical evaluation.", severity: "critical", priority: "critical" },
  { id: "sdh", name: "SDH", conditions: [{ field: "hemorrhageType", operator: "equals", value: "SDH" }], text: "Subdural hematoma with associated mass effect.", severity: "critical", priority: "critical" },
  { id: "sah", name: "SAH", conditions: [{ field: "hemorrhageType", operator: "equals", value: "SAH" }], text: "Subarachnoid hemorrhage with associated mass effect.", severity: "critical", priority: "critical" },
  { id: "iph", name: "IPH", conditions: [{ field: "hemorrhageType", operator: "equals", value: "IPH" }], text: "Intraparenchymal hemorrhage with associated mass effect.", severity: "critical", priority: "critical" },
  { id: "ivh", name: "IVH", conditions: [{ field: "hemorrhageType", operator: "equals", value: "IVH" }], text: "Intraventricular hemorrhage with associated mass effect.", severity: "critical", priority: "critical" },
];

// ── MRI Brain ──
function generateMriBrainFindings(sel: Record<string, unknown>): string {
  const parts: string[] = [];

  // White Matter
  const wm = sel.whiteMatter as string;
  if (wm === "Normal") parts.push("White matter: No hyperintense lesions on T2/FLAIR.");
  else if (wm === "Chronic Microangiopathic Changes") parts.push("White matter: Chronic microangiopathic changes seen on T2/FLAIR.");
  else if (wm === "Fazekas Grade 1") parts.push("White matter: Scattered periventricular and deep white matter hyperintensities (Fazekas Grade 1).");
  else if (wm === "Fazekas Grade 2") parts.push("White matter: Confluent periventricular and deep white matter hyperintensities (Fazekas Grade 2).");
  else if (wm === "Fazekas Grade 3") parts.push("White matter: Extensive confluent periventricular and deep white matter hyperintensities extending to subcortical regions (Fazekas Grade 3).");

  // Infarct
  if (sel.infarctPresent === true) {
    const type = sel.infarctType as string;
    const location = sel.infarctLocation as string;
    const side = sel.infarctSide as string;
    const custom = sel.infarctCustom as string;
    let loc = location;
    if (location === "Custom Location" && custom) loc = custom;
    if (side) loc = `${side} ${loc}`;
    if (type && loc) parts.push(`Infarct: ${type} infarct involving the ${loc}.`);
  }

  // Hemorrhage
  if (sel.hemorrhagePresent === true) {
    const type = sel.hemorrhageType as string;
    const location = sel.hemorrhageLocation as string;
    const side = sel.hemorrhageSide as string;
    const thickness = sel.hemorrhageThickness as number;
    const shift = sel.midlineShift as number;
    let desc = `${type} seen in the ${side} ${location}`;
    if (thickness) desc += `, thickness ${thickness} mm`;
    if (shift) desc += `; midline shift ${shift} mm`;
    desc += ".";
    parts.push(`Hemorrhage: ${desc}`);
  }

  // Atrophy
  const atrophy = sel.atrophy as string;
  if (atrophy === "None") parts.push("Brain volume: Normal.");
  else if (atrophy === "Mild") parts.push("Brain volume: Mild cerebral atrophy with mild sulcal prominence.");
  else if (atrophy === "Moderate") parts.push("Brain volume: Moderate cerebral atrophy with prominent sulci and ventricles.");
  else if (atrophy === "Severe") parts.push("Brain volume: Severe cerebral atrophy with marked prominence of sulci and ventricles.");

  // Hydrocephalus
  const hydro = sel.hydrocephalus as string;
  if (hydro === "None") parts.push("Ventricular system: Normal size and configuration.");
  else if (hydro === "Mild") parts.push("Ventricular system: Mild ventriculomegaly.");
  else if (hydro === "Moderate") parts.push("Ventricular system: Moderate ventriculomegaly with hydrocephalus.");
  else if (hydro === "Severe") parts.push("Ventricular system: Severe ventriculomegaly with hydrocephalus.");

  return parts.length ? parts.join("\n") : "No findings selected.";
}

// ── MRI Cervical Spine ──
function generateMriCervicalFindings(sel: Record<string, unknown>): string {
  const levels = sel.levels as string[];
  const findings = sel.findings as string[];
  const canal = sel.canalDiameter as number;
  const parts: string[] = [];

  if (levels && levels.length > 0 && findings && findings.length > 0) {
    const levelStr = levels.join(", ");
    const findingsStr = findings.join(", ");
    parts.push(`${levelStr}: ${findingsStr}.`);
  }

  if (canal !== undefined && canal !== null && !Number.isNaN(canal)) {
    let severity = "normal";
    if (canal > 10) severity = "none";
    else if (canal >= 8 && canal <= 10) severity = "mild";
    else if (canal >= 5 && canal < 8) severity = "moderate";
    else if (canal < 5) severity = "severe";
    const labels: Record<string, string> = {
      none: "No significant spinal canal stenosis",
      mild: "Mild spinal canal stenosis",
      moderate: "Moderate spinal canal stenosis",
      severe: "Severe spinal canal stenosis",
    };
    parts.push(`Canal diameter: ${canal} mm — ${labels[severity]}.`);
  }

  return parts.length ? parts.join("\n") : "No findings selected.";
}

// ── MRI Lumbar Spine ──
function generateMriLumbarFindings(sel: Record<string, unknown>): string {
  const levels = sel.levels as string[];
  const findings = sel.findings as string[];
  const canal = sel.canalDiameter as number;
  const parts: string[] = [];

  if (levels && levels.length > 0 && findings && findings.length > 0) {
    const levelStr = levels.join(", ");
    const findingsStr = findings.join(", ");
    parts.push(`${levelStr}: ${findingsStr}.`);
  }

  if (canal !== undefined && canal !== null && !Number.isNaN(canal)) {
    let severity = "normal";
    if (canal > 10) severity = "none";
    else if (canal >= 8 && canal <= 10) severity = "mild";
    else if (canal >= 5 && canal < 8) severity = "moderate";
    else if (canal < 5) severity = "severe";
    const labels: Record<string, string> = {
      none: "No significant spinal canal stenosis",
      mild: "Mild spinal canal stenosis",
      moderate: "Moderate spinal canal stenosis",
      severe: "Severe spinal canal stenosis",
    };
    parts.push(`Canal diameter: ${canal} mm — ${labels[severity]}.`);
  }

  return parts.length ? parts.join("\n") : "No findings selected.";
}

// ── USG Abdomen ──
function generateUsgAbdomenFindings(sel: Record<string, unknown>): string {
  const parts: string[] = [];

  // Liver
  const fl = sel.fattyLiver as string;
  if (fl === "Normal") parts.push("Liver: Normal size, shape, and echotexture. No focal lesion.");
  else if (fl === "Grade 1") parts.push("Liver: Mild increase in echotexture with mild attenuation of posterior wall (Grade 1 fatty liver).");
  else if (fl === "Grade 2") parts.push("Liver: Moderate increase in echotexture with moderate attenuation of posterior wall (Grade 2 fatty liver).");
  else if (fl === "Grade 3") parts.push("Liver: Marked increase in echotexture with marked attenuation of posterior wall (Grade 3 fatty liver).");

  // Gallbladder
  const gb = sel.gallbladder as string;
  if (gb === "Normal") parts.push("Gallbladder: Normal wall thickness. No calculus.");
  else if (gb === "Sludge") parts.push("Gallbladder: Sludge seen within the lumen.");
  else if (gb === "Single Calculus") parts.push("Gallbladder: Single calculus seen within the lumen.");
  else if (gb === "Multiple Calculi") parts.push("Gallbladder: Multiple calculi seen within the lumen.");
  else if (gb === "Wall Thickening") parts.push("Gallbladder: Wall thickening noted.");

  // Kidney
  const k = sel.kidney as string;
  if (k === "Normal") parts.push("Kidneys: Both normal size. No hydronephrosis / calculus.");
  else if (k === "Calculus") parts.push("Kidneys: Calculus seen.");
  else if (k === "Hydronephrosis") parts.push("Kidneys: Hydronephrosis present.");
  else if (k === "Cortical Thinning") parts.push("Kidneys: Cortical thinning noted.");

  // Obstetric
  const cr = sel.cr as number;
  const bpd = sel.bpd as number;
  const hc = sel.hc as number;
  const ac = sel.ac as number;
  const flVal = sel.fl as number;
  const obstetricParts: string[] = [];
  if (cr) { const ga = calculateGAFromCRL(cr); if (ga) obstetricParts.push(`CRL ${cr} mm → GA ${ga.weeks}+${ga.days} wks`); }
  if (bpd) { const ga = calculateGAFromBPD(bpd); if (ga) obstetricParts.push(`BPD ${bpd} mm → GA ${ga.weeks}+${ga.days} wks`); }
  if (hc) { const ga = calculateGAFromHC(hc); if (ga) obstetricParts.push(`HC ${hc} mm → GA ${ga.weeks}+${ga.days} wks`); }
  if (ac) { const ga = calculateGAFromAC(ac); if (ga) obstetricParts.push(`AC ${ac} mm → GA ${ga.weeks}+${ga.days} wks`); }
  if (flVal) { const ga = calculateGAFromFL(flVal); if (ga) obstetricParts.push(`FL ${flVal} mm → GA ${ga.weeks}+${ga.days} wks`); }
  if (obstetricParts.length > 0) {
    parts.push(`Obstetric: ${obstetricParts.join("; ")}.`);
  }

  return parts.length ? parts.join("\n") : "No findings selected.";
}

// ── Obstetric GA Calculation ──
function calculateGAFromCRL(mm: number): { weeks: number; days: number } | null {
  if (mm <= 0) return null;
  // Hadlock formula: GA = 40.9 + 3.2 * ln(CRL in mm) — simplified table
  const ga = 40.9 + 3.2 * Math.log(mm);
  const weeks = Math.floor(ga / 7);
  const days = Math.round(ga % 7);
  return { weeks, days };
}
function calculateGAFromBPD(mm: number): { weeks: number; days: number } | null {
  if (mm <= 0) return null;
  const ga = 9.54 + 1.482 * mm + 0.0164 * mm * mm;
  const weeks = Math.floor(ga);
  const days = Math.round((ga - weeks) * 7);
  return { weeks, days };
}
function calculateGAFromHC(mm: number): { weeks: number; days: number } | null {
  if (mm <= 0) return null;
  const ga = 10.3 + 0.028 * mm + 0.00167 * mm * mm;
  const weeks = Math.floor(ga);
  const days = Math.round((ga - weeks) * 7);
  return { weeks, days };
}
function calculateGAFromAC(mm: number): { weeks: number; days: number } | null {
  if (mm <= 0) return null;
  const ga = 8.14 + 0.034 * mm + 0.0012 * mm * mm;
  const weeks = Math.floor(ga);
  const days = Math.round((ga - weeks) * 7);
  return { weeks, days };
}
function calculateGAFromFL(mm: number): { weeks: number; days: number } | null {
  if (mm <= 0) return null;
  const ga = 10.35 + 0.175 * mm + 0.0012 * mm * mm;
  const weeks = Math.floor(ga);
  const days = Math.round((ga - weeks) * 7);
  return { weeks, days };
}

export function generateSmartReport(
  builderType: string,
  selections: Record<string, unknown>
): GeneratedReport {
  let findings = "";
  switch (builderType) {
    case "mri_brain": findings = generateMriBrainFindings(selections); break;
    case "mri_cervical_spine": findings = generateMriCervicalFindings(selections); break;
    case "mri_lumbar_spine": findings = generateMriLumbarFindings(selections); break;
    case "usg_abdomen": findings = generateUsgAbdomenFindings(selections); break;
    default: findings = "No findings selected.";
  }

  const ruleResult = evaluateImpressionRules(selections, DEFAULT_SEED_RULES);
  const impressions = ruleResult.matched.map((r) => r.text);
  const impression = impressions.length ? impressions.join("\n") : "No significant abnormality.";

  const recommendations: string[] = [];
  if (ruleResult.severity === "critical" || ruleResult.severity === "severe") {
    recommendations.push("Urgent clinical correlation and management advised.");
  }
  if (ruleResult.severity === "urgent") {
    recommendations.push("Clinical correlation advised.");
  }

  return {
    findings,
    impression,
    severity: ruleResult.severity,
    priority: ruleResult.priority,
    recommendations,
    matchedRules: ruleResult.matched.map((r) => r.name),
    isEmpty: findings === "No findings selected.",
  };
}

export function generateImpressionText(
  builderType: string,
  selections: Record<string, unknown>
): string {
  const ruleResult = evaluateImpressionRules(selections, DEFAULT_SEED_RULES);
  if (ruleResult.matched.length === 0) return "No significant abnormality.";
  return ruleResult.matched.map((r) => r.text).join("\n");
}

export function generateRecommendations(
  severity: string,
  matchedRules: string[]
): string[] {
  const recs: string[] = [];
  if (severity === "critical" || severity === "severe") {
    recs.push("Urgent clinical correlation and management advised.");
  } else if (severity === "urgent") {
    recs.push("Clinical correlation advised.");
  } else {
    recs.push("Routine follow-up.");
  }
  if (matchedRules.includes("Cord Compression")) {
    recs.push("Urgent neurosurgical evaluation recommended.");
  }
  if (matchedRules.includes("Acute Infarct MCA")) {
    recs.push("Immediate stroke protocol activation recommended.");
  }
  return recs;
}

// ============================================================================
// 3. CANAL STENOSIS CLASSIFICATION
// ============================================================================

export function classifyCanalStenosis(diameterMm: number): {
  severity: string;
  label: string;
  description: string;
} {
  if (diameterMm > 10) {
    return { severity: "normal", label: "No Significant Stenosis", description: `Canal diameter ${diameterMm} mm — no significant stenosis.` };
  }
  if (diameterMm >= 8 && diameterMm <= 10) {
    return { severity: "mild", label: "Mild Stenosis", description: `Canal diameter ${diameterMm} mm — mild stenosis.` };
  }
  if (diameterMm >= 5 && diameterMm < 8) {
    return { severity: "moderate", label: "Moderate Stenosis", description: `Canal diameter ${diameterMm} mm — moderate stenosis.` };
  }
  return { severity: "severe", label: "Severe Stenosis", description: `Canal diameter ${diameterMm} mm — severe stenosis.` };
}

// ============================================================================
// 4. UTILITY
// ============================================================================

export function defaultSelections(builderType: string): Record<string, unknown> {
  switch (builderType) {
    case "mri_brain":
      return { whiteMatter: "Normal", atrophy: "None", hydrocephalus: "None" };
    case "mri_cervical_spine":
      return { levels: [], findings: [], canalDiameter: "" };
    case "mri_lumbar_spine":
      return { levels: [], findings: [], canalDiameter: "" };
    case "usg_abdomen":
      return { fattyLiver: "Normal", gallbladder: "Normal", kidney: "Normal" };
    default:
      return {};
  }
}
