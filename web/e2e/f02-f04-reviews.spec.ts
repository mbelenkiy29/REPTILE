// F02 automatic review (dashboard view), F03 re-run, F04 fix prompts.
// The GitHub-side behaviour (webhooks → worker → comments) is covered by worker/pipeline.test.ts and github.test.ts.
import { createHmac } from "node:crypto";
import { test, expect, login, seedId, expectAccessible, toast, USERS } from "./fixtures";

const REVIEW = seedId("rev_0");

test.describe("F02 reviews in the dashboard", () => {
  test("F02-H2 history filters and review detail tabs", async ({ page }) => {
    await login(page, { next: "/reviews" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectAccessible(page);
    await page.goto("/reviews?status=completed");
    await expect(page.locator("table a").first()).toBeVisible();
    await page.locator("table a").first().click();
    await page.waitForURL(/\/reviews\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("tab", { name: /Findings/ })).toBeVisible();
    await expectAccessible(page);
    for (const tab of ["As posted on GitHub", "Details"]) {
      await page.getByRole("tab", { name: tab }).click();
      await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
      await expectAccessible(page);
    }
  });

  test("F02-E8 another org's admin gets a 404 for Acme's review, repo, finding and knowledge base", async ({ page }) => {
    await login(page, { email: USERS.lena, org: "o_contoso" });
    for (const path of [`/reviews/${REVIEW}`, `/repos/${seedId("r_api")}`, `/knowledge/${seedId("r_api")}`, `/fix/pr/${seedId("pr_0")}`]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "We couldn't find that" }), path).toBeVisible();
      await expect(page.getByText(/Bulk import|acme\//i), path).toHaveCount(0);
    }
  });

  test("F02-E9 malformed ids are a 404 page, not an error", async ({ page }) => {
    await login(page);
    for (const path of ["/reviews/not-a-uuid", "/repos/123", "/fix/%27%3B--", "/knowledge/zzz"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBeLessThan(500);
      await expect(page.getByRole("heading", { name: "We couldn't find that" }), path).toBeVisible();
    }
  });

  test("F02-N1 the GitHub webhook refuses unsigned and forged deliveries", async ({ request }) => {
    const body = JSON.stringify({ action: "opened" });
    const headers = { "content-type": "application/json", "x-github-event": "pull_request", "x-github-delivery": `e2e-${Date.now()}` };
    expect((await request.post("/api/webhooks/github", { data: body, headers })).status()).toBe(401);
    const forged = `sha256=${createHmac("sha256", "not-the-secret").update(body).digest("hex")}`;
    expect((await request.post("/api/webhooks/github", { data: body, headers: { ...headers, "x-hub-signature-256": forged } })).status()).toBe(401);
    // Correctly signed with the server's secret (set when starting the server for e2e): accepted.
    const good = `sha256=${createHmac("sha256", "e2e-webhook-secret").update(body).digest("hex")}`;
    const res = await request.post("/api/webhooks/github", { data: body, headers: { ...headers, "x-hub-signature-256": good } });
    expect([202, 503]).toContain(res.status());
  });
});

test.describe("F03 run again", () => {
  test("F03-H1 / F03-E1 Run again queues one review, even when clicked twice", async ({ page, sql, browser }) => {
    await login(page, { next: "/reviews?status=completed" });
    await page.locator("table a").nth(1).click();
    await page.waitForURL(/\/reviews\/[0-9a-f-]{36}$/);
    const id = new URL(page.url()).pathname.split("/").pop()!;
    const [{ pull_request_id: prId }] = await sql`select pull_request_id from reviews where id = ${id}`;
    // A second tab clicks at the same moment.
    const other = await (await browser.newContext()).newPage();
    await login(other, { next: `/reviews/${id}` });
    await Promise.all([
      page.getByRole("button", { name: "Run again" }).click(),
      other.getByRole("button", { name: "Run again" }).click(),
    ]);
    await page.waitForURL((u) => !u.pathname.endsWith(id));
    const live = await sql`select count(*)::int as n from reviews where pull_request_id = ${prId} and status in ('queued', 'running')`;
    expect(live[0].n).toBeLessThanOrEqual(1);
    await expect(toast(other, /already running|Review queued/)).toBeVisible();
    await other.context().close();
    // The worker finishes it.
    await expect(page.getByRole("tab", { name: /Findings/ })).toBeVisible({ timeout: 45_000 });
  });

  test("F03-N1 a member can run a review again (by design) without errors", async ({ page }) => {
    await login(page, { email: USERS.mateo, next: "/reviews?status=completed" });
    await page.locator("table a").nth(2).click();
    await page.waitForURL(/\/reviews\/[0-9a-f-]{36}$/);
    await page.getByRole("button", { name: "Run again" }).click();
    await expect(toast(page, /Review queued|already running/)).toBeVisible();
  });
});

test.describe("F04 fix with your agent", () => {
  test("F04-H1 one finding → a prompt for that finding", async ({ page }) => {
    await login(page, { next: `/reviews/${REVIEW}` });
    const link = page.getByRole("link", { name: "Fix with your agent" }).first();
    await link.click();
    await page.waitForURL(/\/fix\/[0-9a-f-]{36}$/);
    await expect(page.getByText("prompt.txt")).toBeVisible();
    await expectAccessible(page);
  });

  test("F04-H2 Fix all → every open finding of the PR", async ({ page, sql }) => {
    await login(page, { next: `/reviews/${REVIEW}` });
    const [{ pull_request_id: prId }] = await sql`select pull_request_id from reviews where id = ${REVIEW}`;
    await page.goto(`/fix/pr/${prId}`);
    const prompt = await page.locator("pre").first().innerText();
    const open = await sql`select title from findings f where f.pull_request_id = ${prId} and f.status = 'open'`;
    for (const f of open) expect(prompt).toContain(f.title);
    await expectAccessible(page);
  });

  test("F04-N1 another org's finding is a 404", async ({ page, sql }) => {
    const [f] = await sql`select id from findings where org_id = ${seedId("o_acme")} limit 1`;
    await login(page, { email: USERS.lena, org: "o_contoso" });
    await page.goto(`/fix/${f.id}`);
    await expect(page.getByRole("heading", { name: "We couldn't find that" })).toBeVisible();
  });
});
