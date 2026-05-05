import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  radiologyStudiesTable, radiologyFilmIssuesTable, radiologyShareLinksTable,
  testsTable, patientsTable, ordersTable, orderTestsTable,
  billsTable, reportTemplatesTable, staffTable,
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

// PATCH /api/radiology/studies/:id — update status, technician, num images, notes
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
  };

  const updates: Partial<typeof radiologyStudiesTable.$inferInsert> = {};
  if (body.status !== undefined) {
    const valid = ["scheduled", "in_progress", "acquired", "reported_preliminary", "reported_final", "delivered", "cancelled"];
    if (!valid.includes(body.status)) { res.status(400).json({ error: "Invalid status" }); return; }
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

export default radiologyRouter;
