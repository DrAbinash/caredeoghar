/**
 * Internal Radiology RIS/PACS API
 *
 * These endpoints are NOT protected by staff session auth. Instead they use a
 * bearer token matching the INTERNAL_API_KEY environment secret — suitable for
 * server-to-server calls from Conquest PACS automation scripts.
 *
 * Mounted at: /api/internal  (see routes/index.ts)
 *
 * Endpoints:
 *   GET  /api/internal/patients/:patientId/contact
 *   POST /api/internal/radiology/studies        — study intake (upsert)
 *   POST /api/internal/radiology/report-status  — update worklist status
 *   POST /api/internal/radiology/ai-draft       — generate/return AI report draft
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  patientsTable,
  radiologyWorklistTable,
  radiologyAuditLogTable,
  dicomNodesTable,
  dicomPullJobsTable,
} from "@workspace/db/schema";
import { and, eq, or, sql, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ── Auth ─────────────────────────────────────────────────────────────────────

function requireInternalApiKey(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env["INTERNAL_API_KEY"];
  if (!expected) {
    // Key not configured — gate is open with a warning so existing deployments
    // keep working before the secret is provisioned. Log loudly.
    logger.warn("INTERNAL_API_KEY not set — internal radiology endpoints are unprotected");
    next();
    return;
  }
  const header = req.header("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (provided !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.use(requireInternalApiKey);

// ── Audit helper ─────────────────────────────────────────────────────────────

async function audit(opts: {
  worklistId?: number | null;
  accessionNumber?: string | null;
  action: string;
  actor?: string;
  details?: unknown;
}): Promise<void> {
  try {
    await db.insert(radiologyAuditLogTable).values({
      worklistId: opts.worklistId ?? null,
      accessionNumber: opts.accessionNumber ?? null,
      action: opts.action,
      actor: opts.actor ?? "system",
      details: opts.details !== undefined ? JSON.stringify(opts.details) : null,
    });
  } catch (err) {
    logger.error({ err }, "radiology audit log insert failed");
  }
}

// ── Patient contact lookup ────────────────────────────────────────────────────
// GET /api/internal/patients/:patientId/contact
// Accepts numeric DB id OR text UHID (patient_id field).

router.get("/patients/:patientId/contact", async (req, res) => {
  const param = req.params.patientId;
  const numericId = Number(param);

  const cond = Number.isInteger(numericId) && numericId > 0
    ? or(eq(patientsTable.id, numericId), eq(patientsTable.patientId, param))
    : eq(patientsTable.patientId, param);

  const [patient] = await db
    .select({
      id: patientsTable.id,
      patientId: patientsTable.patientId,
      firstName: patientsTable.firstName,
      lastName: patientsTable.lastName,
      dateOfBirth: patientsTable.dateOfBirth,
      gender: patientsTable.gender,
      phone: patientsTable.phone,
      email: patientsTable.email,
    })
    .from(patientsTable)
    .where(cond!);

  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  // Compute age from dateOfBirth (stored as ISO date string YYYY-MM-DD)
  let age = "";
  if (patient.dateOfBirth) {
    const dob = new Date(patient.dateOfBirth);
    if (!Number.isNaN(dob.getTime())) {
      const now = new Date();
      let years = now.getFullYear() - dob.getFullYear();
      const m = now.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) years--;
      age = `${years}Y`;
    }
  }

  res.json({
    patientId: patient.patientId,
    dbId: patient.id,
    name: `${patient.firstName} ${patient.lastName}`.trim(),
    age,
    sex: patient.gender ?? "",
    mobile: patient.phone ?? "",
    email: patient.email ?? "",
  });
});

// ── Study intake (upsert) ─────────────────────────────────────────────────────
// POST /api/internal/radiology/studies
// Creates or updates a worklist entry. Deduplication via studyInstanceUID first,
// then accessionNumber.

router.post("/radiology/studies", async (req, res) => {
  const b = (req.body ?? {}) as {
    studyId?: number;
    patientId?: number;
    patientName?: string;
    age?: string;
    sex?: string;
    modality?: string;
    studyDescription?: string;
    studyDate?: string;
    accessionNumber?: string;
    studyInstanceUID?: string;
    aeTitle?: string;
    ipAddress?: string;
    port?: number;
    referringDoctor?: string;
    weasisUrl?: string;
  };

  if (!b.accessionNumber?.trim()) {
    res.status(400).json({ error: "accessionNumber is required" });
    return;
  }
  if (!b.patientName?.trim()) {
    res.status(400).json({ error: "patientName is required" });
    return;
  }

  const accessionNumber = b.accessionNumber.trim();
  const studyInstanceUID = b.studyInstanceUID?.trim() || null;

  // Try to find existing entry to decide insert vs update.
  const conds = [];
  if (studyInstanceUID) conds.push(eq(radiologyWorklistTable.studyInstanceUID, studyInstanceUID));
  conds.push(eq(radiologyWorklistTable.accessionNumber, accessionNumber));

  let existing: typeof radiologyWorklistTable.$inferSelect | undefined;
  if (studyInstanceUID) {
    const rows = await db
      .select()
      .from(radiologyWorklistTable)
      .where(or(
        eq(radiologyWorklistTable.studyInstanceUID, studyInstanceUID),
        eq(radiologyWorklistTable.accessionNumber, accessionNumber),
      ));
    existing = rows[0];
  } else {
    const rows = await db
      .select()
      .from(radiologyWorklistTable)
      .where(eq(radiologyWorklistTable.accessionNumber, accessionNumber));
    existing = rows[0];
  }

  const values = {
    studyId: b.studyId ?? null,
    patientId: b.patientId ?? null,
    patientName: b.patientName.trim(),
    age: b.age ?? null,
    sex: b.sex ?? null,
    modality: b.modality?.trim() || "OT",
    studyDescription: b.studyDescription?.trim() || null,
    studyDate: b.studyDate ?? null,
    accessionNumber,
    studyInstanceUID,
    aeTitle: b.aeTitle?.trim() || null,
    ipAddress: b.ipAddress?.trim() || null,
    port: b.port ?? null,
    referringDoctor: b.referringDoctor?.trim() || null,
    weasisUrl: b.weasisUrl?.trim() || null,
  };

  let row: typeof radiologyWorklistTable.$inferSelect;

  if (existing) {
    const [updated] = await db
      .update(radiologyWorklistTable)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(radiologyWorklistTable.id, existing.id))
      .returning();
    row = updated;
    await audit({
      worklistId: row.id,
      accessionNumber,
      action: "STUDY_RECEIVED",
      actor: "pacs",
      details: { event: "updated", modality: values.modality, studyDescription: values.studyDescription },
    });
  } else {
    const [inserted] = await db
      .insert(radiologyWorklistTable)
      .values({ ...values, status: "STUDY_RECEIVED" })
      .returning();
    row = inserted;
    await audit({
      worklistId: row.id,
      accessionNumber,
      action: "STUDY_RECEIVED",
      actor: "pacs",
      details: { event: "created", modality: values.modality, studyDescription: values.studyDescription },
    });
  }

  res.status(201).json(row);
});

// ── Report status update ──────────────────────────────────────────────────────
// POST /api/internal/radiology/report-status

router.post("/radiology/report-status", async (req, res) => {
  const b = (req.body ?? {}) as {
    studyId?: number;
    accessionNumber?: string;
    studyInstanceUID?: string;
    status?: string;
    deliveryStatus?: string;
    reportId?: number;
    actor?: string;
  };

  // Find worklist row
  let existing: typeof radiologyWorklistTable.$inferSelect | undefined;
  if (b.studyInstanceUID) {
    const [row] = await db
      .select()
      .from(radiologyWorklistTable)
      .where(eq(radiologyWorklistTable.studyInstanceUID, b.studyInstanceUID));
    existing = row;
  }
  if (!existing && b.accessionNumber) {
    const [row] = await db
      .select()
      .from(radiologyWorklistTable)
      .where(eq(radiologyWorklistTable.accessionNumber, b.accessionNumber));
    existing = row;
  }
  if (!existing && b.studyId) {
    const [row] = await db
      .select()
      .from(radiologyWorklistTable)
      .where(eq(radiologyWorklistTable.studyId, b.studyId));
    existing = row;
  }

  if (!existing) {
    res.status(404).json({ error: "Worklist entry not found" });
    return;
  }

  const VALID_STATUSES = ["STUDY_RECEIVED", "AI_DRAFT_READY", "REPORT_IN_PROGRESS", "REPORT_FINAL", "DELIVERED"];
  const VALID_DELIVERY = ["READY_TO_SEND", "SENT"];

  const updates: Partial<typeof radiologyWorklistTable.$inferInsert> = { updatedAt: new Date() };
  if (b.status && VALID_STATUSES.includes(b.status)) updates.status = b.status;
  if (b.deliveryStatus && VALID_DELIVERY.includes(b.deliveryStatus)) updates.deliveryStatus = b.deliveryStatus;
  if (b.reportId) updates.reportId = b.reportId;

  const [updated] = await db
    .update(radiologyWorklistTable)
    .set(updates)
    .where(eq(radiologyWorklistTable.id, existing.id))
    .returning();

  const changes: string[] = [];
  if (b.status) changes.push(`status → ${b.status}`);
  if (b.deliveryStatus) changes.push(`deliveryStatus → ${b.deliveryStatus}`);

  await audit({
    worklistId: existing.id,
    accessionNumber: existing.accessionNumber,
    action: "REPORT_STATUS_UPDATED",
    actor: b.actor ?? "system",
    details: { changes },
  });

  res.json(updated);
});

// ── AI draft generation ───────────────────────────────────────────────────────
// POST /api/internal/radiology/ai-draft
//
// Tries Gemini if configured; falls back to structured template-based placeholder.
// SAFETY: AI output is NEVER automatically set to REPORT_FINAL. The radiologist
// must explicitly click "Save Final Report" in the UI.

const RADIOLOGY_TEMPLATES: Record<string, { technique: string; findings: string; impression: string; recommendation: string }> = {
  "MRI Brain Plain": {
    technique: "Multiplanar, multisequence MRI of the brain was performed using T1W, T2W, FLAIR, DWI, GRE/SWI sequences on a [field strength] Tesla MRI scanner without contrast administration.",
    findings: `<b>Brain Parenchyma:</b>
Grey-white matter differentiation is preserved. No focal cortical or subcortical signal abnormality identified.

<b>Ventricles and Sulci:</b>
Ventricles are normal in size and configuration. Basal cisterns are patent. Cortical sulci show age-appropriate prominence.

<b>Corpus Callosum:</b>
Normal morphology and signal.

<b>Cerebellum and Brainstem:</b>
No signal abnormality. Normal foliation of cerebellar hemispheres. Brainstem is normal.

<b>Basal Ganglia and Thalami:</b>
Normal signal and morphology bilaterally.

<b>Posterior Fossa:</b>
No mass lesion or extra-axial collection. Foramen magnum is patent.

<b>Calvarium and Orbits:</b>
No aggressive bony lesion. Orbits appear normal.

<b>Visualized Paranasal Sinuses and Mastoid Air Cells:</b>
Clear.`,
    impression: "• No acute intracranial abnormality identified on plain MRI brain.\n• [Add specific findings if applicable.]",
    recommendation: "Please correlate with clinical findings and symptoms. MRI Brain with contrast is recommended if clinically indicated.",
  },
  "MRI Brain With Contrast": {
    technique: "Multiplanar, multisequence MRI of the brain was performed using T1W, T2W, FLAIR, DWI, GRE/SWI sequences followed by T1W post-gadolinium contrast sequences on a [field strength] Tesla MRI scanner.",
    findings: `<b>Brain Parenchyma (Pre-contrast):</b>
Grey-white matter differentiation is preserved. No focal signal abnormality.

<b>Post-Contrast Enhancement:</b>
No abnormal parenchymal, leptomeningeal, or pachymeningeal enhancement identified.

<b>Ventricles and Sulci:</b>
Normal in size and configuration.

<b>Corpus Callosum:</b>
Normal morphology and signal.

<b>Cerebellum and Brainstem:</b>
No lesion or enhancement.

<b>Basal Ganglia and Thalami:</b>
Normal signal bilaterally. No abnormal enhancement.

<b>Calvarium and Orbits:</b>
No aggressive bony lesion or abnormal enhancement.`,
    impression: "• No abnormal intracranial enhancement detected.\n• No mass lesion, abscess, or leptomeningeal disease identified.\n• [Add specific findings if applicable.]",
    recommendation: "Please correlate with clinical findings. Repeat MRI recommended if symptoms persist.",
  },
  "MRI LS Spine": {
    technique: "Multiplanar, multisequence MRI of the lumbar spine was performed using T1W and T2W sequences in sagittal and axial planes.",
    findings: `<b>Vertebral Alignment:</b>
Normal lumbar lordosis maintained. No listhesis.

<b>Vertebral Bodies:</b>
Height, morphology, and marrow signal of all lumbar vertebral bodies appear within normal limits.

<b>Intervertebral Discs:</b>
L1-L2: Normal height and signal.
L2-L3: Normal height and signal.
L3-L4: Normal height and signal.
L4-L5: Mild disc desiccation noted. No significant disc herniation or canal compromise.
L5-S1: Mild disc desiccation. No significant disc herniation.

<b>Spinal Canal:</b>
Adequate calibre at all levels. No significant central canal stenosis.

<b>Neural Foramina:</b>
No significant foraminal narrowing.

<b>Conus Medullaris:</b>
Terminating at L1-L2 level — within normal limits.

<b>Paravertebral Soft Tissues:</b>
Unremarkable.`,
    impression: "• Mild degenerative disc changes at L4-L5 and L5-S1 without significant neural compromise.\n• [Add specific findings if applicable.]",
    recommendation: "Please correlate with clinical findings. Physiotherapy and conservative management may be considered.",
  },
  "MRI Cervical Spine": {
    technique: "Multiplanar, multisequence MRI of the cervical spine was performed using T1W and T2W sequences in sagittal and axial planes.",
    findings: `<b>Vertebral Alignment:</b>
Normal cervical lordosis maintained. No listhesis.

<b>Vertebral Bodies:</b>
Height, morphology, and marrow signal are within normal limits.

<b>Intervertebral Discs:</b>
C2-C3 through C6-C7: No significant disc herniation, disc desiccation, or canal compromise.

<b>Spinal Canal:</b>
Adequate calibre at all levels. No significant central canal stenosis.

<b>Neural Foramina:</b>
No significant foraminal narrowing.

<b>Spinal Cord:</b>
Normal in calibre and signal throughout.

<b>Paravertebral Soft Tissues:</b>
Unremarkable.`,
    impression: "• No significant disc herniation or cord signal abnormality on MRI cervical spine.\n• [Add specific findings if applicable.]",
    recommendation: "Please correlate with clinical findings and neurological examination.",
  },
  "CT Brain": {
    technique: "Non-contrast CT of the brain was performed using standard axial sections with coronal and sagittal reformats.",
    findings: `<b>Brain Parenchyma:</b>
No hyperdense or hypodense lesion identified. Grey-white matter differentiation is preserved.

<b>Ventricles:</b>
Lateral, third, and fourth ventricles are normal in size and configuration.

<b>Basal Cisterns:</b>
Patent. No effacement.

<b>Midline Structures:</b>
No midline shift.

<b>Extra-Axial Spaces:</b>
No subdural, epidural, or subarachnoid haemorrhage.

<b>Posterior Fossa:</b>
Cerebellum and brainstem appear normal. No mass lesion.

<b>Calvarium:</b>
No fracture or lytic/sclerotic lesion.

<b>Visualized Paranasal Sinuses and Mastoid Air Cells:</b>
Clear.`,
    impression: "• No acute intracranial haemorrhage, infarct, or space-occupying lesion on CT brain.\n• [Add specific findings if applicable.]",
    recommendation: "MRI brain is recommended for further evaluation if clinically indicated.",
  },
  "X-Ray Chest": {
    technique: "PA view chest X-ray obtained in full inspiration.",
    findings: `<b>Lung Fields:</b>
Both lung fields are clear. No consolidation, collapse, cavity, or pleural effusion.

<b>Hila:</b>
Bilateral hilar shadows are within normal limits.

<b>Mediastinum:</b>
Superior mediastinum appears normal in width. Trachea is centrally placed.

<b>Heart:</b>
Cardiothoracic ratio is within normal limits (< 50%). Cardiac contours are normal.

<b>Diaphragm:</b>
Both hemidiaphragms are dome-shaped and at normal levels. Costophrenic angles are sharp.

<b>Bony Thorax:</b>
Ribs, clavicles, and visible shoulder joints appear normal. No fracture.`,
    impression: "• No active cardiopulmonary pathology detected on chest X-ray.\n• [Add specific findings if applicable.]",
    recommendation: "Please correlate with clinical findings. High-resolution CT chest recommended if indicated.",
  },
  "USG Abdomen": {
    technique: "Real-time B-mode ultrasound of the abdomen was performed using a [frequency] MHz probe.",
    findings: `<b>Liver:</b>
Normal in size and echogenicity. No focal lesion, biliary dilatation, or ascites. Portal vein diameter within normal limits.

<b>Gallbladder:</b>
Normal in size. Wall thickness within normal limits. No calculi or polyp. No pericholecystic fluid.

<b>Common Bile Duct:</b>
Not dilated. Diameter within normal limits.

<b>Pancreas:</b>
Visualised portions appear normal in echogenicity and outline. No focal lesion or ductal dilatation.

<b>Spleen:</b>
Normal in size and echogenicity.

<b>Kidneys:</b>
Both kidneys are normal in size, shape, and echogenicity. Corticomedullary differentiation maintained. No hydronephrosis, calculus, or focal lesion.

<b>Urinary Bladder:</b>
Adequately filled. Walls appear normal. No intraluminal lesion.

<b>Aorta and IVC:</b>
No significant dilatation or wall abnormality in the visualised portions.`,
    impression: "• No sonographic abnormality detected in the abdomen.\n• [Add specific findings if applicable.]",
    recommendation: "Please correlate with clinical findings and laboratory investigations.",
  },
};

// Normalise template name lookup — case-insensitive, trim whitespace.
function findTemplate(key: string): typeof RADIOLOGY_TEMPLATES[string] | undefined {
  if (!key) return undefined;
  const k = key.trim().toLowerCase();
  for (const [name, tpl] of Object.entries(RADIOLOGY_TEMPLATES)) {
    if (name.toLowerCase() === k) return tpl;
  }
  return undefined;
}

function buildTemplateFromModality(modality: string, studyDescription: string): typeof RADIOLOGY_TEMPLATES[string] {
  // Best-effort fuzzy match by studyDescription first, then modality.
  const desc = `${studyDescription} ${modality}`.toLowerCase();
  if (desc.includes("brain") && (desc.includes("contrast") || desc.includes("ce"))) return RADIOLOGY_TEMPLATES["MRI Brain With Contrast"]!;
  if (desc.includes("brain") && desc.includes("mri")) return RADIOLOGY_TEMPLATES["MRI Brain Plain"]!;
  if ((desc.includes("ls") || desc.includes("lumbar")) && desc.includes("spine")) return RADIOLOGY_TEMPLATES["MRI LS Spine"]!;
  if ((desc.includes("cervical") || desc.includes("neck")) && desc.includes("spine")) return RADIOLOGY_TEMPLATES["MRI Cervical Spine"]!;
  if (desc.includes("ct") && desc.includes("brain")) return RADIOLOGY_TEMPLATES["CT Brain"]!;
  if (desc.includes("chest") || desc.includes("cxr")) return RADIOLOGY_TEMPLATES["X-Ray Chest"]!;
  if (desc.includes("usg") || desc.includes("abdomen") || desc.includes("ultrasound")) return RADIOLOGY_TEMPLATES["USG Abdomen"]!;

  const m = modality.toUpperCase();
  if (m === "MR") return RADIOLOGY_TEMPLATES["MRI Brain Plain"]!;
  if (m === "CT") return RADIOLOGY_TEMPLATES["CT Brain"]!;
  if (m === "CR" || m === "DX") return RADIOLOGY_TEMPLATES["X-Ray Chest"]!;
  if (m === "US") return RADIOLOGY_TEMPLATES["USG Abdomen"]!;
  return RADIOLOGY_TEMPLATES["X-Ray Chest"]!;
}

function buildFormattedHtml(opts: {
  patientName: string;
  age: string;
  sex: string;
  studyDescription: string;
  accessionNumber: string;
  studyDate: string;
  technique: string;
  findings: string;
  impression: string;
  recommendation: string;
}): string {
  const { patientName, age, sex, studyDescription, accessionNumber, studyDate, technique, findings, impression, recommendation } = opts;
  return `<div style="font-family: Arial, sans-serif; font-size: 13px; line-height: 1.6; padding: 16px;">
<p style="font-weight: bold; margin: 0;">Patient: ${patientName} &nbsp;|&nbsp; Age/Sex: ${age} / ${sex} &nbsp;|&nbsp; Accession: ${accessionNumber} &nbsp;|&nbsp; Date: ${studyDate}</p>
<hr style="border: 2px solid #000; margin: 8px 0;" />
<p style="text-align: center; font-weight: bold; text-decoration: underline; font-size: 15px;">${studyDescription.toUpperCase()}</p>

<p><b>TECHNIQUE:</b><br/>${technique}</p>

<p><b>FINDINGS / OBSERVATIONS:</b><br/>${findings.replace(/\n/g, "<br/>")}</p>

<p><b>IMPRESSION:</b><br/>${impression.replace(/\n/g, "<br/>")}</p>

<p><b>RECOMMENDATION:</b><br/>${recommendation}</p>

<p style="font-style: italic; color: #555; margin-top: 16px;">Please correlate with clinical findings.</p>
</div>`;
}

router.post("/radiology/ai-draft", async (req, res) => {
  const b = (req.body ?? {}) as {
    studyId?: number;
    modality?: string;
    studyDescription?: string;
    clinicalHistory?: string;
    rawFindings?: string;
    templateId?: number;
    templateName?: string;
    // Context for demographics in HTML output
    patientName?: string;
    age?: string;
    sex?: string;
    accessionNumber?: string;
    studyDate?: string;
  };

  const modality = b.modality?.trim() || "OT";
  const studyDescription = b.studyDescription?.trim() || modality;
  const patientName = b.patientName?.trim() || "Patient";
  const age = b.age?.trim() || "";
  const sex = b.sex?.trim() || "";
  const accessionNumber = b.accessionNumber?.trim() || "";
  const studyDate = b.studyDate?.trim() || new Date().toISOString().slice(0, 10);

  // Mark worklist entry as AI_DRAFT_READY (look up by studyId if provided)
  let worklistRow: typeof radiologyWorklistTable.$inferSelect | undefined;
  if (b.studyId) {
    const [r] = await db.select().from(radiologyWorklistTable).where(eq(radiologyWorklistTable.id, b.studyId));
    worklistRow = r;
  }

  // Resolve template
  const tpl = (b.templateName ? findTemplate(b.templateName) : undefined)
    ?? buildTemplateFromModality(modality, studyDescription);

  const title = `${studyDescription} — Report`;

  // If raw findings provided, incorporate into the findings section.
  let findings = tpl.findings;
  if (b.rawFindings?.trim()) {
    findings = `<b>RADIOLOGIST FINDINGS:</b><br/>${b.rawFindings.trim()}<br/><br/>${findings}`;
  }
  if (b.clinicalHistory?.trim()) {
    findings = `<b>CLINICAL HISTORY:</b><br/>${b.clinicalHistory.trim()}<br/><br/>${findings}`;
  }

  // Attempt Gemini generation if key present.
  let aiGenerated = false;
  try {
    const hasGemini = !!(process.env["AI_INTEGRATIONS_GEMINI_API_KEY"] || process.env["GEMINI_API_KEY"]);
    if (hasGemini && (b.rawFindings?.trim() || b.clinicalHistory?.trim())) {
      const { geminiGenerate } = await import("@workspace/integrations-gemini-ai");
      const prompt = `You are an expert radiologist. Generate a structured radiology report.
Study: ${studyDescription}
Modality: ${modality}
${b.clinicalHistory ? `Clinical History: ${b.clinicalHistory}` : ""}
${b.rawFindings ? `Raw Findings / Dictation: ${b.rawFindings}` : ""}

Return a JSON object with these exact keys: title, technique, findings (HTML with <b> headings), impression (bullet points), recommendation.
Respond ONLY with the JSON object, no markdown fences.`;

      const raw = await geminiGenerate(prompt, { maxTokens: 4096 });
      // Strip markdown fences if model adds them anyway
      const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(cleaned) as {
        title?: string; technique?: string; findings?: string;
        impression?: string; recommendation?: string;
      };
      if (parsed.findings) {
        findings = parsed.findings;
        if (parsed.impression) tpl.impression = parsed.impression;
        if (parsed.recommendation) tpl.recommendation = parsed.recommendation;
        if (parsed.technique) tpl.technique = parsed.technique;
        aiGenerated = true;
      }
    }
  } catch {
    // Fall through to template-based output silently
  }

  const draft = {
    title,
    technique: tpl.technique,
    findings,
    impression: tpl.impression,
    recommendation: tpl.recommendation,
    formattedReportHtml: buildFormattedHtml({
      patientName, age, sex, studyDescription, accessionNumber, studyDate,
      technique: tpl.technique, findings, impression: tpl.impression,
      recommendation: tpl.recommendation,
    }),
    formattedReportText: [
      `Patient: ${patientName} | Age/Sex: ${age} / ${sex} | Accession: ${accessionNumber} | Date: ${studyDate}`,
      "─────────────────────────────────",
      studyDescription.toUpperCase(),
      "",
      "TECHNIQUE:",
      tpl.technique,
      "",
      "FINDINGS:",
      findings.replace(/<[^>]+>/g, ""),
      "",
      "IMPRESSION:",
      tpl.impression,
      "",
      "RECOMMENDATION:",
      tpl.recommendation,
      "",
      "Please correlate with clinical findings.",
    ].join("\n"),
    aiGenerated,
    templateUsed: b.templateName ?? studyDescription,
  };

  // Update worklist status if we found a row
  if (worklistRow) {
    await db
      .update(radiologyWorklistTable)
      .set({
        status: "AI_DRAFT_READY",
        aiDraftStatus: "READY",
        aiDraftJson: JSON.stringify(draft),
        updatedAt: new Date(),
      })
      .where(eq(radiologyWorklistTable.id, worklistRow.id));

    await audit({
      worklistId: worklistRow.id,
      accessionNumber: worklistRow.accessionNumber,
      action: "AI_DRAFT_GENERATED",
      actor: "system",
      details: { aiGenerated, templateUsed: draft.templateUsed },
    });
  }

  res.json(draft);
});

// ── Worklist read endpoints ───────────────────────────────────────────────────
// GET /api/internal/radiology/worklist?status=&modality=&date=
router.get("/radiology/worklist", async (req, res) => {
  const status = (req.query.status as string) || "";
  const modality = (req.query.modality as string) || "";

  const conds = [];
  if (status && status !== "all") conds.push(eq(radiologyWorklistTable.status, status));
  if (modality && modality !== "all") conds.push(eq(radiologyWorklistTable.modality, modality));

  const rows = await db
    .select()
    .from(radiologyWorklistTable)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(sql`created_at DESC`)
    .limit(200);

  res.json(rows);
});

// GET /api/internal/radiology/worklist/:id
router.get("/radiology/worklist/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(radiologyWorklistTable).where(eq(radiologyWorklistTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// GET /api/internal/radiology/audit/:worklistId
router.get("/radiology/audit/:worklistId", async (req, res) => {
  const id = Number(req.params.worklistId);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await db
    .select()
    .from(radiologyAuditLogTable)
    .where(eq(radiologyAuditLogTable.worklistId, id))
    .orderBy(sql`created_at DESC`);
  res.json(rows);
});

// GET /api/internal/radiology/templates — list available template names
router.get("/radiology/templates", (_req, res) => {
  res.json(Object.keys(RADIOLOGY_TEMPLATES).map((name) => ({ name })));
});

// ── DICOM Pull Job Agent Endpoints ────────────────────────────────────────────
// These are called by the dicom-pull-agent service running on the Conquest
// server machine. Auth: same INTERNAL_API_KEY bearer token.


// GET /api/internal/dicom/pull-jobs/pending
// The pull agent calls this every POLL_INTERVAL_MS to get queued jobs.
// Returns jobs with status='pending', including the parent node details
// so the agent has host/port/aeTitle/conquestAeTitle in one round-trip.
router.get("/dicom/pull-jobs/pending", async (_req, res) => {
  const jobs = await db.select().from(dicomPullJobsTable)
    .where(eq(dicomPullJobsTable.status, "pending"))
    .orderBy(dicomPullJobsTable.createdAt)
    .limit(10);

  if (jobs.length === 0) {
    res.json({ jobs: [] });
    return;
  }

  // Attach node details to each job
  const nodeIds = [...new Set(jobs.map((j) => j.nodeId))];
  const nodes = await db.select().from(dicomNodesTable)
    .where(inArray(dicomNodesTable.id, nodeIds));
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  res.json({
    jobs: jobs.map((j) => ({ ...j, node: nodeMap.get(j.nodeId) ?? null })),
  });
});

// PATCH /api/internal/dicom/pull-jobs/:jobId/claim
// Agent calls this immediately before starting work to prevent duplicate processing.
router.patch("/dicom/pull-jobs/:jobId/claim", async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (!Number.isFinite(jobId)) {
    res.status(400).json({ error: "Invalid jobId" });
    return;
  }
  const [job] = await db.select().from(dicomPullJobsTable)
    .where(eq(dicomPullJobsTable.id, jobId));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  if (job.status !== "pending") {
    // Another agent already claimed it
    res.status(409).json({ error: `Job already in status '${job.status}'` });
    return;
  }
  const agentId = String(req.body?.agentId ?? "unknown");
  const [updated] = await db.update(dicomPullJobsTable).set({
    status: "running",
    agentId,
    startedAt: new Date(),
  }).where(eq(dicomPullJobsTable.id, jobId)).returning();
  res.json(updated);
});

// PATCH /api/internal/dicom/pull-jobs/:jobId
// Agent calls this when the job finishes (success, failed, or partial).
router.patch("/dicom/pull-jobs/:jobId", async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (!Number.isFinite(jobId)) {
    res.status(400).json({ error: "Invalid jobId" });
    return;
  }
  const [job] = await db.select().from(dicomPullJobsTable)
    .where(eq(dicomPullJobsTable.id, jobId));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  const b = req.body ?? {};
  const status = ["completed", "failed", "partial"].includes(b.status) ? b.status : "failed";
  const [updated] = await db.update(dicomPullJobsTable).set({
    status,
    studiesFound:       typeof b.studiesFound  === "number" ? b.studiesFound  : job.studiesFound,
    studiesPulled:      typeof b.studiesPulled === "number" ? b.studiesPulled : job.studiesPulled,
    studiesFailed:      typeof b.studiesFailed === "number" ? b.studiesFailed : job.studiesFailed,
    studyInstanceUIDs:  typeof b.studyInstanceUIDs === "string" ? b.studyInstanceUIDs : job.studyInstanceUIDs,
    errorMessage:       typeof b.errorMessage === "string" ? b.errorMessage : job.errorMessage,
    agentId:            typeof b.agentId === "string" ? b.agentId : job.agentId,
    completedAt:        new Date(),
  }).where(eq(dicomPullJobsTable.id, jobId)).returning();

  // Update the node's lastPullAt / lastPullStatus
  const pullStatus = status === "completed" ? "success" : status === "partial" ? "partial" : "failed";
  const pullMsg = status === "completed"
    ? `${updated.studiesPulled ?? 0} studies pulled`
    : updated.errorMessage ?? status;
  await db.update(dicomNodesTable).set({
    lastPullAt: new Date(),
    lastPullStatus: pullStatus,
    lastPullMessage: pullMsg,
  }).where(eq(dicomNodesTable.id, job.nodeId));

  res.json(updated);
});

export default router;
