#!/usr/bin/env bun

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const cmd = process.argv[2];

if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
  console.log(`capy — agent orchestrator with quality gates

Usage: capy <command> [args] [flags]

Agents:
  captain <prompt>         Start Captain thread
  build <prompt>           Start Build agent
  threads [list|get|msg|stop|messages]

Tasks:
  status                   Dashboard
  list [status]            List tasks
  get <id>                 Task details
  start/stop/msg <id>      Control tasks
  diff <id>                View diff
  pr <id> [title]          Create PR

Quality:
  review <id>              Gate check
  re-review <id>           Trigger Greptile re-review
  approve <id> [--force]   Approve if gates pass
  retry <id> [--fix="..."] Retry with context

Monitoring:
  watch/unwatch <id>       Auto-poll + notify
  watches                  List watches

Config:
  init                     Interactive setup
  config [key] [value]     Get/set config
  models                   List models
  tools                    All commands + env vars

Flags:
  --json  --model=<id>  --opus  --sonnet  --fast

v${version}
`);
  process.exit(0);
}

try {
  const { run } = await import("../src/cli.js");
  await run(cmd, process.argv.slice(3));
} catch (e: unknown) {
  const err = e as Error & { code?: string };
  if (err.code === "MODULE_NOT_FOUND" || err.code === "ERR_MODULE_NOT_FOUND") {
    console.error("capy: broken install. Reinstall: npm i -g capy-cli");
    process.exit(1);
  }
  console.error(err.message);
  process.exit(1);
}
