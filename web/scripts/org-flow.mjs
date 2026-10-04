// Org screens: S12 members, S15 API keys, S14 integrations, S13 billing, S09 knowledge, S10 analytics.
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-proxy-server"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await ctx.addCookies([{ name: "rp_session", value: "u_jordan", url: base }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const ok = (m) => console.log("✓", m);
const fail = (m) => { console.log("✗", m); errors.push(m); };
const check = (cond, good, bad) => (cond ? ok(good) : fail(bad));
const toast = (t) => page.locator("[data-sonner-toast]").filter({ hasText: t }).first().waitFor();

await page.goto(base + "/repos");
await page.getByRole("button", { name: "Reset seed data" }).click();
await toast("Seed data restored");

// S12
await page.goto(base + "/settings/members");
await page.getByRole("button", { name: "Invite", exact: true }).click();
await page.getByLabel("Email").fill("new.hire@acme.dev");
await page.getByRole("button", { name: "Send invite" }).click();
await page.getByText("already has an open invite").waitFor();
ok("S12 duplicate invite is refused with a message");
await page.getByLabel("Email").fill("lin@acme.dev");
await page.getByRole("button", { name: "Send invite" }).click();
await toast("Invite sent to lin@acme.dev");
check(await page.getByText("lin@acme.dev", { exact: true }).isVisible(), "S12 new invite listed as pending", "S12 invite not listed");
await page.getByRole("combobox", { name: "Role for Mateo Silva" }).click();
await page.getByRole("option", { name: "Admin" }).click();
await toast("Mateo Silva is now an admin");
ok("S12 role changed");

// S15
await page.goto(base + "/settings/api-keys");
await page.getByRole("button", { name: "Create key" }).click();
await page.getByLabel("Name").fill("Release bot");
await page.getByRole("button", { name: "Create key" }).last().click();
await page.getByRole("heading", { name: "Copy your new key" }).waitFor();
const secret = await page.getByRole("dialog").locator("pre").innerText();
check(/^rpt_[A-Za-z0-9]{24}$/.test(secret.trim()), "S15 secret shown once", `S15 secret format ${secret}`);
await page.keyboard.press("Escape");
check(await page.getByRole("heading", { name: "Copy your new key" }).isVisible(), "S15 Escape doesn't dismiss the secret", "S15 secret dialog closed on Escape");
await page.getByRole("button", { name: "I've saved it" }).click();
check(!(await page.getByText(secret.trim()).count()), "S15 secret gone after closing", "S15 secret still on page");
await page.getByRole("row", { name: /Release bot/ }).getByRole("button", { name: "Revoke" }).click();
await page.getByRole("button", { name: "Revoke key" }).click();
await toast("Key revoked");
ok("S15 key revoked");

// S14
await page.goto(base + "/settings/integrations");
await page.getByRole("button", { name: "Connect Jira" }).click();
await toast("Jira connected");
await page.getByRole("button", { name: "Reconnect" }).click();
await toast("Slack connected");
ok("S14 connect and reconnect");

// S13 (trial org)
await page.getByRole("button", { name: /Switch organization/ }).click();
await page.getByRole("menuitem", { name: /Side project/ }).click();
await page.waitForURL("**/repos");
await page.goto(base + "/settings/billing");
await page.getByRole("button", { name: "Choose the Team plan" }).first().click();
await page.getByText("You're on the Team plan").waitFor();
ok("S13 trial upgraded");

// S09 (back to Acme)
await page.getByRole("button", { name: /Switch organization/ }).click();
await page.getByRole("menuitem", { name: /^Acme/ }).click();
await page.waitForURL("**/repos");
await page.goto(base + "/knowledge/r_api?doc=kb_3");
await page.getByRole("button", { name: "Edit page" }).click();
await page.getByLabel("Markdown").fill("## Flow\n\nExports are built by a job and kept for 30 days.");
await page.getByRole("button", { name: "Save page" }).click();
await toast("Page saved");
check(await page.getByText("kept for 30 days").isVisible() && await page.getByText("Edited by Jordan Lee").isVisible(), "S09 page edited and attributed", "S09 edit not shown");

// S10
await page.goto(base + "/analytics");
await page.getByRole("combobox", { name: "Period" }).click();
await page.getByRole("option", { name: "Last 7 days" }).click();
await page.waitForURL("**/analytics?days=7");
await page.getByRole("button", { name: "Show as table" }).first().click();
check(await page.getByRole("columnheader", { name: "Day" }).isVisible(), "S10 period filter and table view", "S10 table view missing");
const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export CSV" }).click()]);
const csv = await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c).toString());
check(csv.startsWith("date,reviews,p0,p1,p2") && csv.trim().split("\n").length === 8, "S10 CSV export has 7 days", `S10 csv: ${csv.slice(0, 60)}`);

console.log(`page errors: ${errors.length}`);
await browser.close();
process.exit(errors.length ? 1 : 0);
