# Bugs: REPTILE

Found by /replica-test on 2026-10-04. Build under test: c424563. Env: local production build (`next start`), Postgres 16,
seed data, `AUTH_DEV_LOGIN=1 GITHUB_FAKE=1 REVIEW_FAKE_AI=1`, Chromium 1440px unless noted.

Every bug below was reproduced: by an e2e spec in the browser, or by a vitest test against Postgres that drives the real webhook
route, worker job or data layer. Each fix started with that test failing. Open bugs keep their repro as an expected failure
(`test.fail` in `web/e2e/known-bugs.spec.ts` / `cross-cutting.spec.ts`), so the test turns red once the bug is fixed and the
marker should come off. Unconfirmed ideas are listed under "To check" at the bottom, not as bugs.

| ID | sev | title | status |
| --- | --- | --- | --- |
| BUG-003 | S1 | Trial reviews billed as overage after upgrading | fixed in 33c1a7c |
| BUG-006 | S1 | Any GitHub user could start billable reviews and model answers by @mention | fixed in 8afc356 |
| BUG-001 | S2 | Open redirect: `/login?next=//evil.example` for signed-in users | fixed in 3794e89 |
| BUG-004 | S2 | A draft marked "ready for review" was never reviewed automatically | fixed in 8afc356 |
| BUG-005 | S2 | @mention reviewed repositories whose reviews are turned off | fixed in 8afc356 |
| BUG-008 | S2 | A review whose job died blocked every new review of its PR forever | fixed in 3bff6e8 |
| BUG-007 | S3 | @mention on a closed or merged PR was reviewed and billed | fixed in 8afc356 |
| BUG-009 | S3 | A retried review left an orphan "REPTILE is reviewing" check run | fixed in 3b6e6fe |
| BUG-010 | S3 | A nearer `.reptile/config.json` couldn't un-ignore files | fixed in 3b6e6fe |
| BUG-011 | S3 | Labels in a repository's own settings never started a review | fixed in f3d07b0 |
| BUG-012 | S3 | "Fix all" 404 once an org has 200+ newer reviews | fixed in e4b6e58 |
| BUG-015 | S3 | Loading skeletons fail axe and aren't announced | fixed in 6f989a6 |
| BUG-016 | S3 | Trial and Free orgs told reviews past the allowance are "billed per review" | fixed in 7f4f099 |
| BUG-017 | S4 | Invitees to a Free org told to "choose the Team plan", which they can't | fixed in 7f4f099 |
| BUG-002 | S3 | A save that fails on the network replaces the page and loses the input | open |
| BUG-013 | S3 | Fix links from GitHub 404 while another of your orgs is active | open |
| BUG-014 | S3 | Installing from GitHub's own page ends on "The install didn't finish" | open |

By severity: S1 2 (2 fixed) · S2 4 (4 fixed) · S3 10 (7 fixed, 3 open) · S4 1 (1 fixed). **No open S1 or S2.**

Second pass (after /replica-build added the Free plan, learning from review comments and the S15 change; build 9d661fd):
2 new bugs, both fixed.

---

### BUG-003: Trial reviews billed as overage after upgrading

- Severity: S1 (payments wrong)
- Flow / case: F09 / F09-E3 (trial → paid)
- Screen: S13 (billing), worker `report-usage`
- Build: c424563

Steps
1. Create an org (14-day trial, 1 seat, 50 included reviews per seat).
2. Run 55 reviews during the trial (worker writes 55 `usage_events`).
3. Upgrade: `checkout.session.completed` sets `plan = 'pro'`.
4. The hourly `report-usage` job runs.

Expected: nothing is billed for trial reviews, and the paid plan's 50 included reviews start from the upgrade.
Actual: 5 overage meter events are sent to Stripe for trial reviews (`row_number()` over every usage row of the month).
Evidence: `src/lib/billing/billing.test.ts` › "BUG-003 reviews done during the trial are never billed as overage after upgrading" (failed with 5 sent, passes after the fix).
Fix: `usage_events.billable` (migration 0004) is set from the org's plan when the review completes (`recordUsage`); only billable rows count toward the included amount and overage.
Status: fixed in 33c1a7c

### BUG-006: Any GitHub user could start billable reviews and model answers by @mention

- Severity: S1 (security / payments: outsiders spend the org's reviews and model budget)
- Flow / case: F03 / F03-H2, recon edge "mention by non-member"
- Screen: S17/S18 (GitHub side), webhook `issue_comment`, `pull_request_review_comment`
- Build: c424563

Steps
1. On a public repository with REPTILE installed, a GitHub user with no access to the repo comments `@reptile review this` on a PR.
2. Or replies `@reptile explain` under one of REPTILE's inline comments.

Expected: only people with write access (`author_association` OWNER, MEMBER, COLLABORATOR) can trigger reviews or answers.
Actual: the review is queued and billed (up to 10 per PR per hour); the thread question queues a model call with no limit.
Evidence: `src/lib/github/github.test.ts` › "BUG-006 only people with write access can start a review by mention", "BUG-006 outsiders' questions in a thread are recorded but not answered".
Status: fixed in 8afc356

### BUG-001: Open redirect on the sign-in page

- Severity: S2 (security; phishing aid, no data exposure)
- Flow / case: F01 / F01-N2
- Screen: S01
- Build: c424563  Browser: Chromium 1440px

Steps
1. Be signed in.
2. Open `http://localhost:3100/login?next=//evil.example/x` (also `/\evil.example`, `/%09/evil.example`).

Expected: stay on REPTILE (`/repos`).
Actual: the browser is redirected to `evil.example`. `login/page.tsx` only checked `next.startsWith("/")`; the sign-in actions and dev login also let `/\host` through.
Evidence: `e2e/f01-onboarding.spec.ts` › "F01-N2b the sign-in page won't send a signed-in user off-site" and "F01-N2 dev login…" (failed, pass after the fix); `src/lib/safe-next.test.ts`.
Fix: one `safeRedirectPath()` for all three.
Status: fixed in 3794e89

### BUG-004: A draft marked "ready for review" was never reviewed automatically

- Severity: S2 (core flow F02 broken for every draft-first team; workaround: @mention)
- Flow / case: F02 / F02-E1
- Build: c424563

Steps
1. Open a draft PR. The worker skips it ("Draft pull request").
2. Mark it ready for review without pushing.

Expected: a review is queued.
Actual: `already reviewed`. The skipped row still held the once-per-commit unique index (`reviews_once_per_sha_auto`), so the insert failed silently.
Evidence: `src/lib/github/github.test.ts` › "BUG-004 a draft marked ready for review is reviewed automatically".
Status: fixed in 8afc356 (a `ready_for_review` or `labeled` event supersedes the skipped review of the same commit)

### BUG-005: @mention reviewed repositories whose reviews are turned off

- Severity: S2 (the admin's switch in S05 is ignored; reviews are billed)
- Flow / case: F03 / F03-H2, F06
- Build: c424563

Steps
1. Turn reviews off for `acme/legacy-billing` (seeded off).
2. Comment `@reptile` on one of its PRs.

Expected: `reviews off`, nothing queued.
Actual: review queued, run and billed.
Evidence: `src/lib/github/github.test.ts` › "BUG-005 a mention doesn't review a repository with reviews turned off".
Status: fixed in 8afc356

### BUG-008: A review whose job died blocked every new review of its PR forever

- Severity: S2 (PR can never be reviewed again; the review page spins forever with Run again disabled)
- Flow / case: F03 / F03-E1, F02-E4
- Build: c424563

Steps
1. A review is queued or running and its job is lost (worker crash, 15-minute expiry on all 3 attempts, or `enqueue` failing after the insert).
2. Click Run again, comment `@reptile`, or push.

Expected: after the job's maximum lifetime, the stuck review stops blocking.
Actual: "A review is already running for this pull request." forever (`reviews_one_active_per_pr`); nothing reaps it.
Evidence: `src/lib/data/data.test.ts` › "BUG-008 a review whose job died stops blocking new reviews after an hour".
Fix: `failStaleReviews()` marks reviews untouched for an hour as failed ("didn't finish within an hour. Run it again."), before queueing and in the daily cleanup. Follow-up in "To check": the GitHub check run of such a review stays "in progress".
Status: fixed in 3bff6e8

### BUG-007: @mention on a closed or merged PR was reviewed and billed

- Severity: S3
- Flow / case: F03 / recon edge "mention on a closed PR"
- Evidence: `src/lib/github/github.test.ts` › "BUG-007 a mention on a closed or merged pull request is ignored". The existing test "@reptile on a PR queues a review" was mentioning a merged PR and expecting a review; it now reopens the PR first.
- Status: fixed in 8afc356

### BUG-009: A retried review left an orphan "REPTILE is reviewing" check run

- Severity: S3 (visibly wrong on GitHub: a check stuck "in progress" next to the real one)
- Flow / case: F02 / F02-E4
- Steps: the model call fails once with a retryable error after the check run was created; the retry succeeds.
- Expected: one check run, completed. Actual: two; the first never completes.
- Evidence: `worker/pipeline.test.ts` › "BUG-009 a retried review completes the one check run it started".
- Status: fixed in 3b6e6fe (retries reuse `reviews.check_run_id`)

### BUG-010: A nearer `.reptile/config.json` couldn't un-ignore files

- Severity: S3 (config precedence path > repo, recon F06, doesn't hold for `ignorePatterns`)
- Steps: `reptile.json` has `"ignorePatterns": ["**/*.md"]`; `docs/.reptile/config.json` has `"ignorePatterns": []`; a PR changes `docs/guide.md`.
- Expected: reviewed. Actual: "skipped: Only ignored files changed" (the repo-level list was applied a second time after the per-file filter). Ignore matching was also case-sensitive in the worker and case-insensitive in the dashboard; both are case-insensitive now.
- Evidence: `worker/pipeline.test.ts` › "BUG-010 a .reptile/config.json nearer the file can un-ignore what reptile.json ignores".
- Status: fixed in 3b6e6fe

### BUG-011: Labels in a repository's own settings never started a review

- Severity: S3 (workaround: set the label at org level)
- Steps: S06 "Customize for this repository" → Only with these labels `needs-review` (org has none) → label a PR `needs-review`.
- Expected: review queued. Actual: `pull request labeled`, nothing queued (only the org row was read).
- Evidence: `src/lib/github/github.test.ts` › "BUG-011 a label from the repository's own settings starts a review".
- Status: fixed in f3d07b0 (labels set only in `reptile.json` still don't trigger on the label event; see "To check")

### BUG-012: "Fix all" 404 once an org has 200+ newer reviews

- Severity: S3 (the link is in every GitHub summary; older ones break)
- Steps: an org with 201 reviews newer than PR X's latest completed review → open `/fix/pr/<X>` (the "Fix all" link).
- Expected: the prompt. Actual: "We couldn't find that" (`listReviews` caps `limit` at 200).
- Evidence: `e2e/known-bugs.spec.ts` › "BUG-012 Fix all works for a PR whose review is older than the newest 200".
- Status: fixed in e4b6e58

### BUG-015: Loading skeletons fail axe and aren't announced

- Severity: S3 (WCAG 2.2 AA: `aria-prohibited-attr`; screen readers get nothing while loading)
- Screen: every app route's `loading.tsx`, and S17 review in progress
- Steps: open any app page on a slow load, or a review that is running; run axe.
- Expected: 0 violations, a status announced. Actual: `aria-label attribute cannot be used on a div with no valid role attribute`.
- Evidence: `e2e/known-bugs.spec.ts` › "BUG-015 …"; first seen as an intermittent axe failure in F04-H2.
- Status: fixed in 6f989a6 (`role="status"`)

### BUG-016: Trial and Free orgs told reviews past the allowance are "billed per review"

- Severity: S3 (wrong billing information; nothing was actually charged, see BUG-003)
- Flow / case: F09 / F09-E5, F09-E6
- Screen: S13
- Build: 9d661fd  Browser: Chromium 1440px

Steps
1. Trial org "Side project" (1 seat, 50 included) runs 55 reviews this month.
2. Open Billing.

Expected: no claim of charges (trial reviews aren't billed); on Free, the "free reviews used" notice only.
Actual: "5 over the included amount, billed per review." under the usage meter, on trial and on Free alike.
Evidence: `e2e/f08-f09-org.spec.ts` › "F09-E5 …", "F09-E6 …" (failed, pass after the fix).
Fix: the meter's note depends on the plan: Team keeps "billed per review", trial says trial reviews aren't billed, Free shows none (its alert explains the pause).
Status: fixed in 7f4f099

### BUG-017: Invitees to a Free org told to "choose the Team plan", which they can't

- Severity: S4 (copy)
- Flow / case: F09 / F09-N5
- Screen: invite page
- Steps: an admin of a Free org created an invite earlier (or before switching to Free); the invitee opens the link and clicks Accept and join.
- Expected: why it can't work and who can fix it. Actual: "The Free plan is for one person. Choose the Team plan to invite teammates." (the admin's message).
- Evidence: `e2e/f08-f09-org.spec.ts` › "F09-N5 an invite to a Free org tells the invitee what to do".
- Fix: "Solo is on the Free plan, which is for one person. Ask an admin of Solo to choose the Team plan, then open this link again."
- Status: fixed in 7f4f099

### BUG-002: A save that fails on the network replaces the page and loses the input

- Severity: S3 (workaround: retype after reconnecting)
- Flow / case: X-3 (offline), affects every dialog/form that calls a server action
- Screen: S08 (reproduced), same pattern in S07, S12, S15
- Build: 6f989a6  Browser: Chromium 1440px

Steps
1. /rules → Add rule → type a rule.
2. Go offline (DevTools / Playwright `setOffline(true)`).
3. Click Add rule.

Expected: an error toast ("couldn't reach the server"), the dialog and the text stay.
Actual: the whole page is replaced by the error screen ("Nothing was changed. Try again in a moment…"); the dialog and the typed rule are gone.
Evidence: `e2e/cross-cutting.spec.ts` › "X-3 offline…" (marked `test.fail`).
Suspected cause: server actions are awaited inside `startTransition`; a rejected fetch (not a returned `{ ok: false }`) propagates to the route error boundary. A small wrapper that catches network errors and returns `{ ok: false, error }` for every client call site would fix it.
Status: open

### BUG-013: Fix links from GitHub 404 while another of your orgs is active

- Severity: S3 (workaround: switch org, then click again)
- Steps: be a member of Acme and Contoso with Contoso active → open a "Fix with your agent" link from an Acme PR (`/fix/<finding>`).
- Expected: the prompt, or "This is in Acme. Switch?" Actual: "We couldn't find that".
- Evidence: `e2e/known-bugs.spec.ts` › "BUG-013 …" (marked `test.fail`). Same for `/reviews/<id>` links.
- Status: open

### BUG-014: Installing from GitHub's own page ends on "The install didn't finish"

- Severity: S3 (workaround: open /onboarding/link by hand)
- Steps: install the GitHub App from github.com/apps/<slug> (not from S02), so GitHub calls the Setup URL with `setup_action=install` and no `state`.
- Expected: the link step (S04). Actual: `/onboarding?error=failed`.
- Evidence: `e2e/known-bugs.spec.ts` › "BUG-014 …" (marked `test.fail`). Needs care in the fix: without our signed state, link only an installation the signed-in user can administer (see "Installation squatting" below).
- Status: open

---

## To check (not reproduced here, or needs a real provider)

Ranked. These came from a code read; none was confirmed in this environment.

1. **Installation squatting (likely S2, check before launch).** `linkInstallation` accepts any installation that the user's
   `GET /user/installations` returns. GitHub returns installations where the user has *any* explicit access, read included.
   A read-only collaborator on one repo of org X could link X's installation to their own REPTILE org first: the real owner
   gets "already linked", and repos added later land in the squatter's org. The fake GitHub can't show what the real API
   returns, so check it with two GitHub accounts. Likely fix: require org admin (`GET /user/memberships/orgs/{org}` role
   `admin`, or the account login equals the user for personal installs), or bind linking to the `installation_id` from the
   state-verified setup callback.
2. **Account deletion doesn't update Stripe seats** (`deleteAccount` skips `updateSeats`), and a failed subscription cancel is
   swallowed while the org is deleted anyway, so a customer could keep being charged with no org to cancel from. Needs Stripe
   test mode.
3. A review failed by the stale reaper (BUG-008) leaves its GitHub check run "in progress".
4. Org-level ignore patterns aren't applied when indexing (only the repo row's), and the clone-timeout message suggests ignore
   patterns, which can't help because the full clone runs first.
5. Labels set only in `reptile.json` / `.reptile/` don't start a review on the `labeled` event (the webhook can't read repo
   files; the worker applies them on other triggers).
6. Out-of-order Stripe events: a late `customer.subscription.created` with status `incomplete` after `checkout.session.completed`
   would map to `free/canceled` and pause reviews.
7. Findings auto-marked `addressed` are never reopened if a later review reports them again.
8. Review detail lists every finding on the PR (including later reviews') and renders the summary with today's config, not
   the review's `effective_config`.
9. Two admins demoting each other at the same moment could leave no admin (admin count is checked outside a transaction).
10. No review cap on trials; a user can create 10 orgs a day, each with a fresh trial.
11. Inviting an existing member whose GitHub email has different case isn't recognised as already a member.
12. `scripts/slice.mjs` failed once right after a full e2e run (Node stack, no assertion text kept) and passed on two reruns,
    including the same sequence. Not reproduced.
13. Trial usage rows (now `billable = false`) are never marked reported; harmless, but the partial index on unreported rows grows.
14. A review comment on a PR REPTILE hasn't recorded yet (opened before linking, never mentioned) isn't learned from
    (`pull request unknown`). The mention path fetches such PRs; this one could too.
15. Learned-from review comments are kept indefinitely (only the last 30 days are used). Consider purging them in `cleanup`
    after 90 days, and say so on the security page: they are customer-written text.
16. Reviews used during the trial count toward the Free allowance in the month an org switches to Free (same usage rows).
    Probably fine; decide and say it on S13 if not.
17. An org that switches to Free with invites still pending keeps them listed on S12; they can't be accepted (BUG-017's
    message explains), but cancelling them on the switch would be tidier.
