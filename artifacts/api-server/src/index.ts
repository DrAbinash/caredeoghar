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
  startCronScheduler();
  ensureDefaultLedger().catch((e) => logger.error({ err: e }, "Failed to seed default ledger"));
  backfillExpirePublicTokens().catch((e) => logger.error({ err: e }, "Failed to backfill public token expiry"));
});

server.on("error", (err) => {
  logger.error({ err }, "Server failed to bind — exiting");
  process.exit(1);
});
