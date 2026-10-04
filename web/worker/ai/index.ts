import type { Embedder, ReviewModel } from "./types";

const g = globalThis as unknown as { __countersignModel?: ReviewModel; __countersignEmbedder?: Embedder };

/** Claude unless a test (or a keyless local run with REVIEW_FAKE_AI=1) swaps in the fake. */
export async function reviewModel(): Promise<ReviewModel> {
  if (g.__countersignModel) return g.__countersignModel;
  if (process.env.REVIEW_FAKE_AI === "1") {
    const { FakeReviewModel } = await import("./fake");
    return (g.__countersignModel = new FakeReviewModel());
  }
  const { ClaudeReviewModel } = await import("./claude");
  return (g.__countersignModel = new ClaudeReviewModel());
}

export async function embedder(): Promise<Embedder> {
  if (g.__countersignEmbedder) return g.__countersignEmbedder;
  if (process.env.REVIEW_FAKE_AI === "1") {
    const { FakeEmbedder } = await import("./fake");
    return (g.__countersignEmbedder = new FakeEmbedder());
  }
  const { VoyageEmbedder } = await import("./embed");
  return (g.__countersignEmbedder = new VoyageEmbedder());
}

export function setAi(m: { model?: ReviewModel; embedder?: Embedder }) {
  if ("model" in m) g.__countersignModel = m.model;
  if ("embedder" in m) g.__countersignEmbedder = m.embedder;
}
