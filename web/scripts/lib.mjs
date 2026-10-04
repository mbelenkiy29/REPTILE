// Shared helpers for the browser scripts.
import { createHash } from "node:crypto";

/** Same as src/db/ids.ts: the UUID the seed gives "r_api", "o_acme", ... */
export function seedId(key) {
  const h = createHash("sha1").update(`reptile-seed:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const EMAIL = { jordan: "jordan@acme.dev", lena: "lena@contoso.dev" };

/** Sign in through the local dev-login route (AUTH_DEV_LOGIN=1), optionally choosing an org. */
export async function devLogin(page, base, { email = EMAIL.jordan, org, next = "/repos" } = {}) {
  const q = new URLSearchParams({ email, next, ...(org ? { org: seedId(org) } : {}) });
  await page.goto(`${base}/api/dev/login?${q}`);
}

/** Reload the seed data from the dev panel; it signs back in as the demo user. */
export async function resetSeed(page) {
  // The reset signs back in through /api/dev/login; wait for that, not for /repos (we may already be there).
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/dev/login"), { timeout: 30_000 }),
    page.getByRole("button", { name: "Reset seed data" }).click(),
  ]);
  await page.waitForURL("**/repos");
  await page.waitForLoadState("load");
}
