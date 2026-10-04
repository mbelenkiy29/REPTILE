import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, fileLayer, mergeConfig, toConfigFile, validateConfigText } from "./config";
import { shouldReview, type PrFacts } from "./should-review";
import { checkRunTitle, fingerprint, renderInlineComment, renderSummary, SUMMARY_MARKER } from "./markdown";
import type { Finding } from "@/lib/data/types";

const pr = (o: Partial<PrFacts> = {}): PrFacts => ({
  isDraft: false, authorLogin: "priya-r", baseBranch: "main", labels: [], changedFiles: ["src/a.ts"], trigger: "opened", ...o,
});

describe("mergeConfig", () => {
  it("applies layers lowest-first and replaces arrays", () => {
    const org = { ignorePatterns: ["dist/**"], strictness: 1 as const };
    const repo = fileLayer({ ignorePatterns: [], labels: ["review-me"] });
    const c = mergeConfig(DEFAULT_CONFIG, org, repo);
    expect(c.strictness).toBe(1);
    expect(c.ignorePatterns).toEqual([]);
    expect(c.includeLabels).toEqual(["review-me"]);
  });
  it("merges summary options key by key", () => {
    const c = mergeConfig(DEFAULT_CONFIG, fileLayer({ summary: { diagram: false } }));
    expect(c.summary).toEqual({ diagram: false, fileTable: true, confidence: true });
  });
  it("ignores undefined keys in a layer", () => {
    expect(mergeConfig(DEFAULT_CONFIG, { strictness: undefined }).strictness).toBe(2);
  });
  it("round-trips through the file format", () => {
    const c = { ...DEFAULT_CONFIG, includeLabels: ["x"], strictness: 3 as const };
    expect(mergeConfig(DEFAULT_CONFIG, fileLayer(toConfigFile(c)))).toEqual(c);
  });
});

describe("validateConfigText", () => {
  it("accepts a valid file", () => {
    const r = validateConfigText('{ "strictness": 3, "ignorePatterns": ["**/*.snap"] }');
    expect(r.ok).toBe(true);
  });
  it("reports bad JSON", () => {
    const r = validateConfigText('{ "strictness": 3, }');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0].message).toMatch(/valid JSON/);
  });
  it("reports unknown keys with a line number", () => {
    const r = validateConfigText('{\n  "strictness": 2,\n  "strictnes": 3\n}');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues[0].message).toMatch(/Unknown setting: strictnes/);
      expect(r.issues[0].line).toBe(3);
    }
  });
  it("rejects strictness out of range and empty comment types", () => {
    const r = validateConfigText('{ "strictness": 4, "commentTypes": [] }');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.path).sort()).toEqual(["commentTypes", "strictness"]);
  });
  it("rejects patterns with spaces", () => {
    const r = validateConfigText('{ "ignorePatterns": ["my file.ts"] }');
    expect(r.ok).toBe(false);
  });
  it("asks for input when empty", () => {
    expect(validateConfigText("  ").ok).toBe(false);
  });
});

describe("shouldReview", () => {
  it("skips drafts unless enabled, but a mention overrides", () => {
    expect(shouldReview(DEFAULT_CONFIG, pr({ isDraft: true }))).toEqual({ review: false, reason: "Draft pull request" });
    expect(shouldReview({ ...DEFAULT_CONFIG, reviewDrafts: true }, pr({ isDraft: true })).review).toBe(true);
    expect(shouldReview(DEFAULT_CONFIG, pr({ isDraft: true, trigger: "mention" })).review).toBe(true);
  });
  it("filters authors with globs", () => {
    const c = { ...DEFAULT_CONFIG, excludeAuthors: ["*[bot]"] };
    expect(shouldReview(c, pr({ authorLogin: "dependabot[bot]" })).review).toBe(false);
    expect(shouldReview({ ...DEFAULT_CONFIG, includeAuthors: ["priya-*"] }, pr()).review).toBe(true);
    expect(shouldReview({ ...DEFAULT_CONFIG, includeAuthors: ["sam*"] }, pr()).review).toBe(false);
  });
  it("filters base branches", () => {
    expect(shouldReview({ ...DEFAULT_CONFIG, includeBranches: ["release/*"] }, pr()).review).toBe(false);
    expect(shouldReview({ ...DEFAULT_CONFIG, includeBranches: ["release/*"] }, pr({ baseBranch: "release/2.1" })).review).toBe(true);
    expect(shouldReview({ ...DEFAULT_CONFIG, excludeBranches: ["main"] }, pr()).review).toBe(false);
  });
  it("handles labels both ways", () => {
    expect(shouldReview({ ...DEFAULT_CONFIG, includeLabels: ["review"] }, pr()).review).toBe(false);
    expect(shouldReview({ ...DEFAULT_CONFIG, includeLabels: ["review"] }, pr({ labels: ["Review"] })).review).toBe(true);
    expect(shouldReview({ ...DEFAULT_CONFIG, disabledLabels: ["no-review"] }, pr({ labels: ["no-review"] })).review).toBe(false);
  });
  it("drops ignored files and skips when nothing is left, even on a mention", () => {
    const c = { ...DEFAULT_CONFIG, ignorePatterns: ["**/*.lock", "dist/**"] };
    expect(shouldReview(c, pr({ changedFiles: ["yarn.lock", "src/a.ts"] }))).toEqual({ review: true, files: ["src/a.ts"] });
    expect(shouldReview(c, pr({ changedFiles: ["dist/x.js"], trigger: "mention" }))).toEqual({ review: false, reason: "Only ignored files changed" });
  });
});

const finding = (o: Partial<Finding> = {}): Finding => ({
  id: "f1", orgId: "o", pullRequestId: "p", firstReviewId: "r", lastSeenReviewId: "r", fingerprint: "x",
  filePath: "src/a.ts", lineStart: 10, lineEnd: 12, inDiff: true, severity: "P1", type: "logic",
  title: "Thing breaks", bodyMd: "Because.", suggestion: null, ruleId: null, status: "open", thumbsUp: 0, thumbsDown: 0,
  createdAt: "2026-01-01T00:00:00Z", ...o,
});
const review = { confidenceScore: 3 as const, verdict: "Safe to merge after the fixes below", summaryMd: "Adds retries.", diagramMermaid: "sequenceDiagram\n  A->>B: hi", filesReviewed: [{ path: "src/a.ts", summary: "Retry | backoff" }], checked: ["Retries"] };

describe("renderSummary", () => {
  it("leads with the marker, score and verdict, and sorts findings by severity", () => {
    const md = renderSummary({ review, findings: [finding({ id: "a", severity: "P2", title: "Minor" }), finding({ id: "b", severity: "P0", title: "Critical one" })] });
    expect(md.startsWith(SUMMARY_MARKER)).toBe(true);
    expect(md).toContain("### **3/5** · Safe to merge after the fixes below");
    expect(md.indexOf("Critical one")).toBeLessThan(md.indexOf("Minor"));
    expect(md).toContain("#### Findings (2, 1 critical)");
  });
  it("lists what was checked when there are no findings", () => {
    const md = renderSummary({ review, findings: [] });
    expect(md).toContain("#### No issues found");
    expect(md).toContain("- Retries");
  });
  it("separates findings outside the diff and hides closed ones", () => {
    const md = renderSummary({ review, findings: [finding({ inDiff: false, title: "Upstream bug" }), finding({ status: "addressed", title: "Gone" })] });
    expect(md).toContain("#### Outside the changed lines");
    expect(md).not.toContain("Gone");
  });
  it("escapes pipes in the file table and respects options", () => {
    const md = renderSummary({ review, findings: [], options: { diagram: false, fileTable: true, confidence: false } });
    expect(md).toContain("Retry \\| backoff");
    expect(md).not.toContain("```mermaid");
    expect(md).not.toContain("3/5");
  });
  it("links findings to their comments when given", () => {
    const md = renderSummary({ review, findings: [finding()], commentUrl: () => "https://x/c/1" });
    expect(md).toContain("[Thing breaks](https://x/c/1)");
  });
});

describe("inline comments and check runs", () => {
  it("renders a suggestion block", () => {
    const md = renderInlineComment(finding({ suggestion: "return 1;" }), "https://fix");
    expect(md).toContain("**P1** · Logic · Thing breaks");
    expect(md).toContain("```suggestion\nreturn 1;\n```");
    expect(md).toContain("[Fix with your agent](https://fix)");
  });
  it("is neutral with critical findings and success otherwise", () => {
    expect(checkRunTitle([finding({ severity: "P0" })])).toEqual({ title: "Countersign · 1 finding (1 critical)", conclusion: "neutral" });
    expect(checkRunTitle([finding(), finding({ id: "2" })]).conclusion).toBe("success");
    expect(checkRunTitle([]).title).toBe("Countersign · no issues found");
  });
  it("fingerprints ignore case, punctuation and line moves", () => {
    expect(fingerprint("a.ts", "Missing await!", "const x = f()")).toBe(fingerprint("a.ts", "missing await", "const x = f();"));
    expect(fingerprint("a.ts", "Missing await", "x")).not.toBe(fingerprint("b.ts", "Missing await", "x"));
  });
});
