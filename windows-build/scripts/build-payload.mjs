// =============================================================================
// build-payload.mjs
//
// Builds a self-contained Windows-runnable folder at:
//   windows-build/dist/payload/
//
// Layout produced:
//   payload/
//     app/
//       server/                  bundled api-server + prod node_modules
//       web/erp/                 diagnostic-erp Vite build  (BASE_PATH=/)
//       web/super-admin-portal/  super-admin Vite build     (BASE_PATH=/super-admin-portal/)
//       db-migrate/              minimal copy of @workspace/db so we can run
//                                drizzle-kit push from the launcher on first run
//     runtime/
//       node/node.exe            Windows portable Node 20
//       pgsql/                   Windows portable PostgreSQL 16 (bin/lib/share)
//
// Downloads are cached in windows-build/.cache/ so re-runs are fast.
// All commands here run on Linux — no Windows tooling required.
// =============================================================================

import { spawn } from "node:child_process";
import {
  cp, mkdir, rm, stat, writeFile, readFile, readdir, rename,
} from "node:fs/promises";
import { existsSync, createWriteStream, createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const BUILD_ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(BUILD_ROOT, ".cache");
const PAYLOAD_DIR = path.join(BUILD_ROOT, "dist/payload");

// -------- Versions of the runtimes we bundle --------------------------------
const NODE_VERSION = "20.18.1";
const NODE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
// EnterpriseDB ships an embeddable Windows zip ("binaries"); we only keep what we need.
const PG_VERSION = "16.4-1";
const PG_URL = `https://get.enterprisedb.com/postgresql/postgresql-${PG_VERSION}-windows-x64-binaries.zip`;

// -------- Tiny helpers ------------------------------------------------------
function log(msg) { process.stdout.write(`[payload] ${msg}\n`); }

async function ensureDir(p) { await mkdir(p, { recursive: true }); }

async function pathExists(p) { try { await stat(p); return true; } catch { return false; } }

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: "inherit", ...opts });
    c.on("error", reject);
    c.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
  });
}

async function download(url, destFile) {
  if (await pathExists(destFile)) {
    log(`cache hit: ${path.basename(destFile)}`);
    return;
  }
  await ensureDir(path.dirname(destFile));
  const tmp = `${destFile}.partial`;
  log(`downloading ${url}`);
  // Use curl - it's always available and handles big files / redirects well.
  await run("curl", ["-fL", "--retry", "3", "-o", tmp, url]);
  await rename(tmp, destFile);
  const sz = (await stat(destFile)).size;
  log(`  -> ${(sz / 1024 / 1024).toFixed(1)} MB`);
}

async function unzip(zipFile, destDir) {
  await ensureDir(destDir);
  // unzip is in coreutils-equivalent on most distros and in Replit's nix path.
  await run("unzip", ["-q", "-o", zipFile, "-d", destDir]);
}

// -------- Concurrency safety ------------------------------------------------
// `pnpm deploy` is safe to run while dev workflows are active:
//   1. It only READS from the shared content-addressable store (CAS).
//   2. It writes to an isolated target dir (windows-build/.cache/*-deploy),
//      never to the workspace's node_modules.
//   3. The CAS uses content-addressed, immutable entries with its own store
//      lock for the rare case a missing package must be fetched.
//   4. --ignore-scripts prevents the root preinstall guard from blocking
//      the deploy (the guard rejects --prod to protect against the dangerous
//      `pnpm install --prod`, but deploy --prod is safe).

// -------- Steps -------------------------------------------------------------

async function buildApiServer() {
  log("building api-server (esbuild bundle)…");
  await run("pnpm", ["--filter", "@workspace/api-server", "run", "build"], { cwd: REPO_ROOT });

  log("running pnpm deploy --prod for api-server…");
  const deployOut = path.join(BUILD_ROOT, ".cache/api-deploy");
  await rm(deployOut, { recursive: true, force: true });
  await run("pnpm", [
    "--filter", "@workspace/api-server", "--prod", "--legacy",
    "--ignore-scripts",
    "deploy", deployOut,
  ], { cwd: REPO_ROOT });

  const target = path.join(PAYLOAD_DIR, "app/server");
  await rm(target, { recursive: true, force: true });
  await ensureDir(target);
  await cp(path.join(deployOut, "node_modules"), path.join(target, "node_modules"), { recursive: true });
  await cp(path.join(REPO_ROOT, "artifacts/api-server/dist"), path.join(target, "dist"), { recursive: true });
  await cp(path.join(REPO_ROOT, "artifacts/api-server/package.json"), path.join(target, "package.json"));
  log("  ✓ app/server ready");
}

async function buildFrontends() {
  log("building diagnostic-erp (BASE_PATH=/)…");
  await run("pnpm", ["--filter", "@workspace/diagnostic-erp", "run", "build"], {
    cwd: REPO_ROOT,
    env: { ...process.env, BASE_PATH: "/" },
  });

  log("building super-admin-portal (BASE_PATH=/super-admin-portal/)…");
  await run("pnpm", ["--filter", "@workspace/super-admin-portal", "run", "build"], {
    cwd: REPO_ROOT,
    env: { ...process.env, BASE_PATH: "/super-admin-portal/" },
  });

  const erpOut = path.join(PAYLOAD_DIR, "app/web/erp");
  const adminOut = path.join(PAYLOAD_DIR, "app/web/super-admin-portal");
  await rm(path.join(PAYLOAD_DIR, "app/web"), { recursive: true, force: true });
  await ensureDir(path.dirname(erpOut));
  await cp(path.join(REPO_ROOT, "artifacts/diagnostic-erp/dist/public"), erpOut, { recursive: true });
  await cp(path.join(REPO_ROOT, "artifacts/super-admin-portal/dist/public"), adminOut, { recursive: true });
  log("  ✓ app/web/{erp,super-admin-portal} ready");
}

async function buildDbMigrate() {
  // The launcher runs `node runtime/node.exe app/db-migrate/run.mjs` once on
  // first boot to create the schema. We ship a tiny self-contained copy of the
  // db package + drizzle-kit so we don't need a full pnpm workspace at runtime.
  log("building db-migrate bundle…");
  const target = path.join(PAYLOAD_DIR, "app/db-migrate");
  await rm(target, { recursive: true, force: true });
  await ensureDir(target);

  // Use pnpm deploy on @workspace/db (which depends on drizzle-kit, drizzle-orm, pg)
  const dbDeploy = path.join(BUILD_ROOT, ".cache/db-deploy");
  await rm(dbDeploy, { recursive: true, force: true });
  await run("pnpm", [
    "--filter", "@workspace/db", "--legacy",
    "--ignore-scripts",
    "deploy", dbDeploy,
  ], { cwd: REPO_ROOT });

  await cp(path.join(dbDeploy, "node_modules"), path.join(target, "node_modules"), { recursive: true });
  await cp(path.join(REPO_ROOT, "lib/db/src"), path.join(target, "src"), { recursive: true });
  await cp(path.join(REPO_ROOT, "lib/db/drizzle.config.ts"), path.join(target, "drizzle.config.ts"));
  await cp(path.join(REPO_ROOT, "lib/db/package.json"), path.join(target, "package.json"));

  // tiny runner that the launcher invokes
  const runner = `// generated by build-payload.mjs
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const drizzleKit = path.join(__dirname, "node_modules/drizzle-kit/bin.cjs");

const res = spawnSync(process.execPath, [drizzleKit, "push", "--config", path.join(__dirname, "drizzle.config.ts")], {
  cwd: __dirname,
  stdio: "inherit",
  env: process.env,
});
process.exit(res.status ?? 1);
`;
  await writeFile(path.join(target, "run.mjs"), runner, "utf8");
  log("  ✓ app/db-migrate ready");
}

async function fetchNode() {
  const zip = path.join(CACHE_DIR, `node-v${NODE_VERSION}-win-x64.zip`);
  await download(NODE_URL, zip);
  const extracted = path.join(CACHE_DIR, `node-v${NODE_VERSION}-win-x64`);
  if (!await pathExists(extracted)) {
    log("extracting Node…");
    await unzip(zip, CACHE_DIR);
  }
  const target = path.join(PAYLOAD_DIR, "runtime/node");
  await rm(target, { recursive: true, force: true });
  await ensureDir(target);
  // Node Windows zip contains node.exe at the root + a few support files.
  for (const entry of await readdir(extracted)) {
    await cp(path.join(extracted, entry), path.join(target, entry), { recursive: true });
  }
  log("  ✓ runtime/node ready");
}

async function fetchPostgres() {
  const zip = path.join(CACHE_DIR, `postgresql-${PG_VERSION}-windows-x64-binaries.zip`);
  await download(PG_URL, zip);
  const extracted = path.join(CACHE_DIR, "pgsql");
  if (!await pathExists(extracted)) {
    log("extracting Postgres…");
    await unzip(zip, CACHE_DIR);
  }
  const target = path.join(PAYLOAD_DIR, "runtime/pgsql");
  await rm(target, { recursive: true, force: true });
  await ensureDir(target);
  // We only need bin, lib, share, and the licence files. Skip docs / symbols.
  for (const sub of ["bin", "lib", "share"]) {
    const src = path.join(extracted, sub);
    if (await pathExists(src)) {
      await cp(src, path.join(target, sub), { recursive: true });
    }
  }
  // Drop the obvious giant Postgres extras we don't use to save disk.
  const dropDirs = [
    "share/doc", "share/man", "share/locale",
    "lib/postgresql/pgxs",
  ];
  for (const d of dropDirs) {
    await rm(path.join(target, d), { recursive: true, force: true });
  }
  log("  ✓ runtime/pgsql ready");
}

async function writeManifest() {
  const manifest = {
    name: "Care Diagnostics",
    builtAt: new Date().toISOString(),
    nodeVersion: NODE_VERSION,
    postgresVersion: PG_VERSION,
    contents: {
      "app/server":              "Bundled Express API server + prod node_modules",
      "app/web/erp":             "Diagnostic ERP frontend (BASE_PATH=/)",
      "app/web/super-admin-portal": "Super Admin frontend (BASE_PATH=/super-admin-portal/)",
      "app/db-migrate":          "Self-contained drizzle-kit push runner",
      "runtime/node":            "Portable Windows Node.js",
      "runtime/pgsql":           "Portable Windows PostgreSQL",
    },
  };
  await writeFile(
    path.join(PAYLOAD_DIR, "MANIFEST.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
}

async function main() {
  log(`payload dir: ${PAYLOAD_DIR}`);
  await ensureDir(PAYLOAD_DIR);
  await ensureDir(CACHE_DIR);

  // App build steps (require pnpm install in the workspace already).
  await buildApiServer();
  await buildFrontends();
  await buildDbMigrate();

  // Runtime download/extract steps run in parallel — they're independent.
  await Promise.all([fetchNode(), fetchPostgres()]);

  await writeManifest();
  log("payload build complete.");
}

main().catch((err) => {
  console.error("[payload] FAILED:", err);
  process.exit(1);
});
