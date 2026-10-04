// The keyless fake must never answer on a public URL.
import { afterEach, describe, expect, it } from "vitest";
import { embedder, reviewModel, setAi } from "./index";

describe("REVIEW_FAKE_AI", () => {
  const saved = { fake: process.env.REVIEW_FAKE_AI, url: process.env.APP_URL };
  afterEach(() => {
    process.env.REVIEW_FAKE_AI = saved.fake;
    process.env.APP_URL = saved.url;
    setAi({ model: undefined, embedder: undefined });
  });

  it("is refused when APP_URL is a public URL", async () => {
    process.env.REVIEW_FAKE_AI = "1";
    process.env.APP_URL = "https://countersign.example";
    setAi({ model: undefined, embedder: undefined });
    await expect(reviewModel()).rejects.toThrow(/Remove REVIEW_FAKE_AI/);
    await expect(embedder()).rejects.toThrow(/Remove REVIEW_FAKE_AI/);
  });

  it("works on localhost", async () => {
    process.env.REVIEW_FAKE_AI = "1";
    process.env.APP_URL = "http://localhost:3100";
    setAi({ model: undefined, embedder: undefined });
    expect((await reviewModel()).constructor.name).toBe("FakeReviewModel");
  });
});
