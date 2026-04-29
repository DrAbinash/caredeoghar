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
