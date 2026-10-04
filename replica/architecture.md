# Architecture: REPTILE (a rebuild of Greptile's core features)

Built from `replica/recon.md` (S01–S20, F01–F10) and `replica/features.csv`.
The name is a working title; /replica-brand picks the real one.

## Stack

One Next.js app and one long-running worker, both from the same TypeScript repo. One Postgres database.
No Redis and no microservices.

| layer | choice | why |
| --- | --- | --- |
| web | Next.js 16 (App Router) + TypeScript, Tailwind | Server components and server actions cover the whole dashboard. Webhook routes live in the same app. |
| database | Postgres 16 on **Neon** + `pgvector` + `citext` | One database for app data, the job queue and code embeddings. Neon branches give every preview deploy its own database. |
| ORM | Drizzle | SQL-first, so the partial unique indexes and the vector column in `schema.sql` map 1:1. Migrations run with drizzle-kit. |
| auth | **Auth.js** (GitHub provider, then Google and email magic links) | Signing in with GitHub gives the user token we need to prove they can see an installation before linking it (F01). |
| GitHub | Our own **GitHub App**, using `@octokit/app` + `@octokit/webhooks` | The official way to read code, post reviews and checks, and receive webhooks. Each installation gets its own scoped token. |
| LLM | **Claude API** (`@anthropic-ai/sdk`), `claude-opus-5-5` for every call | One model means one prompt-cache namespace. Cost is tuned per call with `output_config.effort`: `low` for triage and labels, `high` for the review pass, `xhigh` for the "deep" tier. Adaptive thinking. Server-side `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) so a refusal is rerouted instead of failing the review. |
| embeddings | **Voyage AI `voyage-code-3`** (1024-d) | Anthropic has no embeddings endpoint. Voyage is the code-tuned model that Anthropic's docs recommend. It sits behind a small `embed()` interface so it can be swapped. |
| jobs | **pg-boss** (queue in Postgres), run by a **worker on Fly.io** | Clone + index + review takes minutes and needs a real disk and `git`, which is past serverless limits. The queue in Postgres means no extra infrastructure. |
| payments | Stripe Checkout + Billing (per-seat price + metered **Meter** for overage reviews) | Matches the pricing model (seats including 50 reviews each, then pay per review). The customer portal handles invoices and cards. |
| email | Resend + React Email | For invites, trial ending, failed payments and "first review posted". |
| files | none in v1 | Clones live on the worker's ephemeral volume and are deleted after each job. KB docs live in Postgres. |
| hosting | Vercel (web), Fly.io (worker, 2 machines, 4 GB, 20 GB volume) | Both are managed and deploy from git. Fly keeps a long-running process with local disk. |
| observability | Sentry (web + worker), Axiom or Better Stack logs | Review failures have to be visible before customers notice them. |

## Schema

Tables: **21**. See `replica/schema.sql` (first migration). It applies cleanly to Postgres 16; pgvector was stubbed in the test.

**Access rules: data-layer checks, not RLS policies.** Every request resolves `session → user → membership(org_id, role)`. Every query goes through `db.forOrg(orgId)`, which adds `where org_id = $1`, and admin-only mutations call `requireRole('admin')`. The worker and webhooks run as the system and get `org_id` from the installation. RLS is enabled with no policies as a deny-all backstop, because the app connects as the table owner.

| table | owner col | notes |
| --- | --- | --- |
| users, accounts, sessions, verification_tokens | user_id | Auth.js adapter shape; `users.github_login` maps PR authors and reactors to members |
| organizations | — | plan, trial, Stripe ids, `included_reviews_per_seat` |
| memberships | org_id | role `admin` / `member` (S12) |
| invites | org_id | the token is hashed; one open invite per email |
| installations | org_id | recon "Team"; unique `(provider, external_installation_id)` |
| repositories | org_id | `review_enabled` toggle (S05), `index_status` lifecycle |
| code_chunks | org_id | `vector(1024)` + HNSW index; `content_hash` skips re-embedding |
| knowledge_docs | org_id | could-have KB (S09) |
| review_configs | org_id | one org default and one optional per-repo row (partial unique indexes) |
| rules | org_id | manual, learned or file-sourced; scoped by `repo_ids[]` + `path_globs[]` |
| pull_requests | org_id | holds `summary_comment_id`, so we edit one comment instead of posting new ones |
| reviews | org_id | `effective_config` snapshot, credits, tokens, check run |
| findings | org_id | live on the PR across reviews, matched by `fingerprint` |
| feedback | org_id | 👍/👎 (unique per actor), replies, human comments |
| usage_events | org_id | `review_id` is unique, so one review is never billed twice |
| api_keys | org_id | hashed, shown once |
| integrations | org_id | could-have; credentials encrypted |
| webhook_deliveries | — | `(source, delivery_id)` primary key, used for idempotency |

Hard constraints the recon pointed to, enforced in the database:
- **One live review per PR**: `reviews_one_active_per_pr` is a partial unique index on `(pull_request_id) where status in ('queued','running')`. A new push marks the old review `superseded` and then inserts the new one in the same transaction.
- **Never auto-review the same SHA twice** (webhook retries, `opened` + `synchronize` arriving together): `reviews_once_per_sha_auto`.
- **A finding stays the same finding across reviews**: `unique (pull_request_id, fingerprint)`.
- **Reactions are counted once per person**: `feedback_one_reaction`.
- **Billing is idempotent**: `usage_events.review_id unique`.

## API

Server actions are shown as `ACTION name`. "member" means any member of the org; "admin" means role admin.
Everything under `/api/v1` uses an API key (`Authorization: Bearer rpt_…`).

### F01 Onboard and get a first review

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| `GET/POST /api/auth/*` | Auth.js sign-in / callback / sign-out | public | provider | session cookie | F01 S01 |
| `ACTION createOrganization` | first-run org creation; caller becomes admin; starts the 14-day trial | signed-in user without an org | name | org | F01 |
| `GET /api/github/install` | redirect to `https://github.com/apps/<app>/installations/new?state=<signed org+nonce>` | admin | — | 302 | F01 S02→S03 |
| `GET /api/github/setup` | GitHub's setup URL callback; checks `state`, then checks the installation is in the user's `GET /user/installations` | admin | `installation_id`, `setup_action`, `state` | redirect to S04 | F01 S04 |
| `ACTION linkInstallation` | upsert installation, list its repos, upsert repositories, enqueue `index-repo` for each | admin | installationId | team + repos | F01 S04 |
| `POST /api/webhooks/github` | verify `X-Hub-Signature-256`, insert into `webhook_deliveries` (skip if duplicate), route the event, return 202 within 10 s | GitHub | event payload | 202 | F01–F05 |

### F02/F03 Automatic and on-demand reviews (all through the webhook)

| event | handler |
| --- | --- |
| `pull_request.opened / synchronize / ready_for_review / labeled / reopened` | upsert `pull_requests`, run `shouldReview(effectiveConfig)` (draft, authors, branches, labels), then either insert a `skipped` review with a reason or enqueue `review-pr` |
| `pull_request.closed` | set state/merged_at (feeds merge-time analytics) |
| `issue_comment.created` with `@<bot>` on a PR | enqueue `review-pr` with trigger `mention`; runs even on drafts |
| `pull_request_review_comment.created` | reply to our comment with `@<bot>` → enqueue `answer-thread`. A human comment on a PR → store `feedback(kind=human_comment)` |
| `pull_request_review_thread.resolved` | set the matching finding to `resolved` |
| `push` to the default branch | enqueue `index-repo` (incremental) |
| `installation.*`, `installation_repositories.*` | sync installations and repos; mark removed repos `removed_at`; `suspend` sets `suspended_at` |
| `check_run.rerequested` | enqueue `review-pr` with trigger `manual` |

### Dashboard: repos, config, rules (F06, F07)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| `GET /repos` (page) | repo table with status and toggle | member | `?q=&status=` | S05 | F01, F06 |
| `ACTION setRepoReviewEnabled` | toggle reviews for a repo | admin | repoId, enabled | repo | F06 S05 |
| `ACTION reindexRepo` | enqueue a full re-index | admin | repoId | status | S06 |
| `GET /repos/[id]` (page) | index status, overrides, recent reviews | member | — | S06 | F06 |
| `GET /settings/review` (page) | org default config | member (read), admin (write) | — | S07 | F06 |
| `ACTION saveReviewConfig` | upsert the org or repo config row; zod-validated | admin | orgId \| repoId, config | config | F06 S07 |
| `GET /api/config/export` | effective org config as `reptile.json` | member | `?repo=` | JSON download | F06 S07 |
| `POST /api/config/validate` | validate a pasted `reptile.json` / `.reptile/config.json` | member | text | `{valid, errors[]}` | F06 S16 |
| `GET /settings/rules` (page) | rules list incl. suggested learned rules | member | `?status=` | S08 | F07 |
| `ACTION createRule / updateRule / deleteRule` | CRUD | admin | text, kind, repoIds, pathGlobs | rule | F07 S08 |
| `ACTION acceptSuggestedRule / rejectSuggestedRule` | promote or discard a learned rule | admin | ruleId | rule | F05 S08 |

### History, analytics, fixes (F04, F08)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| `GET /reviews` (page) | review history | member | `?repo=&status=&cursor=` | S11 | F08 |
| `GET /reviews/[id]` (page) | review detail, findings, effective config, token cost | member | — | review | F08 |
| `GET /analytics` (page) + `GET /api/analytics` | PRs reviewed, addressed rate, P0s caught, median time to merge, 👍/👎 ratio | member | `from,to,repo?,author?` | series + tiles | F08 S10 |
| `GET /api/analytics/export` | CSV of findings and reviews | member | same filters | text/csv | F08 S10 |
| `GET /fix/[findingId]?t=<signed>` | "Fix with your agent" landing: copyable prompt + deep links (Claude Code, Cursor) | anyone with the signed link | — | page | F04 |
| `GET /fix/pr/[prId]?t=<signed>` | "Fix All" for every open finding | anyone with the signed link | — | page | F04 |

### Org: members, billing, keys (F09)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| `ACTION inviteMember` | create invite + email | admin | email, role | invite | F09 S12 |
| `GET /invite/[token]` | accept invite (sign in first) | invitee | — | membership | F09 |
| `ACTION changeRole / removeMember` | — | admin (can't remove the last admin) | userId, role | membership | F09 S12 |
| `POST /api/billing/checkout` | Stripe Checkout session (seat price + metered price) | admin | seats | redirect URL | F09 S13 |
| `POST /api/billing/portal` | Stripe customer portal session | admin | — | redirect URL | F09 S13 |
| `POST /api/webhooks/stripe` | verify signature, dedupe via `webhook_deliveries`, sync plan, status and seats | Stripe | event | 200 | F09 |
| `ACTION createApiKey / revokeApiKey` | key shown once, hashed at rest | admin | name | key (once) | S15 |
| `GET /settings/knowledge/[repoId]` + `ACTION updateKnowledgeDoc` | KB view/edit (could) | member / admin | path, body | doc | S09 |

### Public API and CLI (F10, could)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| `POST /api/v1/reviews` | review a diff uploaded by the CLI (base..head patch + repo full_name) | API key | `{repo, base, diff}` | `{reviewId}` | F10 |
| `GET /api/v1/reviews/[id]` | poll status + findings | API key | — | review JSON | F10 |
| `GET /api/v1/repositories/[id]` | index status | API key | — | repo JSON | — |

**Webhooks in:** GitHub App (events above) and Stripe (`checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.payment_failed`).
**Webhooks out:** none in v1. Slack notifications are could-have (S14).
**Calls out (official APIs only, with our own keys):** GitHub REST (pulls, files, reviews, comments, reactions, check runs, contents), Claude Messages API, Voyage embeddings, Stripe, Resend.

### Jobs (pg-boss on the Fly worker)

| job | schedule / trigger | what it does |
| --- | --- | --- |
| `index-repo` | link, push to default branch, manual | shallow-clone at SHA → skip ignored/binary/vendored files → tree-sitter chunking → embed only chunks whose `content_hash` changed → upsert `code_chunks`, delete stale chunks → status `completed`. Singleton per repo. |
| `review-pr` | webhook / mention / API | the pipeline below. Concurrency limit per org (2) and global (≈20). Timeout 15 min. Retries 2× with backoff, but only before anything has been posted. |
| `answer-thread` | reply that mentions the bot | answer in-thread using the finding and code context |
| `sync-reactions` | every 15 min | GitHub sends **no reaction webhooks**, so this lists reactions on our comments for findings open in the last 14 days and upserts `feedback` |
| `learn-rules` | nightly | cluster 👎'd findings and human review comments per org → propose `rules(status='suggested')` with evidence |
| `report-usage` | hourly | send unreported `usage_events` beyond the included reviews to the Stripe Meter, then set `reported_to_stripe_at` |
| `refresh-kb` | after `index-repo` when >5% of files changed (could) | regenerate affected `knowledge_docs` (skips human-edited docs unless forced) |
| `cleanup` | daily 03:00 UTC | prune `webhook_deliveries` >30 d; purge chunks/KB for repos with `removed_at` >7 d; expire invites; delete leftover clones |
| `billing-emails` | daily | trial ends in 3 days / payment failed |

**Review pipeline (`review-pr`):**
1. Mark the check run `in_progress`, and edit or post the summary placeholder ("Reviewing…").
2. Fetch the PR files and diff. Read `reptile.json` and `.reptile/config.json` files at head SHA, merge with the database config, and snapshot the result into `effective_config`. Drop ignored files; skip if nothing is left.
3. Gather context: changed hunks, the full changed files, vector search over `code_chunks` per hunk, callers and callees by symbol name, matching rules (by repo and glob), and `CLAUDE.md` / `AGENTS.md` / `.cursorrules`. Order it so the stable parts come first, for the prompt cache.
4. Run one `effort: high` Opus 5.5 call per file group in parallel. Use structured outputs (`output_config.format` with the finding schema) and stream the response.
5. Run one `effort: low` pass to dedupe and rank findings, apply strictness and comment types, and write the summary, confidence 1–5, verdict, and mermaid diagram.
6. Match against existing findings by fingerprint. Post only new findings, as a single GitHub review with comments using `line`/`side`. Findings outside the diff go into the summary under "Outside changed code". Mark findings that are gone `addressed`.
7. Edit the summary comment, complete the check run (`neutral` if there are P0s, `success` otherwise; never block merges by default), and write `usage_events`.

## The parts that bite

- **Webhook idempotency:** GitHub redelivers and sometimes sends `opened` and `synchronize` close together. The `webhook_deliveries` primary key plus the two partial unique indexes on `reviews` make double work fail at insert. Stripe events are deduped the same way.
- **Races:** a push during a running review. Supersede in one transaction. The running job checks `status` before every GitHub write and stops if it was superseded. Summary edits always target `pull_requests.summary_comment_id`, behind a per-PR advisory lock (`pg_advisory_xact_lock(hashtext(pr_id))`).
- **Diff anchoring:** review comments must point at lines inside the diff, or GitHub returns 422. Validate each `(path, line, side)` against the parsed patch first, and send anything that doesn't fit to the summary. Large diffs return a truncated `patch`, so fetch the file at both SHAs and compute the diff locally.
- **Rate limits:** the GitHub App gets 5k req/h per installation (more on big orgs). Post one review with N comments, not N calls. Cache installation tokens for 50 min. Back off on `x-ratelimit-remaining`. The Claude API's 429s are retried by the SDK (`maxRetries`), and per-org concurrency caps protect the limits.
- **Size limits:** cap the diff at around 3k changed lines per review. Above that, review only the highest-risk files and say so in the summary. Skip binary, generated and lockfiles by default. Shallow-clone only (`--depth 1 --filter=blob:limit=1m`).
- **Prompt cache:** this is the biggest cost lever. Keep the order system prompt → rules → repo context → the PR's own changes, with `cache_control` after the repo-context block. Don't put timestamps or ids in the system prompt. Check `usage.cache_read_input_tokens` in the logs.
- **LLM non-determinism:** findings that move slightly between reviews. Fingerprint on path + normalised title + nearby code, not on line number. Never re-post a finding the user dismissed.
- **Prompt injection from PR content:** the diff, comments and code are untrusted. Wrap them in delimited blocks, never give the review model tools that write, and validate output against the schema. Only the worker posts to GitHub, and only to the PR that triggered the review.
- **Multi-tenancy and code privacy:** every query is scoped by org. Vector search always filters `repo_id IN (org's repos)` **before** ranking. Clones are deleted after each job. No customer code in logs or Sentry breadcrumbs (scrub `content`). Don't train on customer code (say so on the security page).
- **Time zones:** everything is stored as `timestamptz` UTC. Analytics buckets use the viewer's time zone at query time. Billing periods are UTC months, matching Stripe.
- **Secrets:** the GitHub App private key, webhook secret, Stripe and Anthropic keys live in Vercel/Fly secrets. Stored OAuth tokens and integration credentials are encrypted with AES-GCM under a key from env.
- **GDPR / deletion:** deleting an org cascades through every table. Uninstalling the app marks repos removed, and the `cleanup` job purges code chunks and KB docs 7 days later. Users can delete their account; memberships cascade.
- **Search / realtime / offline:** none needed. Dashboard lists use cursor pagination. Review status on S11 refreshes by polling every 5 s while anything is `running`.

## Build order

1. **Vertical slice** (week 1–2). Prove it end to end, ugly is fine.
   - Screens: S01, S02→S04, S05 (bare list), S17 + S18 on a real test repo.
   - Tables: users/accounts/sessions, organizations, memberships, installations, repositories, pull_requests, reviews, findings, webhook_deliveries.
   - Routes: `/api/auth/*`, `createOrganization`, `/api/github/install`, `/api/github/setup`, `linkInstallation`, `/api/webhooks/github` (`pull_request.opened` and `installation*` only).
   - Jobs: `review-pr` on the diff alone (no index yet): one Opus call that posts a summary and inline comments.
   - Done when: open a PR on a test repo and a summary plus at least one inline comment appear within 5 minutes.
2. **Must-haves** (week 3–6), by area:
   - *indexing*: `code_chunks`, `index-repo`, incremental re-index on `push`; S05 status pills, S06.
   - *review*: codebase context retrieval, confidence + verdict, findings sorted by severity, P0/P1/P2, suggestion blocks, check run (S19), draft skip, `@mention` trigger, supersede on push.
   - *config*: `review_configs`, S07, strictness / comment types / ignore patterns, `reptile.json` repo file + precedence.
   - *rules*: `rules`, S08 manual rules with repo + glob scope, cited in comments.
3. **Should-haves** (week 7–10): summary updates on re-review with carried-over findings; `answer-thread`; label / author / branch filters; `.reptile/` per-directory config; export + validator (S16); read `CLAUDE.md`/`AGENTS.md`; `feedback` + `sync-reactions` + `learn-rules` (suggested rules in S08); mermaid diagram and "What we checked"; analytics (S10); history (S11); members and invites (S12); Stripe billing, trial and free tier (S13, `usage_events`, `report-usage`).
   **Could-haves** after that: Fix-with-agent pages, knowledge base (S09), security pass (comment type `security`), CSV export, CLI + `/api/v1` + API keys (S15), GitLab, GHE, Jira/Linear/Slack (S14).
4. **Fixes from replica-entrepreneur**: once it has read public reviews of Greptile, its findings (likely noise and false positives, pricing per review, review latency) go here as their own milestone.
