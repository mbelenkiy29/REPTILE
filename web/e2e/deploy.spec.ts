// What production monitoring relies on (replica/deploy.md).
import { expect, test } from "./fixtures";

test("D-1 /api/health answers 200 without signing in, for uptime checks", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(res.headers()["cache-control"]).toContain("no-store");
});
