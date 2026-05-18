// =============================================================================
// build-launcher.mjs
//
// Compiles windows-build/launcher/launcher.js into a Windows .exe using Node
// 20's Single Executable Application (SEA) feature. The resulting .exe is
// dropped at:   windows-build/dist/payload/DiagnoCenter.exe
//
// Process:
//   1. node --experimental-sea-config sea-config.json    -> sea-prep.blob
//   2. cp runtime/node/node.exe -> DiagnosticERP.exe     (copy of Windows node)
//   3. npx postject DiagnosticERP.exe NODE_SEA_BLOB sea-prep.blob …
//
// We use the *Windows* node.exe that build-payload.mjs already downloaded as
// the host binary — that's what makes this cross-compile work from Linux.
//
// `postject` is downloaded on demand into .cache/ so we don't add it to the
// workspace dependency tree (it's a one-shot tool).
// =============================================================================

import { spawn, spawnSync, execFile } from "node:child_process";
import { cp, mkdir, rm, readFile, writeFile, stat, chmod } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT  = path.resolve(BUILD_ROOT, "..");
const PAYLOAD    = path.join(BUILD_ROOT, "dist/payload");
const LAUNCHER_SRC = path.join(BUILD_ROOT, "launcher/launcher.js");
const STAGE      = path.join(BUILD_ROOT, ".cache/launcher-stage");
const SEA_CONFIG = path.join(STAGE, "sea-config.json");
const SEA_BLOB   = path.join(STAGE, "sea-prep.blob");
const NODE_EXE   = path.join(PAYLOAD, "runtime/node/node.exe");
const OUT_EXE    = path.join(PAYLOAD, "DiagnoCenter.exe");

function log(m) { process.stdout.write(`[launcher] ${m}\n`); }

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: "inherit", ...opts });
    c.on("error", reject);
    c.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
  });
}

async function ensure(p) { await mkdir(p, { recursive: true }); }

async function pathExists(p) { try { await stat(p); return true; } catch { return false; } }

async function main() {
  if (!await pathExists(NODE_EXE)) {
    throw new Error(`Missing host binary: ${NODE_EXE}\nRun "pnpm --filter @workspace/windows-build run build:payload" first.`);
  }

  await rm(STAGE, { recursive: true, force: true });
  await ensure(STAGE);

  // SEA config: we don't enable code cache because postject must run on the
  // same arch as the produced binary, and we're cross-building from Linux.
  const seaConfig = {
    main: LAUNCHER_SRC,
    output: SEA_BLOB,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
  };
  await writeFile(SEA_CONFIG, JSON.stringify(seaConfig, null, 2), "utf8");

  log("Generating SEA blob with the local Node runtime…");
  await run(process.execPath, ["--experimental-sea-config", SEA_CONFIG]);

  log("Copying Windows node.exe -> DiagnoCenter.exe …");
  await cp(NODE_EXE, OUT_EXE);

  log("Injecting SEA blob with postject…");
  // Use the workspace pnpm cache for postject. `pnpm dlx` is npx-equivalent.
  await run("pnpm", [
    "dlx", "postject",
    OUT_EXE, "NODE_SEA_BLOB", SEA_BLOB,
    "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ], { cwd: BUILD_ROOT });

  // Make the .exe executable on Linux for downstream tools that check.
  await chmod(OUT_EXE, 0o755);

  const sz = (await stat(OUT_EXE)).size;
  log(`✓ ${OUT_EXE}  (${(sz / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => { console.error("[launcher] FAILED:", err); process.exit(1); });
