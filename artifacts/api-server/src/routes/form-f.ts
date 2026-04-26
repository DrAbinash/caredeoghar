import { Router } from "express";
import { db, billsTable, patientsTable, formFRecordsTable, clinicSettingsTable } from "@workspace/db";
import { eq, or, ilike, inArray, isNotNull, desc, and } from "drizzle-orm";
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

formFRouter.get("/pending", async (req, res) => {
  try {
    const [settings] = await db.select().from(clinicSettingsTable).limit(1);
    const formFTestIds: number[] = JSON.parse(settings?.formFTestIds ?? "[]");

    if (formFTestIds.length === 0) {
      res.json([]);
      return;
    }

    // Bills that have at least one Form-F-required test (distinct on bill)
    const billsWithFormFTests = await db
      .selectDistinct({
        billId: billsTable.id,
        billNumber: billsTable.billNumber,
        patientId: billsTable.patientId,
        orderId: billsTable.orderId,
        createdAt: billsTable.createdAt,
      })
      .from(billsTable)
      .innerJoin(ordersTable, eq(billsTable.orderId, ordersTable.id))
      .innerJoin(orderTestsTable, eq(orderTestsTable.orderId, ordersTable.id))
      .where(inArray(orderTestsTable.testId, formFTestIds))
      .orderBy(desc(billsTable.createdAt));

    if (billsWithFormFTests.length === 0) { res.json([]); return; }

    // Bill IDs that already have Form F records
    const savedRecords = await db
      .select({ billId: formFRecordsTable.billId })
      .from(formFRecordsTable)
      .where(isNotNull(formFRecordsTable.billId));
    const savedBillIdSet = new Set(savedRecords.map((r) => r.billId).filter(Boolean));

    const pendingBills = billsWithFormFTests.filter((b) => !savedBillIdSet.has(b.billId));
    if (pendingBills.length === 0) { res.json([]); return; }

    // Patient details
    const patientIds = [...new Set(pendingBills.map((b) => b.patientId).filter(Boolean))] as number[];
    const patients = patientIds.length > 0
      ? await db.select().from(patientsTable).where(inArray(patientsTable.id, patientIds))
      : [];
    const patientMap = new Map(patients.map((p) => [p.id, p]));

    // Referring doctors per order
    const orderIds = [...new Set(pendingBills.map((b) => b.orderId))] as number[];
    const orders = orderIds.length > 0
      ? await db.select().from(ordersTable).where(inArray(ordersTable.id, orderIds))
      : [];
    const orderMap = new Map(orders.map((o) => [o.id, o]));

    const doctorIdSet = [...new Set(orders.map((o) => o.doctorId).filter(Boolean))] as number[];
    const doctors = doctorIdSet.length > 0
      ? await db.select().from(doctorsTable).where(inArray(doctorsTable.id, doctorIdSet))
      : [];
    const doctorMap = new Map(doctors.map((d) => [d.id, d]));

    // Form-F tests per order
    const allOrderTests = orderIds.length > 0
      ? await db
          .select({ orderId: orderTestsTable.orderId, testId: orderTestsTable.testId, testName: testsTable.name })
          .from(orderTestsTable)
          .leftJoin(testsTable, eq(orderTestsTable.testId, testsTable.id))
          .where(inArray(orderTestsTable.orderId, orderIds))
      : [];

    const orderFormFTestsMap = new Map<number, string[]>();
    for (const ot of allOrderTests) {
      if (ot.testId && formFTestIds.includes(ot.testId) && ot.testName) {
        if (!orderFormFTestsMap.has(ot.orderId)) orderFormFTestsMap.set(ot.orderId, []);
        orderFormFTestsMap.get(ot.orderId)!.push(ot.testName);
      }
    }

    const result = pendingBills.map((b) => {
      const patient = patientMap.get(b.patientId!);
      const order = orderMap.get(b.orderId);
      const doctor = order?.doctorId ? doctorMap.get(order.doctorId) : null;
      return {
        billId: b.billId,
        billNumber: b.billNumber,
        billDate: b.createdAt ? new Date(b.createdAt).toISOString().slice(0, 10) : "",
        patientName: patient ? `${patient.firstName} ${patient.lastName}`.trim() : "",
        mobile: patient?.phone ?? "",
        address: patient?.address ?? "",
        age: patient?.dateOfBirth
          ? String(new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear())
          : "",
        referredBy: doctor ? "Doctor" : "Self",
        referredByName: doctor?.name ?? "",
        formFTests: orderFormFTestsMap.get(b.orderId) ?? [],
      };
    });

    res.json(result);
  } catch (err) {
    console.error("[form-f] pending error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

formFRouter.get("/pending-tests", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const [settings] = await db.select().from(clinicSettingsTable).limit(1);
    const formFTestIds: number[] = JSON.parse(settings?.formFTestIds ?? "[]");

    if (formFTestIds.length === 0) {
      res.json([]);
      return;
    }

    const tests = await db
      .select({
        id: testsTable.id,
        name: testsTable.name,
        code: testsTable.code,
        category: testsTable.category,
      })
      .from(testsTable)
      .where(inArray(testsTable.id, formFTestIds))
      .orderBy(testsTable.name);

    const result = q
      ? tests.filter((t) =>
          `${t.name ?? ""} ${t.code ?? ""} ${t.category ?? ""}`.toLowerCase().includes(q.toLowerCase())
        )
      : tests;

    res.json(result);
  } catch (err) {
    console.error("[form-f] pending-tests error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

formFRouter.get("/list", async (req, res) => {
  try {
    const { search, searchBy } = req.query as { search?: string; searchBy?: string };
    const q = search?.trim();

    let rows;
    if (q) {
      const pattern = `%${q}%`;
      const field =
        searchBy === "husbandFatherName" ? formFRecordsTable.husbandFatherName
        : searchBy === "mobile"          ? formFRecordsTable.mobile
        : searchBy === "referredBy"      ? formFRecordsTable.referredBy
        : formFRecordsTable.patientName;

      rows = await db
        .select()
        .from(formFRecordsTable)
        .where(ilike(field, pattern))
        .orderBy(formFRecordsTable.createdAt);
    } else {
      rows = await db
        .select()
        .from(formFRecordsTable)
        .orderBy(formFRecordsTable.createdAt);
    }

    res.json(rows);
  } catch (err) {
    console.error("[form-f] list error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default formFRouter;
