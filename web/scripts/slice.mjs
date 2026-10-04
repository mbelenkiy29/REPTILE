// The core loop end to end, keyboard and mouse, on fake data:
// sign in → new org → connect GitHub → link → repos indexing → reviews → open a review → run again → result.
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-proxy-server"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let clicks = 0;
const click = async (loc) => { clicks++; await loc.click(); };
const step = (m) => console.log("·", m);

await page.goto(base + "/repos");
step(`redirected to ${new URL(page.url()).pathname}`);
await click(page.getByRole("button", { name: "Continue with GitHub" }));
await page.waitForURL("**/repos");
step("signed in, landed on /repos");
await page.getByRole("button", { name: "Reset seed data" }).click();
await page.getByText("Seed data restored").waitFor();

await page.goto(base + "/onboarding/new-org");
await page.getByLabel("Organization name").fill("Slice Test Co");
await click(page.getByRole("button", { name: "Create organization" }));
await page.waitForURL("**/onboarding");
step("created org, on onboarding");

await click(page.getByRole("button", { name: "Connect GitHub", exact: true }));
await page.waitForURL("**/onboarding/link**");
step("install finished (fake), on link step");
await click(page.getByLabel(/acme-labs/));
await click(page.getByRole("button", { name: "Link and start indexing" }));
await page.waitForURL("**/repos?linked=3");
await page.getByText("Account linked").waitFor();
const rows = await page.getByRole("row").count();
step(`linked: ${rows - 1} repositories listed, alert shown`);

// Reviews live in the seeded Acme org; switch to it through the org menu.
await click(page.getByRole("button", { name: /Switch organization/ }));
await click(page.getByRole("menuitem", { name: /^Acme/ }));
await page.waitForURL("**/repos");
await page.getByRole("link", { name: "Reviews" }).first().click(); clicks++;
await page.waitForURL("**/reviews");
await click(page.getByRole("link", { name: "Add idempotency to invoice retries" }).first());
await page.waitForURL(/\/reviews\/rev_/);
step(`opened review: ${await page.getByRole("heading", { level: 1 }).innerText()}`);
await click(page.getByRole("tab", { name: "As posted on GitHub" }));
await page.getByRole("heading", { name: "Summary comment" }).waitFor();
step("GitHub preview tab shows the summary comment");
const before = new URL(page.url()).pathname;
await click(page.getByRole("button", { name: "Run again" }));
await page.waitForURL((u) => u.pathname !== before && u.pathname.startsWith("/reviews/rev_"));
await page.getByText(/^Reviewing$/).first().waitFor({ timeout: 15_000 });
step("new review shows as in progress");
step(`re-run queued at ${new URL(page.url()).pathname}`);
await page.getByRole("tab", { name: /Findings/ }).waitFor({ timeout: 30_000 });
step("re-run completed (auto-refresh picked it up)");
console.log(`happy-path clicks: ${clicks}, page errors: ${errors.length}`);
await browser.close();
process.exit(errors.length ? 1 : 0);
