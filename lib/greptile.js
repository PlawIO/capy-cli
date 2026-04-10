"use strict";
const { execFileSync } = require("child_process");
const config = require("./config");

const MCP_URL = "https://api.greptile.com/mcp";

// MCP JSON-RPC call to Greptile
function mcp(method, params) {
  const cfg = config.load();
  const apiKey = cfg.greptileApiKey || process.env.GREPTILE_API_KEY || "";
  if (!apiKey) {
    console.error("capy: GREPTILE_API_KEY not set. Run: capy config greptileApiKey <key>");
    process.exit(1);
  }

  const body = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/call",
    params: {
      name: method,
      arguments: params,
    },
  };

  const args = ["-s", "-X", "POST", MCP_URL,
    "-H", `Authorization: Bearer ${apiKey}`,
    "-H", "Content-Type: application/json",
    "-H", "Accept: application/json",
    "-d", JSON.stringify(body),
  ];

  const out = execFileSync("curl", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 30000 });
  try {
    const data = JSON.parse(out);
    if (data.error) {
      console.error(`greptile: ${data.error.message || JSON.stringify(data.error)}`);
      return null;
    }
    // MCP tools/call returns { result: { content: [{ type: "text", text: "..." }] } }
    if (data.result?.content) {
      const textPart = data.result.content.find(c => c.type === "text");
      if (textPart) {
        try { return JSON.parse(textPart.text); } catch { return textPart.text; }
      }
    }
    return data.result;
  } catch {
    console.error("greptile: bad response:", out.slice(0, 300));
    return null;
  }
}

// Trigger a fresh code review on a PR
function triggerReview(repo, prNumber, defaultBranch) {
  const [owner, name] = repo.split("/");
  return mcp("trigger_code_review", {
    name: repo,
    remote: "github",
    defaultBranch: defaultBranch || "main",
    prNumber: prNumber,
  });
}

// List code reviews for a PR
function listReviews(repo, prNumber) {
  return mcp("list_code_reviews", {
    name: repo,
    remote: "github",
    defaultBranch: "main",
    prNumber: prNumber,
    limit: 5,
  });
}

// Get a specific code review by ID
function getReview(reviewId) {
  return mcp("get_code_review", {
    codeReviewId: reviewId,
  });
}

// Get PR details with review analysis
function getPR(repo, prNumber, defaultBranch) {
  return mcp("get_merge_request", {
    name: repo,
    remote: "github",
    defaultBranch: defaultBranch || "main",
    prNumber: prNumber,
  });
}

// List PR comments with filters
function listComments(repo, prNumber, opts = {}) {
  const params = {
    name: repo,
    remote: "github",
    defaultBranch: opts.defaultBranch || "main",
    prNumber: prNumber,
  };
  if (opts.greptileOnly) params.greptileGenerated = true;
  if (opts.unaddressedOnly) params.addressed = false;
  return mcp("list_merge_request_comments", params);
}

// Poll until review completes (blocking, with timeout)
function waitForReview(reviewId, timeoutMs = 120000) {
  const start = Date.now();
  const interval = 5000;
  while (Date.now() - start < timeoutMs) {
    const review = getReview(reviewId);
    if (!review) return null;
    if (review.status === "COMPLETED") return review;
    if (review.status === "FAILED") return review;
    // sleep
    execFileSync("sleep", ["5"]);
  }
  return null;
}

// Full review flow: trigger -> wait -> return results
function freshReview(repo, prNumber, defaultBranch) {
  const trigger = triggerReview(repo, prNumber, defaultBranch);
  if (!trigger) return null;

  const reviewId = trigger.codeReviewId || trigger.id;
  if (!reviewId) return trigger;

  console.error(`greptile: review triggered (${reviewId}), waiting...`);
  const result = waitForReview(reviewId);
  return result;
}

// Get unaddressed comments (the ones that actually need fixing)
function getUnaddressedIssues(repo, prNumber, defaultBranch) {
  const comments = listComments(repo, prNumber, {
    defaultBranch,
    greptileOnly: true,
    unaddressedOnly: true,
  });
  if (!comments || !Array.isArray(comments)) return [];
  return comments.map(c => ({
    body: (c.body || "").slice(0, 200),
    file: c.path || c.file || "?",
    line: c.line || c.position || "?",
    hasSuggestion: !!c.hasSuggestion,
    suggestedCode: c.suggestedCode || null,
  }));
}

// Check if PR needs re-review (new commits since last review)
function needsReReview(repo, prNumber, defaultBranch) {
  const pr = getPR(repo, prNumber, defaultBranch);
  if (!pr) return null;
  return {
    hasNewCommits: !!pr.reviewAnalysis?.hasNewCommitsSinceReview,
    reviewCompleteness: pr.reviewAnalysis?.reviewCompleteness || "unknown",
  };
}

module.exports = {
  triggerReview, listReviews, getReview, getPR,
  listComments, waitForReview, freshReview,
  getUnaddressedIssues, needsReReview,
};
