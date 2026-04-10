"use strict";
const { execFileSync } = require("child_process");

function gh(args, opts = {}) {
  try {
    return JSON.parse(execFileSync("gh", args, {
      encoding: "utf8",
      timeout: opts.timeout || 15000,
      maxBuffer: 5 * 1024 * 1024,
    }));
  } catch {
    return null;
  }
}

function getPR(repo, number) {
  return gh(["pr", "view", String(number), "--repo", repo, "--json",
    "state,mergeable,mergedAt,closedAt,headRefName,baseRefName,title,body,url,number,additions,deletions,changedFiles,reviewDecision,statusCheckRollup,reviews,comments"]);
}

function getPRReviewComments(repo, number) {
  // get inline review comments (the ones that reference specific lines)
  try {
    const out = execFileSync("gh", ["api", `repos/${repo}/pulls/${number}/comments`, "--paginate"], {
      encoding: "utf8", timeout: 15000, maxBuffer: 5 * 1024 * 1024,
    });
    return JSON.parse(out);
  } catch { return []; }
}

function getPRIssueComments(repo, number) {
  // get top-level PR comments (where Greptile posts its summary)
  try {
    const out = execFileSync("gh", ["api", `repos/${repo}/issues/${number}/comments`, "--paginate"], {
      encoding: "utf8", timeout: 15000, maxBuffer: 5 * 1024 * 1024,
    });
    return JSON.parse(out);
  } catch { return []; }
}

function getCIStatus(repo, number, prData) {
  const pr = prData || getPR(repo, number);
  if (!pr) return null;
  const checks = pr.statusCheckRollup || [];
  const total = checks.length;
  const passing = checks.filter(c =>
    c.conclusion === "SUCCESS" || c.conclusion === "NEUTRAL" || c.status === "COMPLETED"
  ).length;
  const failing = checks.filter(c =>
    c.conclusion === "FAILURE" || c.conclusion === "ERROR" || c.conclusion === "TIMED_OUT"
  );
  const pending = checks.filter(c =>
    c.status === "IN_PROGRESS" || c.status === "QUEUED" || c.status === "PENDING"
  );
  return {
    total,
    passing,
    failing: failing.map(c => ({ name: c.name || c.context, conclusion: c.conclusion })),
    pending: pending.map(c => ({ name: c.name || c.context, status: c.status })),
    allGreen: total > 0 && failing.length === 0 && pending.length === 0,
    noChecks: total === 0,
  };
}

// Parse Greptile review from PR comments
function parseGreptileReview(comments) {
  const greptile = comments.find(c =>
    (c.user?.login || "").toLowerCase().includes("greptile") ||
    (c.body || "").includes("Confidence Score")
  );
  if (!greptile) return null;

  const body = greptile.body || "";
  const scoreMatch = body.match(/(?:Confidence\s*Score|confidence)[:\s]*(\d(?:\.\d)?)\s*\/\s*5/i);
  const score = scoreMatch ? parseFloat(scoreMatch[1]) : null;

  // count issue types
  const logicCount = (body.match(/\bLogic\b/gi) || []).length;
  const syntaxCount = (body.match(/\bSyntax\b/gi) || []).length;
  const styleCount = (body.match(/\bStyle\b/gi) || []).length;

  return {
    score,
    issueCount: logicCount + syntaxCount + styleCount,
    logic: logicCount,
    syntax: syntaxCount,
    style: styleCount,
    body: body.slice(0, 2000),
    url: greptile.html_url,
  };
}

// Check if diff includes test files
function diffHasTests(files) {
  if (!files) return false;
  return files.some(f => {
    const p = (f.path || f.filename || "").toLowerCase();
    return p.includes("test") || p.includes("spec") || p.includes("__tests__") ||
           p.endsWith(".test.ts") || p.endsWith(".test.js") || p.endsWith("_test.go") ||
           p.endsWith(".spec.ts") || p.endsWith(".spec.js");
  });
}

// Get unresolved review threads
function getUnresolvedThreads(repo, number) {
  // use GraphQL for thread resolution status
  try {
    const query = `query { repository(owner:"${repo.split("/")[0]}", name:"${repo.split("/")[1]}") { pullRequest(number:${number}) { reviewThreads(first:100) { nodes { isResolved isOutdated comments(first:1) { nodes { body author { login } } } } } } } }`;
    const out = execFileSync("gh", ["api", "graphql", "-f", `query=${query}`], {
      encoding: "utf8", timeout: 15000,
    });
    const data = JSON.parse(out);
    const threads = data?.data?.repository?.pullRequest?.reviewThreads?.nodes || [];
    return threads.filter(t => !t.isResolved && !t.isOutdated).map(t => ({
      body: t.comments?.nodes?.[0]?.body?.slice(0, 200) || "",
      author: t.comments?.nodes?.[0]?.author?.login || "unknown",
    }));
  } catch { return []; }
}

module.exports = {
  gh, getPR, getPRReviewComments, getPRIssueComments, getCIStatus,
  parseGreptileReview, diffHasTests, getUnresolvedThreads,
};
