import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
// Screenshots + axe (WCAG 2.2 AA) for /design in light, dark and mobile. Needs `SHOW_DESIGN=1 next start -p 3100`.
// 404s are ignored: the nav links to screens that are not built yet.
const base = process.env.BASE_URL ?? "http://localhost:3100";
const out = new URL("../../replica/design/screens", import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--no-proxy-server"] });
const runs = [
  { name: "design-light", theme: "light", viewport: { width: 1280, height: 900 } },
  { name: "design-dark", theme: "dark", viewport: { width: 1280, height: 900 } },
  { name: "design-mobile", theme: "light", viewport: { width: 390, height: 844 } },
];
let violations = 0;
for (const r of runs) {
  const ctx = await browser.newContext({ viewport: r.viewport, colorScheme: r.theme, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("404") && errors.push(m.text()));
  await page.goto(`${base}/design`, { waitUntil: "load" });
  await page.evaluate((t) => (document.documentElement.dataset.theme = t), r.theme);
  await page.screenshot({ path: `${out}/${r.name}.png`, fullPage: true });
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  violations += res.violations.length;
  console.log(`${r.name}: axe ${res.violations.length} violations, page errors ${errors.length}, scrollWidth ${scrollW}/${r.viewport.width}`);
  for (const v of res.violations) console.log(`  - ${v.id} (${v.impact}): ${v.nodes.length} nodes · ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  for (const e of errors) console.log(`  ! ${e}`);
  await ctx.close();
}
// Open-state checks: dialog + select + menu, light theme.
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${base}/design`, { waitUntil: "load" });
await page.getByRole("button", { name: "Invite member" }).click();
await page.getByRole("dialog").waitFor();
await page.screenshot({ path: `${out}/design-dialog.png` });
const d = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
console.log(`dialog: axe ${d.violations.length}`); violations += d.violations.length;
for (const v of d.violations) console.log(`  - ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
await page.keyboard.press("Escape");
await page.waitForTimeout(300); const focused = await page.evaluate(() => document.activeElement?.textContent);
console.log(`focus returned to: ${focused}`);
await ctx.close();
await browser.close();
process.exit(violations ? 1 : 0);
