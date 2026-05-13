import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  radiologyStudiesTable, radiologyFilmIssuesTable, radiologyShareLinksTable,
  testsTable, patientsTable, ordersTable, orderTestsTable,
  billsTable, reportTemplatesTable, staffTable, radiologyPromptsTable,
  radiologyWorklistTable,
  pacsSettingsTable, dicomModalitiesTable, pacsLogsTable,
} from "@workspace/db/schema";
import { and, asc, desc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import crypto from "node:crypto";
import type { StaffAuthRequest } from "../middleware/requireStaffAuth";

// Build an absolute https URL for share-link composition. Trusts the standard
// reverse-proxy headers `x-forwarded-proto` / `x-forwarded-host`. The proxy
// terminates TLS so we don't need a host allowlist for the dev environment;
// production deployments behind Replit's edge already canonicalise these.
function absoluteBase(req: { headers: Record<string, string | string[] | undefined>; protocol?: string }): string {
  const protoHdr = req.headers["x-forwarded-proto"];
  const hostHdr = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = (Array.isArray(protoHdr) ? protoHdr[0] : protoHdr) || req.protocol || "https";
  const host = (Array.isArray(hostHdr) ? hostHdr[0] : hostHdr) || "";
  return `${proto}://${host}`;
}

export const radiologyRouter: IRouter = Router();

// Departments that map to a radiology workflow + their DICOM modality codes.
const MODALITY_MAP: Record<string, string> = {
  "X-Ray": "CR",
  "USG": "US",
  "MRI": "MR",
  "CT": "CT",
  "Mammography": "MG",
  "DEXA": "BMD",
};
const RADIOLOGY_DEPARTMENTS = Object.keys(MODALITY_MAP);

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function compactToday(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

// Computes the next accession number candidate for a (date, modality) pair by
// taking MAX(seq) + 1 over today's rows. This is racy by itself — two concurrent
// callers can derive the same number — so callers MUST wrap the INSERT in a
// retry loop and call this again on `radiology_studies_accession_uq` collision.
async function nextAccessionNumber(modality: string): Promise<string> {
  const today = compactToday();
  const prefix = `ACC-${today}-${modality}-`;
  const result = await db.execute<{ n: number }>(sql`
    SELECT COALESCE(MAX(CAST(SPLIT_PART(accession_number, '-', 4) AS INTEGER)), 0) + 1 AS n
      FROM ${radiologyStudiesTable}
     WHERE accession_number LIKE ${prefix + "%"}
  `);
  const rows = (result as unknown as { rows?: Array<{ n: number }> }).rows
    ?? (result as unknown as Array<{ n: number }>);
  const n = rows[0]?.n ?? 1;
  return `${prefix}${String(n).padStart(3, "0")}`;
}

// Used by bills.ts to fan out studies for fresh orders. Idempotent per
// orderTestId via UNIQUE index `radiology_studies_order_test_uq`.
export async function generateStudiesForOrder(opts: {
  billId: number;
  orderId: number;
  patientId: number;
  dicomFields?: {
    studyDescription?: string;
    bodyPart?: string;
    scheduledStationAETitle?: string;
    referringDoctor?: string;
  };
}): Promise<Array<{ orderTestId: number; testName: string; modality: string; accessionNumber: string }>> {
  const orderTests = await db
    .select({
      orderTestId: orderTestsTable.id,
      testId: orderTestsTable.testId,
      testName: testsTable.name,
      department: testsTable.department,
      roomNumber: testsTable.roomNumber,
    })
    .from(orderTestsTable)
    .innerJoin(testsTable, eq(testsTable.id, orderTestsTable.testId))
    .where(eq(orderTestsTable.orderId, opts.orderId));

  const out: Array<{ orderTestId: number; testName: string; modality: string; accessionNumber: string }> = [];
  for (const ot of orderTests) {
    const department = ot.department || "";
    if (!RADIOLOGY_DEPARTMENTS.includes(department)) continue; // skip non-radiology tests
    const modality = MODALITY_MAP[department] ?? "OT";

    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const accessionNumber = await nextAccessionNumber(modality);
      try {
        const [row] = await db.insert(radiologyStudiesTable).values({
          accessionNumber,
          billId: opts.billId,
          orderId: opts.orderId,
          orderTestId: ot.orderTestId,
          patientId: opts.patientId,
          testId: ot.testId,
          modality,
          department,
          roomNumber: ot.roomNumber || "",
          status: "scheduled",
          studyDate: todayISO(),
          ...(opts.dicomFields?.studyDescription ? { studyDescription: opts.dicomFields.studyDescription } : {}),
          ...(opts.dicomFields?.bodyPart ? { bodyPart: opts.dicomFields.bodyPart } : {}),
          ...(opts.dicomFields?.scheduledStationAETitle ? { scheduledStationAETitle: opts.dicomFields.scheduledStationAETitle } : {}),
          ...(opts.dicomFields?.referringDoctor ? { referringDoctor: opts.dicomFields.referringDoctor } : {}),
        }).returning();
        out.push({ orderTestId: ot.orderTestId, testName: ot.testName, modality, accessionNumber: row.accessionNumber });
        lastErr = null;
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/radiology_studies_order_test_uq/i.test(msg)) {
          // already issued for this order test — idempotent skip
          lastErr = null;
          break;
        }
        if (/radiology_studies_accession_uq/i.test(msg)) {
          lastErr = err;
          await new Promise((r) => setTimeout(r, 10 + Math.random() * 40));
          continue;
        }
        throw err;
      }
    }
    if (lastErr) throw lastErr;
  }
  return out;
}

// ── Worklist ────────────────────────────────────────────────────────────────
// GET /api/radiology/worklist?date=&status=&modality=&search=&assigned=
//   assigned=unclaimed → studies awaiting a radiologist (acquired/in-prelim, no claim)
//   assigned=mine&staffId=NN → studies claimed by the given staff
radiologyRouter.get("/worklist", async (req, res) => {
  const date = (req.query.date as string) || todayISO();
  const status = (req.query.status as string) || "";
  const modality = (req.query.modality as string) || "";
  const search = (req.query.search as string)?.trim() || "";
  const assigned = (req.query.assigned as string) || "";
  // staffId is only meaningful for `assigned=mine`. Reject malformed values
  // (e.g. "undefined") with a 400 instead of silently coercing to 0 and
  // returning an empty worklist that looks like "you have no studies".
  const rawStaffId = req.query.staffId;
  let staffId: number | null = null;
  if (rawStaffId !== undefined && rawStaffId !== null && rawStaffId !== "") {
    const n = Number(rawStaffId);
    if (!Number.isInteger(n) || n < 1) {
      res.status(400).json({ error: "Invalid staffId" });
      return;
    }
    staffId = n;
  }

  const conds = [eq(radiologyStudiesTable.studyDate, date)];
  if (status && status !== "all") conds.push(eq(radiologyStudiesTable.status, status));
  if (modality && modality !== "all") conds.push(eq(radiologyStudiesTable.modality, modality));
  if (assigned === "unclaimed") {
    conds.push(isNull(radiologyStudiesTable.assignedRadiologistId));
  } else if (assigned === "mine") {
    if (staffId === null) {
      res.status(400).json({ error: "assigned=mine requires staffId" });
      return;
    }
    conds.push(eq(radiologyStudiesTable.assignedRadiologistId, staffId));
  }

  const rows = await db
    .select({
      id: radiologyStudiesTable.id,
      accessionNumber: radiologyStudiesTable.accessionNumber,
      modality: radiologyStudiesTable.modality,
      department: radiologyStudiesTable.department,
      roomNumber: radiologyStudiesTable.roomNumber,
      status: radiologyStudiesTable.status,
      scheduledAt: radiologyStudiesTable.scheduledAt,
      startedAt: radiologyStudiesTable.startedAt,
      acquiredAt: radiologyStudiesTable.acquiredAt,
      deliveredAt: radiologyStudiesTable.deliveredAt,
      numImages: radiologyStudiesTable.numImages,
      technicianId: radiologyStudiesTable.technicianId,
      technicianName: radiologyStudiesTable.technicianName,
      assignedRadiologistId: radiologyStudiesTable.assignedRadiologistId,
      assignedRadiologistName: radiologyStudiesTable.assignedRadiologistName,
      claimedAt: radiologyStudiesTable.claimedAt,
      studyDate: radiologyStudiesTable.studyDate,
      prelimReportedAt: radiologyStudiesTable.prelimReportedAt,
      finalReportedAt: radiologyStudiesTable.finalReportedAt,
      hasPrelim: sql<boolean>`(${radiologyStudiesTable.prelimReport} IS NOT NULL AND length(${radiologyStudiesTable.prelimReport}) > 0)`,
      hasFinal: sql<boolean>`(${radiologyStudiesTable.finalReport} IS NOT NULL AND length(${radiologyStudiesTable.finalReport}) > 0)`,
      patientId: patientsTable.id,
      patientCode: patientsTable.patientId,
      patientName: sql<string>`COALESCE(${patientsTable.firstName} || ' ' || ${patientsTable.lastName}, '')`,
      patientPhone: patientsTable.phone,
      patientGender: patientsTable.gender,
      testId: testsTable.id,
      testCode: testsTable.code,
      testName: testsTable.name,
      billId: billsTable.id,
      billNumber: billsTable.billNumber,
    })
    .from(radiologyStudiesTable)
    .leftJoin(patientsTable, eq(patientsTable.id, radiologyStudiesTable.patientId))
    .leftJoin(testsTable, eq(testsTable.id, radiologyStudiesTable.testId))
    .leftJoin(billsTable, eq(billsTable.id, radiologyStudiesTable.billId))
    .where(and(...conds))
    .orderBy(asc(radiologyStudiesTable.scheduledAt));

  let filtered = rows;
  if (search) {
    const s = search.toLowerCase();
    filtered = rows.filter((r) =>
      r.accessionNumber.toLowerCase().includes(s) ||
      (r.patientName ?? "").toLowerCase().includes(s) ||
      (r.patientCode ?? "").toLowerCase().includes(s) ||
      (r.patientPhone ?? "").toLowerCase().includes(s) ||
      (r.testName ?? "").toLowerCase().includes(s) ||
      (r.testCode ?? "").toLowerCase().includes(s)
    );
  }
  res.json(filtered);
});

// GET /api/radiology/options — modalities + departments + status enum
radiologyRouter.get("/options", (_req, res) => {
  res.json({
    modalities: Object.entries(MODALITY_MAP).map(([department, code]) => ({ department, code })),
    statuses: ["scheduled", "in_progress", "acquired", "reported_preliminary", "reported_final", "delivered", "cancelled"],
  });
});

radiologyRouter.get("/:id/pacs-url", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [study] = await db
    .select({
      id: radiologyStudiesTable.id,
      studyInstanceUid: radiologyStudiesTable.studyInstanceUid,
    })
    .from(radiologyStudiesTable)
    .where(eq(radiologyStudiesTable.id, id));
  if (!study) {
    res.status(404).json({ error: "Study not found" });
    return;
  }
  const orthancUrl = (process.env.ORTHANC_URL || "").replace(/\/$/, "");
  const studyInstanceUID = study.studyInstanceUid || "";
  res.json({
    studyInstanceUID,
    orthancViewerUrl: orthancUrl ? `${orthancUrl}/app/explorer.html#study?uuid=${study.id}` : "",
    weasisUrl: orthancUrl && studyInstanceUID
      ? `weasis://$dicom:get -r "${process.env.WADO_URL || `${orthancUrl}/wado`}?requestType=WADO&studyUID=${studyInstanceUID}&contentType=application/dicom"`
      : "",
    ohifUrl: process.env.OHIF_URL && studyInstanceUID
      ? `${process.env.OHIF_URL}/viewer?StudyInstanceUIDs=${studyInstanceUID}`
      : null,
  });
});

// GET /api/radiology/technicians — radiology technicians for assignment dropdown
radiologyRouter.get("/technicians", async (_req, res) => {
  const rows = await db
    .select({
      id: staffTable.id,
      name: sql<string>`${staffTable.firstName} || ' ' || ${staffTable.lastName}`,
      role: staffTable.role,
      department: staffTable.department,
    })
    .from(staffTable)
    .where(eq(staffTable.isActive, true))
    .orderBy(asc(staffTable.firstName));
  // Soft-filter to radiology-relevant staff but keep everyone available.
  const ranked = rows.map((s) => ({
    ...s,
    isRadiology:
      /radio|tech|x-?ray|ct|mri|usg|sonograph/i.test(s.role || "") ||
      /radio|tech|imaging/i.test(s.department || ""),
  }));
  ranked.sort((a, b) => Number(b.isRadiology) - Number(a.isRadiology));
  res.json(ranked);
});

// GET /api/radiology/templates/:testId — report templates for a test
radiologyRouter.get("/templates/:testId", async (req, res) => {
  const testId = Number(req.params.testId);
  if (!Number.isFinite(testId)) { res.status(400).json({ error: "Invalid testId" }); return; }
  const rows = await db
    .select()
    .from(reportTemplatesTable)
    .where(eq(reportTemplatesTable.testId, testId))
    .orderBy(desc(reportTemplatesTable.isDefault), asc(reportTemplatesTable.name));
  res.json(rows);
});

// GET /api/radiology/studies/:id — single study with full detail
radiologyRouter.get("/studies/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db
    .select()
    .from(radiologyStudiesTable)
    .where(eq(radiologyStudiesTable.id, id));
  if (!row) { res.status(404).json({ error: "Study not found" }); return; }
  res.json(row);
});

// POST /api/radiology/studies — manual create (walk-in / external referral)
radiologyRouter.post("/studies", async (req, res) => {
  const body = req.body as {
    patientId: number;
    testId: number;
    department?: string;
    modality?: string;
    notes?: string;
    technicianId?: number;
    // DICOM MWL fields (optional at creation, required before in_progress)
    bodyPart?: string;
    studyDescription?: string;
    scheduledStationAETitle?: string;
    referringDoctor?: string;
  };
  if (!body.patientId || !body.testId) {
    res.status(400).json({ error: "patientId and testId required" }); return;
  }
  const department = body.department || "";
  const modality = body.modality || MODALITY_MAP[department] || "OT";
  let technicianName: string | null = null;
  if (body.technicianId) {
    const [s] = await db.select().from(staffTable).where(eq(staffTable.id, body.technicianId));
    if (s) technicianName = `${s.firstName} ${s.lastName}`.trim();
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const accessionNumber = await nextAccessionNumber(modality);
    try {
      const [row] = await db.insert(radiologyStudiesTable).values({
        accessionNumber,
        patientId: body.patientId,
        testId: body.testId,
        department: department || "X-Ray",
        modality,
        technicianId: body.technicianId ?? null,
        technicianName,
        notes: body.notes ?? null,
        status: "scheduled",
        studyDate: todayISO(),
        // DICOM MWL fields — optional at creation
        bodyPart:                body.bodyPart?.trim() || null,
        studyDescription:        body.studyDescription?.trim() || null,
        scheduledStationAETitle: body.scheduledStationAETitle?.trim() || null,
        referringDoctor:         body.referringDoctor?.trim() || null,
      }).returning();
      res.status(201).json(row); return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/radiology_studies_accession_uq/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 10 + Math.random() * 40));
        continue;
      }
      throw err;
    }
  }
  res.status(500).json({ error: "Could not allocate accession number" });
});

// Valid DICOM modality codes accepted by MWL. Studies must use one of these
// before moving to in_progress (i.e., ready-for-scan) status.
const DICOM_MWL_MODALITIES = ["MR", "CT", "DX", "CR", "US", "MG"] as const;

// PATCH /api/radiology/studies/:id — update status, technician, num images, notes,
// and the new DICOM MWL fields (bodyPart, studyDescription, scheduledStationAETitle,
// referringDoctor). A study cannot move to in_progress unless all mandatory DICOM
// MWL fields are populated.
radiologyRouter.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = req.body as {
    status?: string;
    technicianId?: number | null;
    numImages?: number;
    notes?: string;
    studyInstanceUid?: string;
    clinicalHistory?: string | null;
    // DICOM MWL fields
    bodyPart?: string | null;
    studyDescription?: string | null;
    scheduledStationAETitle?: string | null;
    referringDoctor?: string | null;
  };

  const updates: Partial<typeof radiologyStudiesTable.$inferInsert> = {};

  if (body.status !== undefined) {
    const valid = ["scheduled", "in_progress", "acquired", "reported_preliminary", "reported_final", "delivered", "cancelled"];
    if (!valid.includes(body.status)) { res.status(400).json({ error: "Invalid status" }); return; }

    // ── DICOM MWL gate: validate mandatory fields before allowing in_progress ─
    if (body.status === "in_progress") {
      // Fetch current study + patient in one join so we can check all
      // mandatory fields including demographics that live on the patient row.
      const [current] = await db
        .select({
          modality:                radiologyStudiesTable.modality,
          studyDescription:        radiologyStudiesTable.studyDescription,
          bodyPart:                radiologyStudiesTable.bodyPart,
          scheduledStationAETitle: radiologyStudiesTable.scheduledStationAETitle,
          referringDoctor:         radiologyStudiesTable.referringDoctor,
          gender:                  patientsTable.gender,
          phone:                   patientsTable.phone,
          dateOfBirth:             patientsTable.dateOfBirth,
        })
        .from(radiologyStudiesTable)
        .leftJoin(patientsTable, eq(patientsTable.id, radiologyStudiesTable.patientId))
        .where(eq(radiologyStudiesTable.id, id));

      if (!current) { res.status(404).json({ error: "Study not found" }); return; }

      // Merge the pending update values with existing DB values so the caller
      // can set the MWL fields AND change status to in_progress in one PATCH.
      const effectiveModality   = current.modality;
      const effectiveStudyDesc  = (body.studyDescription  ?? current.studyDescription)?.trim();
      const effectiveBodyPart   = (body.bodyPart           ?? current.bodyPart)?.trim();
      const effectiveStationAE  = (body.scheduledStationAETitle ?? current.scheduledStationAETitle)?.trim();
      const effectiveRefDoc     = (body.referringDoctor    ?? current.referringDoctor)?.trim();

      const missing: string[] = [];
      if (!DICOM_MWL_MODALITIES.includes(effectiveModality as typeof DICOM_MWL_MODALITIES[number])) {
        missing.push(`modality must be one of ${DICOM_MWL_MODALITIES.join(", ")} (current: "${effectiveModality}")`);
      }
      if (!effectiveStudyDesc)  missing.push("studyDescription");
      if (!effectiveBodyPart)   missing.push("bodyPart");
      if (!effectiveStationAE)  missing.push("scheduledStationAETitle");
      if (!effectiveRefDoc)     missing.push("referringDoctor");
      if (!current.gender?.trim())     missing.push("patient sex/gender");
      if (!current.phone?.trim())      missing.push("patient mobile/phone");
      if (!current.dateOfBirth?.trim()) missing.push("patient date of birth");

      if (missing.length > 0) {
        res.status(422).json({
          error: "Cannot move to in_progress: mandatory DICOM MWL fields are missing",
          missing,
          hint: "Populate all required fields before marking the study as ready-for-scan.",
        });
        return;
      }
    }

    updates.status = body.status;
    if (body.status === "in_progress") updates.startedAt = new Date();
    if (body.status === "acquired") updates.acquiredAt = new Date();
    if (body.status === "delivered") updates.deliveredAt = new Date();
  }

  if (body.technicianId !== undefined) {
    if (body.technicianId === null) {
      updates.technicianId = null;
      updates.technicianName = null;
    } else {
      const [s] = await db.select().from(staffTable).where(eq(staffTable.id, body.technicianId));
      if (!s) { res.status(400).json({ error: "Technician not found" }); return; }
      updates.technicianId = body.technicianId;
      updates.technicianName = `${s.firstName} ${s.lastName}`.trim();
    }
  }
  if (body.numImages !== undefined) {
    const n = Number(body.numImages);
    if (!Number.isFinite(n) || n < 0) { res.status(400).json({ error: "numImages must be >= 0" }); return; }
    updates.numImages = n;
  }
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.studyInstanceUid !== undefined) updates.studyInstanceUid = body.studyInstanceUid;
  if ("clinicalHistory" in body) updates.clinicalHistory = (body as { clinicalHistory?: string }).clinicalHistory ?? null;

  // DICOM MWL fields
  if ("bodyPart" in body) updates.bodyPart = body.bodyPart ?? null;
  if ("studyDescription" in body) updates.studyDescription = body.studyDescription ?? null;
  if ("scheduledStationAETitle" in body) updates.scheduledStationAETitle = body.scheduledStationAETitle ?? null;
  if ("referringDoctor" in body) updates.referringDoctor = body.referringDoctor ?? null;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Nothing to update" }); return;
  }

  const [row] = await db.update(radiologyStudiesTable).set(updates).where(eq(radiologyStudiesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Study not found" }); return; }
  res.json(row);
});

// POST /api/radiology/studies/:id/report — save preliminary or final report.
// Body: { stage: "preliminary"|"final", body: string, reportedBy?: string, templateId?: number }
//
// Saving a preliminary advances status to reported_preliminary; saving a final
// advances to reported_final. We never downgrade — if a final already exists,
// posting a preliminary leaves status alone.
radiologyRouter.post("/:id/report", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = req.body as { stage?: string; body?: string; reportedBy?: string; templateId?: number };
  if (!body.stage || !["preliminary", "final"].includes(body.stage)) {
    res.status(400).json({ error: "stage must be 'preliminary' or 'final'" }); return;
  }
  if (typeof body.body !== "string" || !body.body.trim()) {
    res.status(400).json({ error: "body required" }); return;
  }

  const [existing] = await db.select().from(radiologyStudiesTable).where(eq(radiologyStudiesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Study not found" }); return; }

  const updates: Partial<typeof radiologyStudiesTable.$inferInsert> = {};
  if (body.templateId !== undefined) updates.templateId = body.templateId;
  if (body.stage === "preliminary") {
    updates.prelimReport = body.body;
    updates.prelimReportedBy = body.reportedBy ?? null;
    updates.prelimReportedAt = new Date();
    if (existing.status !== "reported_final" && existing.status !== "delivered") {
      updates.status = "reported_preliminary";
    }
  } else {
    updates.finalReport = body.body;
    updates.finalReportedBy = body.reportedBy ?? null;
    updates.finalReportedAt = new Date();
    if (existing.status !== "delivered") updates.status = "reported_final";
    // Saving the final report closes out the tele-radiology claim — the study
    // moves into the QC/verification pipeline and another radiologist should
    // not need to "release" it manually.
    updates.assignedRadiologistId = null;
    updates.assignedRadiologistName = null;
    updates.claimedAt = null;
  }

  const [row] = await db.update(radiologyStudiesTable).set(updates).where(eq(radiologyStudiesTable.id, id)).returning();
  res.json(row);
});

// ── Tele-radiology: claim / unclaim / assign ────────────────────────────────
// POST /api/radiology/:id/claim
// Claims a study for remote/night reading using the *authenticated* staff
// identity — the request body is no longer trusted for identity. Cleared
// automatically when a final report is saved or by explicit unclaim.
radiologyRouter.post("/:id/claim", async (req: StaffAuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const session = req.staffSession;
  if (!session) { res.status(401).json({ error: "Staff session required" }); return; }

  const [existing] = await db.select().from(radiologyStudiesTable).where(eq(radiologyStudiesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Study not found" }); return; }
  if (existing.assignedRadiologistId && existing.assignedRadiologistId !== session.subjectId) {
    res.status(409).json({ error: `Already claimed by ${existing.assignedRadiologistName ?? "another radiologist"}` });
    return;
  }
  const [row] = await db.update(radiologyStudiesTable).set({
    assignedRadiologistId: session.subjectId,
    assignedRadiologistName: session.subjectName,
    claimedAt: existing.claimedAt ?? new Date(),
  }).where(eq(radiologyStudiesTable.id, id)).returning();
  res.json(row);
});

// POST /api/radiology/:id/unclaim — release a claim. Only the radiologist who
// holds the claim (or admin/super_admin) may release it.
radiologyRouter.post("/:id/unclaim", async (req: StaffAuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const session = req.staffSession;
  if (!session) { res.status(401).json({ error: "Staff session required" }); return; }

  const [existing] = await db.select().from(radiologyStudiesTable).where(eq(radiologyStudiesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Study not found" }); return; }
  const isPrivileged = session.role === "admin" || session.role === "super_admin";
  if (existing.assignedRadiologistId && existing.assignedRadiologistId !== session.subjectId && !isPrivileged) {
    res.status(403).json({ error: "Only the assigned radiologist or an admin can release this claim." });
    return;
  }
  const [row] = await db.update(radiologyStudiesTable).set({
    assignedRadiologistId: null,
    assignedRadiologistName: null,
    claimedAt: null,
  }).where(eq(radiologyStudiesTable.id, id)).returning();
  res.json(row);
});

// POST /api/radiology/:id/share-link  { audience?: "patient"|"radiologist", expiresInHours?: number }
// Returns a tokenised URL that opens the public study viewer. Only one active
// link per (study, audience) — older active ones are revoked. The "radiologist"
// audience exposes the draft report and is restricted to the assigned
// radiologist or to admin/super_admin staff.
radiologyRouter.post("/:id/share-link", async (req: StaffAuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const session = req.staffSession;
  if (!session) { res.status(401).json({ error: "Staff session required" }); return; }
  const b = (req.body ?? {}) as { audience?: string; expiresInHours?: number };
  const audience = b.audience === "radiologist" ? "radiologist" : "patient";
  const hours = Math.min(Math.max(Number(b.expiresInHours) || (audience === "radiologist" ? 24 : 168), 1), 24 * 90);
  const [study] = await db.select().from(radiologyStudiesTable).where(eq(radiologyStudiesTable.id, id));
  if (!study) { res.status(404).json({ error: "Study not found" }); return; }

  if (audience === "radiologist") {
    const isPrivileged = session.role === "admin" || session.role === "super_admin";
    const isAssigned = study.assignedRadiologistId === session.subjectId;
    if (!isPrivileged && !isAssigned) {
      res.status(403).json({ error: "Only the assigned radiologist (or an admin) can mint a tele-radiology link. Claim the study first." });
      return;
    }
  }

  // Revoke prior active links for the same (study, audience).
  await db.update(radiologyShareLinksTable)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(radiologyShareLinksTable.studyId, id),
      eq(radiologyShareLinksTable.audience, audience),
      isNull(radiologyShareLinksTable.revokedAt),
    ));

  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000);
  await db.insert(radiologyShareLinksTable).values({
    token, studyId: id, audience,
    createdBy: session.subjectName,
    expiresAt,
  });
  const url = `${absoluteBase(req)}/api/teleradiology/share/${token}`;
  res.json({ token, url, audience, expiresAt });
});

// ── Film / CD / Print Issuance ──────────────────────────────────────────────
// GET /api/radiology/studies/:id/issues
radiologyRouter.get("/:id/issues", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await db.select().from(radiologyFilmIssuesTable)
    .where(eq(radiologyFilmIssuesTable.studyId, id))
    .orderBy(desc(radiologyFilmIssuesTable.issuedAt));
  res.json(rows);
});

// POST /api/radiology/studies/:id/issues
radiologyRouter.post("/:id/issues", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = req.body as { issueType?: string; quantity?: number; issuedBy?: string; receivedBy?: string; notes?: string };
  if (!body.issueType || !["film", "cd", "print"].includes(body.issueType)) {
    res.status(400).json({ error: "issueType must be film, cd, or print" }); return;
  }
  // Quantity is required — silently defaulting to 1 has caused inventory
  // drift when the UI forgot to send it on multi-film/CD issues.
  if (body.quantity === undefined || body.quantity === null) {
    res.status(400).json({ error: "Invalid request", details: [{ path: ["quantity"], message: "quantity is required" }] });
    return;
  }
  const qty = Number(body.quantity);
  if (!Number.isInteger(qty) || qty < 1) { res.status(400).json({ error: "Invalid request", details: [{ path: ["quantity"], message: "quantity must be a positive integer" }] }); return; }

  const [study] = await db.select().from(radiologyStudiesTable).where(eq(radiologyStudiesTable.id, id));
  if (!study) { res.status(404).json({ error: "Study not found" }); return; }

  const [row] = await db.insert(radiologyFilmIssuesTable).values({
    studyId: id,
    issueType: body.issueType,
    quantity: qty,
    issuedBy: body.issuedBy ?? null,
    receivedBy: body.receivedBy ?? null,
    notes: body.notes ?? null,
  }).returning();

  // Issuing a film/CD/print after the final is reported moves the study to
  // "delivered" — once a patient has received their physical artifact the
  // workflow is complete.
  if (study.status === "reported_final") {
    await db.update(radiologyStudiesTable)
      .set({ status: "delivered", deliveredAt: new Date() })
      .where(eq(radiologyStudiesTable.id, id));
  }

  res.status(201).json(row);
});

// ── Saved AI prompts ─────────────────────────────────────────────────────────
// GET  /api/radiology/prompts?testName=&modality=
// POST /api/radiology/prompts   { name, content, testName?, modality? }
// DELETE /api/radiology/prompts/:id

radiologyRouter.get("/prompts", async (req, res) => {
  const rows = await db
    .select()
    .from(radiologyPromptsTable)
    .orderBy(asc(radiologyPromptsTable.createdAt));
  res.json(rows);
});

radiologyRouter.post("/prompts", async (req, res) => {
  const body = req.body as { name?: string; content?: string; testName?: string; modality?: string };
  if (!body.name?.trim() || !body.content?.trim()) {
    res.status(400).json({ error: "name and content are required" }); return;
  }
  const [row] = await db.insert(radiologyPromptsTable).values({
    name: body.name.trim(),
    content: body.content.trim(),
    testName: body.testName?.trim() || null,
    modality: body.modality?.trim() || null,
  }).returning();
  res.status(201).json(row);
});

radiologyRouter.delete("/prompts/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(radiologyPromptsTable).where(eq(radiologyPromptsTable.id, id));
  res.json({ ok: true });
});

// ── Stats for the page header ───────────────────────────────────────────────
radiologyRouter.get("/stats/today", async (_req, res) => {
  const date = todayISO();
  const rows = await db
    .select({ status: radiologyStudiesTable.status, count: sql<number>`count(*)::int` })
    .from(radiologyStudiesTable)
    .where(eq(radiologyStudiesTable.studyDate, date))
    .groupBy(radiologyStudiesTable.status);
  const counts: Record<string, number> = {
    scheduled: 0, in_progress: 0, acquired: 0,
    reported_preliminary: 0, reported_final: 0, delivered: 0, cancelled: 0,
  };
  for (const r of rows) counts[r.status] = r.count;
  res.json({ date, counts });
});

// avoid unused-import warnings while keeping these handy for future filters
void ilike;
void or;
void gte;
void lte;
void ordersTable;

// ── PACS Dashboard ─────────────────────────────────────────────────────────
// GET /api/radiology/pacs-dashboard
radiologyRouter.get("/pacs-dashboard", async (_req, res) => {
  const today = todayISO();

  // Worklist status breakdown (all time)
  const statusRows = await db
    .select({ status: radiologyWorklistTable.status, count: sql<number>`count(*)::int` })
    .from(radiologyWorklistTable)
    .groupBy(radiologyWorklistTable.status);

  // Modality breakdown (all time)
  const modalityRows = await db
    .select({ modality: radiologyWorklistTable.modality, count: sql<number>`count(*)::int` })
    .from(radiologyWorklistTable)
    .groupBy(radiologyWorklistTable.modality);

  // Today's counts
  const todayRows = await db
    .select({ status: radiologyWorklistTable.status, count: sql<number>`count(*)::int` })
    .from(radiologyWorklistTable)
    .where(sql`DATE(${radiologyWorklistTable.createdAt}) = ${today}::date`)
    .groupBy(radiologyWorklistTable.status);

  const byStatus: Record<string, number> = {};
  for (const r of statusRows) byStatus[r.status] = r.count;

  const byModality: Record<string, number> = {};
  for (const r of modalityRows) byModality[r.modality] = r.count;

  const todayTotal = todayRows.reduce((s, r) => s + r.count, 0);
  const todayReported = todayRows
    .filter((r) => r.status === "REPORT_FINAL" || r.status === "DELIVERED")
    .reduce((s, r) => s + r.count, 0);

  // Recent PACS log events
  const recentEvents = await db
    .select()
    .from(pacsLogsTable)
    .orderBy(sql`created_at DESC`)
    .limit(30);

  res.json({
    worklist: {
      total: Object.values(byStatus).reduce((s, n) => s + n, 0),
      byStatus,
      byModality,
      todayTotal,
      todayReported,
    },
    recentEvents,
  });
});

// ── Conquest integration status ────────────────────────────────────────────
// GET /api/radiology/conquest-status
// Staff-gated health probe used by the PACS Dashboard badge.
// Returns whether Conquest host is configured and when the last study arrived.
radiologyRouter.get("/conquest-status", async (_req, res) => {
  const [hostSetting] = await db
    .select({ value: pacsSettingsTable.value })
    .from(pacsSettingsTable)
    .where(and(eq(pacsSettingsTable.key, "conquest_host"), eq(pacsSettingsTable.category, "conquest")))
    .limit(1);

  const configured = !!(hostSetting?.value?.trim());

  const [lastStudy] = await db
    .select({ createdAt: radiologyWorklistTable.createdAt, accessionNumber: radiologyWorklistTable.accessionNumber })
    .from(radiologyWorklistTable)
    .orderBy(desc(radiologyWorklistTable.createdAt))
    .limit(1);

  const lastReceived = lastStudy?.createdAt ?? null;
  const lastAccession = lastStudy?.accessionNumber ?? null;

  const status: "ready" | "not-configured" | "no-activity" = configured
    ? lastReceived ? "ready" : "no-activity"
    : "not-configured";

  res.json({ configured, status, lastStudyReceived: lastReceived, lastAccessionNumber: lastAccession });
});

// ── PACS Logs ──────────────────────────────────────────────────────────────
// GET /api/radiology/pacs-logs?severity=&limit=
radiologyRouter.get("/pacs-logs", async (req, res) => {
  const severity = (req.query.severity as string) || "all";
  const limit = Math.min(Number(req.query.limit) || 200, 500);

  const conds = severity && severity !== "all"
    ? [eq(pacsLogsTable.severity, severity)]
    : [];

  const rows = await db
    .select()
    .from(pacsLogsTable)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(sql`created_at DESC`)
    .limit(limit);

  res.json(rows);
});

// POST /api/radiology/pacs-logs
radiologyRouter.post("/pacs-logs", async (req, res) => {
  const b = (req.body ?? {}) as {
    message?: string; severity?: string; source?: string; eventType?: string;
    logType?: string; studyInstanceUid?: string; accessionNumber?: string;
    patientId?: string; modality?: string; payload?: string; errorStack?: string;
  };
  if (!b.message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

  const VALID_SEV = ["info", "warning", "error", "debug"];
  const [row] = await db.insert(pacsLogsTable).values({
    message:          b.message.trim(),
    severity:         VALID_SEV.includes(b.severity ?? "") ? b.severity! : "info",
    source:           b.source ?? null,
    eventType:        b.eventType ?? null,
    logType:          b.logType ?? null,
    studyInstanceUid: b.studyInstanceUid ?? null,
    accessionNumber:  b.accessionNumber ?? null,
    patientId:        b.patientId ?? null,
    modality:         b.modality ?? null,
    payload:          b.payload ?? null,
    errorStack:       b.errorStack ?? null,
  }).returning();
  res.status(201).json(row);
});

// ── PACS Settings ──────────────────────────────────────────────────────────
// GET /api/radiology/pacs-settings
radiologyRouter.get("/pacs-settings", async (_req, res) => {
  const rows = await db.select().from(pacsSettingsTable).orderBy(pacsSettingsTable.category, pacsSettingsTable.key);
  res.json(rows);
});

// POST /api/radiology/pacs-settings  (upsert by key+category)
radiologyRouter.post("/pacs-settings", async (req, res) => {
  const b = (req.body ?? {}) as { key?: string; value?: string; category?: string; isSecret?: boolean; id?: number };
  if (!b.key?.trim()) { res.status(400).json({ error: "key is required" }); return; }

  const key = b.key.trim();
  const category = b.category?.trim() || "general";

  // If id provided, update that row; otherwise upsert by key+category
  if (b.id) {
    const [row] = await db.update(pacsSettingsTable)
      .set({ value: b.value ?? null, isSecret: b.isSecret ?? false, updatedAt: new Date() })
      .where(eq(pacsSettingsTable.id, b.id))
      .returning();
    res.json(row);
  } else {
    const [row] = await db.insert(pacsSettingsTable)
      .values({ key, value: b.value ?? null, category, isSecret: b.isSecret ?? false })
      .onConflictDoUpdate({
        target: [pacsSettingsTable.key, pacsSettingsTable.category],
        set: { value: b.value ?? null, isSecret: b.isSecret ?? false, updatedAt: new Date() },
      })
      .returning();
    res.status(201).json(row);
  }
});

// DELETE /api/radiology/pacs-settings/:id
radiologyRouter.delete("/pacs-settings/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(pacsSettingsTable).where(eq(pacsSettingsTable.id, id));
  res.json({ ok: true });
});

// ── DICOM Modalities ───────────────────────────────────────────────────────
// GET /api/radiology/modalities
radiologyRouter.get("/modalities", async (_req, res) => {
  const rows = await db.select().from(dicomModalitiesTable).orderBy(dicomModalitiesTable.machineName);
  res.json(rows);
});

// POST /api/radiology/modalities  (insert or update)
radiologyRouter.post("/modalities", async (req, res) => {
  const b = (req.body ?? {}) as {
    id?: number; machineName?: string; modality?: string; aeTitle?: string;
    ipAddress?: string; port?: number; location?: string;
    autoSendEnabled?: boolean; isActive?: boolean;
  };

  if (b.id) {
    // Partial update of an existing modality
    const updates: Partial<typeof dicomModalitiesTable.$inferInsert> = { updatedAt: new Date() };
    if (b.machineName !== undefined) updates.machineName = b.machineName;
    if (b.modality !== undefined) updates.modality = b.modality;
    if (b.aeTitle !== undefined) updates.aeTitle = b.aeTitle;
    if (b.ipAddress !== undefined) updates.ipAddress = b.ipAddress;
    if (b.port !== undefined) updates.port = b.port;
    if (b.location !== undefined) updates.location = b.location;
    if (b.autoSendEnabled !== undefined) updates.autoSendEnabled = b.autoSendEnabled;
    if (b.isActive !== undefined) updates.isActive = b.isActive;
    const [row] = await db.update(dicomModalitiesTable).set(updates).where(eq(dicomModalitiesTable.id, b.id)).returning();
    res.json(row);
  } else {
    if (!b.machineName?.trim()) { res.status(400).json({ error: "machineName is required" }); return; }
    const [row] = await db.insert(dicomModalitiesTable).values({
      machineName:     b.machineName.trim(),
      modality:        b.modality ?? null,
      aeTitle:         b.aeTitle ?? null,
      ipAddress:       b.ipAddress ?? null,
      port:            b.port ?? null,
      location:        b.location ?? null,
      autoSendEnabled: b.autoSendEnabled ?? true,
      isActive:        b.isActive ?? true,
    }).returning();
    res.status(201).json(row);
  }
});

// DELETE /api/radiology/modalities/:id
radiologyRouter.delete("/modalities/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(dicomModalitiesTable).where(eq(dicomModalitiesTable.id, id));
  res.json({ ok: true });
});

export default radiologyRouter;
