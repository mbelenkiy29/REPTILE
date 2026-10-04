// Reproductions for bugs found by /replica-test. Open bugs are marked test.fail(): the suite stays green while the
// bug is there and goes red when it's fixed, so the marker gets removed. See replica/bugs.md.
import { test, expect, login, seedId, expectAccessible, USERS } from "./fixtures";

test("BUG-012 Fix all works for a PR whose review is older than the newest 200", async ({ page, sql }) => {
  const acme = seedId("o_acme");
  const [target] = await sql`select pull_request_id as id from reviews where id = ${seedId("rev_0")}`;
  const [other] = await sql`select id, head_sha from pull_requests where org_id = ${acme} and id <> ${target.id} limit 1`;
  // 201 newer completed reviews on another PR push the target's review out of the newest 200.
  await sql`insert into reviews (org_id, pull_request_id, head_sha, trigger, status, files_reviewed, checked, created_at, completed_at)
    select ${acme}, ${other.id}, ${other.head_sha}, 'manual', 'completed', '[]'::jsonb, '{}', now() + (g || ' seconds')::interval, now()
    from generate_series(1, 201) g`;
  try {
    await login(page, { next: `/fix/pr/${target.id}` });
    await expect(page.getByText("prompt.txt")).toBeVisible();
  } finally {
    await sql`delete from reviews where pull_request_id = ${other.id} and trigger = 'manual' and created_at > now()`;
  }
});

test("BUG-013 a fix link from GitHub works while another of your orgs is active", async ({ page, sql }) => {
  test.fail(true, "open: /fix pages only look in the active org");
  const [f] = await sql`select id from findings where org_id = ${seedId("o_acme")} limit 1`;
  await login(page, { email: USERS.jordan, org: "o_contoso", next: `/fix/${f.id}` });
  await expect(page.getByText("prompt.txt")).toBeVisible({ timeout: 3000 });
});

test("BUG-014 installing from GitHub's own page doesn't end on an error", async ({ page }) => {
  test.fail(true, "open: the setup callback without our state is treated as a failed install");
  await login(page, { org: "o_side" });
  await page.goto("/api/github/setup?installation_id=12345&setup_action=install");
  await expect(page).not.toHaveURL(/error=failed/, { timeout: 3000 });
});

test("BUG-015 loading and in-progress skeletons are announced properly (axe)", async ({ page, sql }) => {
  const [pr] = await sql`select id, head_sha from pull_requests where org_id = ${seedId("o_acme")} order by number desc limit 1`;
  await sql`update reviews set status = 'superseded' where pull_request_id = ${pr.id} and status in ('queued', 'running')`;
  const [r] = await sql`insert into reviews (org_id, pull_request_id, head_sha, trigger, status, files_reviewed, checked, started_at)
    values (${seedId("o_acme")}, ${pr.id}, ${pr.head_sha}, 'manual', 'running', '[]'::jsonb, '{}', now()) returning id`;
  try {
    await login(page, { next: `/reviews/${r.id}` });
    await expect(page.getByRole("status", { name: "Review in progress" })).toBeVisible();
    await expectAccessible(page);
  } finally {
    await sql`update reviews set status = 'failed' where id = ${r.id}`;
  }
});
