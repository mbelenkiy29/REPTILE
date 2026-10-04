// The core loop on the real backend: Postgres, pg-boss, the worker process, Auth.js sessions.
// Needs: the web app on :3100 and `npm run worker`, both with GITHUB_FAKE=1 REVIEW_FAKE_AI=1 AUTH_DEV_LOGIN=1.
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-proxy-server"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const step = (m) => console.log("·", m);

await page.goto(base + "/repos");
step(`unauthenticated → ${new URL(page.url()).pathname}`);
await page.getByRole("link", { name: /demo user/ }).click();
await page.waitForURL("**/repos");
step("signed in with a real database session");

// New org → connect (fake GitHub) → link → repositories indexing (index jobs queued for the worker).
await page.goto(base + "/onboarding/new-org");
await page.getByLabel("Organization name").fill(`Live ${Date.now() % 100000}`);
await page.getByRole("button", { name: "Create organization" }).click();
await page.waitForURL("**/onboarding");
await page.getByRole("link", { name: "Connect GitHub", exact: true }).click();
await page.waitForURL("**/onboarding/link**");
await page.getByLabel(/jordanlee/).click();
await page.getByRole("button", { name: "Link and start indexing" }).click();
await page.waitForURL("**/repos?linked=1");
step("linked a GitHub account; 1 repository queued for indexing");

// Back to Acme; re-run a real seeded review and watch the worker complete it.
await page.getByRole("button", { name: /Switch organization/ }).click();
await page.getByRole("menuitem", { name: /^Acme/ }).click();
await page.waitForURL("**/repos");
await page.goto(base + "/reviews?status=completed");
await page.locator("table a").first().click();
await page.waitForURL(/\/reviews\/[0-9a-f-]{36}$/);
const before = new URL(page.url()).pathname;
await page.getByRole("button", { name: "Run again" }).click();
await page.waitForURL((u) => u.pathname !== before && /\/reviews\/[0-9a-f-]{36}$/.test(u.pathname));
step(`queued ${new URL(page.url()).pathname}`);
await page.getByRole("tab", { name: /Findings/ }).waitFor({ timeout: 60_000 });
const findings = await page.getByText("Bug: percentage is applied twice").count();
step(`worker completed the review; new finding shown: ${findings > 0}`);
await page.getByRole("tab", { name: "As posted on GitHub" }).click();
await page.getByRole("heading", { name: "Summary comment" }).waitFor();
step("summary comment preview rendered from the stored review");

// Invite → the worker sends the email (logged locally).
await page.goto(base + "/settings/members");
await page.getByRole("button", { name: "Invite", exact: true }).click();
const email = `live${Date.now() % 100000}@acme.dev`;
await page.getByLabel("Email").fill(email);
await page.getByRole("button", { name: "Send invite" }).click();
await page.getByText(`Invite sent to ${email}`).waitFor();
step(`invite created for ${email}`);
console.log(`page errors: ${errors.length}`);
await browser.close();
process.exit(errors.length || !findings ? 1 : 0);
