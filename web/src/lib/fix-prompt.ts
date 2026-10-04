import type { Finding } from "@/lib/data";

/** The prompt handed to a coding agent. Plain text so it pastes anywhere. */
export function fixPrompt(repo: string, prNumber: number, findings: Finding[]): string {
  const head = `Fix ${findings.length === 1 ? "this review finding" : `these ${findings.length} review findings`} in ${repo} (pull request #${prNumber}). Keep each change minimal and run the tests afterwards.`;
  const items = findings.map((f, i) =>
    [
      `${i + 1}. [${f.severity}] ${f.title}`,
      `   File: ${f.filePath} lines ${f.lineStart}-${f.lineEnd}`,
      `   Why: ${f.bodyMd.replace(/\s+/g, " ")}`,
      f.suggestion ? `   Suggested change:\n${f.suggestion.split("\n").map((l) => "     " + l).join("\n")}` : null,
    ].filter(Boolean).join("\n"),
  );
  return [head, "", ...items].join("\n");
}
