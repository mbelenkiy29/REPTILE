# Backend: REPTILE

Built by /replica-backend on 2026-10-04. The web app (`web/`) and the worker (`web/worker/`) share one TypeScript codebase and
one Postgres database. Everything external sits behind an interface with a fake for tests and keyless local runs.

**Status: the code is complete for the must-haves, and every check below passes locally. No live provider has been called.**
The accounts and keys are yours to create (steps below). Until they exist, GitHub, Claude, Voyage, Stripe and Resend have
only been exercised through fakes and offline signature checks. The first real run is the next milestone; see
"Before launch" at the end.

## What runs where

| piece | where | what it does |
| --- | --- | --- |
| web | Vercel (Next.js 16) | dashboard, Auth.js, server actions, `/api/webhooks/github`, `/api/webhooks/stripe`, `/api/v1/*` |
| worker | Fly.io (`npm run worker`) | pg-boss queues: review-pr, index-repo, answer-thread, send-email; schedules: sync-reactions (15 min), learn-rules, cleanup, billing-emails (daily, UTC) |
| database | Neon or Supabase Postgres 16 | app data, job queue (`pgboss` schema), code embeddings (pgvector) |

## Setup: accounts you create

Claude never creates these or handles live keys. Put values in `web/.env.local` (local) or the host's env settings; names are in
`web/.env.example`.

1. **Postgres.** Create a Neon (or Supabase) project, enable `vector`, `citext`, `pgcrypto` (Neon: run `create extension …`).
   Turn on daily backups / point-in-time restore (Neon: on by default on paid plans; check *Settings → Storage → History retention*).
   Then: `npm run db:migrate` (and `npm run db:seed` only for a demo database).
2. **GitHub App** (github.com → Settings → Developer settings → GitHub Apps → New):
   - Homepage URL: `APP_URL`. Callback URL: `<APP_URL>/api/auth/callback/github`. Setup URL: `<APP_URL>/api/github/setup`
     (tick "Redirect on update"). Webhook URL: `<APP_URL>/api/webhooks/github`, with a random webhook secret.
   - Tick "Request user authorization (OAuth) during installation" off (sign-in is separate); "Expire user authorization tokens" on.
   - **Repository permissions (fewest needed):** Contents: read · Pull requests: read & write · Checks: read & write ·
     Issues: read & write (summary comment) · Metadata: read. **Organization permissions:** Members: read (only org owners may
     link an installation; added in /replica-deploy). **Account permissions:** Email addresses: read.
   - **Events:** Installation, Installation repositories, Pull request, Pull request review comment, Pull request review thread,
     Issue comment, Push, Check run, Repository.
   - Copy the App ID, slug, client id/secret, and generate a private key → `GITHUB_APP_*`.
   - No marketplace review is needed for a private or unlisted app; listing on the GitHub Marketplace has its own review (optional).
3. **Anthropic API key** → `ANTHROPIC_API_KEY` (console.anthropic.com). Set a monthly spend limit there first.
4. **Voyage AI key** → `VOYAGE_API_KEY` (dash.voyageai.com).
5. **Stripe (test mode):** create the product and the two licensed seat prices in `launch/pricing.md` (monthly
   `STRIPE_PRICE_SEAT`, optional annual `STRIPE_PRICE_SEAT_ANNUAL`; flat pricing since /replica-launch, nothing metered). Enable
   the Customer Portal with cancellation allowed. Add a webhook endpoint `<APP_URL>/api/webhooks/stripe` for `checkout.session.completed`,
   `customer.subscription.created|updated|deleted`, `invoice.payment_failed` → `STRIPE_WEBHOOK_SECRET`. Test locally with
   `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and card 4242 4242 4242 4242.
6. **Resend:** verify your sending domain (SPF/DKIM records; replica-deploy covers DNS) → `RESEND_API_KEY`, `EMAIL_FROM`.
7. **Google sign-in (optional):** Google Cloud OAuth client, redirect `<APP_URL>/api/auth/callback/google`. Basic profile
   scopes only (openid, email, profile) don't need Google's app verification; anything more would take weeks, so don't add scopes.
8. `AUTH_SECRET`: `openssl rand -base64 32`.

**Local without any of these:** `AUTH_DEV_LOGIN=1 GITHUB_FAKE=1 REVIEW_FAKE_AI=1` with `APP_URL=http://localhost:3000` and a local
Postgres. You get a demo sign-in, a fake GitHub with two installations, and a fake model that flags lines containing `BUG:`.
The dev flags are refused unless `APP_URL` is localhost.

## Auth

- [x] GitHub (the GitHub App's own user authorization), Google, and email sign-in links (Resend; 15-minute, single-use).
  The original's product has no passwords, so neither does this.
- [x] Database sessions in http-only cookies (`Secure` on https), 30-day expiry, refreshed daily. Pages verify every request against
  the sessions table; `proxy.ts` only checks a cookie exists.
- [x] Sign out, and **sign out everywhere** (deletes every session for the user) on `/settings/account`.
- [x] Roles: `admin` / `member` per organization. The rule lives in one place, the data layer: reads are scoped by
  `ctx.orgId`; every write calls `assertAdmin(ctx)` and re-checks ownership by id. API keys act as read-only members.
- [x] **Account deletion that deletes** (`/settings/account`): the user row cascades to accounts, sessions and memberships;
  organizations where they're the only member are deleted with all their data after cancelling the Stripe subscription;
  refused while they're the only admin of an org with other members.
- [x] Invites: hashed tokens, 7-day expiry, single use, the signed-in email must match the invite.
- [x] GitHub user tokens are refreshed when they expire (8-hour GitHub App tokens) and re-saved on every sign-in.

## Database

- [x] Migrations in `web/db/migrations` (0001 = the architecture schema, 0002 build additions, 0003 security on by default),
  applied in order by `npm run db:migrate`, recorded in `schema_migrations`. A test fails if the Drizzle mirror drifts from them.
- [x] Access rules: **data-layer authorization**, not RLS policies (the app connects as the table owner). RLS is enabled with no
  policies as a deny-all backstop for any other role. **Tested with a second user:** `data.test.ts` proves another org's admin gets
  empty lists and 404s for every read, and can't change any row by id; members are refused on every write.
- [x] Seed: `npm run db:seed` (invented people and repositories; no real people).
- [ ] Backups: enable and check them on the host (step 1). Not verifiable from here.

## Payments (Stripe, test mode)

- [x] Checkout for the Team plan (seat price × member count, monthly or annual; nothing metered). No card forms.
- [x] Customer Portal for card, invoices and **one-click cancel**.
- [x] Webhooks verify the signature, store the event id first (a replay is a no-op), and forget it when the handler fails so
  Stripe's retry is processed. Handled: `checkout.session.completed`, `customer.subscription.created|updated|deleted`,
  `invoice.payment_failed` (admins emailed).
- [x] Plan status lives in Postgres, written only by webhooks; the worker reads it (ended trial or canceled → reviews pause, nothing billed).
- [x] Seat quantity follows membership changes; past the month's allowance reviews pause until the 1st (no overage), with one email to admins at 80%.

## Email and jobs

- [x] Resend from your domain; templates written fresh: sign-in link, invite, payment failed, trial ending.
- [x] pg-boss jobs with retries and backoff; jobs that exhaust retries go to a dead-letter queue and the `job_failures` table.
  Reviews retry only before anything is posted to GitHub, then fail visibly with no credit charged.
- [x] Times stored as `timestamptz` UTC; the dashboard shows relative times and UTC dates.

## Integrations

| integration | API | permissions | review process | limits and how we handle them |
| --- | --- | --- | --- | --- |
| GitHub App | REST v3 via `@octokit/app` | see step 2 (fewest that work) | none for a private/unlisted app; Marketplace listing optional | 5,000 req/h per installation (more on large orgs). One review call per run, cached installation tokens, ≤40 directories probed for config |
| Claude | Messages API, `claude-opus-5-5` | API key | none | SDK retries 429/5xx (3×); 3 review calls in parallel per PR, 4 PRs per worker; prompt caching on the system prompt and repository context; refusal fallbacks (`fallbacks: "default"`) |
| Voyage AI | REST `/v1/embeddings`, `voyage-code-3` | API key | none | batches of 64, backoff on 429/5xx; only changed chunks are embedded |
| Stripe | Checkout, Portal, Webhooks | secret key (restricted key recommended) | live mode needs account activation (business details) | idempotency keys on customer creation |
| Resend | Emails API | API key | domain verification (DNS) | 5 sign-in emails per address per hour; 30 invites per org per hour |
| Google | OAuth (openid, email, profile) | client id/secret | none for these scopes | — |
| Jira, Linear, Slack, Notion, Datadog | **not built** | — | Slack and Atlassian app reviews take 1–4 weeks if listed publicly; start early if you build these | S14 says "isn't set up" instead of pretending |

## Security checklist

- [x] Secrets only in env vars; `.env*` ignored (except `.env.example`, names only); no `process.env` in any client component.
- [x] Server input validated: zod on forms (rules, config, invites), enums and types re-checked in every server action, malformed
  ids treated as not found. Webhook bodies capped at 25 MB.
- [x] Authorization on every read and write, **tested with a second user** (`src/lib/data/data.test.ts`, 15 tests).
- [x] Rate limits (Postgres fixed window): sign-in emails, invites, org creation, @mention reviews, API (600/min per key).
  Note: OAuth sign-in itself relies on the providers' own limits; add an edge rate limit (Vercel Firewall) at deploy.
- [x] Webhooks verify signatures (GitHub HMAC-SHA256, Stripe) and are idempotent by delivery/event id.
- [x] Uploads: none in this product.
- [x] No user data in logs: emails are masked (`j***@acme.dev`), webhook failures log only the message, installation tokens are
  scrubbed from clone errors. Invite and sign-in tokens appear in their own URLs by necessity and are stored hashed.
- [x] `npm audit --omit=dev`: 0 vulnerabilities. Dev-only advisories remain in the ESLint plugin chain (`eslint-config-next` →
  `fast-glob` → `micromatch` → `braces`); not shipped.
- [x] Security headers: `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, HSTS, referrer and permissions policies.
  A nonce-based `script-src` CSP is a follow-up.
- [x] Prompt injection: PR content is fenced and labelled as data in every prompt; the model has no tools and can't write; its
  output is schema-validated, anchors are checked against the diff, and only the worker posts, only to the PR under review.
- [ ] **Privacy policy** lists every processor: Vercel (hosting), Fly.io (worker), Neon or Supabase (database), Anthropic
  (review model; customer code is sent for review), Voyage AI (embeddings of customer code), Stripe (billing), Resend (email),
  GitHub (source of the code), Google (sign-in, optional). Written by /replica-launch; the list is here so nothing is missed.
- [ ] Customer code: check Anthropic's and Voyage's data-retention and training terms for your account (zero-retention options
  may need a request) and state them on the security page.

## Tests (all passing at the last run)

| suite | count | what |
| --- | --- | --- |
| `npm test` (+ `TEST_DATABASE_URL`) | 76 | review logic; data-layer authorization and constraints; GitHub webhooks, install state, linking; the worker pipeline end to end with a real git repository (index, review, re-review, config files, plan gates, retries, supersede, reactions, answers, rule learning); Stripe webhooks; email templates; schema drift |
| `scripts/screens.mjs` | 52 | every screen state at 1440 and 390 px with axe WCAG 2.2 AA, console errors, overflow |
| `scripts/slice.mjs`, `config-flow.mjs`, `org-flow.mjs` | 3 flows | the UI flows on the real database and real sessions |
| `scripts/live-loop.mjs` | 1 flow | web → Postgres queue → **worker process** → result in the browser, plus an invite email sent by the worker |

## Known gaps (also in features.csv)

- Knowledge base generation, the CLI, a diff-review API endpoint, MCP, Jira/Linear/Slack/Notion/Datadog OAuth, static security rules
  and dependency scanning, a free tier for open source, and ingesting human review comments that aren't replies to REPTILE.
- Analytics aggregates two periods in memory per request; fine for thousands of reviews per org, move to SQL aggregates before
  large customers.
- Review quality is unmeasured: the pipeline is tested with a fake model. Build an eval set of real PRs with known bugs before
  launch (`/claude-api build-eval`) and tune the prompts and strictness thresholds against it.

## Before launch

1. Create the accounts above, run migrations, install the GitHub App on a test org, open a PR with a deliberate bug.
2. Watch one real review end to end; check the summary, the inline anchors and the check run on GitHub.
3. Measure review quality on 20–50 real PRs, then tune.
4. Then `/replica-test` for the full test plan, and `/replica-deploy`.
