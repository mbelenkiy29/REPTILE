// F05 The team gives feedback and REPTILE learns: the team's own review comments (second pass, after /replica-build).
// Webhooks go to the running server, signed with the e2e secret it was started with.
import { createHmac } from "node:crypto";
import { test, expect, login, seedId, expectAccessible } from "./fixtures";

const ACME_INSTALL = 51200871;
const ACME_API = 700000; // acme/api
const PR = 380;

async function reviewComment(request: import("@playwright/test").APIRequestContext, c: { id: number; body: string; association?: string; type?: string; pr?: number }) {
  const body = JSON.stringify({
    action: "created", installation: { id: ACME_INSTALL }, repository: { id: ACME_API }, pull_request: { number: c.pr ?? PR },
    comment: { id: c.id, body: c.body, path: "src/billing/invoice.ts", user: { login: "priya-r", type: c.type ?? "User" }, author_association: c.association ?? "MEMBER" },
  });
  const res = await request.post("/api/webhooks/github", {
    data: body,
    headers: {
      "content-type": "application/json", "x-github-event": "pull_request_review_comment", "x-github-delivery": `e2e-${c.id}-${Date.now()}`,
      "x-hub-signature-256": `sha256=${createHmac("sha256", "e2e-webhook-secret").update(body).digest("hex")}`,
    },
  });
  return { status: res.status(), result: (await res.json()).result as string };
}

test.describe("F05 learning from the team's review comments", () => {
  test("F05-H3 a teammate's comment is kept; F05-E3 a redelivery isn't kept twice", async ({ request, sql }) => {
    const id = 880_000 + (Date.now() % 10_000);
    const text = "Money is integer cents in this service; a float here drifts invoices by a penny.";
    expect(await reviewComment(request, { id, body: text })).toEqual({ status: 202, result: "human comment recorded" });
    expect((await reviewComment(request, { id, body: text })).result).toBe("human comment recorded");
    const rows = await sql`select kind, finding_id, file_path, body from feedback where provider_id = ${id}`;
    expect(rows).toEqual([{ kind: "human_comment", finding_id: null, file_path: "src/billing/invoice.ts", body: text }]);
  });

  test("F05-E2 outsiders', bots' and one-word comments aren't kept", async ({ request, sql }) => {
    const base = 890_000 + (Date.now() % 10_000);
    const long = "This should really use the shared money helper instead of floats.";
    expect((await reviewComment(request, { id: base, body: long, association: "NONE" })).result).toBe("not a collaborator");
    expect((await reviewComment(request, { id: base + 1, body: long, type: "Bot" })).result).toBe("ignored");
    expect((await reviewComment(request, { id: base + 2, body: "lgtm" })).result).toBe("too short to learn from");
    expect((await sql`select count(*)::int as n from feedback where provider_id between ${base} and ${base + 2}`)[0].n).toBe(0);
  });

  test("F05-E4 a comment on a PR REPTILE hasn't seen yet is skipped, not an error", async ({ request }) => {
    const r = await reviewComment(request, { id: 899_999, body: "Please keep amounts in cents everywhere in this module.", pr: 99_999 });
    expect(r).toEqual({ status: 202, result: "pull request unknown" });
  });

  test("F05-E6 a rule suggested from comments shows its evidence as text, linked to the PR", async ({ page, sql }) => {
    const marker = `Evidence${Date.now() % 1e5}`;
    const excerpt = `Reviewer comment on src/a.ts: "<img src=x onerror=window.__xss=1> Ünïcode 🦎 ${marker}"`;
    const [pr] = await sql`select url from pull_requests where org_id = ${seedId("o_acme")} and number = ${PR}`;
    await sql`insert into rules (org_id, text, kind, source, status, repo_ids, path_globs, evidence)
      values (${seedId("o_acme")}, ${`Store money as integer cents (${marker}).`}, 'rule', 'learned', 'suggested', '{}', '{}',
        ${sql.json([{ kind: "human_comment", url: pr.url, excerpt }])})`;
    await login(page, { next: "/rules?view=suggested" });
    const item = page.getByRole("listitem").filter({ hasText: marker }).first();
    await item.getByText(/Why this was suggested/).click();
    const link = item.getByRole("link", { name: new RegExp(marker) });
    await expect(link).toHaveAttribute("href", pr.url);
    await expect(link).toContainText("<img src=x");
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await expectAccessible(page);
  });
});
