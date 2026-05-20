// =============================================================================
// build-installer.mjs
//
// Compiles windows-build/installer/installer.nsi into a Windows installer .exe
// using makensis. Output: windows-build/dist/DiagnoCenter-Setup.exe
//
// Pre-requisites (run beforehand):
//   pnpm --filter @workspace/windows-build run build:payload
//   pnpm --filter @workspace/windows-build run build:launcher
//   pnpm --filter @workspace/windows-build run build:portable     # creates dist/portable/DiagnoCenter
// =============================================================================

import { spawn } from "node:child_process";
import { stat, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_ROOT = path.resolve(__dirname, "..");
// We embed the portable .zip as a single file inside the installer (extracted
// at install time via PowerShell Expand-Archive) instead of asking NSIS to
// File-list 5000+ individual files. See installer.nsi for the rationale.
const SOURCE_ZIP = path.join(BUILD_ROOT, "dist/CareDiagnostics-Portable.zip");
const NSI    = path.join(BUILD_ROOT, "installer/installer.nsi");
const OUT    = path.join(BUILD_ROOT, "dist/CareDiagnostics-Setup.exe");

function log(m) { process.stdout.write(`[installer] ${m}\n`); }

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: "inherit" });
    c.on("error", reject);
    c.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
  });
}

async function main() {
  await mkdir(path.dirname(OUT), { recursive: true });
  await stat(SOURCE_ZIP).catch(() => {
    throw new Error(`Missing portable zip: ${SOURCE_ZIP}\nRun build:portable first.`);
  });

  await run("makensis", [
    "-V2",
    `-DPAYLOAD_ZIP=${SOURCE_ZIP}`,
    `-DOUT_FILE=${OUT}`,
    NSI,
  ]);

  const sz = (await stat(OUT)).size;
  log(`✓ ${OUT}  (${(sz / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => { console.error("[installer] FAILED:", err); process.exit(1); });
