// =============================================================================
// build-all.mjs
//
// One-command build of every Windows distribution:
//   1. Payload (api + frontends + portable Node + portable Postgres)
//   2. Launcher .exe (Node SEA from Linux)
//   3. Portable .zip
//   4. NSIS installer .exe
//   5. Electron desktop installer .exe (also NSIS)
//
// Each step can be run independently via the per-script entry points.
// =============================================================================

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = __dirname;

const STEPS = [
  ["1/6 payload",    path.join(SCRIPTS, "build-payload.mjs")],
  ["2/6 launcher",   path.join(SCRIPTS, "build-launcher.mjs")],
  ["3/6 portable",   path.join(SCRIPTS, "build-portable-zip.mjs")],
  ["4/6 installer",  path.join(SCRIPTS, "build-installer.mjs")],
  ["5/6 electron",   path.join(SCRIPTS, "build-electron.mjs")],
  ["6/6 update-zip", path.join(SCRIPTS, "build-update-zip.mjs")],
];

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: "inherit" });
    c.on("error", reject);
    c.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`exit ${code}`)));
  });
}

async function main() {
  const t0 = Date.now();
  for (const [label, script] of STEPS) {
    process.stdout.write(`\n========== ${label} ==========\n`);
    const t = Date.now();
    await run(process.execPath, [script]);
    process.stdout.write(`---------- ${label} done in ${Math.round((Date.now() - t) / 1000)}s ----------\n`);
  }
  process.stdout.write(`\nAll Windows builds complete in ${Math.round((Date.now() - t0) / 1000)}s.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
