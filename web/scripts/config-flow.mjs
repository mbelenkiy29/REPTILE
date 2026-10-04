// Config screens, driven mostly by keyboard: S07 save + persist, S16 validate, S08 add/accept/delete, S06 override + reset.
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-proxy-server"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: "rp_session", value: "u_jordan", url: base }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const ok = (m) => console.log("✓", m);
const fail = (m) => { console.log("✗", m); errors.push(m); };

await page.goto(base + "/repos");
await page.getByRole("button", { name: "Reset seed data" }).click();
await page.getByText("Seed data restored").waitFor();

// S07: keyboard only.
await page.goto(base + "/settings/review");
await page.getByRole("radio", { name: "3" }).focus();          // segmented control item
await page.keyboard.press("Space");
await page.getByLabel("Ignore patterns").focus();
await page.keyboard.type("**/*.snap");
await page.keyboard.press("Enter");
await page.keyboard.type("bad pattern");
await page.keyboard.press("Enter");
(await page.getByText("Patterns can't contain spaces.").first().isVisible()) ? ok("S07 chip input rejects a pattern with spaces") : fail("S07 no validation message");
await page.keyboard.press("Control+A");
await page.keyboard.press("Backspace");
await page.getByRole("button", { name: "Save changes" }).focus();
await page.keyboard.press("Enter");
await page.getByText("Saved organization defaults").waitFor();
await page.reload();
const strict3 = await page.getByRole("radio", { name: "3" }).getAttribute("aria-checked");
const hasSnap = await page.getByText("**/*.snap", { exact: true }).first().isVisible();
strict3 === "true" && hasSnap ? ok("S07 saved with keyboard and persisted after reload") : fail(`S07 persist strict=${strict3} snap=${hasSnap}`);

// S16
await page.goto(base + "/settings/review/validate");
await page.getByLabel("File contents").fill('{\n  "strictness": 2,\n  "strictnes": 3\n}');
await page.getByText("Unknown setting: strictnes").waitFor();
(await page.getByText("Line 3").isVisible()) ? ok("S16 reports the unknown key on line 3") : fail("S16 line number missing");
await page.getByRole("button", { name: "Insert an example" }).click();
await page.getByText("Valid. Here").waitFor();
ok("S16 example validates and shows effective settings");

// S08
await page.goto(base + "/rules");
await page.getByRole("button", { name: "Add rule" }).click();
await page.getByLabel("Rule", { exact: true }).fill("Feature flags are read once per request, never inside loops.");
await page.getByRole("button", { name: "Add rule" }).last().click();
await page.getByText("Feature flags are read once per request").waitFor();
ok("S08 added a rule through the dialog");
await page.goto(base + "/rules?view=suggested");
await page.getByRole("button", { name: "Accept" }).first().click();
await page.getByText("Rule added").waitFor();
ok("S08 accepted a suggested rule");
await page.goto(base + "/rules");
await page.getByRole("button", { name: "Rule actions" }).first().click();
await page.getByRole("menuitem", { name: "Delete" }).click();
const focused = await page.evaluate(() => document.activeElement?.textContent);
focused === "Cancel" ? ok("S08 delete confirm focuses Cancel, not Delete") : fail(`S08 confirm focus on ${focused}`);
await page.getByRole("button", { name: "Delete rule" }).click();
await page.getByText("Rule deleted").waitFor();
ok("S08 deleted a rule after confirming");

// S06 override + reset
await page.goto(base + "/repos/r_api?tab=settings");
await page.getByRole("button", { name: "Customize for this repository" }).click();
await page.getByRole("radio", { name: "1" }).click();
await page.getByRole("button", { name: "Save changes" }).click();
await page.getByText("Saved repository settings").waitFor();
await page.reload();
(await page.getByRole("tab", { name: "Settings (custom)" }).isVisible()) ? ok("S06 repository override saved") : fail("S06 override not shown");
await page.getByRole("button", { name: "Use organization settings" }).click();
await page.getByRole("button", { name: "Use organization settings" }).last().click();
await page.getByText("Using organization settings").waitFor();
ok("S06 override removed");

console.log(`page errors: ${errors.length}`);
await browser.close();
process.exit(errors.length ? 1 : 0);
