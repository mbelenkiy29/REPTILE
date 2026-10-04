// F08 analytics (S10) and F09 members, invites, billing and API keys (S12, S13, S15).
import { randomBytes } from "node:crypto";
import { test, expect, login, seedId, sha256, expectAccessible, toast, USERS } from "./fixtures";

test.describe("F08 analytics", () => {
  test("F08-H1 period and repository filters update the page and the URL", async ({ page }) => {
    await login(page, { next: "/analytics" });
    await expectAccessible(page);
    await page.getByRole("combobox", { name: "Period" }).click();
    await page.getByRole("option", { name: "Last 90 days" }).click();
    await page.waitForURL(/days=90/);
    await page.getByRole("combobox", { name: "Repository" }).click();
    await page.getByRole("option", { name: "acme/api" }).click();
    await page.waitForURL(/repo=/);
    await expect(page.getByText("Pull requests reviewed")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/NaN|Infinity|undefined/);
  });

  test("F08-H2 / F08-N1 the CSV holds only this org's days and needs a session", async ({ page, request }) => {
    await login(page, { next: "/analytics" });
    const res = await page.request.get("/analytics/export?days=30");
    expect(res.status()).toBe(200);
    const csv = await res.text();
    expect(csv.split("\n")[0]).toBe("date,reviews,p0,p1,p2");
    expect(csv.trim().split("\n")).toHaveLength(31);
    for (const line of csv.trim().split("\n").slice(1)) expect(line).toMatch(/^\d{4}-\d{2}-\d{2}(,\d+){4}$/);
    const anon = await request.get("/analytics/export?days=30", { maxRedirects: 0 });
    expect([302, 303, 307, 308, 401]).toContain(anon.status());
  });

  test("F08-E1 an org with no reviews shows an empty state, not NaN", async ({ page }) => {
    await login(page, { org: "o_side", next: "/analytics" });
    await expect(page.locator("body")).not.toContainText(/NaN|Infinity|undefined/);
    await expectAccessible(page);
  });

  test("F08-E2 a deleted repository's filter doesn't break the page", async ({ page }) => {
    await login(page, { next: `/analytics?repo=${seedId("r_contoso")}` });
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    await page.goto("/analytics?repo=not-a-uuid&days=7");
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
  });
});

test.describe("F09 members and invites", () => {
  test("F09-H1 invite → listed as pending → cancelled", async ({ page, sql }) => {
    await login(page, { next: "/settings/members" });
    await expectAccessible(page);
    const email = `pat${Date.now() % 1e6}@acme.dev`;
    await page.getByRole("button", { name: "Invite", exact: true }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send invite" }).click();
    await expect(toast(page, `Invite sent to ${email}`)).toBeVisible();
    await page.getByRole("listitem").filter({ hasText: email }).getByRole("button", { name: "Cancel invite" }).click();
    await expect(toast(page, `Invite for ${email} cancelled`)).toBeVisible();
    expect((await sql`select count(*)::int as n from invites where email = ${email} and accepted_at is null`)[0].n).toBe(0);
  });

  test("F09-E1 invalid, member and duplicate emails are refused", async ({ page }) => {
    await login(page, { next: "/settings/members" });
    await page.getByRole("button", { name: "Invite", exact: true }).click();
    for (const [email, msg] of [["a@b", /valid email|email address/i], ["mateo@acme.dev", /already/i], ["new.hire@acme.dev", /already has an open invite/i]] as const) {
      await page.getByLabel("Email").fill(email);
      await page.getByRole("button", { name: "Send invite" }).click();
      await expect(page.getByRole("dialog").getByText(msg).first(), email).toBeVisible();
    }
  });

  test("F09-H2 change a role, then remove a member", async ({ page, sql }) => {
    await login(page, { next: "/settings/members" });
    await page.getByRole("combobox", { name: "Role for Ada Okafor" }).click();
    await page.getByRole("option", { name: "Admin" }).click();
    await expect(toast(page, "Ada Okafor is now an admin")).toBeVisible();
    await page.getByRole("button", { name: "Actions for Sam Wu" }).click();
    await page.getByRole("menuitem", { name: "Remove from organization" }).click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(toast(page, "Sam Wu removed")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Sam Wu")).toHaveCount(0);
    const [{ n }] = await sql`select count(*)::int as n from memberships m join users u on u.id = m.user_id where u.email = 'sam@acme.dev' and m.org_id = ${seedId("o_acme")}`;
    expect(n).toBe(0);
  });

  test("F09-E2 the only admin can't demote themselves", async ({ page }) => {
    await login(page, { org: "o_side", next: "/settings/members" });
    await expect(page.getByRole("row", { name: /Jordan Lee/ }).getByRole("cell", { name: "Admin", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: /Role for Jordan Lee/ })).toHaveCount(0);
  });

  test("F09-H3 / F09-N1 an invite works for its own email only, and only once", async ({ page, sql, browser }) => {
    const token = randomBytes(32).toString("base64url");
    const [inv] = await sql`insert into invites (org_id, email, role, token_hash, invited_by, expires_at)
      select ${seedId("o_contoso")}, 'mateo@acme.dev', 'member', ${sha256(token)}, ${seedId("u_lena")}, now() + interval '7 days' returning id`;
    // Wrong person.
    await login(page, { email: USERS.jordan, next: `/invite/${token}` });
    await page.getByRole("button", { name: "Accept and join" }).click();
    await expect(page.getByText("Couldn't accept the invite")).toBeVisible();
    // Right person.
    const mateo = await (await browser.newContext()).newPage();
    await login(mateo, { email: USERS.mateo, next: `/invite/${token}` });
    await expect(mateo.getByRole("heading", { name: "Join Contoso" })).toBeVisible();
    await mateo.getByRole("button", { name: "Accept and join" }).click();
    await mateo.waitForURL(/\/repos/);
    const [{ n }] = await sql`select count(*)::int as n from memberships m join users u on u.id = m.user_id where u.email = 'mateo@acme.dev' and m.org_id = ${seedId("o_contoso")}`;
    expect(n).toBe(1);
    // Used.
    await mateo.goto(`/invite/${token}`);
    await expect(mateo.getByText("This invite link doesn't work")).toBeVisible();
    await mateo.context().close();
    void inv;
  });

  test("F09-N3 a member sees no admin controls on members, billing, API keys", async ({ page }) => {
    await login(page, { email: USERS.mateo, next: "/settings/members" });
    await expect(page.getByRole("button", { name: "Invite", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Actions for/ })).toHaveCount(0);
    await page.goto("/settings/api-keys");
    await expect(page.getByRole("button", { name: "Create key" })).toHaveCount(0);
    await page.goto("/settings/billing");
    await expect(page.getByRole("button", { name: /Choose the Team plan|Manage billing/ })).toHaveCount(0);
  });
});

test.describe("F09 billing and API keys", () => {
  test("F09-E3 a trial org sees the days left and an upgrade button", async ({ page }) => {
    await login(page, { org: "o_side", next: "/settings/billing" });
    await expect(page.getByText(/Your trial ends/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose the Team plan" }).first()).toBeVisible();
    await expectAccessible(page);
  });

  test("F09-H5 trial over → continue on Free → one person, 50 reviews, invites off", async ({ page, sql }) => {
    await login(page, { next: "/onboarding/new-org" });
    const name = `Solo ${Date.now() % 1e6}`;
    await page.getByLabel("Organization name").fill(name);
    await page.getByRole("button", { name: "Create organization" }).click();
    await page.waitForURL("**/onboarding");
    await sql`update organizations set trial_ends_at = now() - interval '1 day' where name = ${name}`;
    await page.goto("/settings/billing");
    await expect(page.getByText("Your trial has ended")).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Continue on Free" }).click();
    await expect(toast(page, "You're on the Free plan")).toBeVisible();
    await expect(page.getByText("the Free plan is for one person")).toBeVisible();
    await expect(page.getByText("Your trial has ended")).toHaveCount(0);
    const [org] = await sql`select plan, billing_status from organizations where name = ${name}`;
    expect(org).toEqual({ plan: "free", billing_status: "none" });
    await page.goto("/settings/members");
    await expect(page.getByText("The Free plan is for one person")).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite", exact: true })).toHaveCount(0);
    await expectAccessible(page);
  });

  test("F09-E4 an org with teammates isn't offered Free when its subscription ends", async ({ page, sql }) => {
    await sql`update organizations set plan = 'free', billing_status = 'canceled' where id = ${seedId("o_contoso")}`;
    try {
      await login(page, { email: USERS.lena, org: "o_contoso", next: "/settings/billing" });
      await expect(page.getByText("The subscription is canceled")).toBeVisible();
      await expect(page.getByText(/needs the other members removed/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Continue on Free" })).toHaveCount(0);
    } finally {
      await sql`update organizations set plan = 'pro', billing_status = 'active' where id = ${seedId("o_contoso")}`;
    }
  });

  const usage = (sql: import("postgres").Sql, org: string, n: number) => sql`
    insert into usage_events (org_id, credits, period_start, billable)
    select ${seedId(org)}, 1, date_trunc('month', now() at time zone 'utc')::date, false from generate_series(1, ${n})`;
  const clearUsage = (sql: import("postgres").Sql, org: string) => sql`delete from usage_events where org_id = ${seedId(org)}`;

  test("F09-E5 Free with its 50 reviews used says reviews resume on the 1st, not that they're billed", async ({ page, sql }) => {
    await usage(sql, "o_solo", 52);
    try {
      await login(page, { org: "o_solo", next: "/settings/billing" });
      await expect(page.getByText("This month's 50 free reviews are used")).toBeVisible();
      await expect(page.getByText(/billed per review/)).toHaveCount(0);
      await expectAccessible(page);
    } finally { await clearUsage(sql, "o_solo"); }
  });

  test("F09-E6 a trial past 50 reviews isn't told it's being billed (trial reviews are free)", async ({ page, sql }) => {
    await usage(sql, "o_side", 55);
    try {
      await login(page, { org: "o_side", next: "/settings/billing" });
      await expect(page.getByRole("meter", { name: "Reviews" })).toBeVisible();
      await expect(page.getByText(/billed per review/)).toHaveCount(0);
    } finally { await clearUsage(sql, "o_side"); }
  });

  test("F09-E7 double-clicking Continue on Free works once, without an error", async ({ page, sql }) => {
    await login(page, { next: "/onboarding/new-org" });
    const name = `Double free ${Date.now() % 1e6}`;
    await page.getByLabel("Organization name").fill(name);
    await page.getByRole("button", { name: "Create organization" }).click();
    await page.waitForURL("**/onboarding");
    await sql`update organizations set trial_ends_at = now() - interval '1 day' where name = ${name}`;
    await page.goto("/settings/billing");
    await page.getByRole("button", { name: "Continue on Free" }).dblclick();
    await expect(toast(page, "You're on the Free plan")).toBeVisible();
    await expect(page.locator("[data-sonner-toast][data-type=error]")).toHaveCount(0);
  });

  test("F09-E8 a paying org isn't offered Free", async ({ page }) => {
    await login(page, { next: "/settings/billing" });
    await expect(page.getByRole("button", { name: "Continue on Free" })).toHaveCount(0);
  });

  test("F09-N5 an invite to a Free org tells the invitee what to do", async ({ page, sql }) => {
    const token = randomBytes(32).toString("base64url");
    await sql`insert into invites (org_id, email, role, token_hash, invited_by, expires_at)
      values (${seedId("o_solo")}, 'mateo@acme.dev', 'member', ${sha256(token)}, ${seedId("u_jordan")}, now() + interval '7 days')`;
    await login(page, { email: USERS.mateo, next: `/invite/${token}` });
    await page.getByRole("button", { name: "Accept and join" }).click();
    const alert = page.getByRole("alert").filter({ hasText: "Couldn't accept the invite" });
    await expect(alert).toContainText(/Free plan/);
    // Mateo can't choose a plan for Solo; the message should send him to whoever can.
    await expect(alert).not.toContainText("Choose the Team plan to invite teammates");
    await expect(alert).toContainText(/admin/i);
  });

  test("F09-H6 S15 shows API calls for this server", async ({ page }) => {
    await login(page, { next: "/settings/api-keys" });
    await expect(page.getByText("http://localhost:3100/api/v1/repositories")).toBeVisible();
    await expect(page.getByText(/countersign-cli|npm install/)).toHaveCount(0);
  });

  test("F09-H4 / F09-N4 a new API key reads the API until it's revoked", async ({ page, request }) => {
    expect((await request.get("/api/v1/repositories")).status()).toBe(401);
    expect((await request.get("/api/v1/repositories", { headers: { authorization: "Bearer csk_nope" } })).status()).toBe(401);
    await login(page, { next: "/settings/api-keys" });
    await page.getByRole("button", { name: "Create key" }).click();
    await page.getByLabel("Name").fill("e2e key");
    await page.getByRole("button", { name: "Create key" }).last().click();
    const secret = (await page.getByRole("dialog").locator("pre").innerText()).trim();
    await page.getByRole("button", { name: "I've saved it" }).click();
    const ok = await request.get("/api/v1/repositories", { headers: { authorization: `Bearer ${secret}` } });
    expect(ok.status()).toBe(200);
    const names = (await ok.json()).data.map((r: { full_name: string }) => r.full_name);
    expect(names).toContain("acme/api");
    expect(names).not.toContain("contoso/storefront");
    await page.getByRole("row", { name: /e2e key/ }).getByRole("button", { name: "Revoke" }).click();
    await page.getByRole("button", { name: "Revoke key" }).click();
    await expect(toast(page, "Key revoked")).toBeVisible();
    expect((await request.get("/api/v1/repositories", { headers: { authorization: `Bearer ${secret}` } })).status()).toBe(401);
  });
});
