#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tsEntry = join(__dirname, "capy.ts");

try {
  execFileSync("bun", ["run", tsEntry, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: process.env,
  });
} catch (e) {
  if (e.status != null) process.exit(e.status);
  console.error("capy requires Bun. Install: curl -fsSL https://bun.sh/install | bash");
  console.error("Then: bun i -g capyai && capy --help");
  process.exit(1);
}
