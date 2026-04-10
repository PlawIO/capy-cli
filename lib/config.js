"use strict";
const fs = require("fs");
const path = require("path");

const CONFIG_DIR = path.join(process.env.HOME || "/root", ".capy");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const WATCH_DIR = path.join(CONFIG_DIR, "watches");

const DEFAULTS = {
  apiKey: "",
  projectId: "",
  server: "https://capy.ai/api/v1",
  repos: [],
  defaultModel: "gpt-5.4",
  quality: {
    minReviewScore: 4,
    requireCI: true,
    requireTests: true,
    requireLinearLink: true,
    reviewProvider: "greptile",
  },
  watchInterval: 3,
  notifyCommand: "",
};

function load() {
  // load .env file if present (CAPY_ENV_FILE or ~/.capy/.env)
  const envPath = process.env.CAPY_ENV_FILE || path.join(CONFIG_DIR, ".env");
  try {
    fs.readFileSync(envPath, "utf8").split("\n").forEach(line => {
      const t = line.trim();
      if (!t || t.startsWith("#")) return;
      const eq = t.indexOf("=");
      if (eq === -1) return;
      const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    });
  } catch {}

  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    cfg = {};
  }

  const merged = { ...DEFAULTS, ...cfg };
  merged.quality = { ...DEFAULTS.quality, ...(cfg.quality || {}) };

  // env overrides
  if (process.env.CAPY_API_KEY) merged.apiKey = process.env.CAPY_API_KEY;
  if (process.env.CAPY_PROJECT_ID) merged.projectId = process.env.CAPY_PROJECT_ID;
  if (process.env.CAPY_SERVER) merged.server = process.env.CAPY_SERVER;

  return merged;
}

function save(cfg) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
}

function get(key) {
  const cfg = load();
  if (key.includes(".")) {
    const parts = key.split(".");
    let val = cfg;
    for (const p of parts) { val = val?.[p]; }
    return val;
  }
  return cfg[key];
}

function set(key, value) {
  const cfg = load();
  if (key.includes(".")) {
    const parts = key.split(".");
    let obj = cfg;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    // auto-parse booleans and numbers
    if (value === "true") value = true;
    else if (value === "false") value = false;
    else if (/^\d+$/.test(value)) value = parseInt(value);
    obj[parts[parts.length - 1]] = value;
  } else {
    cfg[key] = value;
  }
  save(cfg);
}

module.exports = { load, save, get, set, CONFIG_DIR, CONFIG_PATH, WATCH_DIR, DEFAULTS };
