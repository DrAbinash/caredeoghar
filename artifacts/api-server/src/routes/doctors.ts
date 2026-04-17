import { Router } from "express";
import { db, doctorsTable } from "@workspace/db";
import { ilike, or, sql, desc, eq } from "drizzle-orm";
import { ListDoctorsQueryParams, CreateDoctorBody } from "@workspace/api-zod";

export const doctorsRouter = Router();

doctorsRouter.get("/", async (req, res) => {
  const parsed = ListDoctorsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
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
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const ledgerId = req.body?.ledgerId !== undefined && req.body.ledgerId !== null
    ? Number(req.body.ledgerId)
    : null;
  const [doctor] = await db.insert(doctorsTable).values({ ...parsed.data, ledgerId }).returning();
  res.status(201).json(doctor);
});

doctorsRouter.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, specialization, phone, email, hospitalAffiliation, defaultCommission, defaultCommissionType, ledgerId } = req.body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (specialization !== undefined) updates.specialization = specialization;
  if (phone !== undefined) updates.phone = phone || null;
  if (email !== undefined) updates.email = email || null;
  if (hospitalAffiliation !== undefined) updates.hospitalAffiliation = hospitalAffiliation || null;
  if (defaultCommission !== undefined) updates.defaultCommission = String(defaultCommission);
  if (defaultCommissionType !== undefined) updates.defaultCommissionType = defaultCommissionType;
  if (ledgerId !== undefined) updates.ledgerId = ledgerId === null ? null : Number(ledgerId);

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  const [doctor] = await db.update(doctorsTable).set(updates).where(eq(doctorsTable.id, id)).returning();
  if (!doctor) return res.status(404).json({ error: "Doctor not found" });
  res.json(doctor);
});

doctorsRouter.delete("/:id", async (req, res) => {
  await db.delete(doctorsTable).where(eq(doctorsTable.id, Number(req.params.id)));
  res.json({ ok: true });
});
