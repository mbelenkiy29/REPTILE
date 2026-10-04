// What production monitoring relies on (replica/deploy.md).
import { expect, test } from "./fixtures";

test("D-1 /api/health answers 200 without signing in, for uptime checks", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(res.headers()["cache-control"]).toContain("no-store");
});

test("D-2 privacy policy and terms are public, linked from the landing page, and list every processor", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
  const table = page.getByRole("table");
  for (const p of ["GitHub", "Anthropic", "Voyage AI", "Neon", "Vercel", "Fly.io", "Stripe", "Resend", "Sentry"]) {
    await expect(table.getByText(p, { exact: false }).first()).toBeVisible();
  }
  await page.goto("/terms");
  await expect(page.getByRole("heading", { level: 1, name: "Terms of service" })).toBeVisible();
  await expect(page.getByText("We never charge per review", { exact: false })).toBeVisible();
});

test("D-3 the legal pages show the draft notice until a lawyer has reviewed them", async ({ page }) => {
  for (const path of ["/privacy", "/terms"]) {
    await page.goto(path);
    await expect(page.getByRole("note")).toContainText("Draft for legal review");
  }
});
