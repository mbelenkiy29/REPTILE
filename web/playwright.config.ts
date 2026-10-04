import { defineConfig } from "@playwright/test";

// End-to-end tests for /replica-test. They run against a production build with the local fakes:
//   npm run build && SHOW_DESIGN=1 GITHUB_WEBHOOK_SECRET=e2e-webhook-secret npx next start -p 3100
//   npm run worker            (some specs wait for a queued review to finish)
//   npm run e2e
// .env.local must have AUTH_DEV_LOGIN=1 GITHUB_FAKE=1 REVIEW_FAKE_AI=1 and APP_URL=http://localhost:3100.
// The global setup reloads the seed data, so never point DATABASE_URL at a database you care about.
try {
  process.loadEnvFile(".env.local");
} catch {}

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  // One database shared by every spec: run in order, one at a time.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3100",
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
      args: ["--no-proxy-server"],
    },
  },
});
