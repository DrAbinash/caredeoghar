// =============================================================================
// build-update-zip.mjs
//
// Produces a small "app-only" zip that the running ERP can apply in-place
// (Settings → System Update). It contains JUST what changes between releases:
//
//   DiagnosticERP-Update.zip
//     app/server/                 (new server bundle + node_modules)
//     app/web/erp/                (new diagnostic-erp build)
//     app/web/super-admin-portal/ (new super-admin build)
//     app/db-migrate/             (drizzle-kit push runner)
//     MANIFEST.json
//
// The bundled Node + Postgres runtimes are NOT shipped — they only change
// when the user reinstalls the full portable / installer build.
// =============================================================================

import { spawn } from "node:child_process";
import { rm, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_ROOT = path.resolve(__dirname, "..");
const PAYLOAD_DIR = path.join(BUILD_ROOT, "dist/payload");
const OUT_ZIP = path.join(BUILD_ROOT, "dist/CareDiagnostics-Update.zip");

function log(m) { process.stdout.write(`[update-zip] ${m}\n`); }
function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: "inherit", ...opts });
    c.on("error", reject);
    c.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
  });
}

async function main() {
  if (!existsSync(PAYLOAD_DIR)) {
    throw new Error(`Payload not built. Run build-payload.mjs first. Missing: ${PAYLOAD_DIR}`);
  }
  if (!existsSync(path.join(PAYLOAD_DIR, "app/server/dist/index.mjs"))) {
    throw new Error("Payload looks incomplete: app/server/dist/index.mjs missing.");
  }

  await mkdir(path.dirname(OUT_ZIP), { recursive: true });
  await rm(OUT_ZIP, { force: true });

  log(`Zipping app/ + MANIFEST.json from ${PAYLOAD_DIR} → ${OUT_ZIP}`);
  // Use `zip` (the system tool) for portability + speed. Stored at deflate -1
  // for fast first-time install; the JS code in the bundle compresses fine.
  await run("zip", ["-r", "-q", "-1", OUT_ZIP, "app", "MANIFEST.json"], {
    cwd: PAYLOAD_DIR,
  });

  const sz = (await stat(OUT_ZIP)).size;
  log(`✓ ${OUT_ZIP}  (${(sz / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => { console.error("[update-zip] FAILED:", err); process.exit(1); });
