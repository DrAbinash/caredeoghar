// =============================================================================
// Diagnostic ERP — Electron desktop main process.
//
// Boots Postgres + the bundled API server (using the same payload tree that
// the portable launcher uses) and shows a single BrowserWindow pointed at the
// local server. The user sees a real desktop window — no browser involved.
//
// On packaged builds (electron-builder) the payload lives at:
//   process.resourcesPath/payload/
//
// On `electron .` dev runs we look at ../dist/payload/.
// =============================================================================

"use strict";

const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");

const PAYLOAD_ROOT = (() => {
  const packed = path.join(process.resourcesPath || "", "payload");
  if (fs.existsSync(packed)) return packed;
  return path.resolve(__dirname, "../dist/payload");
})();

const NODE_EXE   = path.join(PAYLOAD_ROOT, "runtime/node/node.exe");
const PG_BIN     = path.join(PAYLOAD_ROOT, "runtime/pgsql/bin");
const PG_CTL     = path.join(PG_BIN, "pg_ctl.exe");
const PG_INITDB  = path.join(PG_BIN, "initdb.exe");
const PSQL       = path.join(PG_BIN, "psql.exe");
const SERVER_ENTRY = path.join(PAYLOAD_ROOT, "app/server/dist/index.mjs");
const STATIC_DIR = path.join(PAYLOAD_ROOT, "app/web");
const MIGRATE_SCRIPT = path.join(PAYLOAD_ROOT, "app/db-migrate/run.mjs");

const USER_DIR = path.join(app.getPath("userData"), "diagnostic-erp");
const PG_DATA  = path.join(USER_DIR, "pgsql");
const PASS_FILE = path.join(USER_DIR, ".pgpass");
const PORT_FILE = path.join(USER_DIR, ".ports.json");
const LOG_DIR   = path.join(USER_DIR, "logs");

const DB_USER = "erp";
const DB_NAME = "diagnostic_erp";

let mainWindow = null;
let serverProc = null;
let pgPort = 55432;
let httpPort = 8888;
let shuttingDown = false;

fs.mkdirSync(USER_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR,  { recursive: true });
const launcherLog = fs.createWriteStream(path.join(LOG_DIR, "electron-launcher.log"), { flags: "a" });
function log(m) {
  const line = `[${new Date().toISOString()}] ${m}\n`;
  process.stdout.write(line);
  try { launcherLog.write(line); } catch { /* ignore */ }
}

// -------- Helpers ----------------------------------------------------------
function findFreePort(preferred) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", () => {
      const s2 = net.createServer();
      s2.unref();
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

function ensurePostgres() {
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
    const pwfile = path.join(USER_DIR, ".initdb-pwfile");
    fs.writeFileSync(pwfile, pgPassword, { encoding: "utf8", mode: 0o600 });
    try {
      const r = spawnSync(PG_INITDB, [
        "-D", PG_DATA, "-U", DB_USER, "--pwfile", pwfile,
        "--encoding=UTF8", "--locale=C",
        "--auth-local=md5", "--auth-host=md5",
      ], { stdio: ["ignore", "pipe", "pipe"] });
      if (r.status !== 0) {
        throw new Error(`initdb failed (exit ${r.status}): ${r.stderr || r.stdout}`);
      }
    } finally {
      try { fs.unlinkSync(pwfile); } catch { /* ignore */ }
    }
    fs.appendFileSync(
      path.join(PG_DATA, "postgresql.conf"),
      "\n# Diagnostic ERP overrides\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = ''\nlogging_collector = on\nlog_directory = 'log'\n",
    );
  }

  return pgPassword;
}

function startPostgres(port) {
  log(`Starting PostgreSQL on 127.0.0.1:${port}…`);
  const r = spawnSync(PG_CTL, [
    "-D", PG_DATA,
    "-l", path.join(LOG_DIR, "postgres.log"),
    "-o", `-p ${port} -h 127.0.0.1`,
    "start", "-w", "-t", "30",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  if (r.status !== 0) {
    throw new Error(`pg_ctl start failed (exit ${r.status}): ${r.stderr || r.stdout}`);
  }
}

function stopPostgres() {
  try {
    spawnSync(PG_CTL, ["-D", PG_DATA, "stop", "-m", "fast", "-w", "-t", "20"], { stdio: "ignore" });
  } catch { /* ignore */ }
}

function ensureDatabase(pgPassword) {
  const env = { ...process.env, PGPASSWORD: pgPassword };
  const check = spawnSync(PSQL, [
    "-h", "127.0.0.1", "-p", String(pgPort), "-U", DB_USER, "-d", "postgres",
    "-tAc", `SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'`,
  ], { env, encoding: "utf8" });
  if (check.status !== 0) throw new Error(`psql failed: ${check.stderr || check.stdout}`);
  if (check.stdout.trim() !== "1") {
    log(`Creating database "${DB_NAME}"…`);
    const c = spawnSync(PSQL, [
      "-h", "127.0.0.1", "-p", String(pgPort), "-U", DB_USER, "-d", "postgres",
      "-c", `CREATE DATABASE "${DB_NAME}"`,
    ], { env, encoding: "utf8" });
    if (c.status !== 0) throw new Error(`createdb failed: ${c.stderr}`);
  }
}

function runMigrations(databaseUrl) {
  log("Applying database schema (drizzle-kit push)…");
  const r = spawnSync(NODE_EXE, [MIGRATE_SCRIPT], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(`Migration failed: ${r.stderr || r.stdout}`);
  }
}

function startServer(databaseUrl) {
  log(`Starting API server on http://127.0.0.1:${httpPort}…`);
  serverProc = spawn(NODE_EXE, ["--enable-source-maps", SERVER_ENTRY], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(httpPort),
      DATABASE_URL: databaseUrl,
      SERVE_STATIC_DIR: STATIC_DIR,
      LOG_LEVEL: process.env.LOG_LEVEL || "info",
    },
    cwd: path.join(PAYLOAD_ROOT, "app/server"),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const apiLog = fs.createWriteStream(path.join(LOG_DIR, "api.log"), { flags: "a" });
  serverProc.stdout.pipe(apiLog);
  serverProc.stderr.pipe(apiLog);
  serverProc.on("exit", (code, sig) => {
    log(`API server exited (code=${code}, signal=${sig})`);
    if (!shuttingDown) {
      dialog.showErrorBox("Server stopped", `The API server exited unexpectedly (code ${code}). The app will close.`);
      cleanupAndQuit(1);
    }
  });
}

async function waitForHttp(url, timeoutMs = 20000) {
  const http = require("node:http");
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve();
        retry();
      });
      req.on("error", retry);
      req.setTimeout(1000, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) return reject(new Error("server did not become ready"));
      setTimeout(tick, 250);
    };
    tick();
  });
}

// -------- Window -----------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Diagnostic ERP Desktop",
    backgroundColor: "#0f172a",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  // Restrict navigation to the local server.
  mainWindow.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(`http://localhost:${httpPort}`) && !url.startsWith(`http://127.0.0.1:${httpPort}`)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Application menu — keep the basics, hide the dev menu in prod.
  const isDev = !app.isPackaged;
  if (!isDev) Menu.setApplicationMenu(null);

  mainWindow.loadURL(`http://localhost:${httpPort}/`);
  mainWindow.on("closed", () => { mainWindow = null; });
}

// -------- Lifecycle --------------------------------------------------------
function showSplashError(err) {
  log(`STARTUP FAILED: ${err.stack || err}`);
  dialog.showErrorBox("Diagnostic ERP failed to start", String(err.message || err));
  cleanupAndQuit(1);
}

function cleanupAndQuit(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (serverProc && serverProc.pid) {
    try { serverProc.kill(); } catch { /* ignore */ }
  }
  stopPostgres();
  try { launcherLog.end(); } catch { /* ignore */ }
  app.exit(code);
}

app.on("window-all-closed", () => cleanupAndQuit(0));
app.on("before-quit", () => cleanupAndQuit(0));

app.whenReady().then(async () => {
  try {
    if (process.platform !== "win32" && !process.env.DIAG_ERP_FORCE_RUN) {
      throw new Error("Diagnostic ERP Desktop runs on Windows only.");
    }

    let ports = { http: httpPort, pg: pgPort };
    if (fs.existsSync(PORT_FILE)) {
      try { ports = { ...ports, ...JSON.parse(fs.readFileSync(PORT_FILE, "utf8")) }; } catch { /* ignore */ }
    }
    httpPort = await findFreePort(ports.http);
    pgPort   = await findFreePort(ports.pg);
    fs.writeFileSync(PORT_FILE, JSON.stringify({ http: httpPort, pg: pgPort }, null, 2));

    const pgPassword = ensurePostgres();
    startPostgres(pgPort);
    ensureDatabase(pgPassword);
    const databaseUrl = `postgres://${DB_USER}:${encodeURIComponent(pgPassword)}@127.0.0.1:${pgPort}/${DB_NAME}`;
    runMigrations(databaseUrl);
    startServer(databaseUrl);

    await waitForHttp(`http://127.0.0.1:${httpPort}/`);
    createWindow();
  } catch (e) {
    showSplashError(e);
  }
});
