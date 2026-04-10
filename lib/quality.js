"use strict";
const github = require("./github");
const config = require("./config");

let greptile;
try { greptile = require("./greptile"); } catch { greptile = null; }

function check(task) {
  const cfg = config.load();
  const thresholds = cfg.quality;
  const gates = [];

  const reviewProvider = cfg.quality.reviewProvider || "greptile";
  const hasGreptileKey = !!(cfg.greptileApiKey || process.env.GREPTILE_API_KEY);
  const useGreptile = (reviewProvider === "greptile" || reviewProvider === "both") && hasGreptileKey && greptile;
  const useCapy = reviewProvider === "capy" || reviewProvider === "both";

  // Gate: PR exists
  const hasPR = !!(task.pullRequest && task.pullRequest.number);
  gates.push({ name: "pr_exists", pass: hasPR, detail: hasPR ? `PR#${task.pullRequest.number}` : "No PR created" });

  if (!hasPR) {
    return {
      pass: false, passed: 0, total: 1, gates,
      summary: "No PR. Create one first: capy pr " + (task.identifier || task.id),
    };
  }

  const repo = task.pullRequest.repoFullName || (cfg.repos[0] && cfg.repos[0].repoFullName);
  if (!repo) {
    return { pass: false, passed: 0, total: 1, gates, summary: "No repo configured. Run: capy init" };
  }
  const prNum = task.pullRequest.number;
  const defaultBranch = cfg.repos.find(r => r.repoFullName === repo)?.branch || "main";

  // Gate: PR state
  const pr = github.getPR(repo, prNum);
  if (pr) {
    const merged = pr.state === "MERGED";
    const open = pr.state === "OPEN";
    gates.push({
      name: "pr_open",
      pass: merged || open,
      detail: `${pr.state}${pr.reviewDecision ? ` (${pr.reviewDecision})` : ""}`,
    });
  }

  // Gate: CI checks (Greptile's own status check is tracked separately)
  const ci = github.getCIStatus(repo, prNum, pr);
  if (ci) {
    const nonGreptile = f => !(f.name || "").toLowerCase().includes("greptile");
    const failures = ci.failing.filter(nonGreptile);
    const pending = ci.pending.filter(nonGreptile);
    const ciGreen = failures.length === 0 && pending.length === 0;
    const greptileCheck = !ci.failing.every(nonGreptile) || !ci.pending.every(nonGreptile);

    gates.push({
      name: "ci",
      pass: ciGreen || ci.noChecks,
      detail: ci.noChecks ? "No CI configured" :
        ciGreen ? `${ci.total - (greptileCheck ? 1 : 0)} passing` :
        `${failures.length} failing: ${failures.map(f => f.name).join(", ")}`,
      failing: failures,
      pending,
    });
  }

  // Gate: Greptile review (live API, not stale scores)
  if (useGreptile) {
    const status = getGreptileStatusCheck(pr);

    if (status === "pending") {
      gates.push({ name: "greptile", pass: false, detail: "Review still processing" });
    } else {
      const unaddressed = greptile.getUnaddressedIssues(repo, prNum, defaultBranch);
      gates.push({
        name: "greptile",
        pass: unaddressed.length === 0,
        detail: unaddressed.length === 0
          ? "All issues addressed"
          : `${unaddressed.length} unaddressed: ${unaddressed.slice(0, 3).map(u => `${u.file}:${u.line}`).join(", ")}`,
        issues: unaddressed,
      });

      if (status === "failure") {
        gates.push({ name: "greptile_check", pass: false, detail: "Status check failing" });
      } else if (status === "success") {
        gates.push({ name: "greptile_check", pass: true, detail: "Status check passing" });
      }
    }
  }

  // Gate: Unresolved review threads (GitHub)
  if (useCapy) {
    const unresolved = github.getUnresolvedThreads(repo, prNum);
    gates.push({
      name: "threads",
      pass: unresolved.length === 0,
      detail: unresolved.length === 0 ? "No unresolved threads" : `${unresolved.length} unresolved`,
      threads: unresolved,
    });
  }

  // Gate: Tests in diff
  if (thresholds.requireTests) {
    let diffFiles = null;
    try { diffFiles = require("./api").getDiff(task.identifier || task.id).files; } catch {}
    const hasTests = diffFiles ? github.diffHasTests(diffFiles) : false;
    gates.push({ name: "tests", pass: hasTests, detail: hasTests ? "Tests in diff" : "No test files in diff" });
  }

  // Result: simple pass/fail counts
  const passed = gates.filter(g => g.pass).length;
  const total = gates.length;
  const allPass = gates.every(g => g.pass);
  const failing = gates.filter(g => !g.pass);

  let summary;
  if (allPass) {
    summary = `${passed}/${total} gates passing. Ready to merge.`;
  } else {
    summary = `${passed}/${total} gates passing:\n` +
      failing.map(g => `  - ${g.name}: ${g.detail}`).join("\n");
  }

  return { pass: allPass, passed, total, gates, summary };
}

function getGreptileStatusCheck(pr) {
  if (!pr?.statusCheckRollup) return null;
  const c = pr.statusCheckRollup.find(c =>
    (c.name || c.context || "").toLowerCase().includes("greptile")
  );
  if (!c) return null;
  if (c.conclusion === "SUCCESS" || c.status === "COMPLETED") return "success";
  if (c.conclusion === "FAILURE" || c.conclusion === "ERROR") return "failure";
  if (c.status === "IN_PROGRESS" || c.status === "QUEUED" || c.status === "PENDING") return "pending";
  return null;
}

module.exports = { check };
