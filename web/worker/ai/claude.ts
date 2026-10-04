// Claude implementation of ReviewModel. Model claude-opus-5-5 throughout; effort tuned per call.
// Structured outputs (zod) for every call, streaming for long outputs, prompt caching on repository context,
// and server-side refusal fallbacks ("default") so a declined request is re-run instead of failing the review.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { ANSWER_SYSTEM, REVIEW_SYSTEM, RULES_SYSTEM, SUMMARY_SYSTEM, reviewUserContent } from "./prompts";
import { ReviewOut, RulesOut, SummaryOut, type ReviewModel, type Usage } from "./types";

const MODEL = process.env.REVIEW_MODEL ?? "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export class RefusedError extends Error {
  constructor(public category: string | null) {
    super("The model declined to review this change.");
    this.name = "RefusedError";
  }
}

export class ClaudeReviewModel implements ReviewModel {
  private client: Anthropic;
  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is missing");
    this.client = new Anthropic({ apiKey, maxRetries: 3, timeout: 10 * 60_000 });
  }

  private async structured<S extends z.ZodType>(opts: {
    system: string; effort: "low" | "medium" | "high" | "xhigh"; schema: S; maxTokens: number;
    stable?: string; volatile: string;
  }): Promise<{ out: z.infer<S>; usage: Usage }> {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (opts.stable) content.push({ type: "text", text: opts.stable, cache_control: { type: "ephemeral" } });
    content.push({ type: "text", text: opts.volatile });
    const stream = this.client.beta.messages.stream({
      model: MODEL,
      max_tokens: opts.maxTokens,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") throw new RefusedError(msg.stop_details?.category ?? null);
    if (msg.stop_reason === "max_tokens") throw new Error("The review was too long for one response.");
    const parsed = (msg as { parsed_output?: z.infer<S> | null }).parsed_output;
    if (!parsed) throw new Error("The model's response didn't match the expected format.");
    return { out: parsed, usage: { inputTokens: msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0), outputTokens: msg.usage.output_tokens } };
  }

  async review(req: Parameters<ReviewModel["review"]>[0]) {
    const { stable, volatile } = reviewUserContent(req);
    return this.structured({ system: REVIEW_SYSTEM, effort: "high", schema: ReviewOut, maxTokens: 64_000, stable, volatile });
  }

  async summarize(req: Parameters<ReviewModel["summarize"]>[0]) {
    const volatile = [
      `Repository: ${req.repo}`, `Pull request: ${req.prTitle}`, req.prBody ? `Description:\n${req.prBody.slice(0, 4000)}` : "",
      `Files:\n${req.fileSummaries.map((f) => `- ${f.path}: ${f.summary}`).join("\n")}`,
      `Findings:\n${req.findings.length ? req.findings.map((f) => `- ${f.severity} ${f.title} (${f.file})`).join("\n") : "(none)"}`,
    ].filter(Boolean).join("\n\n");
    return this.structured({ system: SUMMARY_SYSTEM, effort: "low", schema: SummaryOut, maxTokens: 8_000, volatile });
  }

  async answer(req: Parameters<ReviewModel["answer"]>[0]) {
    const msg = await this.client.beta.messages.create({
      model: MODEL, max_tokens: 4_000, betas: [FALLBACK_BETA], fallbacks: "default", thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: ANSWER_SYSTEM,
      messages: [{ role: "user", content: `Repository: ${req.repo}\nYour comment on ${req.finding.file}:${req.finding.line}: ${req.finding.title}\n${req.finding.body}\n\n${req.code ? `Code:\n${req.code}\n\n` : ""}Their question:\n${req.question}` }],
    });
    if (msg.stop_reason === "refusal") throw new RefusedError(msg.stop_details?.category ?? null);
    const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
    return { text, usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens } };
  }

  async proposeRules(req: Parameters<ReviewModel["proposeRules"]>[0]) {
    const volatile = `Existing rules:\n${req.existing.map((r) => `- ${r}`).join("\n") || "(none)"}\n\nEvidence:\n${req.evidence.map((e, i) => `${i}. ${e}`).join("\n")}`;
    return this.structured({ system: RULES_SYSTEM, effort: "medium", schema: RulesOut, maxTokens: 8_000, volatile });
  }
}
