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
import bcrypt from "bcryptjs";

// One-shot bootstrap: when the deployed database contains zero users
// (typical after the very first publish to a brand-new production
// PostgreSQL), automatically seed a super-admin account so the operator
// can sign in to the live site without having to run SQL by hand.
//
// The seed only runs when the users table is completely empty — once any
// user exists this becomes a no-op forever, so it is safe to leave in.
//
// Defaults are tailored to this clinic; override per-deployment with
// BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_NAME / BOOTSTRAP_ADMIN_PIN
// env vars if a different initial account is desired. Operator is
// expected to change the PIN immediately after first login.
async function seedInitialSuperAdminIfEmpty(): Promise<void> {
  try {
    const existing = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
    if (existing.length > 0) return; // table already has data — nothing to do

    const email = (process.env["BOOTSTRAP_ADMIN_EMAIL"] || "abinashsingh@gmail.com").toLowerCase();
    const name = process.env["BOOTSTRAP_ADMIN_NAME"] || "Dr Abinash Kumar";
    const plainPin = process.env["BOOTSTRAP_ADMIN_PIN"] || "2321";
    const hash = await bcrypt.hash(plainPin, 12);

    const allModulePermissions = [
      "/", "/patients", "/orders", "/register", "/billing", "/doctors",
      "/report-generator", "/referrals", "/discounts", "/tests", "/payments",
      "/reports", "/inventory", "/accounting", "/settings",
    ];

    await db.insert(usersTable).values({
      name,
      email,
      role: "super_admin",
      permissions: JSON.stringify(allModulePermissions),
      pin: hash,
      isActive: true,
      mustChangePin: false,
    });

    logger.warn(
      { email, role: "super_admin" },
      "Seeded initial super-admin user (users table was empty). " +
        "Sign in and change the PIN immediately.",
    );
  } catch (err) {
    logger.error({ err }, "Failed to seed initial super-admin");
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

const server = app.listen(port, () => {
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

  ensureDefaultLedger().catch((e) => logger.error({ err: e }, "Failed to seed default ledger"));
  backfillExpirePublicTokens().catch((e) => logger.error({ err: e }, "Failed to backfill public token expiry"));
  seedInitialSuperAdminIfEmpty().catch((e) => logger.error({ err: e }, "Failed to seed initial super-admin"));
});

server.on("error", (err) => {
  logger.error({ err }, "Server failed to bind — exiting");
  process.exit(1);
});
