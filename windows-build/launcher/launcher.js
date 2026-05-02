// =============================================================================
// Diagnostic ERP — portable launcher
//
// This file is bundled into a Windows .exe via Node 20's "Single Executable
// Application" (SEA) feature. The .exe is then placed at the root of a
// portable folder with this layout:
//
//   DiagnosticERP.exe                ← this script (compiled into node.exe)
//   runtime/node/node.exe            ← second copy of Node, used to run the
//                                      bundled API server (which imports many
//                                      node_modules that SEA can't bundle).
//   runtime/pgsql/bin/{postgres.exe,pg_ctl.exe,initdb.exe,…}
//   app/server/dist/index.mjs
//   app/server/node_modules/…
//   app/web/erp/                     ← static SPA (BASE_PATH=/)
//   app/web/super-admin-portal/      ← static SPA (BASE_PATH=/super-admin-portal/)
//   app/db-migrate/run.mjs           ← drizzle-kit push runner
//   data/                            ← created on first run; holds Postgres data
//   logs/                            ← rolling launcher / postgres / api logs
//
// On first run we:
//   1. Generate a random Postgres superuser password and store it in data/.pgpass
//   2. Run initdb against data/
//   3. Start Postgres on a free local port
//   4. Run the migration script to create tables
//   5. Start the API server with SERVE_STATIC_DIR pointing at app/web/
//   6. Open the user's default browser to http://localhost:8888/
//
// On subsequent runs we skip steps 1-2 and just start everything.
//
// Pressing Ctrl+C, closing the window, or signalling the process gracefully
// stops the API server and Postgres.
// =============================================================================

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync, execFileSync } = require("node:child_process");
const net = require("node:net");
const crypto = require("node:crypto");
const os = require("node:os");

// -------- Locate the portable folder ---------------------------------------
// When running as a SEA .exe, process.execPath is the bundled launcher exe
// (DiagnosticERP.exe, SuperAdmin.exe, …) and the real files are alongside it.
// When running with `node launcher.js` for testing, the layout is the same
// relative to __dirname (inside the dist/portable tree).
const ROOT = (() => {
  // Prefer the directory next to the running executable IF it has runtime/ —
  // works for any exe name (variant-friendly).
  if (process.execPath) {
    const cand = path.dirname(process.execPath);
    if (fs.existsSync(path.join(cand, "runtime"))) return cand;
  }
  // dev fallbacks: try Diagnostic ERP first, then Super Admin
  for (const name of ["DiagnosticERP", "SuperAdmin"]) {
    const cand = path.resolve(__dirname, "../dist/portable", name);
    if (fs.existsSync(path.join(cand, "runtime"))) return cand;
  }
  return path.resolve(__dirname, "../dist/portable/DiagnosticERP");
})();

// -------- Variant config ----------------------------------------------------
// Optional file `app/launcher-config.json` lets a build customise branding,
// the URL the browser opens to, the database name, and the data directory
// without forking this launcher. Defaults match the original Diagnostic ERP
// behaviour so existing builds are unaffected.
const VARIANT = (() => {
  const defaults = {
    appName:         "Diagnostic Center Billing ERP",
    openPath:        "/",
    dbName:          "diagnostic_erp",
    dbUser:          "erp",
    dataDirName:     "data",
    defaultHttpPort: 8888,
    defaultPgPort:   55432,
  };
  try {
    const cfg = path.join(ROOT, "app/launcher-config.json");
    if (fs.existsSync(cfg)) {
      const raw = JSON.parse(fs.readFileSync(cfg, "utf8"));
      return { ...defaults, ...raw };
    }
  } catch { /* ignore — fall back to defaults */ }
  return defaults;
})();

const NODE_EXE   = path.join(ROOT, "runtime/node/node.exe");
const PG_BIN     = path.join(ROOT, "runtime/pgsql/bin");
const PG_INITDB  = path.join(PG_BIN, "initdb.exe");
const PG_CTL     = path.join(PG_BIN, "pg_ctl.exe");
const PG_POSTGRES = path.join(PG_BIN, "postgres.exe");
const SERVER_ENTRY = path.join(ROOT, "app/server/dist/index.mjs");
const STATIC_DIR = path.join(ROOT, "app/web");
const MIGRATE_SCRIPT = path.join(ROOT, "app/db-migrate/run.mjs");
const DATA_DIR   = path.join(ROOT, VARIANT.dataDirName);
const PG_DATA    = path.join(DATA_DIR, "pgsql");
const PASS_FILE  = path.join(DATA_DIR, ".pgpass");
const PORT_FILE  = path.join(DATA_DIR, ".ports.json");
const LOG_DIR    = path.join(ROOT, "logs");

const DEFAULT_HTTP_PORT = Number(process.env.PORT || VARIANT.defaultHttpPort);
const DEFAULT_PG_PORT   = Number(process.env.PG_PORT || VARIANT.defaultPgPort);
const DB_USER = VARIANT.dbUser;
const DB_NAME = VARIANT.dbName;

// -------- Logging -----------------------------------------------------------
fs.mkdirSync(LOG_DIR, { recursive: true });
const launcherLog = fs.createWriteStream(path.join(LOG_DIR, "launcher.log"), { flags: "a" });
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try { launcherLog.write(line); } catch { /* ignore */ }
}
function fatal(msg) {
  log(`FATAL: ${msg}`);
  process.stderr.write(`\n${msg}\n\nPress any key to exit…\n`);
  try { execFileSync("cmd", ["/c", "pause >nul"], { stdio: "inherit" }); } catch { /* ignore */ }
  process.exit(1);
}

// -------- Sanity checks -----------------------------------------------------
function preflight() {
  for (const [label, p] of [
    ["Node runtime",      NODE_EXE],
    ["Postgres pg_ctl",   PG_CTL],
    ["Postgres initdb",   PG_INITDB],
    ["Bundled API server", SERVER_ENTRY],
    ["Web static dir",    STATIC_DIR],
    ["Migration script",  MIGRATE_SCRIPT],
  ]) {
    if (!fs.existsSync(p)) fatal(`Missing ${label}: ${p}\n\nThis launcher must run from inside the DiagnosticERP folder.`);
  }
}

// -------- Free-port helper --------------------------------------------------
function findFreePort(preferred) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", () => {
      // Preferred port taken — fall back to ephemeral.
      const s2 = net.createServer();
      s2.unref();
      s2.on("error", reject);
      s2.listen(0, "127.0.0.1", () => {
        const p = s2.address().port;
        s2.close(() => resolve(p));
      });
    });
    srv.listen(preferred, "127.0.0.1", () => {
      srv.close(() => resolve(preferred));
    });
  });
}

// -------- Postgres lifecycle ------------------------------------------------
function runSync(cmd, args, opts = {}) {
  log(`$ ${path.basename(cmd)} ${args.map(a => /\s/.test(a) ? `"${a}"` : a).join(" ")}`);
  const res = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (res.status !== 0) {
    fatal(`${path.basename(cmd)} failed (exit ${res.status})`);
  }
}

function ensurePostgres() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  let pgPassword;
  if (fs.existsSync(PASS_FILE)) {
    pgPassword = fs.readFileSync(PASS_FILE, "utf8").trim();
  } else {
    pgPassword = crypto.randomBytes(24).toString("base64url");
    fs.writeFileSync(PASS_FILE, pgPassword, { encoding: "utf8", mode: 0o600 });
  }

  if (!fs.existsSync(path.join(PG_DATA, "PG_VERSION"))) {
    log("First run: initialising PostgreSQL data directory…");
    fs.mkdirSync(PG_DATA, { recursive: true });
    const pwfile = path.join(DATA_DIR, ".initdb-pwfile");
    fs.writeFileSync(pwfile, pgPassword, { encoding: "utf8", mode: 0o600 });
    try {
      runSync(PG_INITDB, [
        "-D", PG_DATA,
        "-U", DB_USER,
        "--pwfile", pwfile,
        "--encoding=UTF8",
        "--locale=C",
        "--auth-local=md5",
        "--auth-host=md5",
      ]);
    } finally {
      try { fs.unlinkSync(pwfile); } catch { /* ignore */ }
    }
    // Lock listener to localhost only.
    const conf = path.join(PG_DATA, "postgresql.conf");
    fs.appendFileSync(conf, "\n# Diagnostic ERP overrides\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = ''\nlogging_collector = on\nlog_directory = 'log'\n");
  }

  return pgPassword;
}

function startPostgres(pgPort) {
  const args = [
    "-D", PG_DATA,
    "-l", path.join(LOG_DIR, "postgres.log"),
    "-o", `-p ${pgPort} -h 127.0.0.1`,
    "start",
    "-w", "-t", "30",
  ];
  log(`Starting PostgreSQL on 127.0.0.1:${pgPort}…`);
  runSync(PG_CTL, args);
}

function stopPostgres() {
  try {
    log("Stopping PostgreSQL…");
    spawnSync(PG_CTL, ["-D", PG_DATA, "stop", "-m", "fast", "-w", "-t", "20"], { stdio: "inherit" });
  } catch { /* ignore */ }
}

function ensureDatabase(pgPort, pgPassword) {
  // Use psql to check whether our app DB exists; if not, create it.
  const psql = path.join(PG_BIN, "psql.exe");
  const env = { ...process.env, PGPASSWORD: pgPassword };
  const check = spawnSync(psql, [
    "-h", "127.0.0.1", "-p", String(pgPort), "-U", DB_USER, "-d", "postgres",
    "-tAc", `SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'`,
  ], { env, encoding: "utf8" });
  if (check.status !== 0) fatal(`psql failed: ${check.stderr || check.stdout}`);
  if (check.stdout.trim() !== "1") {
    log(`Creating database "${DB_NAME}"…`);
    runSync(psql, [
      "-h", "127.0.0.1", "-p", String(pgPort), "-U", DB_USER, "-d", "postgres",
      "-c", `CREATE DATABASE "${DB_NAME}"`,
    ], { env });
  }
}

function runMigrations(databaseUrl) {
  log("Applying database schema (drizzle-kit push)…");
  const env = { ...process.env, DATABASE_URL: databaseUrl };
  const res = spawnSync(NODE_EXE, [MIGRATE_SCRIPT], { env, stdio: "inherit" });
  if (res.status !== 0) fatal(`Database migration failed (exit ${res.status})`);
}

// -------- API server lifecycle ----------------------------------------------
let serverProc = null;

function startServer(httpPort, databaseUrl) {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(httpPort),
    DATABASE_URL: databaseUrl,
    SERVE_STATIC_DIR: STATIC_DIR,
    LOG_LEVEL: process.env.LOG_LEVEL || "info",
  };
  log(`Starting API server on http://127.0.0.1:${httpPort} …`);
  serverProc = spawn(NODE_EXE, ["--enable-source-maps", SERVER_ENTRY], {
    env,
    cwd: path.join(ROOT, "app/server"),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const apiLog = fs.createWriteStream(path.join(LOG_DIR, "api.log"), { flags: "a" });
  serverProc.stdout.pipe(apiLog);
  serverProc.stderr.pipe(apiLog);
  serverProc.stdout.pipe(process.stdout);
  serverProc.stderr.pipe(process.stderr);
  serverProc.on("exit", (code, sig) => {
    log(`API server exited (code=${code}, signal=${sig})`);
    cleanupAndExit(code ?? 0);
  });
}

function openBrowser(url) {
  log(`Opening ${url}`);
  // Detached "start" so we don't block on the browser.
  try {
    spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
  } catch (e) {
    log(`Failed to open browser: ${e.message}. Please open ${url} manually.`);
  }
}

// -------- Shutdown handling -------------------------------------------------
let shuttingDown = false;
function cleanupAndExit(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (serverProc && serverProc.pid) {
    try { process.kill(serverProc.pid); } catch { /* ignore */ }
  }
  stopPostgres();
  try { launcherLog.end(); } catch { /* ignore */ }
  process.exit(code);
}
process.on("SIGINT",  () => cleanupAndExit(0));
process.on("SIGTERM", () => cleanupAndExit(0));
process.on("SIGHUP",  () => cleanupAndExit(0));
process.on("uncaughtException", (e) => { log(`uncaught: ${e.stack || e}`); cleanupAndExit(1); });

// -------- Main --------------------------------------------------------------
async function main() {
  log("=".repeat(60));
  log(`${VARIANT.appName} — portable launcher`);
  log(`Install root: ${ROOT}`);
  log("=".repeat(60));

  if (process.platform !== "win32" && !process.env.DIAG_ERP_FORCE_RUN) {
    fatal("This launcher is for Windows. Set DIAG_ERP_FORCE_RUN=1 to override (testing only).");
  }

  preflight();

  // Reuse ports across runs so users always hit the same URL.
  let ports = { http: DEFAULT_HTTP_PORT, pg: DEFAULT_PG_PORT };
  if (fs.existsSync(PORT_FILE)) {
    try { ports = { ...ports, ...JSON.parse(fs.readFileSync(PORT_FILE, "utf8")) }; } catch { /* ignore */ }
  }
  ports.http = await findFreePort(ports.http);
  ports.pg   = await findFreePort(ports.pg);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PORT_FILE, JSON.stringify(ports, null, 2));

  const pgPassword = ensurePostgres();
  startPostgres(ports.pg);
  ensureDatabase(ports.pg, pgPassword);

  const databaseUrl = `postgres://${DB_USER}:${encodeURIComponent(pgPassword)}@127.0.0.1:${ports.pg}/${DB_NAME}`;
  runMigrations(databaseUrl);

  startServer(ports.http, databaseUrl);

  // Give the server a moment to bind, then open the browser.
  const openPath = VARIANT.openPath.startsWith("/") ? VARIANT.openPath : `/${VARIANT.openPath}`;
  setTimeout(() => openBrowser(`http://localhost:${ports.http}${openPath}`), 1500);

  log(`Launcher ready. Close this window (or press Ctrl+C) to stop ${VARIANT.appName}.`);
}

main().catch((err) => fatal(err.stack || String(err)));
