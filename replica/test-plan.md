# Test plan: REPTILE

Build: c424563 (tested), fixes through 6f989a6  Date: 2026-10-04  Env: local, `next build && next start` on :3100, Postgres 16, seed data,
`AUTH_DEV_LOGIN=1 GITHUB_FAKE=1 REVIEW_FAKE_AI=1` (fake GitHub, fake model, dev sign-in). Never against Greptile.

How to read `auto`:
- **e2e**: Playwright spec in `web/e2e/` (`npm run e2e`). Every spec fails on console errors, page errors, any 5xx,
  and runs axe (WCAG 2.2 AA) on each screen it visits.
- **vitest**: existing unit/integration test (`npm run test:db`), named in brackets. The GitHub-side screens (S17–S19)
  are markdown and API calls, so the worker pipeline test against the fake GitHub is where they're exercised.
- **manual**: needs a real provider account (GitHub App, Stripe, Resend, Claude). Checklist at the bottom.

Results: ✓ pass · ✗ fail (bug ID) · — not run (manual, needs accounts).

## F01 Team admin onboards and gets a first review

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F01-H1 | happy | signed out → /repos → sign in → new org → Connect GitHub → pick installation → Link | redirected to /login first; org created; repos listed as indexing with a "linked" alert | e2e || ✓ |
| F01-H2 | happy | open PR on a linked repo (webhook) | review queued, summary + inline comments + check run posted | vitest [opening a PR…, reviews a PR…] || ✓ |
| F01-E1 | edge: empty input | submit new-org form with an empty / whitespace name | inline validation, no org created | e2e || ✓ |
| F01-E2 | edge: very long input | 300-character org name | refused or trimmed with a message, no 500, no layout overflow | e2e || ✓ |
| F01-E3 | edge: emoji and accents | org name "Café 🦎 Ünïcode" | saved and shown exactly; slug is URL-safe | e2e || ✓ |
| F01-E4 | edge: double click on submit | double-click Create organization | exactly one org created | e2e || ✓ |
| F01-E5 | edge: back / refresh mid-flow | refresh on the link step; back from link to onboarding | link step still works; nothing linked twice | e2e || ✓ |
| F01-E6 | edge: no repos selected / installation already linked | link an installation already linked to another org | clear error, no second link | vitest [links an installation the user can see, once] || ✓ |
| F01-E7 | edge: forged install state | /api/github/setup with a tampered or expired `state` | refused, nothing linked | vitest [state is signed and expires] + e2e (tampered) || ✓ |
| F01-E8 | edge: PR opened before linking | mention on a PR that predates linking | PR fetched, then reviewed | vitest [a mention on a PR opened before linking…] || ✓ |
| F01-E9 | edge: mobile width | onboarding and repos at 390px | no horizontal scroll, controls reachable | e2e (axe + overflow) || ✓ |
| F01-N1 | negative: signed out | open any app route signed out | redirect to /login with a safe `next` | e2e || ✓ |
| F01-N2 | negative: open redirect | dev-login / login with `next=//evil.example` | stays on our origin | e2e || ✓ after fix (✗ BUG-001) |
| F01-N3 | negative: expired session | delete the session row, reload | back to /login, no data shown | e2e || ✓ |

## F02 Developer receives an automatic review

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F02-H1 | happy | PR opened → check in progress → summary + inline comments | one review, one summary, check completed, credits used | vitest [reviews a PR…] || ✓ |
| F02-E1 | edge: draft | open a draft PR | skipped (default), mention overrides | vitest [drafts are skipped…, skips drafts unless enabled…] || ✓ (found BUG-004 next to it: ready-for-review) |
| F02-E2 | edge: excluded author / base branch | author or branch filtered | skipped with a reason | vitest [filters authors…, filters base branches] || ✓ |
| F02-E3 | edge: only ignored files | PR touches only ignored paths | skipped, even on mention | vitest [drops ignored files…] || ✓ |
| F02-E4 | edge: review fails | model throws on every attempt | failure recorded, check = failure, no credit charged | vitest [retries before posting…] || ✓ (found BUG-009) |
| F02-E5 | edge: credits / trial exhausted | trial ended | reviews pause, nothing billed | vitest [an ended trial pauses reviews] || ✓ |
| F02-E6 | edge: same commit twice | duplicate `synchronize` | reviewed once | vitest [the same commit isn't reviewed twice…] || ✓ |
| F02-E7 | edge: webhook redelivery | same delivery id twice | handled once | vitest [handles a delivery once] || ✓ |
| F02-N1 | negative: forged webhook | bad / missing signature | 401, nothing recorded | vitest [rejects a bad or missing signature] + e2e (HTTP) || ✓ |
| F02-N2 | negative: repo with reviews off / unknown repo | PR event | recorded but not reviewed / ignored | vitest || ✓ |
| F02-H2 | happy | review history (S11) and review detail (S17 preview) show the review | list, filters, detail tabs render | e2e || ✓ |
| F02-E8 | edge: second user's data | Contoso admin opens an Acme review / repo by URL | 404, never the data | e2e + vitest [can't read another org's rows by id] || ✓ |
| F02-E9 | edge: malformed id | /reviews/not-a-uuid | 404 page, not a 500 | e2e || ✓ |

## F03 Developer re-triggers / converses

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F03-H1 | happy | "Run again" on a review | new review queued, shows Reviewing | e2e || ✓ |
| F03-H2 | happy | `@reptile` comment on a PR | review queued; bot and unrelated comments ignored | vitest [@reptile on a PR queues a review…] || ✓ (found BUG-005, BUG-006, BUG-007) |
| F03-H3 | happy | reply "@reptile why?" under a finding | threaded answer posted | vitest [answers a question in the thread] || ✓ (found BUG-006) |
| F03-E1 | edge: re-trigger while running | Run again twice quickly / double click | one live review per PR | e2e + vitest [one live review per pull request] || ✓ (found BUG-008) |
| F03-E2 | edge: new push mid-review | synchronize while a review runs | old review superseded, stops without posting | vitest [a new push supersedes…, a superseded review stops…] || ✓ |
| F03-E3 | edge: re-review after fixes | push fixes | fixed findings marked addressed, summary edited in place | vitest [on a new push…] || ✓ |
| F03-N1 | negative: member re-runs | member clicks Run again | allowed or refused consistently with the role model, no 500 | e2e || ✓ |

## F04 Developer applies a fix

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F04-H1 | happy | review detail → "Fix with your agent" on a finding | /fix/[id] shows a copyable prompt for that finding | e2e || ✓ |
| F04-H2 | happy | "Fix all" | /fix/pr/[id] prompt lists every open finding | e2e || ✓ after fix (✗ BUG-012, BUG-015) |
| F04-E1 | edge: suggestion out of date | new push after suggestion | finding marked addressed or kept open, not duplicated | vitest [on a new push…] || ✓ |
| F04-N1 | negative: another org's finding | open /fix/<other org finding> | 404 | e2e || ✓ |

## F05 Team gives feedback, and the system learns

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F05-H1 | happy | 👎 on an inline comment | finding dismissed, not repeated | vitest [syncs 👎 reactions…] || ✓ |
| F05-H2 | happy | repeated feedback | rule proposed as a suggestion on S08 | vitest [proposes rules…] + e2e (accept/dismiss suggested rule) || ✓ |
| F05-E1 | edge: conflicting reactions | 👍 and 👎 on one comment | counts shown, no crash | manual (needs real reactions) || — |

## F06 Admin tunes the noise level

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F06-H1 | happy | S07 change strictness, comment types, a label → Save → reload | saved values persist | e2e || ✓ |
| F06-H2 | happy | S16 paste a valid file | "valid" | e2e || ✓ |
| F06-E1 | edge: invalid JSON / unknown key | S16 paste broken JSON, unknown key | error with a line number | e2e + vitest [reports unknown keys…] || ✓ |
| F06-E2 | edge: keyboard only | S07 entirely by keyboard | every control reachable, saved | e2e || ✓ |
| F06-E3 | edge: repo file overrides dashboard | reptile.json in the repo | repo wins; S06 shows the override | vitest [reptile.json … overrides the dashboard] || ✓ (found BUG-010) |
| F06-E4 | edge: very long / odd chip input | 200-char label, emoji label, pattern with spaces | refused or saved, never a 500 | e2e || ✓ |
| F06-E5 | edge: two tabs at once | save in tab A, then save stale form in tab B | last write wins, no crash, values consistent after reload | e2e || ✓ |
| F06-N1 | negative: member | member opens S07 | read-only, Save not offered; server refuses a forced write | e2e + vitest [every write is refused] || ✓ |
| F06-H3 | happy | S06 customize repo settings, then reset to org defaults | override saved, then removed | e2e || ✓ |

## F07 Admin adds custom rules

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F07-H1 | happy | S08 Add rule → text + scope → save | rule listed with scope | e2e || ✓ |
| F07-H2 | happy | edit, disable, delete a rule | changes persist after reload | e2e || ✓ |
| F07-E1 | edge: empty rule | save with empty text | validation message | e2e || ✓ |
| F07-E2 | edge: very long / emoji text | 5,000 chars; emoji + accents | stored and rendered safely (no HTML injection) | e2e || ✓ |
| F07-E3 | edge: double click on save | double-click Save | one rule | e2e || ✓ |
| F07-N1 | negative: member | member opens S08 | no add/edit controls | e2e || ✓ |

## F08 Lead reviews impact

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F08-H1 | happy | S10 change period and repo filter | tiles and charts update, URL keeps filters | e2e || ✓ |
| F08-H2 | happy | Export CSV | CSV downloads with a header row and only this org's data | e2e || ✓ |
| F08-E1 | edge: no data | empty org | empty state, no NaN / Infinity | e2e || ✓ |
| F08-E2 | edge: CSV injection | PR title starting with `=` in the export | cell is neutralized | e2e (after seeding such a title) || ✓ n/a: the export holds only dates and counts |
| F08-N1 | negative: export signed out / other org | GET export signed out | 401 / redirect, no data | e2e || ✓ |

## F09 Admin manages seats and billing

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| F09-H1 | happy | S12 invite → pending invite listed → revoke | invite created then removed | e2e || ✓ |
| F09-H2 | happy | change a member's role; remove a member | persists; seat count follows | e2e || ✓ |
| F09-H3 | happy | invite accept page as the invited email | joins the org | e2e || ✓ |
| F09-E1 | edge: invalid / duplicate invite email | "not-an-email", an existing member, a pending invite | validation message, no duplicate | e2e || ✓ |
| F09-E2 | edge: last admin | demote / remove the only admin | refused with a message | e2e + vitest [an org keeps at least one admin] || ✓ |
| F09-E3 | edge: trial | S13 on a trial org | days left shown, upgrade CTA | e2e || ✓ |
| F09-N1 | negative: invite for another email | accept an invite signed in as someone else | refused | e2e + vitest [email must match] || ✓ |
| F09-N2 | negative: card declined | Stripe Checkout with 4000 0000 0000 0002 | error in Checkout, plan unchanged | manual || — |
| F09-N3 | negative: member | member opens S12/S13/S15 | no admin controls | e2e || ✓ |
| F09-H4 | happy | S15 create API key → shown once → revoke; API call with it | key works on /api/v1, fails after revoke | e2e || ✓ |
| F09-N4 | negative: API without / with bad key | GET /api/v1/repositories | 401 | e2e || ✓ |

## F10 Developer reviews locally (CLI)

Not built (features.csv: CLI is a known gap). Nothing to test.

## Cross-cutting

| case | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- |
| X-1 | a11y + console | every dashboard screen, 1440 and 390 | 0 axe violations, 0 console errors, 0 overflow | e2e (`screens.spec.ts`) || ✓ 40/40 (after BUG-015) |
| X-2 | slow network | S07 save and S08 add under 3G throttling | button shows pending, no double write | e2e || ✓ |
| X-3 | offline | submit S08 while offline | error toast, form keeps its input | e2e || ✗ BUG-002 (open) |
| X-4 | time zones | analytics/reviews viewed with `TZ=Pacific/Auckland` browser | dates labelled UTC, no off-by-one | e2e || ✓ |
| X-5 | security headers | any page | frame-ancestors none, nosniff, HSTS | e2e || ✓ |
| X-6 | sign out everywhere | /settings/account | all sessions deleted, other tab signed out | e2e || ✓ |

## Second pass (after /replica-build: Free plan, learning from review comments, S15)

Build 9d661fd, fixes in 7f4f099. Everything above was re-run as well.

| case | flow | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- | --- |
| F09-H5 | billing | happy | trial ends → Continue on Free | Free card, invites off on S12 | e2e | ✓ |
| F09-E4 | billing | edge: several members | canceled Team org with 2 members | no Free button, says why | e2e | ✓ |
| F09-E5 | billing | edge: allowance used | Free org at 52/50 | "free reviews used" alert, nothing about billing | e2e | ✓ after fix (✗ BUG-016) |
| F09-E6 | billing | edge: trial over allowance | trial at 55/50 | no "billed per review" | e2e | ✓ after fix (✗ BUG-016) |
| F09-E7 | billing | edge: double click | double-click Continue on Free | one switch, no error | e2e | ✓ |
| F09-E8 | billing | negative: paying org | Team org on S13 | no Free option | e2e | ✓ |
| F09-N5 | billing | negative: invite into Free | invitee accepts | refused, told to ask an admin | e2e | ✓ after fix (✗ BUG-017) |
| F09-N6 | billing | negative: member / paid | member or Team org calls continueOnFree | refused | vitest | ✓ |
| F09-E9 | billing | edge: allowance in the worker | Free org at 50 used, or 2 members | review skipped with a reason; Free reviews not billable | vitest | ✓ |
| F09-H6 | api | happy | S15 | shows curl calls for this server, no CLI | e2e | ✓ |
| F05-H3 | learning | happy | teammate's inline review comment (webhook) | kept as human_comment | e2e + vitest | ✓ |
| F05-E2 | learning | negative | outsider, bot, "lgtm" | not kept | e2e + vitest | ✓ |
| F05-E3 | learning | edge: redelivery | same comment twice | kept once | e2e + vitest | ✓ |
| F05-E4 | learning | edge: unknown PR | comment on a PR not recorded | skipped, 202 (gap in "To check") | e2e | ✓ |
| F05-H4 | learning | happy | learn-rules with only comments | suggested rule citing them, linked to the PR | vitest | ✓ |
| F05-E6 | learning | edge: HTML/emoji in evidence | S08 suggested rule | shown as text, no script, axe clean | e2e | ✓ |
| X-1 | all | a11y | new states S13-free, S12-free at 1440/390 | 0 violations | screens.mjs | ✓ |

## Results

| suite | cases | passed | failed | notes |
| --- | --- | --- | --- | --- |
| e2e (`npm run e2e`) | 109 | 106 | 0 | 3 expected failures = open S3 bugs (BUG-002, BUG-013, BUG-014), marked `test.fail` |
| vitest (`npm run test:db`) | 93 | 93 | 0 | |
| flow scripts (`slice`, `config-flow`, `org-flow`, `live-loop`) | 4 | 4 | 0 | |
| screen check (`scripts/screens.mjs`) | 56 | 56 | 0 | 28 states × 2 widths |
| manual (real accounts) | 5 | — | — | not run: needs a GitHub App, Stripe, Resend, Google |

Bugs: 17 found, 14 fixed, 3 open (all S3). See `bugs.md`.

## Manual checklist (needs real accounts; run before /replica-deploy)

1. Install the GitHub App on a test org; open a PR with a deliberate bug; check summary, inline anchors, suggestion block, check run (F01-H2, F02-H1 for real).
2. 👍 and 👎 the same comment from two accounts; wait 15 minutes for sync (F05-E1).
3. Stripe test mode: upgrade with 4242…, then a declined card 4000 0000 0000 0002, then cancel in the portal (F09-N2).
4. Email sign-in link and invite email arrive from your domain; links work once (Resend).
5. Google sign-in with a fresh account.
