// The public landing page (replica/launch/landing.md): what a signed-out visitor sees, and nothing it can't back up.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, expectAccessible, expectNoHorizontalScroll, login, test } from "./fixtures";

// The names that must never ship, from the brand file (kept out of this source so the rebrand sweep stays clean).
const AVOID: string[] = JSON.parse(readFileSync(join(__dirname, "../../replica/brand.json"), "utf8")).avoid;

test.describe("landing page", () => {
  test("L-1 a signed-out visitor sees the landing page, not the sign-in redirect", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("A second reviewer on every pull request");
    await expect(page.getByRole("img", { name: /A Countersign review in the app/ })).toBeVisible();
    await expectAccessible(page);
  });

  test("L-2 pricing on the page matches the billing settings: flat seat price, nothing per review", async ({ page }) => {
    await page.goto("/");
    const pricing = page.locator("#pricing");
    await expect(pricing.getByText("$24", { exact: true })).toBeVisible();
    await expect(pricing.getByText("No per-review charges, ever")).toBeVisible();
    await expect(page.getByText(/\$\d+(\.\d+)? (per|a) review/)).toHaveCount(0);
  });

  test("L-3 the original's name and made-up proof never appear", async ({ page }) => {
    await page.goto("/");
    const text = (await page.locator("body").innerText()).toLowerCase();
    for (const banned of [...AVOID.map((n) => n.toLowerCase()), "trusted by", "testimonial", "★"]) expect(text).not.toContain(banned);
  });

  test("L-4 Start free goes to sign-in; a signed-in user skips the landing page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Start free" }).first().click();
    await expect(page).toHaveURL(/\/login/);
    await login(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/repos/);
  });

  test("L-6 link previews get our own Open Graph image, reachable without signing in", async ({ page, request }) => {
    await page.goto("/");
    const og = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(og).toMatch(/opengraph-image/);
    const res = await request.get(new URL(og!).pathname + new URL(og!).search);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  });

  test("L-5 fits a phone without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/");
    await expectNoHorizontalScroll(page);
  });
});
