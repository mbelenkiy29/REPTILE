// What the review pipeline asks of a model. Claude implements it (claude.ts); tests use fake.ts.
import { z } from "zod";

export const FindingOut = z.object({
  file: z.string().describe("Path of the changed file the issue is in, exactly as given."),
  line_start: z.number().int().describe("First line of the issue in the NEW version of the file."),
  line_end: z.number().int().describe("Last line of the issue in the NEW version of the file."),
  severity: z.enum(["P0", "P1", "P2"]).describe("P0: breaks production, loses or leaks data, security hole. P1: a real bug or risk users will hit. P2: worth fixing, low impact."),
  type: z.enum(["logic", "syntax", "style", "security"]),
  title: z.string().describe("One short line naming the problem."),
  body: z.string().describe("Why it's a problem and what happens, in 1-3 sentences. Markdown allowed."),
  suggestion: z.string().nullable().describe("Replacement text for exactly lines line_start..line_end, or null when a fix isn't a direct replacement."),
  rule_index: z.number().int().nullable().describe("Index of the team rule this violates, or null."),
  confidence: z.number().describe("0 to 1: how sure you are this is a real problem."),
});
export type FindingOut = z.infer<typeof FindingOut>;

export const ReviewOut = z.object({
  findings: z.array(FindingOut),
  file_summaries: z.array(z.object({ path: z.string(), summary: z.string().describe("What changed in this file, in under 12 words.") })),
});
export type ReviewOut = z.infer<typeof ReviewOut>;

export const SummaryOut = z.object({
  summary: z.string().describe("What the pull request does and where the risk is, in 2-3 plain sentences."),
  confidence: z.number().int().describe("1-5: how safe this is to merge as is. 5 = safe, 1 = do not merge."),
  verdict: z.string().describe("One short line, like 'Safe to merge' or 'Fix the critical issue before merging'."),
  diagram: z.string().nullable().describe("A mermaid sequenceDiagram of the main flow the change touches, or null if there is no meaningful flow."),
  checked: z.array(z.string()).describe("3-5 short phrases naming what you checked."),
});
export type SummaryOut = z.infer<typeof SummaryOut>;

export const RulesOut = z.object({
  rules: z.array(z.object({
    text: z.string().describe("The convention, as a plain-English instruction to a reviewer."),
    path_globs: z.array(z.string()),
    evidence_indexes: z.array(z.number().int()),
  })),
});
export type RulesOut = z.infer<typeof RulesOut>;

export interface ReviewFileInput {
  path: string;
  status: string;
  patch: string;
  content: string | null;
}

export interface ReviewRequest {
  repo: string;
  prTitle: string;
  prBody: string | null;
  rules: string[];
  repoGuides: { path: string; text: string }[];
  context: { path: string; startLine: number; endLine: number; content: string }[];
  files: ReviewFileInput[];
}

export interface Usage { inputTokens: number; outputTokens: number }

export interface ReviewModel {
  review(req: ReviewRequest): Promise<{ out: ReviewOut; usage: Usage }>;
  summarize(req: { repo: string; prTitle: string; prBody: string | null; fileSummaries: { path: string; summary: string }[]; findings: { severity: string; title: string; file: string }[] }): Promise<{ out: SummaryOut; usage: Usage }>;
  answer(req: { repo: string; question: string; finding: { title: string; body: string; file: string; line: number }; code: string | null }): Promise<{ text: string; usage: Usage }>;
  proposeRules(req: { evidence: string[]; existing: string[] }): Promise<{ out: RulesOut; usage: Usage }>;
}

export interface Embedder {
  readonly dimensions: number;
  embed(texts: string[], kind: "document" | "query"): Promise<number[][]>;
}
