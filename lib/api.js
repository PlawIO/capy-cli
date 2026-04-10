"use strict";
const { execFileSync } = require("child_process");
const config = require("./config");

function request(method, path, body) {
  const cfg = config.load();
  if (!cfg.apiKey) {
    console.error("capy: API key not configured. Run: capy init");
    process.exit(1);
  }
  const url = `${cfg.server}${path}`;
  const args = ["-s", "-X", method, url,
    "-H", `Authorization: Bearer ${cfg.apiKey}`,
    "-H", "Accept: application/json"];
  if (body) {
    args.push("-H", "Content-Type: application/json", "-d", JSON.stringify(body));
  }
  const out = execFileSync("curl", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  try {
    const data = JSON.parse(out);
    if (data.error) {
      console.error(`capy: API error — ${data.error.message || data.error.code}`);
      process.exit(1);
    }
    return data;
  } catch {
    console.error("capy: bad API response:", out.slice(0, 200));
    process.exit(1);
  }
}

// --- Threads ---
function createThread(prompt, model, repos) {
  const cfg = config.load();
  return request("POST", "/threads", {
    projectId: cfg.projectId,
    prompt,
    model: model || cfg.defaultModel,
    repos: repos || cfg.repos,
  });
}

function listThreads(opts = {}) {
  const cfg = config.load();
  const p = new URLSearchParams({ projectId: cfg.projectId, limit: String(opts.limit || 10) });
  if (opts.status) p.set("status", opts.status);
  return request("GET", `/threads?${p}`);
}

function getThread(id) { return request("GET", `/threads/${id}`); }
function messageThread(id, msg) { return request("POST", `/threads/${id}/message`, { message: msg }); }
function stopThread(id) { return request("POST", `/threads/${id}/stop`); }

// --- Tasks ---
function createTask(prompt, model, opts = {}) {
  const cfg = config.load();
  return request("POST", "/tasks", {
    projectId: cfg.projectId,
    prompt,
    title: (opts.title || prompt).slice(0, 80),
    repos: cfg.repos,
    model: model || cfg.defaultModel,
    start: opts.start !== false,
    ...(opts.labels ? { labels: opts.labels } : {}),
  });
}

function listTasks(opts = {}) {
  const cfg = config.load();
  const p = new URLSearchParams({ projectId: cfg.projectId, limit: String(opts.limit || 30) });
  if (opts.status) p.set("status", opts.status);
  return request("GET", `/tasks?${p}`);
}

function getTask(id) { return request("GET", `/tasks/${id}`); }
function startTask(id, model) { return request("POST", `/tasks/${id}/start`, { model: model || config.load().defaultModel }); }
function stopTask(id, reason) { return request("POST", `/tasks/${id}/stop`, reason ? { reason } : {}); }
function messageTask(id, msg) { return request("POST", `/tasks/${id}/message`, { message: msg }); }
function createPR(id, opts = {}) { return request("POST", `/tasks/${id}/pr`, opts); }

function getDiff(id, mode = "run") {
  return request("GET", `/tasks/${id}/diff?mode=${mode}`);
}

function listModels() { return request("GET", "/models"); }

// --- Thread messages ---
function getThreadMessages(id, opts = {}) {
  const p = new URLSearchParams({ limit: String(opts.limit || 50) });
  return request("GET", `/threads/${id}/messages?${p}`);
}

module.exports = {
  request,
  createThread, listThreads, getThread, messageThread, stopThread, getThreadMessages,
  createTask, listTasks, getTask, startTask, stopTask, messageTask, createPR, getDiff,
  listModels,
};
