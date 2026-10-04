// The markdown Countersign posts on GitHub: the summary comment (S17), inline comments (S18)
// and the check run title (S19). Pure functions so the worker and the dashboard preview share them.
import type { Finding, Review, Severity } from "@/lib/data/types";

export const SUMMARY_MARKER = "<!-- countersign:summary -->";
const ORDER: Record<Severity, number> = { P0: 0, P1: 1, P2: 2 };
const WORD: Record<Severity, string> = { P0: "Critical", P1: "High", P2: "Medium" };
const TYPE: Record<Finding["type"], string> = { logic: "Logic", syntax: "Syntax", style: "Style", security: "Security" };

export function sortFindings(fs: Finding[]): Finding[] {
  return [...fs].sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.filePath.localeCompare(b.filePath) || a.lineStart - b.lineStart);
}

export interface SummaryInput {
  review: Pick<Review, "confidenceScore" | "verdict" | "summaryMd" | "diagramMermaid" | "filesReviewed" | "checked">;
  findings: Finding[];
  /** Link for each finding's inline comment, when it has been posted. */
  commentUrl?: (f: Finding) => string | undefined;
  fixAllUrl?: string;
  options?: { diagram: boolean; fileTable: boolean; confidence: boolean };
}

export function renderSummary({ review, findings, commentUrl, fixAllUrl, options }: SummaryInput): string {
  const opts = options ?? { diagram: true, fileTable: true, confidence: true };
  const open = sortFindings(findings.filter((f) => f.status === "open"));
  const inDiff = open.filter((f) => f.inDiff);
  const outside = open.filter((f) => !f.inDiff);
  const lines: string[] = [SUMMARY_MARKER];

  const head = [opts.confidence && review.confidenceScore ? `**${review.confidenceScore}/5**` : null, review.verdict].filter(Boolean).join(" · ");
  if (head) lines.push(`### ${head}`, "");
  if (review.summaryMd) lines.push(review.summaryMd, "");

  if (inDiff.length) {
    const p0 = inDiff.filter((f) => f.severity === "P0").length;
    lines.push(`#### Findings (${inDiff.length}${p0 ? `, ${p0} critical` : ""})`, "");
    for (const f of inDiff) {
      const where = `\`${f.filePath}:${f.lineStart}\``;
      const url = commentUrl?.(f);
      lines.push(`- **${f.severity}** ${WORD[f.severity]} · ${url ? `[${f.title}](${url})` : f.title} · ${where}`);
    }
    lines.push("");
  } else if (review.checked.length) {
    lines.push("#### No issues found", "", "What we checked:", ...review.checked.map((c) => `- ${c}`), "");
  }

  if (outside.length) {
    lines.push("#### Outside the changed lines", "", "These are in code this PR depends on but didn't change:", "");
    for (const f of outside) lines.push(`- **${f.severity}** ${f.title} · \`${f.filePath}:${f.lineStart}\``);
    lines.push("");
  }

  if (opts.fileTable && review.filesReviewed.length) {
    lines.push("<details><summary>Files reviewed</summary>", "", "| File | Change |", "| --- | --- |");
    for (const f of review.filesReviewed) lines.push(`| \`${f.path}\` | ${f.summary.replace(/\|/g, "\\|")} |`);
    lines.push("", "</details>", "");
  }
  if (opts.diagram && review.diagramMermaid) {
    lines.push("<details><summary>Sequence diagram</summary>", "", "```mermaid", review.diagramMermaid.trimEnd(), "```", "", "</details>", "");
  }
  if (fixAllUrl && open.length) lines.push(`[Fix all with your agent](${fixAllUrl}) · React 👍 or 👎 on any comment to tune future reviews`);
  return lines.join("\n").trimEnd() + "\n";
}

export function renderInlineComment(f: Finding, fixUrl?: string): string {
  const parts = [`**${f.severity}** · ${TYPE[f.type]} · ${f.title}`, "", f.bodyMd];
  if (f.suggestion) parts.push("", "```suggestion", f.suggestion, "```");
  parts.push("", [fixUrl ? `[Fix with your agent](${fixUrl})` : null, "React 👍 or 👎 to tune future reviews"].filter(Boolean).join(" · "));
  return parts.join("\n");
}

export function checkRunTitle(findings: Finding[]): { title: string; conclusion: "success" | "neutral" } {
  const open = findings.filter((f) => f.status === "open");
  const p0 = open.filter((f) => f.severity === "P0").length;
  if (!open.length) return { title: "Countersign · no issues found", conclusion: "success" };
  return {
    title: `Countersign · ${open.length} finding${open.length === 1 ? "" : "s"}${p0 ? ` (${p0} critical)` : ""}`,
    conclusion: p0 ? "neutral" : "success",
  };
}

/** Stable across reviews: path + normalised title + nearby code, never the line number. */
export function fingerprint(path: string, title: string, anchor: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const input = `${path}\u0000${norm(title)}\u0000${norm(anchor).slice(0, 120)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}
