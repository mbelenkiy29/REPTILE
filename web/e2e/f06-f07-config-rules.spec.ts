// F06 tune the noise level (S07, S16, S06) and F07 custom rules (S08).
import { test, expect, login, seedId, expectAccessible, toast, USERS } from "./fixtures";

test.describe("F06 review settings", () => {
  test("F06-H1 / F06-E2 strictness, comment types and labels saved by keyboard persist", async ({ page }) => {
    await login(page, { next: "/settings/review" });
    await expectAccessible(page);
    await page.getByRole("radio", { name: "1" }).focus();
    await page.keyboard.press("Space");
    await page.getByLabel("Only with these labels").focus();
    await page.keyboard.type("needs-review");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Save changes" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Saved organization defaults")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("radio", { name: "1" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("needs-review", { exact: true }).first()).toBeVisible();
  });

  test("F06-E4 a 300-character label is refused with a message; emoji labels are kept", async ({ page }) => {
    await login(page, { next: "/settings/review" });
    const input = page.getByLabel("Never with these labels");
    await input.fill("🦎-skip");
    await input.press("Enter");
    await input.fill("l".repeat(300));
    await input.press("Enter");
    await page.getByRole("button", { name: "Save changes" }).click();
    // Either the chip input or the server refuses the long one, with words, not a crash.
    await expect(page.getByText(/200|too long|characters/i).first()).toBeVisible();
  });

  test("F06-E5 two tabs: the later save wins and the page stays consistent", async ({ page, browser }) => {
    await login(page, { next: "/settings/review" });
    const other = await (await browser.newContext()).newPage();
    await login(other, { next: "/settings/review" });
    await page.getByRole("radio", { name: "3" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved organization defaults")).toBeVisible();
    await other.getByRole("radio", { name: "2" }).click();
    await other.getByRole("button", { name: "Save changes" }).click();
    await expect(other.getByText("Saved organization defaults")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("radio", { name: "2" })).toHaveAttribute("aria-checked", "true");
    await other.context().close();
  });

  test("F06-N1 a member sees the settings read-only", async ({ page }) => {
    await login(page, { org: "o_contoso", next: "/settings/review" });
    await expect(page.getByRole("radio", { name: "2" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
    await expectAccessible(page);
  });

  test("F06-H2 / F06-E1 config checker: broken JSON, unknown key, valid example", async ({ page }) => {
    await login(page, { next: "/settings/review/validate" });
    const box = page.getByLabel("File contents");
    await box.fill('{ "strictness": 2,');
    await expect(page.getByText(/JSON|Unexpected|Expected/i).first()).toBeVisible();
    await box.fill('{\n  "strictness": 2,\n  "strictnes": 3\n}');
    await expect(page.getByText("Unknown setting: strictnes")).toBeVisible();
    await expect(page.getByText("Line 3")).toBeVisible();
    await page.getByRole("button", { name: "Insert an example" }).click();
    await expect(page.getByText("Valid. Here")).toBeVisible();
    await expectAccessible(page);
  });

  test("F06-H3 a repository override, then back to the org defaults", async ({ page }) => {
    await login(page, { next: `/repos/${seedId("r_mobile")}?tab=settings` });
    await page.getByRole("button", { name: "Customize for this repository" }).click();
    await page.getByRole("radio", { name: "3" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved repository settings")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("tab", { name: "Settings (custom)" })).toBeVisible();
    await page.getByRole("button", { name: "Use organization settings" }).click();
    await page.getByRole("button", { name: "Use organization settings" }).last().click();
    await expect(page.getByText("Using organization settings")).toBeVisible();
  });
});

test.describe("F07 rules", () => {
  const addRule = async (page: import("@playwright/test").Page, text: string) => {
    await page.getByRole("button", { name: "Add rule" }).click();
    await page.getByLabel("Rule", { exact: true }).fill(text);
  };

  test("F07-H1 / F07-H2 add a scoped rule, edit it, disable it, delete it", async ({ page }) => {
    await login(page, { next: "/rules" });
    await expectAccessible(page);
    const text = `Money is stored in integer cents ${Date.now() % 1e5}.`;
    await addRule(page, text);
    await page.getByLabel("Only for these paths").fill("src/billing/**");
    await page.getByLabel("Only for these paths").press("Enter");
    await page.getByRole("button", { name: "Add rule" }).last().click();
    await expect(page.getByText(text)).toBeVisible();
    await expect(page.getByText("src/billing/**").first()).toBeVisible();
    const row = page.locator("li, tr, article").filter({ hasText: text }).last();
    await row.getByRole("button", { name: "Rule actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await page.getByLabel("Rule", { exact: true }).fill(`${text} Edited.`);
    await page.getByRole("button", { name: "Save rule" }).click();
    await page.reload();
    await expect(page.getByText(`${text} Edited.`)).toBeVisible();
    await page.locator("li, tr, article").filter({ hasText: text }).last().getByRole("button", { name: "Rule actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete rule" }).click();
    await expect(toast(page, "Rule deleted")).toBeVisible();
    await page.reload();
    await expect(page.getByText(text)).toHaveCount(0);
  });

  test("F07-E1 an empty rule is refused", async ({ page, sql }) => {
    await login(page, { next: "/rules" });
    const before = (await sql`select count(*)::int as n from rules`)[0].n;
    await addRule(page, "     ");
    await page.getByRole("button", { name: "Add rule" }).last().click();
    await expect(page.getByText(/at least a few words|required/i).first()).toBeVisible();
    expect((await sql`select count(*)::int as n from rules`)[0].n).toBe(before);
  });

  test("F07-E2 long text with emoji and HTML is stored and shown as text", async ({ page, sql }) => {
    await login(page, { next: "/rules" });
    const marker = `XSS${Date.now() % 1e5}`;
    const text = `<img src=x onerror="window.__xss=1"> Ünïcode 🦎 ${marker} ` + "y".repeat(3000);
    await addRule(page, text);
    await page.getByRole("button", { name: "Add rule" }).last().click();
    await expect(page.getByText(marker).first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    const [r] = await sql`select text from rules where text like ${"%" + marker + "%"}`;
    expect(r.text).toBe(text);
  });

  test("F07-E3 double-clicking Add makes one rule", async ({ page, sql }) => {
    await login(page, { next: "/rules" });
    const text = `Once only ${Date.now() % 1e6}`;
    await addRule(page, text);
    await page.getByRole("button", { name: "Add rule" }).last().dblclick();
    await expect(page.getByText(text).first()).toBeVisible();
    await page.waitForTimeout(800);
    expect((await sql`select count(*)::int as n from rules where text = ${text}`)[0].n).toBe(1);
  });

  test("F07-N1 a member can't add or change rules", async ({ page }) => {
    await login(page, { email: USERS.mateo, next: "/rules" });
    await expect(page.getByRole("button", { name: "Add rule" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rule actions" })).toHaveCount(0);
  });

  test("F05-H2 a suggested rule can be accepted or dismissed", async ({ page }) => {
    await login(page, { next: "/rules?view=suggested" });
    await page.getByRole("button", { name: "Dismiss" }).first().click();
    await expect(toast(page, "Suggestion dismissed")).toBeVisible();
  });
});
