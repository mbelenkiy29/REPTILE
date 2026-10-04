// Error tracking stays off without a DSN, and reports handled errors with tags when it's on.
import { afterEach, describe, expect, it, vi } from "vitest";

const captured: unknown[][] = [];
vi.mock("@sentry/node", () => ({ captureException: (...a: unknown[]) => { captured.push(a); } }));
const { errorTrackingEnabled, reportError, sentryOptions } = await import("./observability");

describe("observability", () => {
  const saved = process.env.SENTRY_DSN;
  afterEach(() => { process.env.SENTRY_DSN = saved; captured.length = 0; });

  it("reports nothing when SENTRY_DSN isn't set", () => {
    delete process.env.SENTRY_DSN;
    expect(errorTrackingEnabled()).toBe(false);
    reportError(new Error("x"), { queue: "review-pr" });
    expect(captured).toHaveLength(0);
  });

  it("reports handled errors with tags, and never sends personal data", () => {
    process.env.SENTRY_DSN = "https://key@o0.ingest.example/1";
    const e = new Error("boom");
    reportError(e, { queue: "review-pr" });
    expect(captured).toEqual([[e, { tags: { queue: "review-pr" } }]]);
    expect(sentryOptions()).toMatchObject({ sendDefaultPii: false, tracesSampleRate: 0 });
  });
});
