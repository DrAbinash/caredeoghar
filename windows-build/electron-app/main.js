// =============================================================================
// Care Diagnostics — Electron desktop main process.
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

const { app, BrowserWindow, Menu, dialog, shell, Tray, nativeImage, clipboard } = require("electron");
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

// Updates can swap in a per-user override for app/. Once an update has been
// applied we read the bundled binaries (Node, Postgres) from PAYLOAD_ROOT but
// the server / web / migrate code from APP_DIR.
const NODE_EXE   = path.join(PAYLOAD_ROOT, "runtime/node/node.exe");
const PG_BIN     = path.join(PAYLOAD_ROOT, "runtime/pgsql/bin");
const PG_CTL     = path.join(PG_BIN, "pg_ctl.exe");
const PG_INITDB  = path.join(PG_BIN, "initdb.exe");
const PSQL       = path.join(PG_BIN, "psql.exe");

const USER_DIR = path.join(app.getPath("userData"), "diagnostic-erp");
const PG_DATA  = path.join(USER_DIR, "pgsql");
const PASS_FILE = path.join(USER_DIR, ".pgpass");
const PORT_FILE = path.join(USER_DIR, ".ports.json");
const LOG_DIR   = path.join(USER_DIR, "logs");
const APP_OVERRIDE = path.join(USER_DIR, "app");
const STAGING_DIR  = path.join(USER_DIR, "staging-update");
const MARKER_FILE  = path.join(USER_DIR, ".pending-update");

// Pick the app tree: override (if a previous update placed one) else bundled.
function currentAppDir() {
  return fs.existsSync(path.join(APP_OVERRIDE, "server/dist/index.mjs"))
    ? APP_OVERRIDE
    : path.join(PAYLOAD_ROOT, "app");
}
let APP_DIR = currentAppDir();
let SERVER_ENTRY = path.join(APP_DIR, "server/dist/index.mjs");
let STATIC_DIR   = path.join(APP_DIR, "web");
let MIGRATE_SCRIPT = path.join(APP_DIR, "db-migrate/run.mjs");
function refreshAppPaths() {
  APP_DIR = currentAppDir();
  SERVER_ENTRY = path.join(APP_DIR, "server/dist/index.mjs");
  STATIC_DIR   = path.join(APP_DIR, "web");
  MIGRATE_SCRIPT = path.join(APP_DIR, "db-migrate/run.mjs");
}

const DB_USER = "erp";
const DB_NAME = "diagnostic_erp";

let mainWindow = null;
let serverProc = null;
let pgPort = 55432;
let httpPort = 8888;
let shuttingDown = false;
let tray = null;

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
      "\n# Care Diagnostics overrides\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = ''\nlogging_collector = on\nlog_directory = 'log'\n",
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
      APP_INSTALL_ROOT: USER_DIR,
      APP_MANIFEST_PATH: path.join(PAYLOAD_ROOT, "MANIFEST.json"),
      UPDATE_STAGING_DIR: STAGING_DIR,
      UPDATE_MARKER_FILE: MARKER_FILE,
    },
    cwd: path.join(APP_DIR, "server"),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const apiLog = fs.createWriteStream(path.join(LOG_DIR, "api.log"), { flags: "a" });
  serverProc.stdout.pipe(apiLog);
  serverProc.stderr.pipe(apiLog);
  serverProc.on("exit", (code, sig) => {
    log(`API server exited (code=${code}, signal=${sig})`);
    if (shuttingDown) return;
    if (fs.existsSync(MARKER_FILE)) {
      try {
        applyStagedUpdate();
        refreshAppPaths();
        log("Restarting API server after update swap…");
        startServer(databaseUrl);
        if (mainWindow) mainWindow.webContents.reload();
        return;
      } catch (e) {
        log(`Update swap failed: ${e.stack || e}`);
      }
    }
    dialog.showErrorBox("Server stopped", `The API server exited unexpectedly (code ${code}). The app will close.`);
    cleanupAndQuit(1);
  });
}

function applyStagedUpdate() {
  if (!fs.existsSync(MARKER_FILE)) return;
  let marker;
  try { marker = JSON.parse(fs.readFileSync(MARKER_FILE, "utf8")); }
  catch { marker = { stagingDir: STAGING_DIR }; }
  const newAppParent = marker.stagingDir || STAGING_DIR;
  const newAppDir = path.join(newAppParent, "app");
  if (!fs.existsSync(newAppDir)) {
    try { fs.unlinkSync(MARKER_FILE); } catch {}
    try { fs.rmSync(STAGING_DIR, { recursive: true, force: true }); } catch {}
    return;
  }
  log(`Applying staged update from ${newAppDir}`);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  if (fs.existsSync(APP_OVERRIDE)) {
    fs.renameSync(APP_OVERRIDE, path.join(USER_DIR, `app.bak-${ts}`));
  }
  fs.mkdirSync(path.dirname(APP_OVERRIDE), { recursive: true });
  fs.renameSync(newAppDir, APP_OVERRIDE);
  try { fs.rmSync(STAGING_DIR, { recursive: true, force: true }); } catch {}
  try { fs.unlinkSync(MARKER_FILE); } catch {}
  // Prune old backups, keep last 3.
  try {
    const olds = fs.readdirSync(USER_DIR)
      .filter((n) => n.startsWith("app.bak-"))
      .map((n) => path.join(USER_DIR, n)).sort();
    while (olds.length > 3) {
      const v = olds.shift();
      try { fs.rmSync(v, { recursive: true, force: true }); } catch {}
    }
  } catch { /* ignore */ }
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
    title: "Care Diagnostics Desktop",
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

  // Minimize to tray instead of taskbar
  mainWindow.on("minimize", (e) => {
    e.preventDefault();
    mainWindow.hide();
    updateTray();
  });
}

// -------- Tray / LAN helpers -----------------------------------------------
const os = require("node:os");
function getLanIps() {
  const list = [];
  for (const [iface, addrs] of Object.entries(os.networkInterfaces())) {
    if (!iface || iface.startsWith("lo")) continue;
    for (const a of addrs) {
      if (a.internal) continue;
      if (a.family === "IPv4") list.push(a.address);
    }
  }
  return list;
}

function buildTrayMenu() {
  const ips = getLanIps();
  const lanItems = ips.map((ip) => {
    const u = `http://${ip}:${httpPort}/`;
    return {
      label: `Open ${u}`,
      click: () => { shell.openExternal(u); },
    };
  });
  const copyItems = ips.map((ip) => {
    const u = `http://${ip}:${httpPort}/`;
    return {
      label: `Copy ${u}`,
      click: () => {
        clipboard.writeText(u);
        dialog.showMessageBox(mainWindow || undefined, { type: "info", buttons: ["OK"], message: "LAN URL copied to clipboard", detail: u });
      },
    };
  });
  const template = [
    { label: `DiagnoCenter Desktop  —  port ${httpPort}`, enabled: false },
    { type: "separator" },
    ...(lanItems.length ? [
      { label: "LAN Access", enabled: false },
      ...lanItems,
      ...copyItems,
      { type: "separator" },
    ] : []),
    {
      label: "Show Window",
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
      },
    },
    { type: "separator" },
    { label: "Quit", click: () => cleanupAndQuit(0) },
  ];
  return Menu.buildFromTemplate(template);
}

function createTray() {
  if (tray) return;
  // Use a tiny inline PNG (16x16) for the tray icon. On Windows we can fall back
  // to a blank nativeImage if no file exists.
  let icon;
  try {
    const iconPath = path.join(PAYLOAD_ROOT, "app/web/erp/favicon.ico");
    icon = nativeImage.createFromPath(iconPath);
  } catch {
    icon = nativeImage.createEmpty();
  }
  tray = new Tray(icon.isEmpty() ? undefined : icon);
  tray.setToolTip(`Care Diagnostics Desktop — ${httpPort}`);
  tray.setContextMenu(buildTrayMenu());
  tray.on("click", () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
}

function updateTray() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

// -------- Lifecycle --------------------------------------------------------
function showSplashError(err) {
  log(`STARTUP FAILED: ${err.stack || err}`);
  dialog.showErrorBox("Care Diagnostics failed to start", String(err.message || err));
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
      throw new Error("Care Diagnostics Desktop runs on Windows only.");
    }

    // Apply any update staged by the previous run BEFORE we touch app paths.
    try { applyStagedUpdate(); refreshAppPaths(); } catch (e) { log(`Boot update swap failed: ${e.stack || e}`); }

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
    createTray();
  } catch (e) {
    showSplashError(e);
  }
});
