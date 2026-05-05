import { rm } from "node:fs/promises";
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
