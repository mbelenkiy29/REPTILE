// Screen check for /replica-build: screenshots at 1440 and 390 into replica/clone-screens,
// axe (WCAG 2.2 AA), console errors and horizontal overflow per screen.
// Needs the app running: `SHOW_DESIGN=1 next start -p 3100` (SHOW_DESIGN enables the dev panel).
// Usage: node scripts/screens.mjs [S05 S11 ...]   (no args = every screen)
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { devLogin, seedId } from "./lib.mjs";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const out = new URL("../../replica/clone-screens/", import.meta.url).pathname;
const only = new Set(process.argv.slice(2));

// org: which seeded org to view as (o_acme admin, o_side empty admin, o_contoso member)
export const SCREENS = [
  { id: "S01", path: "/login", auth: false },
  { id: "S01-sent", path: "/login?sent=1", auth: false },
  { id: "S02", path: "/onboarding", org: "o_side" },
  { id: "S04", path: "/onboarding/link", org: "o_side" },
  { id: "S05", path: "/repos" },
  { id: "S05-empty", path: "/repos", org: "o_side" },
  { id: "S05-member", path: "/repos", org: "o_contoso" },
  { id: "S06", path: `/repos/${seedId("r_api")}` },
  { id: "S06-failed", path: `/repos/${seedId("r_infra")}` },
  { id: "S07", path: "/settings/review" },
  { id: "S07-member", path: "/settings/review", org: "o_contoso" },
  { id: "S08", path: "/rules" },
  { id: "S08-empty", path: "/rules", org: "o_side" },
  { id: "S09", path: `/knowledge/${seedId("r_api")}` },
  { id: "S10", path: "/analytics" },
  { id: "S10-empty", path: "/analytics", org: "o_side" },
  { id: "S11", path: "/reviews" },
  { id: "S11-empty", path: "/reviews", org: "o_side" },
  { id: "S12", path: "/settings/members" },
  { id: "S13", path: "/settings/billing" },
  { id: "S13-trial", path: "/settings/billing", org: "o_side" },
  { id: "S13-free", path: "/settings/billing", org: "o_solo" },
  { id: "S12-free", path: "/settings/members", org: "o_solo" },
  { id: "S14", path: "/settings/integrations" },
  { id: "S15", path: "/settings/api-keys" },
  { id: "S16", path: "/settings/review/validate" },
  { id: "S17", path: `/reviews/${seedId("rev_0")}` },
  { id: "S11-error", path: "/reviews", sim: "error" },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-proxy-server"] });
let problems = 0;
for (const s of SCREENS.filter((x) => !only.size || [...only].some((o) => x.id.startsWith(o)))) {
  for (const vp of [{ w: 1440, h: 900, tag: "" }, { w: 390, h: 844, tag: "-mobile" }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    if (s.auth !== false) await devLogin(page, base, { org: s.org ?? "o_acme" });
    if (s.sim) await ctx.addCookies([{ name: "cs_sim", value: s.sim, url: base }]);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      const t = m.text();
      // Expected: the simulated failure screen logs the thrown error; 404s are links to unbuilt routes.
      if (m.type() === "error" && !(s.sim && /Simulated failure|server components render|error #441/i.test(t)) && !t.includes("404")) errors.push(t);
    });
    const res = await page.goto(base + s.path, { waitUntil: "load" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}${s.id}${vp.tag}.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const bad = axe.violations.length + errors.length + (overflow > 0 ? 1 : 0);
    problems += bad;
    console.log(`${bad ? "✗" : "✓"} ${s.id}${vp.tag} ${res?.status()} ${s.path}${axe.violations.length ? ` axe:${axe.violations.length}` : ""}${errors.length ? ` errors:${errors.length}` : ""}${overflow > 0 ? ` overflow:${overflow}px` : ""}`);
    for (const v of axe.violations) console.log(`    axe ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    for (const e of errors) console.log(`    console: ${e.slice(0, 200)}`);
    await ctx.close();
  }
}
await browser.close();
process.exit(problems ? 1 : 0);
