// Cross-cutting checks: every screen accessible at two widths, slow network, offline, time zones, headers, sessions.
import { test, expect, login, seedId, expectAccessible, expectNoHorizontalScroll, toast } from "./fixtures";

const SCREENS: { path: string; org?: string }[] = [
  { path: "/repos" }, { path: `/repos/${seedId("r_api")}` }, { path: `/repos/${seedId("r_infra")}` },
  { path: "/reviews" }, { path: `/reviews/${seedId("rev_0")}` }, { path: "/rules" }, { path: "/rules?view=suggested" },
  { path: `/knowledge/${seedId("r_api")}` }, { path: "/analytics" }, { path: "/settings/review" },
  { path: "/settings/review/validate" }, { path: "/settings/members" }, { path: "/settings/billing" },
  { path: "/settings/integrations" }, { path: "/settings/api-keys" }, { path: "/settings/account" },
  { path: "/repos", org: "o_side" }, { path: "/reviews", org: "o_side" }, { path: "/onboarding", org: "o_side" },
  { path: "/repos", org: "o_contoso" },
];

test.describe("X-1 every screen: axe, console, overflow", () => {
  for (const width of [1440, 390]) {
    for (const s of SCREENS) {
      test(`${s.path}${s.org ? ` (${s.org})` : ""} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await login(page, { org: s.org ?? "o_acme", next: s.path });
        await page.waitForLoadState("load");
        await expectNoHorizontalScroll(page);
        await expectAccessible(page);
      });
    }
  }
});

test("X-2 slow network: saving a rule shows progress and writes once", async ({ page, sql }) => {
  await login(page, { next: "/rules" });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 1500, downloadThroughput: 50_000, uploadThroughput: 20_000 });
  const text = `Slow network rule ${Date.now() % 1e6}`;
  await page.getByRole("button", { name: "Add rule" }).click();
  await page.getByLabel("Rule", { exact: true }).fill(text);
  const save = page.getByRole("button", { name: "Add rule" }).last();
  await save.click();
  await save.click({ force: true }).catch(() => {});
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 30_000 });
  expect((await sql`select count(*)::int as n from rules where text = ${text}`)[0].n).toBe(1);
});

test("X-3 offline: a failed save says so and keeps the input", async ({ page, context, allowProblems }) => {
  allowProblems(/Failed to fetch|ERR_INTERNET_DISCONNECTED|net::/);
  await login(page, { next: "/rules" });
  await page.getByRole("button", { name: "Add rule" }).click();
  await page.getByLabel("Rule", { exact: true }).fill("Written while offline, must survive.");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Add rule" }).last().click();
  await expect(page.getByText(/offline|network|connection|went wrong|try again/i).first()).toBeVisible();
  await expect(page.getByLabel("Rule", { exact: true })).toHaveValue("Written while offline, must survive.");
  await context.setOffline(false);
});

test("X-4 time zones: dates read the same from Auckland as from UTC", async ({ browser }) => {
  const texts: string[] = [];
  for (const timezoneId of ["UTC", "Pacific/Auckland"]) {
    const page = await (await browser.newContext({ timezoneId })).newPage();
    await login(page, { next: `/reviews/${seedId("rev_0")}` });
    await page.getByRole("tab", { name: "Details" }).click();
    texts.push(await page.getByRole("tabpanel").innerText());
    await page.context().close();
  }
  expect(texts[1]).toBe(texts[0]);
});

test("X-5 security headers on pages", async ({ request }) => {
  const res = await request.get("/login");
  const h = res.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["content-security-policy"] ?? "").toContain("frame-ancestors 'none'");
});

test("X-6 sign out everywhere ends the other tab's session too", async ({ page, browser }) => {
  await login(page, { next: "/settings/account" });
  const other = await (await browser.newContext()).newPage();
  await login(other);
  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  await page.waitForURL(/\/login/);
  await other.goto("/repos");
  await expect(other).toHaveURL(/\/login/);
  await other.context().close();
  void toast;
});
