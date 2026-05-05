import { Router } from "express";
import { db, doctorsTable } from "@workspace/db";
import { ilike, or, desc, eq } from "drizzle-orm";
import {
  ListDoctorsQueryParams,
  CreateDoctorBody,
  UpdateDoctorParams,
  UpdateDoctorBody,
  DeleteDoctorParams,
} from "@workspace/api-zod";

export const doctorsRouter = Router();

doctorsRouter.get("/", async (req, res) => {
  const parsed = ListDoctorsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }
  const { search } = parsed.data;

  let query = db.select().from(doctorsTable);
  if (search) {
    query = query.where(
      or(
        ilike(doctorsTable.name, `%${search}%`),
        ilike(doctorsTable.specialization, `%${search}%`),
        ilike(doctorsTable.hospitalAffiliation, `%${search}%`)
      )
    ) as typeof query;
  }

  const doctors = await query.orderBy(desc(doctorsTable.createdAt));
  res.json({ doctors, total: doctors.length });
});

doctorsRouter.post("/", async (req, res) => {
  const parsed = CreateDoctorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }
  const ledgerId = req.body?.ledgerId !== undefined && req.body.ledgerId !== null
    ? Number(req.body.ledgerId)
    : null;
  const [doctor] = await db.insert(doctorsTable).values({ ...parsed.data, ledgerId }).returning();
  res.status(201).json(doctor);
});

doctorsRouter.patch("/:id", async (req, res) => {
  const paramsParsed = UpdateDoctorParams.safeParse(req.params);
  const bodyParsed = UpdateDoctorBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({
      error: "Invalid request",
      details: [
        ...(paramsParsed.success ? [] : paramsParsed.error.issues),
        ...(bodyParsed.success ? [] : bodyParsed.error.issues),
      ],
    });
    return;
  }
  const id = paramsParsed.data.id;
  const body = bodyParsed.data;

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.specialization !== undefined) updates.specialization = body.specialization;
  if (body.phone !== undefined) updates.phone = body.phone || null;
  if (body.email !== undefined) updates.email = body.email || null;
  if (body.hospitalAffiliation !== undefined) updates.hospitalAffiliation = body.hospitalAffiliation || null;
  // Module B: registrationNumber persists from the Doctors form so PCPNDT Form F can auto-fill it.
  if (body.registrationNumber !== undefined) updates.registrationNumber = body.registrationNumber || null;
  if (body.defaultCommission !== undefined) updates.defaultCommission = String(body.defaultCommission);
  if (body.defaultCommissionType !== undefined) updates.defaultCommissionType = body.defaultCommissionType;
  if (body.ledgerId !== undefined) updates.ledgerId = body.ledgerId === null ? null : Number(body.ledgerId);

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [doctor] = await db.update(doctorsTable).set(updates).where(eq(doctorsTable.id, id)).returning();
  if (!doctor) {
    res.status(404).json({ error: "Doctor not found" });
    return;
  }
  res.json(doctor);
});

doctorsRouter.delete("/:id", async (req, res) => {
  const paramsParsed = DeleteDoctorParams.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid request", details: paramsParsed.error.issues });
    return;
  }
  await db.delete(doctorsTable).where(eq(doctorsTable.id, paramsParsed.data.id));
  res.json({ success: true });
});

