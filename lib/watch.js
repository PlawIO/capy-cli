"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const config = require("./config");

function getCrontab() {
  try { return execSync("crontab -l 2>/dev/null", { encoding: "utf8" }); } catch { return ""; }
}

function setCrontab(content) {
  execSync(`echo ${JSON.stringify(content)} | crontab -`, { encoding: "utf8" });
}

function add(id, type, intervalMin) {
  const watchDir = config.WATCH_DIR;
  fs.mkdirSync(watchDir, { recursive: true });

  const binPath = path.resolve(__dirname, "..", "bin", "capy.js");
  const tag = `# capy-watch:${id}`;
  const cronLine = `*/${intervalMin} * * * * node ${binPath} _poll ${id} ${type} ${tag}`;

  let crontab = getCrontab();
  if (crontab.includes(`capy-watch:${id}`)) return false;

  crontab = crontab.trimEnd() + "\n" + cronLine + "\n";
  setCrontab(crontab);

  fs.writeFileSync(path.join(watchDir, `${id}.json`), JSON.stringify({
    id, type, intervalMin, created: new Date().toISOString(),
  }));
  return true;
}

function remove(id) {
  let crontab = getCrontab();
  const lines = crontab.split("\n").filter(l => !l.includes(`capy-watch:${id}`));
  setCrontab(lines.join("\n") + "\n");
  try { fs.unlinkSync(path.join(config.WATCH_DIR, `${id}.json`)); } catch {}
}

function list() {
  try {
    return fs.readdirSync(config.WATCH_DIR)
      .filter(f => f.endsWith(".json"))
      .map(f => JSON.parse(fs.readFileSync(path.join(config.WATCH_DIR, f), "utf8")));
  } catch { return []; }
}

function notify(text) {
  const cfg = config.load();
  const cmd = cfg.notifyCommand || "openclaw system event --text {text} --mode now";
  try {
    execSync(cmd.replace("{text}", JSON.stringify(text)), {
      encoding: "utf8", timeout: 15000,
    });
    return true;
  } catch { return false; }
}

module.exports = { add, remove, list, notify };
