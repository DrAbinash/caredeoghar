import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import {
  clinicSettingsTable,
  portalSessionsTable,
  patientsTable,
  usersTable,
  billsTable,
  paymentsTable,
  ordersTable,
  orderTestsTable,
  testsTable,
  appointmentsTable,
  appointmentCounterTable,
  doctorsTable,
} from "@workspace/db/schema";
import { eq, and, desc, gt, sql } from "drizzle-orm";

export const portalRouter = Router();

// Session lifetime: 12 hours
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

// Cleanup helper — best-effort prune of expired sessions
async function pruneExpiredSessions() {
  try {
    await db.delete(portalSessionsTable).where(sql`${portalSessionsTable.expiresAt} < now()`);
  } catch {
    /* swallow */
  }
}

async function getSettings() {
  const rows = await db.select().from(clinicSettingsTable).limit(1);
  if (rows[0]) return rows[0];
  const [created] = await db.insert(clinicSettingsTable).values({}).returning();
  return created;
}

async function requirePortalEnabled(res: Response): Promise<boolean> {
  const s = await getSettings();
  if (!s.portalEnabled) {
    res.status(403).json({ error: "Patient portal is currently disabled" });
    return false;
  }
  return true;
}

// =====================================================================
// Public endpoints
// =====================================================================

// Public portal info — clients use this to render the landing page.
portalRouter.get("/settings", async (_req, res) => {
  const s = await getSettings();
  res.json({
    enabled: s.portalEnabled,
    heading: s.portalHeading || s.name,
    welcomeMessage: s.portalWelcomeMessage,
    centerName: s.name,
    tagline: s.tagline,
    address: s.address,
    phone: s.phone,
    email: s.email,
    logoDataUrl: s.logoDataUrl,
    allowAppointmentBooking: s.portalAllowAppointmentBooking,
    allowProfileEdit: s.portalAllowProfileEdit,
  });
});

// Patient login — phone number lookup. NOTE: per requested UX, no extra
// factor (DOB / OTP) is checked. Phone alone is sufficient.
portalRouter.post("/patient-login", async (req, res) => {
  if (!(await requirePortalEnabled(res))) return;

  const phone = String(req.body?.phone ?? "").trim();
  if (!phone) {
    res.status(400).json({ error: "Mobile number is required" });
    return;
  }
  // Strip all non-digits for comparison; also keep raw to match either format
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) {
    res.status(400).json({ error: "Please enter a valid mobile number" });
    return;
  }

  // Look up by exact match OR by "ends with last 10 digits" (handles +91 etc.)
  const last10 = digits.slice(-10);
  const matches = await db
    .select()
    .from(patientsTable)
    .where(sql`regexp_replace(${patientsTable.phone}, '\\D', '', 'g') LIKE ${"%" + last10}`);

  if (matches.length === 0) {
    res.status(404).json({ error: "No patient registered with this number. Please visit reception to register first." });
    return;
  }
  if (matches.length > 1) {
    // Should be rare — return first by createdAt desc to prefer the latest record
    matches.sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0));
  }
  const patient = matches[0];

  await pruneExpiredSessions();
  const token = crypto.randomBytes(24).toString("hex");
  await db.insert(portalSessionsTable).values({
    token,
    scope: "patient",
    subjectId: patient.id,
    subjectName: `${patient.firstName} ${patient.lastName}`.trim(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

  res.json({
    token,
    patient: {
      id: patient.id,
      patientId: patient.patientId,
      firstName: patient.firstName,
      lastName: patient.lastName,
      phone: patient.phone,
      email: patient.email,
      photoDataUrl: patient.photoDataUrl,
    },
  });
});

// Staff login — email + PIN against existing users table.
portalRouter.post("/staff-login", async (req, res) => {
  if (!(await requirePortalEnabled(res))) return;

  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const pin = String(req.body?.pin ?? "").trim();
  if (!email || !pin) {
    res.status(400).json({ error: "Email and PIN are required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user || !user.isActive || !user.pin || user.pin !== pin) {
    res.status(401).json({ error: "Invalid email or PIN" });
    return;
  }

  await pruneExpiredSessions();
  const token = crypto.randomBytes(24).toString("hex");
  await db.insert(portalSessionsTable).values({
    token,
    scope: "staff",
    subjectId: user.id,
    subjectName: user.name,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

// =====================================================================
// Authenticated middleware — patient scope
// =====================================================================

interface PortalAuthRequest extends Request {
  portalSession?: { id: number; scope: string; subjectId: number; subjectName: string };
}

async function requirePatientAuth(req: PortalAuthRequest, res: Response, next: NextFunction) {
  if (!(await requirePortalEnabled(res))) return;

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    res.status(401).json({ error: "Login required" });
    return;
  }

  const [session] = await db
    .select()
    .from(portalSessionsTable)
    .where(and(eq(portalSessionsTable.token, token), gt(portalSessionsTable.expiresAt, new Date())))
    .limit(1);

  if (!session || session.scope !== "patient") {
    res.status(401).json({ error: "Session expired. Please log in again." });
    return;
  }

  req.portalSession = session;
  next();
}

// =====================================================================
// Patient self-service endpoints
// =====================================================================

// Logout (any scope)
portalRouter.post("/logout", async (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token) await db.delete(portalSessionsTable).where(eq(portalSessionsTable.token, token));
  res.json({ ok: true });
});

// Profile
portalRouter.get("/me", requirePatientAuth, async (req: PortalAuthRequest, res) => {
  const id = req.portalSession!.subjectId;
  const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, id)).limit(1);
  if (!p) { res.status(404).json({ error: "Patient not found" }); return; }
  res.json(p);
});

portalRouter.put("/me", requirePatientAuth, async (req: PortalAuthRequest, res) => {
  const s = await getSettings();
  if (!s.portalAllowProfileEdit) {
    res.status(403).json({ error: "Profile editing is disabled by the clinic" });
    return;
  }
  const id = req.portalSession!.subjectId;
  const allowed = ["firstName", "lastName", "phone", "email", "address", "bloodGroup"] as const;
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const f of allowed) {
    const v = req.body?.[f];
    if (v !== undefined) {
      if (v !== null && typeof v !== "string") {
        res.status(400).json({ error: `${f} must be a string` });
        return;
      }
      const trimmed = typeof v === "string" ? v.trim() : v;
      // Per-field validation
      if (f === "firstName" || f === "lastName") {
        if (!trimmed || (trimmed as string).length < 1 || (trimmed as string).length > 100) {
          res.status(400).json({ error: `${f === "firstName" ? "First" : "Last"} name is required (max 100 chars)` });
          return;
        }
      }
      if (f === "phone") {
        const digits = String(trimmed ?? "").replace(/\D/g, "");
        if (digits.length < 6 || digits.length > 20) {
          res.status(400).json({ error: "Please enter a valid mobile number — you'll need it to log in." });
          return;
        }
      }
      if (f === "email" && trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed as string)) {
        res.status(400).json({ error: "Please enter a valid email address" });
        return;
      }
      if (typeof trimmed === "string" && trimmed.length > 500) {
        res.status(400).json({ error: `${f} too long (max 500 chars)` });
        return;
      }
      update[f] = trimmed === "" ? null : trimmed;
    }
  }
  if (Object.keys(update).length <= 1) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  const [updated] = await db.update(patientsTable).set(update).where(eq(patientsTable.id, id)).returning();
  res.json(updated);
});

// Bills + payments
portalRouter.get("/me/bills", requirePatientAuth, async (req: PortalAuthRequest, res) => {
  const id = req.portalSession!.subjectId;
  const bills = await db
    .select()
    .from(billsTable)
    .where(eq(billsTable.patientId, id))
    .orderBy(desc(billsTable.createdAt));

  // Attach payment summary
  const enriched = await Promise.all(
    bills.map(async (b) => {
      const pays = await db.select().from(paymentsTable).where(eq(paymentsTable.billId, b.id));
      return { ...b, payments: pays };
    }),
  );
  res.json(enriched);
});

// Visit history (orders)
portalRouter.get("/me/visits", requirePatientAuth, async (req: PortalAuthRequest, res) => {
  const id = req.portalSession!.subjectId;
  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.patientId, id))
    .orderBy(desc(ordersTable.createdAt));

  const enriched = await Promise.all(
    orders.map(async (o) => {
      const tests = await db
        .select({
          id: orderTestsTable.id,
          testId: orderTestsTable.testId,
          testName: testsTable.name,
          price: orderTestsTable.price,
          result: orderTestsTable.result,
          resultStatus: orderTestsTable.resultStatus,
        })
        .from(orderTestsTable)
        .leftJoin(testsTable, eq(orderTestsTable.testId, testsTable.id))
        .where(eq(orderTestsTable.orderId, o.id));
      return { ...o, tests };
    }),
  );
  res.json(enriched);
});

// Reports = completed test results (exposed via order tests with result text)
portalRouter.get("/me/reports", requirePatientAuth, async (req: PortalAuthRequest, res) => {
  const id = req.portalSession!.subjectId;
  const rows = await db
    .select({
      orderId: ordersTable.id,
      orderNumber: ordersTable.orderNumber,
      orderDate: ordersTable.createdAt,
      testId: orderTestsTable.testId,
      testName: testsTable.name,
      result: orderTestsTable.result,
      resultStatus: orderTestsTable.resultStatus,
    })
    .from(orderTestsTable)
    .innerJoin(ordersTable, eq(orderTestsTable.orderId, ordersTable.id))
    .leftJoin(testsTable, eq(orderTestsTable.testId, testsTable.id))
    .where(eq(ordersTable.patientId, id))
    .orderBy(desc(ordersTable.createdAt));

  // Only show ones that have a result captured
  res.json(rows.filter((r) => r.result && r.result.trim().length > 0));
});

// Appointments
portalRouter.get("/me/appointments", requirePatientAuth, async (req: PortalAuthRequest, res) => {
  const id = req.portalSession!.subjectId;
  const rows = await db
    .select({
      appointment: appointmentsTable,
      doctor: { id: doctorsTable.id, name: doctorsTable.name },
    })
    .from(appointmentsTable)
    .leftJoin(doctorsTable, eq(appointmentsTable.doctorId, doctorsTable.id))
    .where(eq(appointmentsTable.patientId, id))
    .orderBy(desc(appointmentsTable.appointmentDate), desc(appointmentsTable.createdAt));

  res.json(rows.map((r) => ({ ...r.appointment, doctor: r.doctor })));
});

portalRouter.post("/me/appointments", requirePatientAuth, async (req: PortalAuthRequest, res) => {
  const s = await getSettings();
  if (!s.portalAllowAppointmentBooking) {
    res.status(403).json({ error: "Appointment booking is disabled by the clinic" });
    return;
  }

  const id = req.portalSession!.subjectId;
  const date = String(req.body?.appointmentDate ?? "").trim();
  const slot = String(req.body?.timeSlot ?? "").trim();
  const doctorId = req.body?.doctorId == null ? null : Number(req.body.doctorId);
  const notes = req.body?.notes ? String(req.body.notes).slice(0, 500) : null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "Please pick a valid date" });
    return;
  }
  if (!slot) {
    res.status(400).json({ error: "Please pick a time slot" });
    return;
  }
  // Reject past dates
  if (new Date(date + "T23:59:59").getTime() < Date.now() - 24 * 3600_000) {
    res.status(400).json({ error: "Date is in the past" });
    return;
  }
  if (doctorId != null && (!Number.isInteger(doctorId) || doctorId <= 0)) {
    res.status(400).json({ error: "Invalid doctor" });
    return;
  }

  // Generate appointment ID — atomic increment to avoid race conditions
  // when multiple patients book simultaneously.
  let seq: number;
  const updated = await db
    .update(appointmentCounterTable)
    .set({ counter: sql`${appointmentCounterTable.counter} + 1` })
    .returning({ counter: appointmentCounterTable.counter });
  if (updated.length > 0) {
    seq = updated[0].counter;
  } else {
    const [created] = await db.insert(appointmentCounterTable).values({ counter: 1 }).returning();
    seq = created.counter;
  }
  const now = new Date();
  const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const apptId = `APT-${yymm}-${String(seq).padStart(4, "0")}`;

  const [created] = await db
    .insert(appointmentsTable)
    .values({
      appointmentId: apptId,
      patientId: id,
      doctorId,
      appointmentDate: date,
      timeSlot: slot,
      status: "scheduled",
      type: "portal",
      notes,
    })
    .returning();
  res.status(201).json(created);
});

// Public list of doctors (for booking dropdown). No PII beyond name.
portalRouter.get("/doctors", async (_req, res) => {
  if (!(await requirePortalEnabled(res))) return;
  const rows = await db
    .select({ id: doctorsTable.id, name: doctorsTable.name, specialization: doctorsTable.specialization })
    .from(doctorsTable);
  res.json(rows);
});
