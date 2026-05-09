import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Load a workspace-root .env file (if present) before anything reads
// process.env. By default dotenv does NOT override variables that are
// already set, so the values injected by Replit's runtime always win.
const rootEnv = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.env",
);
dotenv.config({ path: rootEnv });

import app from "./app";
import { logger } from "./lib/logger";
import { startCronScheduler } from "./cron";
import { ensureDefaultLedger } from "./routes/ledgers";
import { backfillExpirePublicTokens } from "./routes/patient-reports";
import { db, usersTable } from "@workspace/db";
import { pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

// Bootstrap admin account for fresh production databases.
//
// Default behaviour: only seeds when the `users` table is completely
// empty (typical right after the first publish to a brand-new prod DB).
// Once any user exists this is a no-op forever, so it's safe to leave in.
//
// Force mode: set BOOTSTRAP_ADMIN_FORCE=1 in deployment secrets to
// upsert the bootstrap account even when the table already has rows.
// Use this once when you need to reset the role/PIN on an existing
// bootstrap row (e.g. you seeded a super_admin but want a regular admin
// because you don't have the USB pen-drive yet). Remove the env var
// after the next publish so subsequent restarts don't keep overwriting
// PIN changes made through the UI.
//
// Defaults: role=admin, PIN=1234. Override via BOOTSTRAP_ADMIN_EMAIL /
// BOOTSTRAP_ADMIN_NAME / BOOTSTRAP_ADMIN_PIN / BOOTSTRAP_ADMIN_ROLE.
// "admin" gives full access to every module without requiring the USB
// pen-drive that "super_admin" needs.
async function seedBootstrapAdminIfNeeded(): Promise<void> {
  try {
    const force =
      process.env["BOOTSTRAP_ADMIN_FORCE"] === "1" ||
      process.env["BOOTSTRAP_ADMIN_FORCE"] === "true";

    const anyUser = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
    if (anyUser.length > 0 && !force) return; // already populated, no force flag

    const email = (process.env["BOOTSTRAP_ADMIN_EMAIL"] || "abinashsingh@gmail.com").toLowerCase();
    const name = process.env["BOOTSTRAP_ADMIN_NAME"] || "Dr Abinash Kumar";
    const plainPin = process.env["BOOTSTRAP_ADMIN_PIN"] || "1234";
    const role = process.env["BOOTSTRAP_ADMIN_ROLE"] || "admin";
    const hash = await bcrypt.hash(plainPin, 12);

    const allModulePermissions = [
      "/", "/patients", "/orders", "/register", "/billing", "/doctors",
      "/report-generator", "/referrals", "/discounts", "/tests", "/payments",
      "/reports", "/inventory", "/accounting", "/settings",
    ];
    const permissionsJson = JSON.stringify(allModulePermissions);

    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(usersTable)
        .set({
          name,
          role,
          permissions: permissionsJson,
          pin: hash,
          isActive: true,
          mustChangePin: false,
        })
        .where(eq(usersTable.email, email));
      logger.warn(
        { email, role, force },
        "Bootstrap admin updated (existing row reset to bootstrap defaults). " +
          "Sign in and change the PIN, then unset BOOTSTRAP_ADMIN_FORCE.",
      );
    } else {
      await db.insert(usersTable).values({
        name,
        email,
        role,
        permissions: permissionsJson,
        pin: hash,
        isActive: true,
        mustChangePin: false,
      });
      logger.warn(
        { email, role },
        "Seeded bootstrap admin user. Sign in and change the PIN immediately.",
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed/update bootstrap admin");
  }
}

// ── Startup schema migrations ──────────────────────────────────────────────────
// Idempotent ALTER TABLE / CREATE TABLE IF NOT EXISTS statements that extend
// the schema without requiring a full Drizzle migration pipeline. Safe to run
// on every startup because every clause uses IF NOT EXISTS / ADD COLUMN IF.
async function runStartupMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE order_tests ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
      ALTER TABLE order_tests ADD COLUMN IF NOT EXISTS cancelled_by_name TEXT;
      ALTER TABLE order_tests ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
      ALTER TABLE order_tests ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
      ALTER TABLE diagnostic_tests ADD COLUMN IF NOT EXISTS test_type TEXT NOT NULL DEFAULT 'inhouse';
      ALTER TABLE diagnostic_tests ADD COLUMN IF NOT EXISTS outsourced_lab_id INTEGER;
      CREATE TABLE IF NOT EXISTS outsourced_labs (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        contact_person TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        gstin TEXT,
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    logger.info("Startup migrations applied");
  } catch (err) {
    logger.error({ err }, "Startup migration failed — partial-cancel / outsourced-labs features may not work");
  } finally {
    client.release();
  }
}

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — exiting");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection — continuing");
  // Do NOT exit: crashing on every unhandled rejection prevents the server
  // from ever passing its startup health check if a background operation
  // (cron job, startup backfill, etc.) rejects in the production environment.
  // Log the rejection so it is visible in deployment logs and investigate.
});

const rawPort = process.env["PORT"] ?? "8080";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen({ port, exclusive: true }, () => {
  logger.info({ port }, "Server listening");

  // Cron schedulers must NOT run on autoscale deployments: containers can
  // scale to zero and miss firing windows, and every cold start would
  // re-init the scheduler. Enable them only on always-on hosts (Reserved VM,
  // local dev, or the Windows desktop bundle) by setting ENABLE_SCHEDULERS=1.
  if (process.env["ENABLE_SCHEDULERS"] === "1" || process.env["ENABLE_SCHEDULERS"] === "true") {
    startCronScheduler();
    logger.info("Cron schedulers enabled (ENABLE_SCHEDULERS set)");
  } else {
    logger.info("Cron schedulers disabled (set ENABLE_SCHEDULERS=1 to enable)");
  }

  runStartupMigrations().catch((e) => logger.error({ err: e }, "Failed to run startup migrations"));
  ensureDefaultLedger().catch((e) => logger.error({ err: e }, "Failed to seed default ledger"));
  backfillExpirePublicTokens().catch((e) => logger.error({ err: e }, "Failed to backfill public token expiry"));
  seedBootstrapAdminIfNeeded().catch((e) => logger.error({ err: e }, "Failed to seed/update bootstrap admin"));
});

server.on("error", (err) => {
  logger.error({ err }, "Server failed to bind — exiting");
  process.exit(1);
});
