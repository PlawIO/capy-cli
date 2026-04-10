"use strict";

const IS_JSON = process.argv.includes("--json");

function pad(s, n) { return (String(s) + " ".repeat(n)).slice(0, n); }

function out(data) {
  if (IS_JSON) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === "string") {
    console.log(data);
  } else if (data !== null && data !== undefined) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function table(headers, rows) {
  if (IS_JSON) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] || "").length)));
  console.log(headers.map((h, i) => pad(h, widths[i] + 2)).join(""));
  console.log("-".repeat(widths.reduce((a, b) => a + b + 2, 0)));
  rows.forEach(r => {
    console.log(r.map((c, i) => pad(String(c || ""), widths[i] + 2)).join(""));
  });
}

function credits(c) {
  if (!c) return "0";
  if (typeof c === "number") return String(c);
  return `llm=${c.llm || 0} vm=${c.vm || 0}`;
}

function section(title) {
  if (!IS_JSON) {
    console.log(`\n${title}`);
    console.log("-".repeat(80));
  }
}

module.exports = { pad, out, table, credits, section, IS_JSON };
