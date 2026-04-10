"use strict";
const api = require("./api");
const config = require("./config");
const github = require("./github");
const quality = require("./quality");
const watch = require("./watch");
const fmt = require("./format");

function parseModel(argv) {
  const f = argv.find(a => a.startsWith("--model="));
  if (f) return f.split("=")[1];
  if (argv.includes("--opus"))   return "claude-opus-4-6";
  if (argv.includes("--sonnet")) return "claude-sonnet-4-6";
  if (argv.includes("--mini"))   return "gpt-5.4-mini";
  if (argv.includes("--fast"))   return "gpt-5.4-fast";
  if (argv.includes("--kimi"))   return "kimi-k2.5";
  if (argv.includes("--glm"))    return "glm-5";
  if (argv.includes("--gemini")) return "gemini-3.1-pro";
  if (argv.includes("--grok"))   return "grok-4.1-fast";
  if (argv.includes("--qwen"))   return "qwen-3-coder";
  return null; // use config default
}

function strip(argv) { return argv.filter(a => !a.startsWith("--")); }
function getMode(argv) {
  const f = argv.find(a => a.startsWith("--mode="));
  return f ? f.split("=")[1] : "run";
}
function getInterval(argv) {
  const f = argv.find(a => a.startsWith("--interval="));
  return f ? Math.max(1, Math.min(parseInt(f.split("=")[1]), 30)) : config.load().watchInterval;
}

const commands = {};

// ─── init ──────────────────────────────────────────────────────────────────
commands.init = function(argv) {
  const cfg = config.load();
  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q, def) => new Promise(r => rl.question(`${q} [${def}]: `, a => r(a.trim() || def)));

  (async () => {
    cfg.apiKey = await ask("Capy API key", cfg.apiKey || "capy_...");
    cfg.projectId = await ask("Project ID", cfg.projectId || "");
    const repoStr = await ask("Repos (owner/repo:branch, comma-sep)", cfg.repos.map(r => `${r.repoFullName}:${r.branch}`).join(",") || "owner/repo:main");
    cfg.repos = repoStr.split(",").map(s => {
      const [repo, branch] = s.trim().split(":");
      return { repoFullName: repo, branch: branch || "main" };
    });
    cfg.defaultModel = await ask("Default model", cfg.defaultModel);
    cfg.quality.minReviewScore = parseInt(await ask("Min review score (1-5)", String(cfg.quality.minReviewScore)));
    rl.close();
    config.save(cfg);
    console.log(`\nConfig saved to ${config.CONFIG_PATH}`);
  })();
};

// ─── config ────────────────────────────────────────────────────────────────
commands.config = function(argv) {
  const args = strip(argv);
  if (args.length === 0) {
    fmt.out(config.load());
    return;
  }
  if (args.length === 1) {
    const val = config.get(args[0]);
    if (val === undefined) {
      console.error(`capy: unknown config key "${args[0]}"`);
      process.exit(1);
    }
    if (fmt.IS_JSON || typeof val === "object") {
      fmt.out(fmt.IS_JSON ? { [args[0]]: val } : val);
    } else {
      console.log(String(val));
    }
    return;
  }
  config.set(args[0], args.slice(1).join(" "));
  console.log(`Set ${args[0]} = ${config.get(args[0])}`);
};

// ─── captain ───────────────────────────────────────────────────────────────
commands.captain = commands.plan = function(argv) {
  const prompt = strip(argv).join(" ");
  if (!prompt) { console.error("Usage: capy captain <prompt>"); process.exit(1); }
  const model = parseModel(argv) || config.load().defaultModel;
  const data = api.createThread(prompt, model);
  if (fmt.IS_JSON) { fmt.out(data); return; }
  console.log(`Captain started: https://app.capy.ai/threads/${data.id}`);
  console.log(`Thread: ${data.id}  Model: ${model}`);
};

// ─── threads ───────────────────────────────────────────────────────────────
commands.threads = function(argv) {
  const sub = strip(argv)[0] || "list";
  if (sub === "list") {
    const data = api.listThreads();
    if (fmt.IS_JSON) { fmt.out(data.items || []); return; }
    if (!data.items?.length) { console.log("No threads."); return; }
    fmt.table(["ID", "STATUS", "TITLE"], data.items.map(t => [
      t.id.slice(0, 16), t.status, (t.title || "(untitled)").slice(0, 40),
    ]));
    return;
  }
  if (sub === "get") {
    const id = strip(argv)[1];
    if (!id) { console.error("Usage: capy threads get <id>"); process.exit(1); }
    const data = api.getThread(id);
    if (fmt.IS_JSON) { fmt.out(data); return; }
    console.log(`Thread: ${data.id}`);
    console.log(`Title:  ${data.title || "(untitled)"}`);
    console.log(`Status: ${data.status}`);
    if (data.tasks?.length) {
      console.log(`\nTasks (${data.tasks.length}):`);
      data.tasks.forEach(t => console.log(`  ${t.identifier} ${t.title} [${t.status}]`));
    }
    if (data.pullRequests?.length) {
      console.log(`\nPRs:`);
      data.pullRequests.forEach(p => console.log(`  PR#${p.number} ${p.url} [${p.state}]`));
    }
    return;
  }
  if (sub === "msg" || sub === "message") {
    const id = strip(argv)[1], msg = strip(argv).slice(2).join(" ");
    if (!id || !msg) { console.error("Usage: capy threads msg <id> <text>"); process.exit(1); }
    api.messageThread(id, msg);
    console.log("Message sent.");
    return;
  }
  if (sub === "stop") {
    const id = strip(argv)[1];
    if (!id) { console.error("Usage: capy threads stop <id>"); process.exit(1); }
    api.stopThread(id);
    console.log(`Stopped thread ${id}.`);
    return;
  }
  if (sub === "messages" || sub === "msgs") {
    const id = strip(argv)[1];
    if (!id) { console.error("Usage: capy threads messages <id>"); process.exit(1); }
    const data = api.getThreadMessages(id);
    if (fmt.IS_JSON) { fmt.out(data.items || []); return; }
    (data.items || []).forEach(m => {
      console.log(`[${m.source}] ${m.content.slice(0, 200)}`);
      console.log();
    });
    return;
  }
  console.error("Usage: capy threads [list|get|msg|stop|messages]");
  process.exit(1);
};

// ─── build ─────────────────────────────────────────────────────────────────
commands.build = commands.run = function(argv) {
  const prompt = strip(argv).join(" ");
  if (!prompt) { console.error("Usage: capy build <prompt>"); process.exit(1); }
  const model = parseModel(argv) || config.load().defaultModel;
  const data = api.createTask(prompt, model);
  if (fmt.IS_JSON) { fmt.out(data); return; }
  console.log(`Build started: https://app.capy.ai/tasks/${data.id}`);
  console.log(`ID: ${data.identifier}  Model: ${model}`);
};

// ─── list ──────────────────────────────────────────────────────────────────
commands.list = commands.ls = function(argv) {
  const status = strip(argv)[0];
  const data = api.listTasks({ status });
  if (fmt.IS_JSON) { fmt.out(data.items || []); return; }
  if (!data.items?.length) { console.log("No tasks."); return; }
  fmt.table(["ID", "STATUS", "TITLE", "PR"], data.items.map(t => [
    t.identifier,
    t.status,
    (t.title || "").slice(0, 45),
    t.pullRequest ? `PR#${t.pullRequest.number} [${t.pullRequest.state}]` : "\u2014",
  ]));
};

// ─── get ───────────────────────────────────────────────────────────────────
commands.get = commands.show = function(argv) {
  const id = strip(argv)[0];
  if (!id) { console.error("Usage: capy get <id>"); process.exit(1); }
  const data = api.getTask(id);
  if (fmt.IS_JSON) { fmt.out(data); return; }
  console.log(`Task:    ${data.identifier} \u2014 ${data.title}`);
  console.log(`Status:  ${data.status}`);
  console.log(`Created: ${data.createdAt}`);
  if (data.pullRequest) {
    console.log(`PR:      ${data.pullRequest.url || `#${data.pullRequest.number}`} [${data.pullRequest.state}]`);
  }
  if (data.jams?.length) {
    console.log(`\nJams (${data.jams.length}):`);
    data.jams.forEach((j, i) => {
      console.log(`  ${i+1}. model=${j.model || "?"} status=${j.status || "?"} credits=${fmt.credits(j.credits)}`);
    });
  }
};

// ─── start/stop/msg ────────────────────────────────────────────────────────
commands.start = function(argv) {
  const id = strip(argv)[0];
  if (!id) { console.error("Usage: capy start <id>"); process.exit(1); }
  const model = parseModel(argv) || config.load().defaultModel;
  const data = api.startTask(id, model);
  if (fmt.IS_JSON) { fmt.out(data); return; }
  console.log(`Started ${data.identifier || id} \u2192 ${data.status}`);
};

commands.stop = commands.kill = function(argv) {
  const id = strip(argv)[0], reason = strip(argv).slice(1).join(" ");
  if (!id) { console.error("Usage: capy stop <id>"); process.exit(1); }
  const data = api.stopTask(id, reason);
  if (fmt.IS_JSON) { fmt.out(data); return; }
  console.log(`Stopped ${data.identifier || id} \u2192 ${data.status}`);
};

commands.msg = commands.message = function(argv) {
  const id = strip(argv)[0], msg = strip(argv).slice(1).join(" ");
  if (!id || !msg) { console.error("Usage: capy msg <id> <text>"); process.exit(1); }
  api.messageTask(id, msg);
  if (fmt.IS_JSON) { fmt.out({ id, message: msg, status: "sent" }); return; }
  console.log("Message sent.");
};

// ─── diff ──────────────────────────────────────────────────────────────────
commands.diff = function(argv) {
  const id = strip(argv)[0];
  if (!id) { console.error("Usage: capy diff <id>"); process.exit(1); }
  const data = api.getDiff(id, getMode(argv));
  if (fmt.IS_JSON) { fmt.out(data); return; }
  console.log(`Diff (${data.source || "unknown"}): +${data.stats?.additions || 0} -${data.stats?.deletions || 0} in ${data.stats?.files || 0} files\n`);
  if (data.files) {
    data.files.forEach(f => {
      console.log(`--- ${f.path} (${f.state}) +${f.additions} -${f.deletions}`);
      if (f.patch) console.log(f.patch);
      console.log();
    });
  }
};

// ─── pr ────────────────────────────────────────────────────────────────────
commands.pr = function(argv) {
  const id = strip(argv)[0], title = strip(argv).slice(1).join(" ");
  if (!id) { console.error("Usage: capy pr <id> [title]"); process.exit(1); }
  const body = title ? { title } : {};
  const data = api.createPR(id, body);
  if (fmt.IS_JSON) { fmt.out(data); return; }
  console.log(`PR: ${data.url}`);
  console.log(`#${data.number} ${data.title} (${data.headRef} \u2192 ${data.baseRef})`);
};

// ─── models ────────────────────────────────────────────────────────────────
commands.models = function() {
  const data = api.listModels();
  if (fmt.IS_JSON) { fmt.out(data.models || []); return; }
  if (data.models) {
    fmt.table(["MODEL", "PROVIDER", "CAPTAIN"], data.models.map(m => [
      m.id, m.provider || "?", m.captainEligible ? "yes" : "no",
    ]));
  }
};

// ─── tools ─────────────────────────────────────────────────────────────────
commands.tools = commands.commands = function(argv) {
  const all = {
    captain:    { args: "<prompt>",              desc: "Start Captain thread" },
    build:      { args: "<prompt>",              desc: "Start Build agent (isolated)" },
    threads:    { args: "[list|get|msg|stop]",   desc: "Manage threads" },
    status:     { args: "",                      desc: "Dashboard" },
    list:       { args: "[status]",              desc: "List tasks" },
    get:        { args: "<id>",                  desc: "Task details" },
    start:      { args: "<id>",                  desc: "Start task" },
    stop:       { args: "<id> [reason]",         desc: "Stop task" },
    msg:        { args: "<id> <text>",           desc: "Message task" },
    diff:       { args: "<id>",                  desc: "View diff" },
    pr:         { args: "<id> [title]",          desc: "Create PR" },
    review:     { args: "<id>",                  desc: "Quality gates check" },
    "re-review":{ args: "<id>",                  desc: "Trigger Greptile re-review" },
    approve:    { args: "<id>",                  desc: "Approve if gates pass" },
    retry:      { args: "<id> [--fix=...]",      desc: "Retry with failure context" },
    watch:      { args: "<id>",                  desc: "Poll + notify on completion" },
    unwatch:    { args: "<id>",                  desc: "Stop watching" },
    watches:    { args: "",                      desc: "List watches" },
    models:     { args: "",                      desc: "List models" },
    tools:      { args: "",                      desc: "This list" },
    config:     { args: "[key] [value]",         desc: "Get/set config" },
    init:       { args: "",                      desc: "Interactive setup" },
  };

  if (fmt.IS_JSON) { fmt.out(all); return; }

  const cfg = config.load();
  console.log("Available commands:\n");
  for (const [name, t] of Object.entries(all)) {
    console.log(`  ${fmt.pad(name, 14)} ${fmt.pad(t.args, 24)} ${t.desc}`);
  }
  console.log(`\nConfig: ${config.CONFIG_PATH}`);
  console.log(`Review provider: ${cfg.quality?.reviewProvider || "greptile"}`);
  console.log(`Default model: ${cfg.defaultModel}`);
  console.log(`Repos: ${(cfg.repos || []).map(r => r.repoFullName).join(", ") || "none"}`);

  const envVars = [
    ["CAPY_API_KEY", "API key (overrides config)"],
    ["CAPY_PROJECT_ID", "Project ID (overrides config)"],
    ["CAPY_SERVER", "API server URL"],
    ["CAPY_ENV_FILE", "Path to .env file"],
    ["GREPTILE_API_KEY", "Greptile API key"],
  ];
  console.log("\nEnvironment variables:");
  envVars.forEach(([k, v]) => console.log(`  ${fmt.pad(k, 20)} ${v}`));
};

// ─── status ────────────────────────────────────────────────────────────────
commands.status = commands.dashboard = function(argv) {
  const cfg = config.load();
  const threads = api.listThreads({ limit: 10 });
  const tasks = api.listTasks({ limit: 30 });

  if (fmt.IS_JSON) {
    fmt.out({
      threads: threads.items || [],
      tasks: tasks.items || [],
      watches: watch.list(),
    });
    return;
  }

  // Active threads
  const active = (threads.items || []).filter(t => t.status === "active");
  if (active.length) {
    fmt.section("ACTIVE THREADS");
    active.forEach(t => console.log(`  ${t.id.slice(0, 14)}  ${(t.title || "(untitled)").slice(0, 50)}  [active]`));
  }

  // Tasks by status
  const allTasks = tasks.items || [];
  const buckets = {};
  allTasks.forEach(t => { (buckets[t.status] = buckets[t.status] || []).push(t); });

  if (buckets.in_progress?.length) {
    fmt.section("IN PROGRESS");
    buckets.in_progress.forEach(t => {
      const j = (t.jams || []).at(-1);
      const stuck = j && j.status === "idle" && (!j.credits || (j.credits.llm === 0 && j.credits.vm === 0));
      console.log(`  ${fmt.pad(t.identifier, 10)} ${fmt.pad((t.title || "").slice(0, 48), 50)}${stuck ? " !! STUCK" : ""}`);
    });
  }

  if (buckets.needs_review?.length) {
    fmt.section("NEEDS REVIEW");
    buckets.needs_review.forEach(t => {
      let prInfo = "no PR";
      if (t.pullRequest?.number) {
        const repo = t.pullRequest.repoFullName || cfg.repos[0]?.repoFullName || "";
        const pr = github.getPR(repo, t.pullRequest.number);
        const state = pr ? pr.state : t.pullRequest.state || "?";
        const ci = github.getCIStatus(repo, t.pullRequest.number, pr);
        const ciStr = ci ? (ci.allGreen ? "CI pass" : ci.noChecks ? "no CI" : "CI FAIL") : "?";
        prInfo = `PR#${t.pullRequest.number} [${state}] ${ciStr}`;
      }
      console.log(`  ${fmt.pad(t.identifier, 10)} ${fmt.pad((t.title || "").slice(0, 42), 44)} ${prInfo}`);
    });
  }

  if (buckets.backlog?.length) {
    fmt.section(`BACKLOG (${buckets.backlog.length})`);
    buckets.backlog.forEach(t => console.log(`  ${fmt.pad(t.identifier, 10)} ${(t.title || "").slice(0, 60)}`));
  }

  // Watches
  const watches = watch.list();
  if (watches.length) {
    fmt.section(`ACTIVE WATCHES (${watches.length})`);
    watches.forEach(w => console.log(`  ${fmt.pad(w.id.slice(0, 18), 20)} type=${w.type}  every ${w.intervalMin}min`));
  }

  // Summary
  const stuckCount = (buckets.in_progress || []).filter(t => {
    const j = (t.jams || []).at(-1);
    return j && j.status === "idle" && (!j.credits || (j.credits.llm === 0 && j.credits.vm === 0));
  }).length;
  console.log(`\nSummary: ${allTasks.length} tasks, ${(buckets.in_progress || []).length} active, ${(buckets.needs_review || []).length} review, ${stuckCount} stuck`);
};

// ─── review ────────────────────────────────────────────────────────────────
commands.review = function(argv) {
  const id = strip(argv)[0];
  if (!id) { console.error("Usage: capy review <id>"); process.exit(1); }

  const task = api.getTask(id);
  const cfg = config.load();
  const reviewProvider = cfg.quality?.reviewProvider || "greptile";

  if (!task.pullRequest?.number) {
    if (fmt.IS_JSON) { fmt.out({ error: "no_pr", task: task.identifier }); return; }
    console.log(`${task.identifier}: No PR. Create one first: capy pr ${task.identifier}`);
    return;
  }

  const repo = task.pullRequest.repoFullName || cfg.repos[0]?.repoFullName || "";
  const prNum = task.pullRequest.number;
  const defaultBranch = cfg.repos.find(r => r.repoFullName === repo)?.branch || "main";

  // diff stats for context
  let diffStats = null;
  try {
    const diff = api.getDiff(id);
    diffStats = diff.stats || null;
  } catch {}

  // quality gates (the source of truth)
  const q = quality.check(task);

  // gather extra detail for Greptile provider
  let unaddressed = [];
  let greptileApi;
  try { greptileApi = require("./greptile"); } catch { greptileApi = null; }
  const hasGreptileKey = !!(cfg.greptileApiKey || process.env.GREPTILE_API_KEY);

  if ((reviewProvider === "greptile" || reviewProvider === "both") && hasGreptileKey && greptileApi) {
    unaddressed = greptileApi.getUnaddressedIssues(repo, prNum, defaultBranch);
  }

  if (fmt.IS_JSON) {
    fmt.out({
      task: task.identifier,
      quality: q,
      unaddressed,
      reviewProvider,
      diff: diffStats ? { files: diffStats.files || 0, additions: diffStats.additions || 0, deletions: diffStats.deletions || 0 } : null,
    });
    return;
  }

  const prOpen = q.gates.find(g => g.name === "pr_open");
  console.log(`Review: ${task.identifier} — ${task.title}`);
  console.log(`PR: #${prNum} [${prOpen?.detail || task.pullRequest?.state || "?"}]`);
  if (diffStats) console.log(`Diff: +${diffStats.additions || 0} -${diffStats.deletions || 0} in ${diffStats.files || 0} files`);
  console.log(`Review: ${reviewProvider}`);
  console.log();

  q.gates.forEach(g => {
    const icon = g.pass ? "\u2713" : "\u2717";
    console.log(`  ${icon} ${g.name}: ${g.detail}`);
    if (g.name === "ci" && g.failing?.length) {
      g.failing.forEach(f => console.log(`      \u2717 ${f.name} (${f.conclusion || f.status})`));
    }
    if (g.name === "ci" && g.pending?.length) {
      g.pending.forEach(f => console.log(`      ... ${f.name} (${f.status})`));
    }
  });

  // show unaddressed Greptile issues inline
  if (unaddressed.length > 0) {
    console.log(`\nUnaddressed Greptile issues (${unaddressed.length}):`);
    unaddressed.forEach(u => {
      console.log(`  ${u.file}:${u.line} ${u.body}`);
      if (u.hasSuggestion) console.log(`    ^ has suggested fix`);
    });
  }

  console.log(`\n${q.summary}`);

  // actionable tips
  const greptileGate = q.gates.find(g => g.name === "greptile");
  if (greptileGate && !greptileGate.pass) {
    if (greptileGate.detail.includes("processing")) {
      console.log(`\nGreptile is still processing. Wait a minute, then: capy review ${task.identifier}`);
    } else {
      console.log(`\nFix the unaddressed issues, push, and Greptile will auto-re-review.`);
      console.log(`Then: capy review ${task.identifier}`);
    }
  }
};

// ─── re-review (manual trigger — normally auto-triggered by triggerOnUpdates) ──
commands["re-review"] = commands.rereview = function(argv) {
  const id = strip(argv)[0];
  if (!id) { console.error("Usage: capy re-review <id>"); process.exit(1); }

  const cfg = config.load();
  const reviewProvider = cfg.quality?.reviewProvider || "greptile";

  if (reviewProvider !== "greptile" && reviewProvider !== "both") {
    console.error(`capy: re-review requires Greptile provider (current: ${reviewProvider})`);
    process.exit(1);
  }

  let greptileApi;
  try { greptileApi = require("./greptile"); } catch {
    console.error("capy: greptile module not available");
    process.exit(1);
  }

  if (!cfg.greptileApiKey && !process.env.GREPTILE_API_KEY) {
    console.error("capy: GREPTILE_API_KEY not set. Run: capy config greptileApiKey <key>");
    process.exit(1);
  }

  const task = api.getTask(id);
  if (!task.pullRequest?.number) {
    console.error(`${task.identifier}: No PR. Create one first: capy pr ${task.identifier}`);
    process.exit(1);
  }

  const repo = task.pullRequest.repoFullName || cfg.repos[0]?.repoFullName || "";
  const prNum = task.pullRequest.number;
  const defaultBranch = cfg.repos.find(r => r.repoFullName === repo)?.branch || "main";

  console.log(`Triggering fresh Greptile review for PR#${prNum}...`);
  console.log(`(Note: Greptile auto-reviews on every push via triggerOnUpdates. This is a manual override.)`);
  const result = greptileApi.freshReview(repo, prNum, defaultBranch);

  if (fmt.IS_JSON) { fmt.out(result); return; }

  if (result) {
    if (result.status === "COMPLETED") {
      console.log("Review completed.");
    } else if (result.status === "FAILED") {
      console.log("Review failed. Check the PR state.");
    } else {
      console.log(`Review status: ${result.status || "unknown"}`);
    }
  } else {
    console.log("Review triggered. Check back shortly or run: capy review " + task.identifier);
  }

  // show unaddressed issues after re-review
  const unaddressed = greptileApi.getUnaddressedIssues(repo, prNum, defaultBranch);
  if (unaddressed.length > 0) {
    console.log(`\nUnaddressed issues: ${unaddressed.length}`);
    unaddressed.forEach(u => console.log(`  ${u.file}:${u.line} ${u.body}`));
  } else {
    console.log("\nAll issues addressed.");
  }
};

// ─── approve ───────────────────────────────────────────────────────────────
commands.approve = function(argv) {
  const id = strip(argv)[0];
  if (!id) { console.error("Usage: capy approve <id>"); process.exit(1); }
  const force = argv.includes("--force");

  const task = api.getTask(id);
  const cfg = config.load();
  const q = quality.check(task);

  if (fmt.IS_JSON) { fmt.out({ task: task.identifier, quality: q, approved: q.pass || force }); return; }

  console.log(`${task.identifier} — ${task.title}\n`);
  q.gates.forEach(g => {
    const icon = g.pass ? "\u2713" : "\u2717";
    console.log(`  ${icon} ${g.name}: ${g.detail}`);
  });
  console.log(`\n${q.summary}`);

  if (!q.pass && !force) {
    console.log(`\nBlocked. Fix the failing gates or use --force to override.`);
    process.exit(1);
  }

  if (q.pass || force) {
    console.log(`\n\u2713 Approved.${force && !q.pass ? " (forced)" : ""}`);
    const approveCmd = cfg.approveCommand;
    if (approveCmd) {
      try {
        const { execSync } = require("child_process");
        const expanded = approveCmd
          .replace("{task}", task.identifier || task.id)
          .replace("{title}", task.title || "")
          .replace("{pr}", String(task.pullRequest?.number || ""));
        execSync(expanded, { encoding: "utf8", timeout: 15000, stdio: "pipe" });
        console.log("Post-approve hook ran.");
      } catch {}
    }
  }
};

// ─── retry ─────────────────────────────────────────────────────────────────
commands.retry = function(argv) {
  const id = strip(argv)[0];
  if (!id) { console.error("Usage: capy retry <id> [--fix \"what to fix\"]"); process.exit(1); }

  const fixFlag = argv.find(a => a.startsWith("--fix="));
  const fixArg = fixFlag ? fixFlag.split("=").slice(1).join("=") : null;

  const task = api.getTask(id);
  const cfg = config.load();

  // gather context from the failed attempt
  let context = `Previous attempt: ${task.identifier} "${task.title}" [${task.status}]\n`;

  // get diff if available
  try {
    const diff = api.getDiff(id);
    if (diff.stats?.files > 0) {
      context += `\nPrevious diff: +${diff.stats.additions} -${diff.stats.deletions} in ${diff.stats.files} files\n`;
      context += `Files changed: ${(diff.files || []).map(f => f.path).join(", ")}\n`;
    } else {
      context += `\nPrevious diff: empty (agent produced no changes)\n`;
    }
  } catch { context += "\nPrevious diff: unavailable\n"; }

  // get PR review comments + quality gate context
  if (task.pullRequest?.number) {
    const repo = task.pullRequest.repoFullName || cfg.repos[0]?.repoFullName || "";
    const prNum = task.pullRequest.number;
    const defaultBranch = cfg.repos.find(r => r.repoFullName === repo)?.branch || "main";
    const reviewComments = github.getPRReviewComments(repo, prNum);
    const ci = github.getCIStatus(repo, prNum);

    // use live Greptile API for unaddressed issues if available
    const reviewProvider = cfg.quality?.reviewProvider || "greptile";
    const hasGreptileKey = !!(cfg.greptileApiKey || process.env.GREPTILE_API_KEY);
    let greptileApi;
    try { greptileApi = require("./greptile"); } catch { greptileApi = null; }

    if (reviewProvider === "greptile" && hasGreptileKey && greptileApi) {
      const unaddressed = greptileApi.getUnaddressedIssues(repo, prNum, defaultBranch);
      if (unaddressed.length > 0) {
        context += `\nUnaddressed Greptile issues (${unaddressed.length}):\n`;
        unaddressed.forEach(u => {
          context += `  ${u.file}:${u.line}: ${u.body}\n`;
          if (u.suggestedCode) context += `    Suggested fix: ${u.suggestedCode.slice(0, 200)}\n`;
        });
      } else {
        context += `\nGreptile: all issues addressed\n`;
      }
    } else {
      // fallback to stale PR comment parsing
      const issueComments = github.getPRIssueComments(repo, prNum);
      const greptile = github.parseGreptileReview(issueComments);
      if (greptile) {
        context += `\nGreptile review: ${greptile.score}/5 (stale — may not reflect latest)\n`;
      }
    }

    if (ci && !ci.allGreen) {
      context += `\nCI failures: ${ci.failing.map(f => f.name).join(", ")}\n`;
    }
    if (reviewComments.length) {
      context += `\nReview comments (${reviewComments.length}):\n`;
      reviewComments.slice(0, 5).forEach(c => {
        context += `  ${c.path}:${c.line || "?"}: ${(c.body || "").slice(0, 150)}\n`;
      });
    }
  }

  // build retry prompt
  const originalPrompt = task.prompt || task.title;
  let retryPrompt = `RETRY: This is a retry of a previous attempt that had issues.\n\n`;
  retryPrompt += `Original task: ${originalPrompt}\n\n`;
  retryPrompt += `--- CONTEXT FROM PREVIOUS ATTEMPT ---\n${context}\n`;

  if (fixArg) {
    retryPrompt += `--- SPECIFIC FIX REQUESTED ---\n${fixArg}\n\n`;
  }

  retryPrompt += `--- INSTRUCTIONS ---\n`;
  retryPrompt += `Fix the issues from the previous attempt. Do not repeat the same mistakes.\n`;
  retryPrompt += `Include tests. Run tests before completing. Verify CI will pass.\n`;

  if (fmt.IS_JSON) {
    fmt.out({ originalTask: task.identifier, retryPrompt, context });
    return;
  }

  // stop old task if still running
  if (task.status === "in_progress") {
    api.stopTask(id, "Retrying with fixes");
    console.log(`Stopped ${task.identifier}.`);
  }

  // start new Captain thread with full context
  const model = parseModel(argv) || cfg.defaultModel;
  const data = api.createThread(retryPrompt, model);
  console.log(`Retry started: https://app.capy.ai/threads/${data.id}`);
  console.log(`Thread: ${data.id}  Model: ${model}`);
  console.log(`\nContext included: ${context.split("\n").length} lines from previous attempt.`);
};

// ─── watch/unwatch/watches ─────────────────────────────────────────────────
commands.watch = function(argv) {
  const id = strip(argv)[0];
  if (!id) { console.error("Usage: capy watch <id> [--interval=3]"); process.exit(1); }
  const interval = getInterval(argv);
  const type = (id.length > 20 || (id.length > 10 && !id.match(/^[A-Z]+-\d+$/))) ? "thread" : "task";
  const added = watch.add(id, type, interval);
  if (fmt.IS_JSON) { fmt.out({ id, type, interval, added }); return; }
  if (added) {
    console.log(`Watching ${id} (${type}) every ${interval}min. Will notify when done.`);
  } else {
    console.log(`Already watching ${id}.`);
  }
};

commands.unwatch = function(argv) {
  const id = strip(argv)[0];
  if (!id) { console.error("Usage: capy unwatch <id>"); process.exit(1); }
  watch.remove(id);
  if (fmt.IS_JSON) { fmt.out({ id, status: "removed" }); return; }
  console.log(`Stopped watching ${id}.`);
};

commands.watches = function() {
  const w = watch.list();
  if (fmt.IS_JSON) { fmt.out(w); return; }
  if (!w.length) { console.log("No active watches."); return; }
  w.forEach(e => console.log(`${fmt.pad(e.id.slice(0, 20), 22)} type=${e.type}  every ${e.intervalMin}min  since ${e.created}`));
};

// ─── _poll (cron internal) ─────────────────────────────────────────────────
commands._poll = function(argv) {
  const id = argv[0], type = argv[1] || "task";
  if (!id) process.exit(1);

  if (type === "thread") {
    const data = api.getThread(id);
    if (data.status === "idle" || data.status === "archived") {
      const taskLines = (data.tasks || []).map(t => `  ${t.identifier}: ${t.title} [${t.status}]`).join("\n");
      const prLines = (data.pullRequests || []).map(p => `  PR#${p.number}: ${p.url} [${p.state}]`).join("\n");
      let msg = `[Capy] Captain thread finished.\nTitle: ${data.title || "(untitled)"}\nStatus: ${data.status}`;
      if (taskLines) msg += `\n\nTasks:\n${taskLines}`;
      if (prLines) msg += `\n\nPRs:\n${prLines}`;
      msg += `\n\nRun: capy review <task-id> for each task, then capy approve <task-id> if quality passes.`;
      watch.notify(msg);
      watch.remove(id);
    }
    return;
  }

  const data = api.getTask(id);
  if (data.status === "needs_review" || data.status === "archived") {
    let msg = `[Capy] Task ${data.identifier} ready.\nTitle: ${data.title}\nStatus: ${data.status}`;
    if (data.pullRequest) msg += `\nPR: ${data.pullRequest.url || "#" + data.pullRequest.number}`;
    msg += `\n\nRun: capy review ${data.identifier}, then capy approve ${data.identifier} if quality passes.`;
    watch.notify(msg);
    watch.remove(id);
  }
};

// ─── run ───────────────────────────────────────────────────────────────────
function run(cmd, argv) {
  const handler = commands[cmd];
  if (!handler) {
    console.error(`capy: unknown command "${cmd}". Run: capy help`);
    process.exit(1);
  }
  handler(argv);
}

module.exports = { run };
