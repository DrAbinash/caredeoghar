import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..", "..");

const targets = [
  "lib/api-client-react/dist",
  "lib/api-zod/dist",
];

await Promise.all(
  targets.map(async (rel) => {
    const abs = path.join(root, rel);
    await rm(abs, { recursive: true, force: true });
    console.log(`[clean-stale-dist] removed ${rel}`);
  }),
);

// Rebuild composite libs so consumers (api-server, frontends) immediately
// see the regenerated types and zod schemas. Without this, codegen leaves
// the workspace in a broken typecheck state until something else triggers
// `tsc --build`.
console.log("[clean-stale-dist] rebuilding composite libs (tsc --build --force)…");
const result = spawnSync(
  "pnpm",
  ["exec", "tsc", "--build", "--force", "lib/api-zod", "lib/api-client-react"],
  { cwd: root, stdio: "inherit" },
);
if (result.status !== 0) {
  console.error("[clean-stale-dist] composite lib rebuild failed");
  process.exit(result.status ?? 1);
}
