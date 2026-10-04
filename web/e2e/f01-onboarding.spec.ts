// F01 Team admin onboards and gets a first review (dashboard side; the GitHub side is in worker/pipeline.test.ts).
import { test, expect, login, expectAccessible, expectNoHorizontalScroll, USERS } from "./fixtures";

test.describe("F01 onboarding", () => {
  test("F01-H1 sign in → new org → connect GitHub → link → repositories indexing", async ({ page, sql }) => {
    await page.goto("/repos");
    await expect(page).toHaveURL(/\/login\?next=%2Frepos$/);
    await expectAccessible(page);
    await login(page, { next: "/onboarding/new-org" });
    const name = `F01 Happy ${Date.now() % 1e6}`;
    await page.getByLabel("Organization name").fill(name);
    await page.getByRole("button", { name: "Create organization" }).click();
    await page.waitForURL("**/onboarding");
    await expectAccessible(page);
    await page.getByRole("link", { name: "Connect GitHub", exact: true }).click();
    await page.waitForURL("**/onboarding/link**");
    await expectAccessible(page);
    await page.getByLabel(/acme-labs/).click();
    await page.getByRole("button", { name: "Link and start indexing" }).click();
    await page.waitForURL(/\/repos\?linked=\d+$/);
    await expect(page.getByText("Account linked")).toBeVisible();
    await expectAccessible(page);
    const [org] = await sql`select id from organizations where name = ${name}`;
    const repos = await sql`select r.index_status from repositories r join installations i on i.id = r.installation_id where i.org_id = ${org.id}`;
    expect(repos.length).toBeGreaterThan(0);
  });

  test("F01-E1 empty and whitespace-only org names are refused", async ({ page, sql }) => {
    await login(page, { next: "/onboarding/new-org" });
    const before = (await sql`select count(*)::int as n from organizations`)[0].n;
    await page.getByRole("button", { name: "Create organization" }).click();
    // The browser's required check keeps the form from submitting.
    await expect(page).toHaveURL(/\/onboarding\/new-org$/);
    await page.getByLabel("Organization name").fill("   ");
    await page.getByRole("button", { name: "Create organization" }).click();
    await expect(page.getByText("Use 2 to 60 characters.")).toBeVisible();
    expect((await sql`select count(*)::int as n from organizations`)[0].n).toBe(before);
  });

  test("F01-E2 a 300-character name is capped by the field and refused by the server", async ({ page, sql }) => {
    await login(page, { next: "/onboarding/new-org" });
    const long = "x".repeat(300);
    await page.getByLabel("Organization name").fill(long);
    expect((await page.getByLabel("Organization name").inputValue()).length).toBe(60);
    // Bypass the maxlength attribute to check the server's own limit.
    await page.getByLabel("Organization name").evaluate((el: HTMLInputElement, v) => { el.removeAttribute("maxlength"); el.value = v; }, long);
    await page.getByRole("button", { name: "Create organization" }).click();
    await expect(page.getByText("Use 2 to 60 characters.")).toBeVisible();
    expect((await sql`select count(*)::int as n from organizations where length(name) > 60`)[0].n).toBe(0);
  });

  test("F01-E3 emoji and accents are kept exactly, the slug is URL-safe", async ({ page, sql }) => {
    await login(page, { next: "/onboarding/new-org" });
    const name = `Café 🦎 Ünïcode ${Date.now() % 1e5}`;
    await page.getByLabel("Organization name").fill(name);
    await page.getByRole("button", { name: "Create organization" }).click();
    await page.waitForURL("**/onboarding");
    const [org] = await sql`select name, slug from organizations where name = ${name}`;
    expect(org.name).toBe(name);
    expect(org.slug).toMatch(/^[a-z0-9-]+$/);
    await page.goto("/repos");
    await expect(page.getByRole("button", { name: /Switch organization/ })).toContainText("Café 🦎 Ünïcode");
  });

  test("F01-E4 double-clicking Create makes one org", async ({ page, sql }) => {
    await login(page, { next: "/onboarding/new-org" });
    const name = `Double ${Date.now() % 1e6}`;
    await page.getByLabel("Organization name").fill(name);
    await page.getByRole("button", { name: "Create organization" }).dblclick();
    await page.waitForURL("**/onboarding");
    await page.waitForTimeout(1000);
    expect((await sql`select count(*)::int as n from organizations where name = ${name}`)[0].n).toBe(1);
  });

  test("F01-E5 refresh and back on the link step don't link twice", async ({ page, sql }) => {
    await login(page, { next: "/onboarding/new-org" });
    const name = `Refresh ${Date.now() % 1e6}`;
    await page.getByLabel("Organization name").fill(name);
    await page.getByRole("button", { name: "Create organization" }).click();
    await page.waitForURL("**/onboarding");
    await page.getByRole("link", { name: "Connect GitHub", exact: true }).click();
    await page.waitForURL("**/onboarding/link**");
    await page.reload();
    await page.goBack();
    await page.goForward();
    await page.getByLabel(/jordanlee/).click();
    await page.getByRole("button", { name: "Link and start indexing" }).click();
    await page.waitForURL(/\/repos\?linked=\d+$/);
    await page.goBack();
    // Back on the link step after linking: submitting again must not create a second link.
    if (await page.getByRole("button", { name: "Link and start indexing" }).isVisible()) {
      await page.getByLabel(/jordanlee/).click().catch(() => {});
      await page.getByRole("button", { name: "Link and start indexing" }).click();
      await page.waitForLoadState("load");
    }
    const [org] = await sql`select id from organizations where name = ${name}`;
    expect((await sql`select count(*)::int as n from installations where org_id = ${org.id}`)[0].n).toBe(1);
  });

  test("F01-E7 a forged install state links nothing", async ({ page }) => {
    await login(page);
    await page.goto("/api/github/setup?installation_id=1&setup_action=install&state=forged.state");
    await expect(page).toHaveURL(/\/onboarding\?error=failed$/);
  });

  test("F01-E9 onboarding and repositories fit a 390px screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, { org: "o_side", next: "/onboarding" });
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);
    await page.goto("/repos");
    await login(page, { next: "/repos" });
    await expectNoHorizontalScroll(page);
    await expect(page.getByRole("switch").first()).toBeVisible();
  });

  test("F01-N1 every app route sends a signed-out visitor to sign in", async ({ page }) => {
    for (const path of ["/repos", "/reviews", "/rules", "/analytics", "/settings/members", "/settings/billing", "/onboarding"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login/);
    }
  });

  // Records whether the browser ever requested evil.example (the sandbox can't resolve it, so the navigation itself fails).
  const landedOn = async (page: import("@playwright/test").Page, url: string) => {
    let offsite = false;
    const seen = (r: import("@playwright/test").Request) => { if (new URL(r.url()).hostname.endsWith("evil.example")) offsite = true; };
    page.on("request", seen);
    await page.goto(url).catch(() => {});
    await page.waitForLoadState("load").catch(() => {});
    page.off("request", seen);
    return offsite ? "evil.example" : new URL(page.url().startsWith("http") ? page.url() : "http://localhost:3100").host;
  };
  const OFFSITE = ["//evil.example/x", "https://evil.example/", "/\\evil.example", "/\t/evil.example"];

  test("F01-N2 dev login won't redirect off-site", async ({ page }) => {
    for (const next of OFFSITE) {
      expect(await landedOn(page, `/api/dev/login?${new URLSearchParams({ email: USERS.jordan, next })}`), next).toBe("localhost:3100");
    }
  });

  test("F01-N2b the sign-in page won't send a signed-in user off-site", async ({ page }) => {
    await login(page);
    for (const next of OFFSITE) {
      expect(await landedOn(page, `/login?${new URLSearchParams({ next })}`), next).toBe("localhost:3100");
    }
  });

  test("F01-N3 a deleted session signs you out", async ({ page, context, sql }) => {
    await login(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const token = (await context.cookies()).find((c) => c.name === "authjs.session-token")!.value;
    await sql`delete from sessions where session_token = ${token}`;
    await page.goto("/repos");
    await expect(page).toHaveURL(/\/login/);
  });
});
