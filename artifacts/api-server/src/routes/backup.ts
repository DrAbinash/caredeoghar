import { Router } from "express";
import { db } from "@workspace/db";
import * as schema from "@workspace/db/schema";
import { backupLogsTable } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import type { Table } from "drizzle-orm";

export const backupRouter = Router();

// White-list of tables included in a "settings + master data" backup.
// We deliberately do NOT include patient/order/bill data (that can be huge).
// Users wanting a full DB backup should use Postgres-level pg_dump.
const BACKUP_TABLES: Array<{ key: string; table: Table }> = [
  { key: "users", table: schema.usersTable },
  { key: "clinic_settings", table: schema.clinicSettingsTable },
  { key: "doctors", table: schema.doctorsTable },
  { key: "diagnostic_tests", table: schema.testsTable },
  { key: "test_categories", table: schema.testCategoriesTable },
  { key: "packages", table: schema.packagesTable },
  { key: "package_tests", table: schema.packageTestsTable },
  { key: "report_templates", table: schema.reportTemplatesTable },
  { key: "departments", table: schema.departmentsTable },
  { key: "branches", table: schema.branchesTable },
  { key: "machines", table: schema.machinesTable },
  { key: "machine_amc_contracts", table: schema.machineAmcContractsTable },
  { key: "commission_rules", table: schema.commissionRulesTable },
  { key: "discount_reasons", table: schema.discountReasonsTable },
  { key: "signatures", table: schema.signaturesTable },
  { key: "vendors", table: schema.vendorsTable },
];

// GET /api/backup/logs — recent backup history
backupRouter.get("/logs", async (_req, res) => {
  const rows = await db.select().from(backupLogsTable).orderBy(desc(backupLogsTable.createdAt)).limit(50);
  res.json(rows);
});

// POST /api/backup/run — generate JSON backup of master data, log it, return a download
backupRouter.post("/run", async (req, res) => {
  const performedBy = typeof req.body?.performedBy === "string" ? req.body.performedBy : "system";
  try {
    const dump: Record<string, unknown[]> = {};
    let totalRows = 0;
    for (const { key, table } of BACKUP_TABLES) {
      try {
        const rows = await db.select().from(table);
        dump[key] = rows;
        totalRows += rows.length;
      } catch {
        // table may not exist in some installations — skip
        dump[key] = [];
      }
    }
    const payload = {
      generatedAt: new Date().toISOString(),
      version: 1,
      tables: dump,
    };
    const json = JSON.stringify(payload);
    const sizeBytes = Buffer.byteLength(json, "utf8");

    await db.insert(backupLogsTable).values({
      backupType: "manual",
      status: "success",
      format: "json",
      rowCount: totalRows,
      sizeBytes,
      performedBy,
    });

    const filename = `care_diagnostics_backup_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(json);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Backup failed";
    await db.insert(backupLogsTable).values({
      backupType: "manual",
      status: "failed",
      format: "json",
      errorMessage: msg,
      performedBy,
    });
    res.status(500).json({ error: msg });
  }
});

// GET /api/backup/info — what's included
backupRouter.get("/info", (_req, res) => {
  res.json({ tables: BACKUP_TABLES.map(t => t.key) });
});

// DELETE /api/admin/backups/:id — remove a backup log entry
backupRouter.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  await db.delete(backupLogsTable).where(eq(backupLogsTable.id, id));
  res.json({ success: true });
});
