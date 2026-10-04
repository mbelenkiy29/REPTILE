import type { Embedder, ReviewModel } from "./types";

const g = globalThis as unknown as { __reptileModel?: ReviewModel; __reptileEmbedder?: Embedder };

/** Claude unless a test (or a keyless local run with REVIEW_FAKE_AI=1) swaps in the fake. */
export async function reviewModel(): Promise<ReviewModel> {
  if (g.__reptileModel) return g.__reptileModel;
  if (process.env.REVIEW_FAKE_AI === "1") {
    const { FakeReviewModel } = await import("./fake");
    return (g.__reptileModel = new FakeReviewModel());
  }
  const { ClaudeReviewModel } = await import("./claude");
  return (g.__reptileModel = new ClaudeReviewModel());
}

export async function embedder(): Promise<Embedder> {
  if (g.__reptileEmbedder) return g.__reptileEmbedder;
  if (process.env.REVIEW_FAKE_AI === "1") {
    const { FakeEmbedder } = await import("./fake");
    return (g.__reptileEmbedder = new FakeEmbedder());
  }
  const { VoyageEmbedder } = await import("./embed");
  return (g.__reptileEmbedder = new VoyageEmbedder());
}

export function setAi(m: { model?: ReviewModel; embedder?: Embedder }) {
  if ("model" in m) g.__reptileModel = m.model;
  if ("embedder" in m) g.__reptileEmbedder = m.embedder;
}
