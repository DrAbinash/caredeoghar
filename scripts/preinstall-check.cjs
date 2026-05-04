#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

for (const lock of ["package-lock.json", "yarn.lock"]) {
  const p = path.join(__dirname, "..", lock);
  if (fs.existsSync(p)) {
    try {
      fs.unlinkSync(p);
    } catch {}
  }
}

const ua = process.env.npm_config_user_agent || "";
if (!ua.startsWith("pnpm/")) {
  console.error("Use pnpm instead (run: npm i -g pnpm && pnpm install)");
  process.exit(1);
}

if (process.env.npm_config_production === "true") {
  const cmd = (process.env.npm_command || "").toLowerCase();
  if (cmd !== "deploy") {
    console.error(
      "ERROR: Do not run `pnpm install --prod` in this workspace.\n" +
      "It prunes devDependencies from the shared virtual store, breaking\n" +
      "CLI binaries (e.g. vite) that other packages depend on.\n" +
      "Use `pnpm deploy --prod <target-dir>` for isolated prod node_modules."
    );
    process.exit(1);
  }
}
