// Shared fixtures: every page fails its test on a console error, an uncaught page error or any 5xx response.
import { createHash } from "node:crypto";
import { test as base, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";

/** Same as src/db/ids.ts: the UUID the seed gives "r_api", "o_acme", ... */
export function seedId(key: string) {
  const h = createHash("sha1").update(`reptile-seed:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");

export const USERS = {
  jordan: "jordan@acme.dev", // admin of Acme and Side project, member of Contoso
  mateo: "mateo@acme.dev", // member of Acme
  lena: "lena@contoso.dev", // admin of Contoso only
} as const;

/** Sign in through the dev-login route (AUTH_DEV_LOGIN=1), choosing the active org. */
export async function login(page: Page, { email = USERS.jordan, org = "o_acme", next = "/repos" }: { email?: string; org?: string; next?: string } = {}) {
  const q = new URLSearchParams({ email, next, org: seedId(org) });
  await page.goto(`/api/dev/login?${q}`);
}

/** axe, WCAG 2.2 AA. */
export async function expectAccessible(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);
}

export const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text }).first();

type Fixtures = { sql: postgres.Sql; problems: string[]; allowProblems: (re: RegExp) => void };

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  sql: async ({}, use) => {
    const sql = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {} });
    await use(sql);
    await sql.end();
  },
  problems: async ({ page }, use) => {
    const problems: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("response", (r) => { if (r.status() >= 500) problems.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
    await use(problems);
  },
  allowProblems: async ({ problems }, use) => {
    const allowed: RegExp[] = [];
    await use((re) => allowed.push(re));
    const left = problems.filter((p) => !allowed.some((re) => re.test(p)));
    expect(left, "console errors, page errors and 5xx responses").toEqual([]);
  },
});

// Make the guard run for every test that has a page, even if the test doesn't ask for allowProblems.
test.beforeEach(async ({ allowProblems }) => { void allowProblems; });

export { expect };
