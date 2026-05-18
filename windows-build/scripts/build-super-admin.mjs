// =============================================================================
// build-super-admin.mjs
//
// Builds a standalone, pen-drive-friendly Windows portable for the
// Super Admin Portal:
//
//   windows-build/dist/SuperAdmin-Portable.zip
//   windows-build/dist/portable/SuperAdmin/SuperAdmin.exe
//
// The Super Admin variant reuses the *same* payload as the DiagnoCenter
// build (Postgres + Node + bundled API + both built frontends) — only three
// things change at runtime:
//
//   1. A small file `app/launcher-config.json` overrides branding, the URL
//      the browser auto-opens to (`/super-admin-portal/`), the default
//      HTTP/PG ports, the database name, and the data-directory name.
//   2. The launcher exe is named `SuperAdmin.exe`.
//   3. Different default ports + DB name + data dir let it coexist on the
//      same Windows machine as the main Diagnostic ERP install without
//      colliding.
//
// Pre-requisites (run beforehand):
//   pnpm --filter @workspace/windows-build run build:payload
//
// Performance notes:
//   - We hardlink the payload tree into the staging folder (cp -al) instead
//     of copying — instant on the same filesystem, ~zero extra disk usage.
//   - We then *break* the hardlinks for the few files we need to overwrite
//     (MANIFEST.json, the new launcher exe, launcher-config.json) so we
//     don't mutate the source payload.
// =============================================================================

import { spawn } from "node:child_process";
import { mkdir, rm, stat, writeFile, chmod, copyFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const BUILD_ROOT = path.resolve(__dirname, "..");
const SRC_PAYLOAD = path.join(BUILD_ROOT, "dist/payload");
const STAGE       = path.join(BUILD_ROOT, "dist/portable/SAdmin");
const OUT_ZIP     = path.join(BUILD_ROOT, "dist/SAdmin-Portable.zip");

const LAUNCHER_SRC = path.join(BUILD_ROOT, "launcher/launcher.js");
const SEA_STAGE    = path.join(BUILD_ROOT, ".cache/super-admin-launcher-stage");
const SEA_CONFIG   = path.join(SEA_STAGE, "sea-config.json");
const SEA_BLOB     = path.join(SEA_STAGE, "sea-prep.blob");
const NODE_EXE     = path.join(STAGE, "runtime/node/node.exe");
const OUT_EXE      = path.join(STAGE, "SuperAdmin.exe");
const OLD_EXE      = path.join(STAGE, "DiagnoCenter.exe");

// Variant-specific launcher config — written into the payload so launcher.js
// picks it up at runtime without code changes.
const LAUNCHER_CONFIG = {
  appName:         "Super Admin Portal",
  openPath:        "/super-admin-portal/",
  // Different DB + data dir so the two installs don't collide on one PC.
  dbName:          "diagnostic_erp_superadmin",
  dbUser:          "erp",
  dataDirName:     "data",
  // Different default ports for the same reason.
  defaultHttpPort: 8889,
  defaultPgPort:   55433,
};

function log(m) { process.stdout.write(`[super-admin] ${m}\n`); }

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: "inherit", ...opts });
    c.on("error", reject);
    c.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
  });
}

async function pathExists(p) { try { await stat(p); return true; } catch { return false; } }

async function ensureDir(p) { await mkdir(p, { recursive: true }); }

// Replace a file in STAGE that may currently be a hardlink into SRC_PAYLOAD.
// We unlink first so we don't mutate the source.
async function safeWrite(target, contents) {
  if (await pathExists(target)) await unlink(target);
  await writeFile(target, contents, "utf8");
}

async function safeCopy(src, dst) {
  if (await pathExists(dst)) await unlink(dst);
  await copyFile(src, dst);
}

async function clonePayloadFast() {
  if (!await pathExists(SRC_PAYLOAD)) {
    throw new Error(
      `Source payload not found at ${SRC_PAYLOAD}\n` +
      `Run "pnpm --filter @workspace/windows-build run build:payload" first.`
    );
  }
  log(`Hardlink-cloning payload → ${STAGE} (fast, no disk duplication)`);
  await rm(STAGE, { recursive: true, force: true });
  await ensureDir(path.dirname(STAGE));
  // cp -al: hardlink files, recreate dirs. Same filesystem only — perfect for
  // dist/ within a single workspace.
  await run("cp", ["-al", SRC_PAYLOAD, STAGE]);
}

async function writeVariantConfig() {
  const cfgPath = path.join(STAGE, "app/launcher-config.json");
  log(`Writing ${path.relative(BUILD_ROOT, cfgPath)}`);
  await safeWrite(cfgPath, JSON.stringify(LAUNCHER_CONFIG, null, 2));

  const manifest = {
    name: LAUNCHER_CONFIG.appName,
    builtAt: new Date().toISOString(),
    variant: "super-admin",
    description:
      "Standalone portable build of the Super Admin Portal. Bundles the same " +
      "Postgres + Node + API server as the main Diagnostic ERP build, but " +
      "auto-opens the Super Admin UI and uses a separate database and ports.",
    launcherConfig: LAUNCHER_CONFIG,
  };
  await safeWrite(
    path.join(STAGE, "MANIFEST.json"),
    JSON.stringify(manifest, null, 2),
  );
}

async function buildLauncherExe() {
  if (!await pathExists(NODE_EXE)) {
    throw new Error(`Missing host binary in cloned payload: ${NODE_EXE}`);
  }
  await rm(SEA_STAGE, { recursive: true, force: true });
  await ensureDir(SEA_STAGE);

  const seaConfig = {
    main: LAUNCHER_SRC,
    output: SEA_BLOB,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
  };
  await writeFile(SEA_CONFIG, JSON.stringify(seaConfig, null, 2), "utf8");

  log("Generating SEA blob…");
  await run(process.execPath, ["--experimental-sea-config", SEA_CONFIG]);

  log("Copying Windows node.exe → SuperAdmin.exe …");
  await safeCopy(NODE_EXE, OUT_EXE);

  log("Injecting SEA blob with postject…");
  await run("pnpm", [
    "dlx", "postject",
    OUT_EXE, "NODE_SEA_BLOB", SEA_BLOB,
    "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ], { cwd: BUILD_ROOT });

  await chmod(OUT_EXE, 0o755);

  // Drop the original DiagnosticERP.exe — this build is super-admin only.
  if (await pathExists(OLD_EXE)) {
    await unlink(OLD_EXE);
    log("Removed bundled DiagnosticERP.exe (super-admin variant)");
  }

  const sz = (await stat(OUT_EXE)).size;
  log(`  ✓ ${path.relative(BUILD_ROOT, OUT_EXE)}  (${(sz / 1024 / 1024).toFixed(1)} MB)`);
}

async function zipStage() {
  log(`Zipping → ${OUT_ZIP}`);
  await rm(OUT_ZIP, { force: true });
  // -y preserves symlinks (we don't have any but it's a no-op safety).
  // -1 = fastest compression. The bulk of the payload is already-compressed
  // (.zip-format embeddable Node + already-compressed Postgres binaries),
  // so higher compression buys very little but costs lots of CPU time.
  await run("zip", ["-rq", "-1", OUT_ZIP, "SAdmin"], { cwd: path.dirname(STAGE) });
  const sz = (await stat(OUT_ZIP)).size;
  log(`✓ ${OUT_ZIP}  (${(sz / 1024 / 1024).toFixed(1)} MB)`);
}

async function main() {
  log(`Building Super Admin standalone portable from ${SRC_PAYLOAD}`);
  const t0 = Date.now();
  await clonePayloadFast();
  await writeVariantConfig();
  await buildLauncherExe();
  await zipStage();
  log(`Super Admin portable build complete in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
}

main().catch((err) => { console.error("[super-admin] FAILED:", err); process.exit(1); });
