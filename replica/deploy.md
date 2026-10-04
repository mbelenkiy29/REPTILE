# Deploy checklist: Countersign

Date: 2026-10-04 · Commit: see `git log` (the commit that adds this file) · **Go from user: not yet**

**Status: not live.** The four code-side failures are fixed (second pass, below). What's left is yours: the lawyer's
review of the legal pages, the two-account check, accounts and keys, and your go. Nothing has been deployed, bought or
signed up for. The user does every account step; this file gives the exact names, records and commands.

## Preflight

| check | result | evidence |
| --- | --- | --- |
| e2e suite green | ✅ **115 / 115** passed (3 of them are `test.fail` repros of the open S3s) | `npx playwright test`, against a production build on a fresh seed |
| unit, data and pipeline tests | ✅ 101 / 101 | `npx vitest run` |
| no open S1 or S2 bugs | ✅ none open; the possible S2 (installation squatting) is **fixed in code**, still to confirm with two real GitHub accounts | `bugs.md`: 6 S1/S2 found, all fixed; 3 S3 open (BUG-002, BUG-013, BUG-014) |
| parity: all must-haves done | ✅ 22 / 22, feature score 92.9 | `parity.py replica/features.csv` |
| rebrand sweep clean | ✅ **exit 0 for the whole repo** (second pass) | the handoff note moved to `replica/HANDOFF.md`; the root `HANDOFF.md` is a pointer that names neither app |
| store listing passes | ✅ 0 errors, 0 warnings (not shipping to stores: web app only) | `listing.py replica/launch/listing.json` |
| production build passes | ✅ | `npm run build` |
| privacy policy and terms live, every processor listed | ⚠️ **live as drafts** at `/privacy` and `/terms`, every processor listed (e2e `D-2`), linked from the landing footer and sign-in; a visible "Draft for legal review" notice stays until a lawyer reviews them | fill `LEGAL` and set `LEGAL_REVIEWED = true` in `web/src/components/legal-page.tsx` |
| account deletion works | ✅ e2e `cross-cutting` covers it; **fixed today**: a failed Stripe cancel now stops the deletion, and orgs that keep members get their seat count lowered (were `bugs.md` "To check" #2) | `billing.test.ts` (2 new tests) |
| cookie banner (EU/UK) | ✅ not needed today: only the sign-in session cookie and the theme in localStorage | keep it that way: pick cookieless analytics |
| favicon, titles, OG image, emails yours | ✅ favicon `icon.svg`, titles "… · Countersign", emails in the new voice; **OG image added today** (1200×630, `src/app/opengraph-image.png`, public for link previews) | e2e `L-6`; screenshots checked by eye |
| app icon | n/a: interim mark until the logo from `brand.md` is drawn | |

Also from `launch/launch-plan.md` §0. They aren't in the skill's list, but they block launch:

| gate | result |
| --- | --- |
| error tracking | ✅ wired (Sentry, web + browser + worker); **off until you set `SENTRY_DSN`** |
| product analytics | ❌ not installed |
| margin check (live review cost vs. $0.48 a review) | ❌ no live review has run yet |
| name checks (trademark, domain, handles) | ❌ to run (`brand.md`) |
| installation squatting checked with two GitHub accounts | ⚠️ fixed in code (owners only), confirm with two accounts |
| stored GitHub sign-in tokens encrypted | ❌ **found in the second pass**: `accounts.access_token` and `refresh_token` are stored in plain text (the architecture planned AES-GCM; never built). The privacy policy doesn't claim otherwise. Fix before launch |

### Second pass: the four code-side items (2026-10-04)

1. **Sweep:** `HANDOFF.md` moved to `replica/HANDOFF.md`; a pointer stays at the root. Whole-repo sweep: exit 0.
2. **Privacy policy and terms:** `/privacy` and `/terms`, written from what the code does (data stored, retention from
   the cleanup job, cookies, processors, pricing and cancelling from the billing code). Placeholders: company name,
   address, contact, governing law, date (`LEGAL` in `web/src/components/legal-page.tsx`). Public in the auth proxy.
   While writing them, two things turned up: the org cookie was still named `rp_org` (now `cs_org`), and stored GitHub
   tokens aren't encrypted (row above).
3. **Installation squatting:** an installation can only be linked by an active owner (admin) of the GitHub
   organization, or by the personal account itself (`canAdminister`, checked against the user's own GitHub token).
   Others still see it, greyed out, with who has to link it. Unit test in `github.test.ts`. **The production GitHub
   App needs the organization permission "Members: read"** for the owner check; without it, nobody can link an org.
4. **Error tracking:** `@sentry/nextjs` (server errors through `onRequestError`, browser errors) and `@sentry/node` in
   the worker (job errors, dead-lettered jobs, failed reviews with the review id). No personal data, no tracing. Off
   unless `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are set: the browser SDK is a lazy chunk that isn't loaded without a
   DSN (checked: 12 scripts on the landing page, none of them Sentry). Started both processes with a dummy DSN: both
   run. Source maps aren't uploaded (stack traces from the browser are minified); add `withSentryConfig` and a Sentry
   auth token later if you want them.

### Processors (for the privacy policy)

| processor | what it gets | why |
| --- | --- | --- |
| GitHub | the app's access to chosen repositories; users' GitHub identity | the product itself |
| Anthropic (Claude API) | changed files and related code for each review | the review |
| Voyage AI | code chunks for embeddings | search over the codebase |
| Neon (or your Postgres host) | everything stored | database |
| Vercel | web traffic, logs | web hosting |
| Fly.io | the worker: repository clones on its volume, logs | background jobs |
| Stripe | billing contact and card details (Stripe holds the card, we don't) | payments |
| Resend | email addresses and email content | sign-in links, invites, billing emails |
| Google (optional) | identity, if Google sign-in is enabled | sign-in |
| Sentry | error reports (no request bodies, cookies or IPs) | error tracking |
| your analytics vendor | usage events | when added |

## Changes made in this step (all tested)

- **Deploy config:** `vercel-build` runs migrations then the build; `fly.toml` and `Dockerfile.worker` for the worker,
  whose `release_command` migrates before each deploy. `migrate.ts` now takes a Postgres advisory lock, so a web
  deploy and a worker deploy can't migrate at the same time. Tested here: two runs at once applied 5 migrations once.
  The Docker image was **not** built here (no Docker daemon); Fly builds it on the first deploy.
- **`/api/health`:** 200 `{ok:true}` when the database answers, 503 when not, `no-store`; for uptime checks.
- **`REVIEW_FAKE_AI` is refused on a public URL** (it would post made-up reviews). Same rule `GITHUB_FAKE` already had.
- **Account deletion and billing** (above), and the **OG image** with `metadataBase` from `APP_URL`.

## Production

Two hosts, one database: web on **Vercel**, worker on **Fly.io**, Postgres 16 with pgvector on **Neon**
(`architecture.md`).

### 1. Database (Neon)

- [ ] A **new Neon project for production**, never the dev one. Region near the Fly worker (US East if you keep `iad`).
- [ ] Extensions: the migrations create `vector`, `citext` and `pgcrypto`; Neon supports all three.
- [ ] Backups: Neon's point-in-time restore on a paid plan (set the history window to at least 7 days).
- [ ] Connection strings: the **pooled** one for Vercel (`DATABASE_URL`), the **direct** one for the worker (pg-boss and the
      migration lock take session-level advisory locks, which a transaction-mode pooler breaks).
- [ ] Migrations run in the deploys (`vercel-build`, Fly `release_command`), never by hand.
- [ ] Preview deploys: use the Neon Vercel integration so each preview gets its own branch database. Production
      `DATABASE_URL` must be set for the **Production** environment only.

### 2. Environment variables

Names match `web/.env.example`. Set live values only here, in the hosts' secret stores.

| variable | Vercel (web) | Fly (worker) |
| --- | --- | --- |
| `DATABASE_URL` | pooled | direct |
| `DATABASE_POOL` | optional | `5` |
| `APP_URL` | `https://<your-domain>` | same |
| `AUTH_SECRET` | `openssl rand -base64 32` | not needed |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | if Google sign-in is on | not needed |
| `RESEND_API_KEY`, `EMAIL_FROM` | ✅ | ✅ (the worker sends email) |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` | ✅ | ✅ |
| `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET` | ✅ | `GITHUB_APP_SLUG` only |
| `ANTHROPIC_API_KEY`, `REVIEW_MODEL`, `VOYAGE_API_KEY`, `EMBED_MODEL` | not needed | ✅ |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_SEAT`, `STRIPE_PRICE_SEAT_ANNUAL` | ✅ (live) | not needed |
| `PRICE_SEAT_CENTS`, `PRICE_SEAT_ANNUAL_CENTS` | `2400`, `2000` | not needed |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | ✅ | ✅ |
| `NEXT_PUBLIC_SENTRY_DSN` | ✅ (needed at build time) | not needed |
| **never in production:** `AUTH_DEV_LOGIN`, `GITHUB_FAKE`, `REVIEW_FAKE_AI`, `SHOW_DESIGN`, `TEST_DATABASE_URL` | ❌ | ❌ |

Fly: `fly secrets set NAME=value …` (values never in `fly.toml`). Vercel: Project → Settings → Environment Variables,
scope **Production**.

### 3. GitHub App (production)

- [ ] Register a **new** GitHub App named "Countersign", slug `countersign` if it's free (otherwise update
      `GITHUB_APP_SLUG` and the landing copy's `@countersign`).
- [ ] URLs: Homepage `https://<your-domain>`; Callback `https://<your-domain>/api/auth/callback/github`; Setup
      `https://<your-domain>/api/github/setup` (tick "Redirect on update"); Webhook
      `https://<your-domain>/api/webhooks/github` with a new random secret.
- [ ] Permissions exactly as in `backend.md` step 3 (Contents read; Pull requests, Checks, Issues read and write;
      Metadata read; **organization Members read**, for the owner check; account Email addresses read). Events as listed there.
- [ ] Public (installable by anyone) only after confirming the owner check with two accounts: a read-only collaborator
      sees the org's installation greyed out and can't link it; an owner can.

### 4. Stripe (live)

- [ ] Activate the account (business details). Switch to **live mode**.
- [ ] Recreate, in live mode, the product and the two seat prices from `launch/pricing.md` (test-mode objects don't
      carry over). Customer Portal, renewal emails and the webhook exactly as listed there.
- [ ] Webhook endpoint `https://<your-domain>/api/webhooks/stripe` → its signing secret in `STRIPE_WEBHOOK_SECRET`.
- [ ] One real purchase on a throwaway org with your own card, check the org turns "Team", cancel it from the
      portal, refund it. Write the result here.

### 5. Email (Resend) and sign-in

- [ ] Add the domain in Resend (a subdomain such as `mail.<your-domain>` keeps the apex's reputation separate) and
      add its DNS records (below). `EMAIL_FROM` = `Countersign <hello@mail.<your-domain>>`.
- [ ] Google sign-in (optional): authorised origin `https://<your-domain>`, redirect
      `https://<your-domain>/api/auth/callback/google`. Basic profile and email scopes need no verification.

## Domain

After you buy the domain (any registrar). Add it in Vercel (Project → Settings → Domains), then:

| record | name | value | for |
| --- | --- | --- | --- |
| A | `@` | the apex IP Vercel shows in Domains | the site |
| CNAME | `www` | `cname.vercel-dns.com` | the site |
| TXT | as Vercel asks | Vercel's verification value, if asked | ownership |
| TXT (SPF) | as Resend shows (on the mail subdomain) | as Resend shows, e.g. `v=spf1 include:… ~all` | email |
| TXT or CNAME (DKIM) | as Resend shows (e.g. `resend._domainkey.mail`) | as Resend shows | email |
| MX | as Resend shows (bounce handling on the mail subdomain) | as Resend shows | email |
| TXT (DMARC) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@<your-domain>` | email; tighten to `p=quarantine` after 2 to 4 weeks of clean reports |

- [ ] Canonical host: the apex (`https://<your-domain>`). In Vercel, set `www` to redirect (308) to the apex.
- [ ] HTTPS: automatic on Vercel. Check the certificate on both hosts after DNS settles; HSTS is already sent.
- [ ] `APP_URL` = the canonical origin, everywhere.

Records set: none yet.

## Watch

- [ ] **Error tracking:** create a Sentry project and set the DSN variables above (the code is wired). Alert on new issues, on reviews that end
      `failed`, and on rows in `job_failures` (dead-lettered jobs).
- [ ] **Uptime:** `https://<your-domain>/` and `https://<your-domain>/api/health` every minute, alert by email and phone.
      For the worker, alert if the oldest queued `review-pr` job is over 10 minutes old.
- [ ] **Logs:** Vercel and Fly keep short histories; add a drain (Axiom, Better Stack) if you need more than a few days.
- [ ] **Analytics:** a cookieless one (Plausible, Fathom, Vercel Web Analytics), listed in the privacy policy, so no
      cookie banner is needed.
- [ ] **Core flow on the live site:** sign up → install the app on a test org → open a PR → review posted → 👍 a
      comment → billing page → checkout (test card in test mode, then the real purchase above). Desktop, then you on
      your phone.

### The first week

- Every review: did it post, how long did it take, did anything land in `job_failures`?
- Cost per review (Anthropic and Voyage dashboards) against $0.48 per review per seat. This is the margin check.
- 👍/👎 ratio and the comments that got 👎.
- Sign-up → install → first review drop-off.
- Stripe: any failed payment, any dispute, and that cancels and refunds behave as written.

## Mobile

None: Countersign is a web app (`launch/listing.json` is ready if that changes).
