// Deterministic stand-ins for tests and keyless local runs. No network.
import { createHash } from "node:crypto";
import type { Embedder, ReviewModel, ReviewRequest } from "./types";

/** Flags lines containing "BUG:" (P1 logic) or "SECRET" (P0 security) in added lines, so tests control findings. */
export class FakeReviewModel implements ReviewModel {
  calls: ReviewRequest[] = [];
  async review(req: ReviewRequest) {
    this.calls.push(req);
    const findings = [];
    for (const f of req.files) {
      let line = 0;
      for (const l of f.patch.split("\n")) {
        const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(l);
        if (h) { line = Number(h[1]) - 1; continue; }
        if (l.startsWith("-")) continue;
        line++;
        if (!l.startsWith("+")) continue;
        if (l.includes("BUG:")) findings.push({ file: f.path, line_start: line, line_end: line, severity: "P1" as const, type: "logic" as const, title: `Bug: ${l.split("BUG:")[1].trim()}`, body: "This line is marked as a bug.", suggestion: "// fixed", rule_index: null, confidence: 0.9 });
        if (l.includes("SECRET")) findings.push({ file: f.path, line_start: line, line_end: line, severity: "P0" as const, type: "security" as const, title: "Hard-coded secret", body: "A credential is committed in source.", suggestion: null, rule_index: req.rules.length ? 0 : null, confidence: 0.95 });
        if (l.includes("nit:")) findings.push({ file: f.path, line_start: line, line_end: line, severity: "P2" as const, type: "style" as const, title: "Style nit", body: "Minor style issue.", suggestion: null, rule_index: null, confidence: 0.4 });
      }
    }
    return { out: { findings, file_summaries: req.files.map((f) => ({ path: f.path, summary: `Changes ${f.path.split("/").pop()}` })) }, usage: { inputTokens: 1000, outputTokens: 200 } };
  }
  async summarize(req: Parameters<ReviewModel["summarize"]>[0]) {
    const worst = req.findings.some((f) => f.severity === "P0") ? 2 : req.findings.length ? 3 : 5;
    return { out: { summary: `${req.prTitle}.`, confidence: worst, verdict: worst === 5 ? "Safe to merge" : "Fix the issues before merging", diagram: null, checked: ["Error handling", "Secrets in code"] }, usage: { inputTokens: 300, outputTokens: 80 } };
  }
  async answer(req: Parameters<ReviewModel["answer"]>[0]) {
    return { text: `About "${req.finding.title}": the line can fail as described.`, usage: { inputTokens: 200, outputTokens: 40 } };
  }
  async proposeRules(req: Parameters<ReviewModel["proposeRules"]>[0]) {
    // Evidence about money in cents → a money rule citing it; anything else → the generic test-file rule.
    const cents = req.evidence.flatMap((e, i) => (/cents/i.test(e) ? [i] : []));
    const rules = cents.length >= 2
      ? [{ text: "Store money as integer cents, never floats.", path_globs: [], evidence_indexes: cents }]
      : req.evidence.length >= 2 ? [{ text: "Don't flag missing error handling in test files.", path_globs: ["**/*.test.ts"], evidence_indexes: [0, 1] }] : [];
    return { out: { rules }, usage: { inputTokens: 200, outputTokens: 50 } };
  }
}

/** Hash-based vectors: identical text → identical vector; similar text shares buckets. */
export class FakeEmbedder implements Embedder {
  readonly dimensions = 1024;
  async embed(texts: string[]) {
    return texts.map((t) => {
      const v = new Array(this.dimensions).fill(0);
      for (const w of t.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean)) {
        const h = createHash("md5").update(w).digest();
        v[h.readUInt16BE(0) % this.dimensions] += 1;
      }
      const n = Math.hypot(...v) || 1;
      return v.map((x) => x / n);
    });
  }
}
