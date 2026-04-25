import { Router } from "express";
import { db, billsTable, patientsTable, formFRecordsTable } from "@workspace/db";
import { eq, or, ilike } from "drizzle-orm";
import { ordersTable, orderTestsTable, testsTable, doctorsTable } from "@workspace/db";

const formFRouter = Router();

formFRouter.get("/fetch-billing/:search", async (req, res) => {
  try {
    const search = req.params.search.trim();

    let bill: typeof billsTable.$inferSelect | null = null;

    const byBillNumber = await db
      .select()
      .from(billsTable)
      .where(ilike(billsTable.billNumber, search))
      .limit(1);

    if (byBillNumber[0]) {
      bill = byBillNumber[0];
    } else {
      const patientRows = await db
        .select()
        .from(patientsTable)
        .where(
          or(
            ilike(patientsTable.patientId, `%${search}%`),
            ilike(patientsTable.firstName, `%${search}%`),
            ilike(patientsTable.phone, `%${search}%`)
          )
        )
        .limit(1);

      if (patientRows[0]) {
        const billRows = await db
          .select()
          .from(billsTable)
          .where(eq(billsTable.patientId, patientRows[0].id))
          .orderBy(billsTable.createdAt)
          .limit(1);
        if (billRows[0]) bill = billRows[0];
      }
    }

    if (!bill) {
      res.status(404).json({ error: "No billing record found" });
      return;
    }

    const [patient] = await db
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.id, bill.patientId));

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, bill.orderId));

    let procedurePurpose = "";
    let referredBy = "Self";
    let referredByName = "";

    if (order) {
      const tests = await db
        .select({ test: testsTable })
        .from(orderTestsTable)
        .leftJoin(testsTable, eq(orderTestsTable.testId, testsTable.id))
        .where(eq(orderTestsTable.orderId, order.id));

      procedurePurpose = tests
        .map((t) => t.test?.name)
        .filter(Boolean)
        .join(", ");

      if (order.doctorId) {
        const [doctor] = await db
          .select()
          .from(doctorsTable)
          .where(eq(doctorsTable.id, order.doctorId));
        if (doctor) {
          referredBy = "Doctor";
          referredByName = doctor.name;
        }
      }
    }

    const dob = patient?.dateOfBirth ?? "";
    let age = "";
    if (dob) {
      const birth = new Date(dob);
      const now = new Date();
      age = String(now.getFullYear() - birth.getFullYear());
    }

    res.json({
      billNumber: bill.billNumber,
      billDate: bill.createdAt ? new Date(bill.createdAt).toISOString().slice(0, 10) : "",
      patientName: patient
        ? `${patient.firstName} ${patient.lastName}`.trim()
        : "",
      age,
      husbandFatherName: "",
      address: patient?.address ?? "",
      mobile: patient?.phone ?? "",
      referredBy,
      referredByName,
      procedurePurpose: procedurePurpose || "Obstetric ultrasonography",
      ultrasoundResult: "Normal",
    });
  } catch (err) {
    console.error("[form-f] fetch-billing error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

formFRouter.post("/save", async (req, res) => {
  try {
    const body = req.body ?? {};

    let billId: number | undefined;
    let patientId: number | undefined;

    if (body.billNumber) {
      const [bill] = await db
        .select()
        .from(billsTable)
        .where(ilike(billsTable.billNumber, body.billNumber))
        .limit(1);
      if (bill) {
        billId = bill.id;
        patientId = bill.patientId;
      }
    }

    const record: typeof formFRecordsTable.$inferInsert = {
      billId: billId ?? null,
      patientId: patientId ?? null,
      billNumber: body.billNumber ?? null,
      centreName: body.centreName ?? "",
      registrationNo: body.registrationNo ?? "",
      patientName: body.patientName ?? "",
      age: body.age ?? "",
      childrenDetails: body.childrenDetails ?? "",
      husbandFatherName: body.husbandFatherName ?? "",
      address: body.address ?? "",
      mobile: body.mobile ?? "",
      referredBy: body.referredBy ?? "Self",
      lmpWeeks: body.lmpWeeks ?? "",
      geneticHistory: body.geneticHistory ?? "",
      basisDiagnosis: body.basisDiagnosis ?? "",
      previousChildIssue: body.previousChildIssue ?? "",
      indicationOther: body.indicationOther ?? "",
      doctorName: body.doctorName ?? "",
      procedure: body.procedure ?? "",
      procedurePurpose: body.procedurePurpose ?? "",
      invasiveProcedure: body.invasiveProcedure ?? "",
      complication: body.complication ?? "",
      labTests: body.labTests ?? "",
      prenatalResult: body.prenatalResult ?? "",
      ultrasoundResult: body.ultrasoundResult ?? "",
      abnormality: body.abnormality ?? "",
      procedureDate: body.procedureDate ?? "",
      consentDate: body.consentDate ?? "",
      resultConveyed: body.resultConveyed ?? "",
      mtpAdvised: body.mtpAdvised ?? "",
      mtpDate: body.mtpDate ?? "",
      date: body.date ?? "",
      place: body.place ?? "",
    };

    const [saved] = await db.insert(formFRecordsTable).values(record).returning();
    res.json(saved);
  } catch (err) {
    console.error("[form-f] save error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

formFRouter.get("/list", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(formFRecordsTable)
      .orderBy(formFRecordsTable.createdAt);
    res.json(rows);
  } catch (err) {
    console.error("[form-f] list error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default formFRouter;
