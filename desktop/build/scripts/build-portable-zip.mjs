// =============================================================================
// build-portable-zip.mjs
//
// Wraps desktop/build/dist/payload/ + the compiled DiagnoCenter.exe into a
// distributable .zip:   desktop/build/dist/DiagnosticERP-Portable.zip
// =============================================================================

import { spawn } from "node:child_process";
import { mkdir, rm, stat, cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_ROOT = path.resolve(__dirname, "..");
const PAYLOAD = path.join(BUILD_ROOT, "dist/payload");
const STAGE   = path.join(BUILD_ROOT, "dist/portable/DiagnoCenter");
const OUT_ZIP = path.join(BUILD_ROOT, "dist/DiagnoCenter-Portable.zip");

function log(m) { process.stdout.write(`[portable] ${m}\n`); }

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: "inherit", ...opts });
    c.on("error", reject);
    c.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
  });
}

async function main() {
  await rm(STAGE, { recursive: true, force: true });
  await mkdir(path.dirname(STAGE), { recursive: true });
  log("Staging portable folder…");
  await cp(PAYLOAD, STAGE, { recursive: true });

  log(`Zipping → ${OUT_ZIP}`);
  await rm(OUT_ZIP, { force: true });
  // Use system zip (always available in the Replit nix env).
  await run("zip", ["-rq", OUT_ZIP, "DiagnoCenter"], { cwd: path.dirname(STAGE) });

  const sz = (await stat(OUT_ZIP)).size;
  log(`✓ ${OUT_ZIP}  (${(sz / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => { console.error("[portable] FAILED:", err); process.exit(1); });
