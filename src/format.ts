import type { Credits } from "./types.js";

export const IS_JSON = process.argv.includes("--json");

export function pad(s: string | number, n: number): string {
  return (String(s) + " ".repeat(n)).slice(0, n);
}

export function out(data: unknown): void {
  if (IS_JSON) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === "string") {
    console.log(data);
  } else if (data !== null && data !== undefined) {
    console.log(JSON.stringify(data, null, 2));
  }
}

export function table(headers: string[], rows: (string | number | null | undefined)[][]): void {
  if (IS_JSON) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => String(r[i] || "").length))
  );
  console.log(headers.map((h, i) => pad(h, widths[i] + 2)).join(""));
  console.log("-".repeat(widths.reduce((a, b) => a + b + 2, 0)));
  rows.forEach(r => {
    console.log(r.map((c, i) => pad(String(c || ""), widths[i] + 2)).join(""));
  });
}

export function credits(c: Credits | number | null | undefined): string {
  if (!c) return "0";
  if (typeof c === "number") return String(c);
  return `llm=${c.llm || 0} vm=${c.vm || 0}`;
}

export function section(title: string): void {
  if (!IS_JSON) {
    console.log(`\n${title}`);
    console.log("-".repeat(80));
  }
}
