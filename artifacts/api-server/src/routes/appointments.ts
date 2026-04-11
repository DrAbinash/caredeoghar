import { Router } from "express";
import { db } from "@workspace/db";
import {
  appointmentsTable,
  appointmentCounterTable,
  patientsTable,
  doctorsTable,
} from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";

const router = Router();

async function generateAppointmentId(): Promise<string> {
  const [counter] = await db.select().from(appointmentCounterTable).limit(1);
  let seq = 1;
  if (counter) {
    seq = counter.counter + 1;
    await db.update(appointmentCounterTable).set({ counter: seq }).where(eq(appointmentCounterTable.id, counter.id));
  } else {
    await db.insert(appointmentCounterTable).values({ counter: 1 });
  }
  const now = new Date();
  const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `APT-${yymm}-${String(seq).padStart(4, "0")}`;
}

// List appointments with filters
router.get("/", async (req, res) => {
  const { date, status, patientId, doctorId } = req.query as Record<string, string>;

  const rows = await db
    .select({
      appointment: appointmentsTable,
      patient: {
        id: patientsTable.id,
        patientId: patientsTable.patientId,
        firstName: patientsTable.firstName,
        lastName: patientsTable.lastName,
        phone: patientsTable.phone,
      },
      doctor: {
        id: doctorsTable.id,
        name: doctorsTable.name,
      },
    })
    .from(appointmentsTable)
    .leftJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
    .leftJoin(doctorsTable, eq(appointmentsTable.doctorId, doctorsTable.id))
    .where(
      and(
        date ? eq(appointmentsTable.appointmentDate, date) : undefined,
        status ? eq(appointmentsTable.status, status) : undefined,
        patientId ? eq(appointmentsTable.patientId, Number(patientId)) : undefined,
        doctorId ? eq(appointmentsTable.doctorId, Number(doctorId)) : undefined,
      )
    )
    .orderBy(desc(appointmentsTable.createdAt));

  return res.json(
    rows.map((r) => ({
      ...r.appointment,
      patient: r.patient,
      doctor: r.doctor,
    }))
  );
});

// Stats for today
router.get("/stats", async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.appointmentDate, today));

  const total = rows.length;
  const scheduled = rows.filter((r) => r.status === "scheduled").length;
  const confirmed = rows.filter((r) => r.status === "confirmed").length;
  const completed = rows.filter((r) => r.status === "completed").length;
  const cancelled = rows.filter((r) => r.status === "cancelled").length;
  const noShow = rows.filter((r) => r.status === "no-show").length;

  return res.json({ total, scheduled, confirmed, completed, cancelled, noShow });
});

// Get single appointment
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db
    .select({
      appointment: appointmentsTable,
      patient: {
        id: patientsTable.id,
        patientId: patientsTable.patientId,
        firstName: patientsTable.firstName,
        lastName: patientsTable.lastName,
        phone: patientsTable.phone,
      },
      doctor: {
        id: doctorsTable.id,
        name: doctorsTable.name,
      },
    })
    .from(appointmentsTable)
    .leftJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
    .leftJoin(doctorsTable, eq(appointmentsTable.doctorId, doctorsTable.id))
    .where(eq(appointmentsTable.id, id));

  if (!row) return res.status(404).json({ error: "Appointment not found" });
  return res.json({ ...row.appointment, patient: row.patient, doctor: row.doctor });
});

// Create appointment
router.post("/", async (req, res) => {
  const { patientId, doctorId, packageId, appointmentDate, timeSlot, status, type, notes } = req.body;
  if (!patientId || !appointmentDate || !timeSlot) {
    return res.status(400).json({ error: "patientId, appointmentDate, timeSlot are required" });
  }

  const aptId = await generateAppointmentId();
  const [apt] = await db
    .insert(appointmentsTable)
    .values({
      appointmentId: aptId,
      patientId: Number(patientId),
      doctorId: doctorId ? Number(doctorId) : null,
      packageId: packageId ? Number(packageId) : null,
      appointmentDate,
      timeSlot,
      status: status || "scheduled",
      type: type || "walk-in",
      notes: notes || null,
    })
    .returning();

  return res.status(201).json(apt);
});

// Update appointment status / fields
router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const allowed = ["status", "timeSlot", "appointmentDate", "doctorId", "packageId", "notes", "type"];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No valid fields to update" });
  }
  const [apt] = await db
    .update(appointmentsTable)
    .set(updates)
    .where(eq(appointmentsTable.id, id))
    .returning();
  if (!apt) return res.status(404).json({ error: "Appointment not found" });
  return res.json(apt);
});

// Delete appointment
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [apt] = await db
    .delete(appointmentsTable)
    .where(eq(appointmentsTable.id, id))
    .returning();
  if (!apt) return res.status(404).json({ error: "Appointment not found" });
  return res.json({ success: true });
});

export { router as appointmentsRouter };
