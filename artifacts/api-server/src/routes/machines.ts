import { Router } from "express";
import { db } from "@workspace/db";
import {
  machinesTable,
  machineAmcContractsTable,
  machineBreakdownsTable,
  machineServiceRecordsTable,
} from "@workspace/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";

export const machinesRouter = Router();

// ---------- Helpers ----------
function asString(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (v == null) return null;
  return String(v);
}
function asNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function asNonNegNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const STATUSES = new Set(["active", "maintenance", "retired", "out_of_service"]);
const SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const BREAKDOWN_STATUSES = new Set(["open", "in_progress", "resolved"]);
const SERVICE_TYPES = new Set(["preventive", "corrective", "calibration", "inspection", "installation"]);
const CONTRACT_TYPES = new Set(["AMC", "CMC", "Warranty", "Other"]);

// =====================================================================
// MACHINES (master)
// =====================================================================
machinesRouter.get("/", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.toLowerCase() : "";
  const department = typeof req.query.department === "string" ? req.query.department : "";
  const status = typeof req.query.status === "string" ? req.query.status : "";

  let rows = await db.select().from(machinesTable).orderBy(machinesTable.name);
  if (search) rows = rows.filter(m => m.name.toLowerCase().includes(search) || m.code.toLowerCase().includes(search) || (m.serialNumber || "").toLowerCase().includes(search));
  if (department) rows = rows.filter(m => m.department === department);
  if (status) rows = rows.filter(m => m.status === status);

  // Augment with derived counters
  const ids = rows.map(r => r.id);
  if (ids.length === 0) return res.json({ rows: [], summary: { total: 0, active: 0, inMaintenance: 0, retired: 0, openBreakdowns: 0 } });

  const breakdownRows = await db.select({ machineId: machineBreakdownsTable.machineId, status: machineBreakdownsTable.status }).from(machineBreakdownsTable);
  const amcRows = await db.select({ machineId: machineAmcContractsTable.machineId, endDate: machineAmcContractsTable.endDate, isActive: machineAmcContractsTable.isActive }).from(machineAmcContractsTable);
  const serviceRows = await db.select({ machineId: machineServiceRecordsTable.machineId, nextDueDate: machineServiceRecordsTable.nextDueDate, serviceType: machineServiceRecordsTable.serviceType }).from(machineServiceRecordsTable);

  const today = new Date().toISOString().slice(0, 10);
  const augmented = rows.map(m => {
    const openBreakdownCount = breakdownRows.filter(b => b.machineId === m.id && b.status !== "resolved").length;
    const activeAmc = amcRows.find(a => a.machineId === m.id && a.isActive && a.endDate >= today);
    const calibrations = serviceRows.filter(s => s.machineId === m.id && s.serviceType === "calibration" && s.nextDueDate);
    const nextCalibration = calibrations.length > 0
      ? calibrations.map(c => c.nextDueDate!).sort()[0]
      : null;
    return {
      ...m,
      openBreakdownCount,
      amcStatus: activeAmc ? `valid until ${activeAmc.endDate}` : "expired",
      amcEndDate: activeAmc?.endDate ?? null,
      nextCalibrationDue: nextCalibration,
    };
  });

  const summary = {
    total: augmented.length,
    active: augmented.filter(m => m.status === "active").length,
    inMaintenance: augmented.filter(m => m.status === "maintenance").length,
    retired: augmented.filter(m => m.status === "retired").length,
    openBreakdowns: augmented.reduce((s, m) => s + m.openBreakdownCount, 0),
  };

  res.json({ rows: augmented, summary });
});

machinesRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [machine] = await db.select().from(machinesTable).where(eq(machinesTable.id, id));
  if (!machine) return res.status(404).json({ error: "Machine not found" });

  const [contracts, breakdowns, services] = await Promise.all([
    db.select().from(machineAmcContractsTable).where(eq(machineAmcContractsTable.machineId, id)).orderBy(desc(machineAmcContractsTable.endDate)),
    db.select().from(machineBreakdownsTable).where(eq(machineBreakdownsTable.machineId, id)).orderBy(desc(machineBreakdownsTable.reportedAt)),
    db.select().from(machineServiceRecordsTable).where(eq(machineServiceRecordsTable.machineId, id)).orderBy(desc(machineServiceRecordsTable.serviceDate)),
  ]);

  // KPIs
  const totalDowntimeHours = breakdowns.reduce((s, b) => s + (b.downtimeHours ? Number(b.downtimeHours) : 0), 0);
  const totalRepairCost = breakdowns.reduce((s, b) => s + Number(b.repairCost), 0);
  const totalServiceCost = services.reduce((s, x) => s + Number(x.cost), 0);
  const totalAmcCost = contracts.reduce((s, c) => s + Number(c.cost), 0);
  const openBreakdowns = breakdowns.filter(b => b.status !== "resolved").length;

  res.json({ machine, contracts, breakdowns, services, kpis: { totalDowntimeHours, totalRepairCost, totalServiceCost, totalAmcCost, openBreakdowns } });
});

machinesRouter.post("/", async (req, res) => {
  const code = asString(req.body?.code);
  const name = asString(req.body?.name);
  if (!code || !name) return res.status(400).json({ error: "code and name are required" });
  const status = asString(req.body?.status) || "active";
  if (!STATUSES.has(status)) return res.status(400).json({ error: `status must be one of ${[...STATUSES].join(", ")}` });

  try {
    const [row] = await db.insert(machinesTable).values({
      code,
      name,
      modelNumber: asString(req.body?.modelNumber),
      serialNumber: asString(req.body?.serialNumber),
      manufacturer: asString(req.body?.manufacturer),
      department: asString(req.body?.department) || "",
      location: asString(req.body?.location),
      purchaseDate: asString(req.body?.purchaseDate),
      purchaseCost: req.body?.purchaseCost == null || req.body?.purchaseCost === "" ? null : String(asNumber(req.body.purchaseCost)),
      warrantyEnd: asString(req.body?.warrantyEnd),
      status,
      notes: asString(req.body?.notes),
      isActive: req.body?.isActive !== false,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create machine";
    if (msg.includes("unique") || msg.includes("duplicate")) return res.status(409).json({ error: "A machine with that code already exists" });
    res.status(500).json({ error: msg });
  }
});

machinesRouter.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(machinesTable).where(eq(machinesTable.id, id));
  if (!existing) return res.status(404).json({ error: "Machine not found" });

  const updates: Partial<typeof machinesTable.$inferInsert> = {};
  for (const k of ["name", "modelNumber", "serialNumber", "manufacturer", "department", "location", "purchaseDate", "warrantyEnd", "notes"] as const) {
    if (k in req.body) updates[k] = asString(req.body[k]) ?? "";
  }
  if ("status" in req.body) {
    const s = asString(req.body.status) || "active";
    if (!STATUSES.has(s)) return res.status(400).json({ error: "Invalid status" });
    updates.status = s;
  }
  if ("purchaseCost" in req.body) {
    updates.purchaseCost = req.body.purchaseCost == null || req.body.purchaseCost === "" ? null : String(asNumber(req.body.purchaseCost));
  }
  if ("isActive" in req.body) updates.isActive = !!req.body.isActive;

  const [row] = await db.update(machinesTable).set(updates).where(eq(machinesTable.id, id)).returning();
  res.json(row);
});

machinesRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(machinesTable).where(eq(machinesTable.id, id));
  if (!existing) return res.status(404).json({ error: "Machine not found" });
  await db.delete(machinesTable).where(eq(machinesTable.id, id));
  res.json({ ok: true });
});

// =====================================================================
// AMC / CMC contracts
// =====================================================================
machinesRouter.get("/:id/amc", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db.select().from(machineAmcContractsTable).where(eq(machineAmcContractsTable.machineId, id)).orderBy(desc(machineAmcContractsTable.endDate));
  res.json(rows);
});

machinesRouter.post("/:id/amc", async (req, res) => {
  const machineId = Number(req.params.id);
  const [machine] = await db.select().from(machinesTable).where(eq(machinesTable.id, machineId));
  if (!machine) return res.status(404).json({ error: "Machine not found" });

  const vendor = asString(req.body?.vendor);
  const startDate = asString(req.body?.startDate);
  const endDate = asString(req.body?.endDate);
  const contractType = asString(req.body?.contractType) || "AMC";
  if (!vendor || !startDate || !endDate) return res.status(400).json({ error: "vendor, startDate and endDate are required" });
  if (!CONTRACT_TYPES.has(contractType)) return res.status(400).json({ error: "Invalid contract type" });

  const [row] = await db.insert(machineAmcContractsTable).values({
    machineId,
    contractType,
    vendor,
    contractNumber: asString(req.body?.contractNumber),
    startDate,
    endDate,
    cost: String(asNumber(req.body?.cost)),
    contactPerson: asString(req.body?.contactPerson),
    contactPhone: asString(req.body?.contactPhone),
    contactEmail: asString(req.body?.contactEmail),
    coverage: asString(req.body?.coverage),
    notes: asString(req.body?.notes),
    isActive: req.body?.isActive !== false,
  }).returning();
  res.status(201).json(row);
});

machinesRouter.patch("/amc/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(machineAmcContractsTable).where(eq(machineAmcContractsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Contract not found" });

  const updates: Partial<typeof machineAmcContractsTable.$inferInsert> = {};
  for (const k of ["vendor", "contractNumber", "startDate", "endDate", "contactPerson", "contactPhone", "contactEmail", "coverage", "notes"] as const) {
    if (k in req.body) updates[k] = asString(req.body[k]) ?? null as any;
  }
  if ("contractType" in req.body) {
    const t = asString(req.body.contractType) || "AMC";
    if (!CONTRACT_TYPES.has(t)) return res.status(400).json({ error: "Invalid contract type" });
    updates.contractType = t;
  }
  if ("cost" in req.body) updates.cost = String(asNumber(req.body.cost));
  if ("isActive" in req.body) updates.isActive = !!req.body.isActive;

  const [row] = await db.update(machineAmcContractsTable).set(updates).where(eq(machineAmcContractsTable.id, id)).returning();
  res.json(row);
});

machinesRouter.delete("/amc/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(machineAmcContractsTable).where(eq(machineAmcContractsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Contract not found" });
  await db.delete(machineAmcContractsTable).where(eq(machineAmcContractsTable.id, id));
  res.json({ ok: true });
});

// =====================================================================
// BREAKDOWNS (with downtime tracking)
// =====================================================================
machinesRouter.get("/breakdowns/all", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "";
  let rows = await db.select({
    breakdown: machineBreakdownsTable,
    machineName: machinesTable.name,
    machineCode: machinesTable.code,
    department: machinesTable.department,
  }).from(machineBreakdownsTable)
    .leftJoin(machinesTable, eq(machineBreakdownsTable.machineId, machinesTable.id))
    .orderBy(desc(machineBreakdownsTable.reportedAt));
  if (status) rows = rows.filter(r => r.breakdown.status === status);

  const flat = rows.map(r => ({ ...r.breakdown, machineName: r.machineName, machineCode: r.machineCode, department: r.department }));
  const summary = {
    total: flat.length,
    open: flat.filter(b => b.status === "open").length,
    inProgress: flat.filter(b => b.status === "in_progress").length,
    resolved: flat.filter(b => b.status === "resolved").length,
    totalDowntimeHours: flat.reduce((s, b) => s + (b.downtimeHours ? Number(b.downtimeHours) : 0), 0),
    totalRepairCost: flat.reduce((s, b) => s + Number(b.repairCost), 0),
  };
  res.json({ rows: flat, summary });
});

machinesRouter.post("/:id/breakdowns", async (req, res) => {
  const machineId = Number(req.params.id);

  const description = asString(req.body?.description);
  if (!description) return res.status(400).json({ error: "description is required" });
  const severity = asString(req.body?.severity) || "medium";
  if (!SEVERITIES.has(severity)) return res.status(400).json({ error: "Invalid severity" });
  const status = asString(req.body?.status) || "open";
  if (!BREAKDOWN_STATUSES.has(status)) return res.status(400).json({ error: "Invalid status" });

  const reportedAt = req.body?.reportedAt ? new Date(req.body.reportedAt) : new Date();
  const finalReportedAt = isNaN(reportedAt.getTime()) ? new Date() : reportedAt;

  try {
    const row = await db.transaction(async (tx) => {
      // Lock the machine row to serialise concurrent breakdown writes for the same machine.
      const [locked] = await tx.select({ id: machinesTable.id, status: machinesTable.status })
        .from(machinesTable)
        .where(eq(machinesTable.id, machineId))
        .for("update");
      if (!locked) throw new Error("__not_found__");

      const [inserted] = await tx.insert(machineBreakdownsTable).values({
        machineId,
        reportedAt: finalReportedAt,
        reportedBy: asString(req.body?.reportedBy),
        description,
        severity,
        status,
        repairCost: String(asNumber(req.body?.repairCost)),
        serviceVendor: asString(req.body?.serviceVendor),
        notes: asString(req.body?.notes),
      }).returning();

      // Atomically derive machine status: if any open high/critical breakdown exists
      // (including the one we may have just inserted), machine should be in maintenance
      // — but never override "retired".
      if (locked.status !== "retired") {
        const [openHigh] = await tx.select({ c: sql<number>`count(*)::int` })
          .from(machineBreakdownsTable)
          .where(and(
            eq(machineBreakdownsTable.machineId, machineId),
            sql`${machineBreakdownsTable.status} != 'resolved'`,
            sql`${machineBreakdownsTable.severity} IN ('high','critical')`,
          ));
        if ((openHigh?.c ?? 0) > 0 && locked.status !== "maintenance") {
          await tx.update(machinesTable).set({ status: "maintenance" }).where(eq(machinesTable.id, machineId));
        }
      }
      return inserted;
    });
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof Error && err.message === "__not_found__") {
      return res.status(404).json({ error: "Machine not found" });
    }
    throw err;
  }
});

machinesRouter.patch("/breakdowns/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(machineBreakdownsTable).where(eq(machineBreakdownsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Breakdown not found" });

  const updates: Partial<typeof machineBreakdownsTable.$inferInsert> = {};
  if ("description" in req.body) updates.description = asString(req.body.description) || existing.description;
  if ("reportedBy" in req.body) updates.reportedBy = asString(req.body.reportedBy);
  if ("severity" in req.body) {
    const s = asString(req.body.severity) || "medium";
    if (!SEVERITIES.has(s)) return res.status(400).json({ error: "Invalid severity" });
    updates.severity = s;
  }
  if ("repairCost" in req.body) updates.repairCost = String(asNumber(req.body.repairCost));
  if ("serviceVendor" in req.body) updates.serviceVendor = asString(req.body.serviceVendor);
  if ("notes" in req.body) updates.notes = asString(req.body.notes);
  if ("resolution" in req.body) updates.resolution = asString(req.body.resolution);
  if ("downtimeHours" in req.body) updates.downtimeHours = req.body.downtimeHours == null || req.body.downtimeHours === "" ? null : String(asNonNegNumber(req.body.downtimeHours) ?? 0);

  if ("status" in req.body) {
    const s = asString(req.body.status) || "open";
    if (!BREAKDOWN_STATUSES.has(s)) return res.status(400).json({ error: "Invalid status" });
    updates.status = s;
    if (s === "resolved" && !existing.resolvedAt) {
      const now = new Date();
      updates.resolvedAt = now;
      if (!("downtimeHours" in req.body) && existing.reportedAt) {
        const hours = (now.getTime() - existing.reportedAt.getTime()) / 3_600_000;
        updates.downtimeHours = String(Math.max(0, Number(hours.toFixed(2))));
      }
    } else if (s !== "resolved") {
      updates.resolvedAt = null;
    }
  }

  // Wrap update + machine-status recomputation in a single transaction with a row lock
  // on the machine so concurrent breakdown writes can't leave the machine in an
  // inconsistent state (e.g., active while an open high/critical breakdown exists).
  const row = await db.transaction(async (tx) => {
    const [locked] = await tx.select({ id: machinesTable.id, status: machinesTable.status })
      .from(machinesTable)
      .where(eq(machinesTable.id, existing.machineId))
      .for("update");

    const [updated] = await tx.update(machineBreakdownsTable).set(updates).where(eq(machineBreakdownsTable.id, id)).returning();

    if (locked && locked.status !== "retired") {
      const [openHigh] = await tx.select({ c: sql<number>`count(*)::int` })
        .from(machineBreakdownsTable)
        .where(and(
          eq(machineBreakdownsTable.machineId, existing.machineId),
          sql`${machineBreakdownsTable.status} != 'resolved'`,
          sql`${machineBreakdownsTable.severity} IN ('high','critical')`,
        ));
      const shouldBeMaintenance = (openHigh?.c ?? 0) > 0;
      if (shouldBeMaintenance && locked.status !== "maintenance") {
        await tx.update(machinesTable).set({ status: "maintenance" }).where(eq(machinesTable.id, existing.machineId));
      } else if (!shouldBeMaintenance && locked.status === "maintenance") {
        await tx.update(machinesTable).set({ status: "active" }).where(eq(machinesTable.id, existing.machineId));
      }
    }
    return updated;
  });

  res.json(row);
});

machinesRouter.delete("/breakdowns/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(machineBreakdownsTable).where(eq(machineBreakdownsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Breakdown not found" });
  await db.delete(machineBreakdownsTable).where(eq(machineBreakdownsTable.id, id));
  res.json({ ok: true });
});

// =====================================================================
// SERVICE HISTORY + CALIBRATION
// =====================================================================
machinesRouter.get("/services/all", async (req, res) => {
  const type = typeof req.query.type === "string" ? req.query.type : "";
  let rows = await db.select({
    service: machineServiceRecordsTable,
    machineName: machinesTable.name,
    machineCode: machinesTable.code,
    department: machinesTable.department,
  }).from(machineServiceRecordsTable)
    .leftJoin(machinesTable, eq(machineServiceRecordsTable.machineId, machinesTable.id))
    .orderBy(desc(machineServiceRecordsTable.serviceDate));
  if (type) rows = rows.filter(r => r.service.serviceType === type);
  const flat = rows.map(r => ({ ...r.service, machineName: r.machineName, machineCode: r.machineCode, department: r.department }));
  res.json(flat);
});

machinesRouter.post("/:id/services", async (req, res) => {
  const machineId = Number(req.params.id);
  const [machine] = await db.select().from(machinesTable).where(eq(machinesTable.id, machineId));
  if (!machine) return res.status(404).json({ error: "Machine not found" });

  const serviceDate = asString(req.body?.serviceDate);
  if (!serviceDate || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) return res.status(400).json({ error: "serviceDate is required (YYYY-MM-DD)" });
  const serviceType = asString(req.body?.serviceType) || "preventive";
  if (!SERVICE_TYPES.has(serviceType)) return res.status(400).json({ error: `serviceType must be one of ${[...SERVICE_TYPES].join(", ")}` });

  const [row] = await db.insert(machineServiceRecordsTable).values({
    machineId,
    serviceDate,
    serviceType,
    engineer: asString(req.body?.engineer),
    vendor: asString(req.body?.vendor),
    cost: String(asNumber(req.body?.cost)),
    partsReplaced: asString(req.body?.partsReplaced),
    notes: asString(req.body?.notes),
    nextDueDate: asString(req.body?.nextDueDate),
    certificateNumber: asString(req.body?.certificateNumber),
    certificateUrl: asString(req.body?.certificateUrl),
    performedBy: asString(req.body?.performedBy),
  }).returning();
  res.status(201).json(row);
});

machinesRouter.patch("/services/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(machineServiceRecordsTable).where(eq(machineServiceRecordsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Service record not found" });

  const updates: Partial<typeof machineServiceRecordsTable.$inferInsert> = {};
  for (const k of ["engineer", "vendor", "partsReplaced", "notes", "nextDueDate", "certificateNumber", "certificateUrl", "performedBy"] as const) {
    if (k in req.body) updates[k] = asString(req.body[k]);
  }
  if ("serviceDate" in req.body) {
    const d = asString(req.body.serviceDate);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return res.status(400).json({ error: "serviceDate must be YYYY-MM-DD" });
    updates.serviceDate = d;
  }
  if ("serviceType" in req.body) {
    const t = asString(req.body.serviceType) || "preventive";
    if (!SERVICE_TYPES.has(t)) return res.status(400).json({ error: "Invalid service type" });
    updates.serviceType = t;
  }
  if ("cost" in req.body) updates.cost = String(asNumber(req.body.cost));

  const [row] = await db.update(machineServiceRecordsTable).set(updates).where(eq(machineServiceRecordsTable.id, id)).returning();
  res.json(row);
});

machinesRouter.delete("/services/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(machineServiceRecordsTable).where(eq(machineServiceRecordsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Service record not found" });
  await db.delete(machineServiceRecordsTable).where(eq(machineServiceRecordsTable.id, id));
  res.json({ ok: true });
});

// =====================================================================
// CALIBRATION REMINDERS — derived view
// =====================================================================
machinesRouter.get("/calibration/reminders", async (req, res) => {
  const daysAhead = Number(req.query.days) || 30;
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const horizonDate = new Date(today.getTime() + daysAhead * 86_400_000);
  const horizonStr = horizonDate.toISOString().slice(0, 10);

  const all = await db.select({
    service: machineServiceRecordsTable,
    machineName: machinesTable.name,
    machineCode: machinesTable.code,
    department: machinesTable.department,
  }).from(machineServiceRecordsTable)
    .leftJoin(machinesTable, eq(machineServiceRecordsTable.machineId, machinesTable.id))
    .where(eq(machineServiceRecordsTable.serviceType, "calibration"));

  // For each machine, take the LATEST calibration record (one row per machine)
  const latestByMachine = new Map<number, typeof all[number]>();
  for (const r of all) {
    const existing = latestByMachine.get(r.service.machineId);
    if (!existing || r.service.serviceDate > existing.service.serviceDate) {
      latestByMachine.set(r.service.machineId, r);
    }
  }

  const reminders = [...latestByMachine.values()]
    .filter(r => r.service.nextDueDate)
    .map(r => {
      const due = r.service.nextDueDate!;
      const overdue = due < todayStr;
      const dueSoon = due >= todayStr && due <= horizonStr;
      const daysToDue = Math.round((new Date(due).getTime() - today.getTime()) / 86_400_000);
      return {
        id: r.service.id,
        machineId: r.service.machineId,
        machineName: r.machineName,
        machineCode: r.machineCode,
        department: r.department,
        lastCalibrationDate: r.service.serviceDate,
        nextDueDate: due,
        daysToDue,
        status: overdue ? "overdue" : dueSoon ? "due_soon" : "ok",
        certificateNumber: r.service.certificateNumber,
        engineer: r.service.engineer,
        vendor: r.service.vendor,
      };
    })
    .filter(r => r.status !== "ok") // only show overdue + due_soon
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));

  res.json({
    rows: reminders,
    summary: {
      overdue: reminders.filter(r => r.status === "overdue").length,
      dueSoon: reminders.filter(r => r.status === "due_soon").length,
      windowDays: daysAhead,
    },
  });
});

// =====================================================================
// DOWNTIME REPORT — by machine and overall
// =====================================================================
machinesRouter.get("/downtime/report", async (req, res) => {
  const from = typeof req.query.from === "string" ? req.query.from : "";
  const to = typeof req.query.to === "string" ? req.query.to : "";

  const machines = await db.select().from(machinesTable);
  const breakdowns = await db.select().from(machineBreakdownsTable);

  const filtered = breakdowns.filter(b => {
    const date = b.reportedAt.toISOString().slice(0, 10);
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });

  const byMachine = new Map<number, { downtimeHours: number; cost: number; incidents: number; openIncidents: number }>();
  for (const b of filtered) {
    const cur = byMachine.get(b.machineId) || { downtimeHours: 0, cost: 0, incidents: 0, openIncidents: 0 };
    cur.downtimeHours += b.downtimeHours ? Number(b.downtimeHours) : 0;
    cur.cost += Number(b.repairCost);
    cur.incidents += 1;
    if (b.status !== "resolved") cur.openIncidents += 1;
    byMachine.set(b.machineId, cur);
  }

  const rows = machines
    .map(m => {
      const stats = byMachine.get(m.id);
      return {
        machineId: m.id,
        machineCode: m.code,
        machineName: m.name,
        department: m.department,
        status: m.status,
        downtimeHours: stats?.downtimeHours ?? 0,
        repairCost: stats?.cost ?? 0,
        incidents: stats?.incidents ?? 0,
        openIncidents: stats?.openIncidents ?? 0,
      };
    })
    .filter(r => r.incidents > 0 || r.openIncidents > 0)
    .sort((a, b) => b.downtimeHours - a.downtimeHours);

  res.json({
    rows,
    summary: {
      totalDowntimeHours: rows.reduce((s, r) => s + r.downtimeHours, 0),
      totalRepairCost: rows.reduce((s, r) => s + r.repairCost, 0),
      totalIncidents: rows.reduce((s, r) => s + r.incidents, 0),
      machinesAffected: rows.length,
    },
  });
});
