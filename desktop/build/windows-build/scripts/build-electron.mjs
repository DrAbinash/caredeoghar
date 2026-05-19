// =============================================================================
// build-electron.mjs
//
// Two-phase Electron build that works inside our Linux cross-build sandbox:
//
//   Phase 1 — `electron-builder --win dir`
//     Produces dist/electron/win-unpacked/ — the full unpacked Windows app
//     (Electron + our main.js/preload.js + the bundled payload). This step
//     does NOT invoke the NSIS toolchain, so it doesn't need wine.
//
//   Phase 2 — zip win-unpacked + makensis wrap
//     The default `--win nsis` step uses a 7z+lzma compress over the entire
//     384 MB payload, which exceeds our 120 s sandbox timeout and silently
//     dies. Instead we zip win-unpacked ourselves (deflate-1, fast) and
//     embed the .zip as a single File in our own NSIS script
//     (installer/installer-electron.nsi), which extracts it on the user's
//     machine via PowerShell Expand-Archive — same trick used by the
//     portable installer.
//
// Pre-requisites:
//   pnpm --filter @workspace/windows-build run build:payload
//
// On first run this will download Electron (~109 MB, win32-x64) into
// ~/.cache/electron/. Re-runs reuse the cache.
// =============================================================================

import { spawn } from "node:child_process";
import { stat, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const BUILD_ROOT = path.resolve(__dirname, "..");
const APP_DIR    = path.join(BUILD_ROOT, "electron-app");
const DIST_DIR   = path.join(BUILD_ROOT, "dist/electron");
const PAYLOAD    = path.join(BUILD_ROOT, "dist/payload");
const UNPACKED   = path.join(DIST_DIR, "win-unpacked");
const ZIP_FILE   = path.join(DIST_DIR, "DiagnoCenter-Desktop-win-unpacked.zip");
const NSI_FILE   = path.join(BUILD_ROOT, "installer/installer-electron.nsi");
const OUT_FILE   = path.join(DIST_DIR, "DiagnoCenter-Desktop-Setup.exe");
const EB_BIN     = path.join(APP_DIR, "node_modules/.bin/electron-builder");

function log(m) { process.stdout.write(`[electron] ${m}\n`); }

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: "inherit", ...opts });
    c.on("error", reject);
    c.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
  });
}

async function pathExists(p) { try { await stat(p); return true; } catch { return false; } }

async function main() {
  if (!await pathExists(PAYLOAD)) {
    throw new Error(`Missing payload at ${PAYLOAD}\nRun build:payload first.`);
  }
  await mkdir(DIST_DIR, { recursive: true });

  // ---- Phase 1: electron-builder --win dir -------------------------------
  if (await pathExists(path.join(UNPACKED, "DiagnoCenter Desktop.exe"))) {
    log("Phase 1: win-unpacked/ already present, skipping electron-builder.");
  } else {
    log("Phase 1: electron-builder --win dir --x64 (produces win-unpacked/)…");
    await run(EB_BIN, [
      "--win", "dir",
      "--x64",
      "--config.npmRebuild=false",
    ], {
      cwd: APP_DIR,
      env: {
        ...process.env,
        ELECTRON_CACHE: process.env.ELECTRON_CACHE || path.join(process.env.HOME, ".cache/electron"),
      },
    });
  }

  // ---- Phase 2a: zip win-unpacked ----------------------------------------
  if (await pathExists(ZIP_FILE)) {
    log(`Phase 2a: ${path.basename(ZIP_FILE)} already present, skipping zip.`);
  } else {
    log("Phase 2a: zipping win-unpacked/ (deflate-1, fast)…");
    await run("zip", ["-r", "-1", "-q",
      path.basename(ZIP_FILE),
      "win-unpacked",
    ], { cwd: DIST_DIR });
  }

  // ---- Phase 2b: makensis wrap -------------------------------------------
  await rm(OUT_FILE, { force: true });
  log("Phase 2b: makensis wrapping zip in NSIS installer…");
  await run("makensis", [
    "-V2",
    `-DPAYLOAD_ZIP=${ZIP_FILE}`,
    `-DOUT_FILE=${OUT_FILE}`,
    NSI_FILE,
  ]);

  const sz = (await stat(OUT_FILE)).size;
  log(`✓ ${OUT_FILE}  (${(sz / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => { console.error("[electron] FAILED:", err); process.exit(1); });
