# REPTILE web app

Next.js 16 (App Router) + Tailwind v4 + Radix. The dashboard for REPTILE's AI pull-request reviews.

The data layer in `src/lib/data` is a **fake**: in-memory seed data, fake sign-in and a fake GitHub install, behind the
function signatures the real Postgres/Drizzle layer will keep. Screens import only from `@/lib/data`.

```bash
npm install
npm run dev            # http://localhost:3000, sign in with any button
npm test               # unit tests for the review logic
npm run lint && npm run typecheck
npm run tokens         # regenerate src/styles from replica/design/tokens*.json
```

In development the sidebar has a **Dev data** panel: make the data layer slow or failing to see loading and error states,
or reset the seed data. Switch organizations (top left) to see other states: **Acme** (full data, admin), **Side project**
(empty, on a trial) and **Contoso** (member, read-only).

Browser checks (Playwright + axe) run against a production build:

```bash
npm run build && SHOW_DESIGN=1 npx next start -p 3100
node scripts/screens.mjs      # every screen at 1440 and 390 → replica/clone-screens
node scripts/slice.mjs        # the core loop end to end
node scripts/config-flow.mjs  # settings, validator, rules, repo overrides
node scripts/org-flow.mjs     # members, API keys, integrations, billing, knowledge, analytics
```

`/design` shows every UI primitive (dev builds, or `SHOW_DESIGN=1`).
