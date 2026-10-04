import type { Embedder, ReviewModel } from "./types";

const g = globalThis as unknown as { __countersignModel?: ReviewModel; __countersignEmbedder?: Embedder };

/** REVIEW_FAKE_AI=1 is for keyless local runs only. On a public URL it would post made-up reviews, so refuse loudly. */
function fakeAi() {
  if (process.env.REVIEW_FAKE_AI !== "1") return false;
  if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(process.env.APP_URL ?? "")) {
    throw new Error("REVIEW_FAKE_AI is set but APP_URL isn't localhost. Remove REVIEW_FAKE_AI from this environment.");
  }
  return true;
}

/** Claude unless a test (or a keyless local run with REVIEW_FAKE_AI=1) swaps in the fake. */
export async function reviewModel(): Promise<ReviewModel> {
  if (g.__countersignModel) return g.__countersignModel;
  if (fakeAi()) {
    const { FakeReviewModel } = await import("./fake");
    return (g.__countersignModel = new FakeReviewModel());
  }
  const { ClaudeReviewModel } = await import("./claude");
  return (g.__countersignModel = new ClaudeReviewModel());
}

export async function embedder(): Promise<Embedder> {
  if (g.__countersignEmbedder) return g.__countersignEmbedder;
  if (fakeAi()) {
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
