import { Router } from "express";
import { db, doctorsTable } from "@workspace/db";
import { ilike, or, sql, desc } from "drizzle-orm";
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
  const [doctor] = await db.insert(doctorsTable).values(parsed.data).returning();
  res.status(201).json(doctor);
});
