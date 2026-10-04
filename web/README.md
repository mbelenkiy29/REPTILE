# Countersign web app and worker

Next.js 16 (App Router) + Tailwind v4 + Radix for the dashboard; Postgres (Drizzle, pgvector) for data, jobs and code
embeddings; a pg-boss worker (`worker/`) that reviews pull requests with Claude. Setup, keys and the security checklist:
[`../replica/backend.md`](../replica/backend.md).

## Run it locally without any provider keys

```bash
npm install
cp .env.example .env.local   # then set DATABASE_URL, AUTH_SECRET, APP_URL=http://localhost:3000,
                             # AUTH_DEV_LOGIN=1 GITHUB_FAKE=1 REVIEW_FAKE_AI=1
npm run db:migrate && npm run db:seed
npm run dev                  # web on :3000
npm run worker               # in another terminal: processes reviews, indexing, email
```

Sign in with "Continue as the demo user". Switch organizations (top left) for other states: **Acme** (full data, admin),
**Side project** (empty, on a trial), **Contoso** (member, read-only). Re-run a review to watch the worker pick it up.
The sidebar's **Dev data** panel makes the data layer slow or failing, and reloads the seed.

## Checks

```bash
npm run lint && npm run typecheck
npm run test:db              # unit + database + worker tests (needs a Postgres whose name contains "test")
npm run build && SHOW_DESIGN=1 GITHUB_WEBHOOK_SECRET=e2e-webhook-secret npx next start -p 3100   # with APP_URL=http://localhost:3100 and the dev flags
npm run e2e                  # Playwright: every flow in ../replica/test-plan.md (reseeds DATABASE_URL; run `npm run worker` too)
node scripts/screens.mjs     # every screen at 1440 and 390 px, axe, console, overflow → ../replica/clone-screens
node scripts/slice.mjs       # core loop in the UI
node scripts/config-flow.mjs # settings, validator, rules, repo overrides
node scripts/org-flow.mjs    # members, API keys, integrations, billing, knowledge, analytics
node scripts/live-loop.mjs   # web → queue → worker → result (run `npm run worker` too)
```

`/design` shows every UI primitive (dev builds, or `SHOW_DESIGN=1`).
