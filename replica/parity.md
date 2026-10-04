# Parity: REPTILE vs Greptile

> **Update after /replica-build (2026-10-04):** feature parity is now **92.9**. Free plan and learning from human review
> comments are done, and S15 no longer advertises the unbuilt CLI (top-five items 3–5). Every row still missing is a
> *could*. Items 1–2 (first live run, installation squatting) are still open. Everything below is the original report.

Date: 2026-10-04. Build: aae07c6 (after /replica-test). Original: Greptile, from public docs extracts only (see `recon.md`).

## Verdict: shippable on paper, not yet proven live

| gate | result |
| --- | --- |
| Must-haves done | **22 of 22** |
| Feature score | **91.2 / 100** (needs 80+) |
| Open S1 bugs | **0** (2 found, 2 fixed) |
| Open S2 bugs | **0** (4 found, 4 fixed) |
| Layout score | **not measured**: no reference screenshots of the original exist (see below) |
| Better than the original | not yet; /replica-entrepreneur hasn't run |

By the rubric this is **shippable**. Three things the scores can't see stand between that and actually shipping:

1. **No review has run against real GitHub or Claude.** Every review in every test used the fake GitHub and the fake model.
   Review quality, the product itself, is unmeasured.
2. **One possible S2 is unverified**: installation squatting (`bugs.md`, "To check" #1). It needs two real GitHub accounts to
   confirm or rule out.
3. **The layout was never compared with the original's.**

## Scores

| | score | notes |
| --- | --- | --- |
| **Overall** | **91.2** | feature score only; no layout score to blend in |
| Feature parity | 91.2 | 51 rows counted (must ×3, should ×2, could ×1, partial = half); 5 `skip` rows left out on purpose |
| Layout parity | n/a | the network policy blocks greptile.com, docs.greptile.com and app.greptile.com, and nobody has an account to capture the dashboard |

### Feature parity by area, weakest first

| area | score | features |
| --- | --- | --- |
| integrations | 0.0 | 4 (GitLab, GHE, Jira/Linear, Slack) |
| cli | 0.0 | 1 |
| knowledge | 50.0 | 1 |
| security | 50.0 | 1 |
| api | 50.0 | 1 |
| learning | 75.0 | 2 |
| billing | 75.0 | 2 |
| rules | 83.3 | 3 |
| review | 98.8 | 16 |
| onboarding, repos, indexing, config, analytics, team | 100.0 | 20 |

All weak areas are should/could rows. Every must-have, which together make up the core review loop, is done.

### Layout

No layout score against the original. To get one:

1. Allow `www.greptile.com` (and `docs.greptile.com`) in this environment's network settings, or take screenshots by hand.
   They go in `replica/screens/` at 1440×900 and 390×844, named by screen ID (`S05.png`, `S05-mobile.png`).
   Public pages only give S01 and S20; the dashboard (S02–S16) needs a trial account.
2. Run `python3 imgdiff.py replica/screens/S05.png replica/clone-screens/S05.png --json > replica/diffs/S05.json`, then
   `parity.py --visual replica/diffs/*.json`.

**Regression check instead (clone against clone):** all 52 screen states captured before /replica-test (c424563) were diffed
against the current build in layout mode. 37 scored 96–100. The 15 lower scores (S04, S10, S11, S12, S14, S15 at 50–92) were
checked by eye. Every one is a data difference (an extra fake installation, a revoked key row, a connected integration,
different review rows and times), not a layout change. The fixes moved nothing. The current build also passes the screen check
(axe WCAG 2.2 AA, no console errors, no overflow) on all 52.

## Missing features, in build order

| priority | area | feature | clone | what's missing |
| --- | --- | --- | --- | --- |
| should | billing | Free tier and 14-day trial | partial | trial, reminder and pause done; no free tier (the original has 1 dev with 50 reviews free) |
| should | learning | Infer rules from human review comments | partial | only replies under REPTILE's own comments are learned from |
| could | cli | CLI local review (`review -b`, `--resume`) | no | read API exists; no CLI, no diff-review endpoint |
| could | integrations | GitHub Enterprise Server | no | "coming soon" on S02 |
| could | integrations | GitLab merge requests | no | "coming soon" on S02 |
| could | integrations | Jira/Linear ticket context | no | S14 says it isn't set up |
| could | integrations | Slack Q&A | no | same |
| could | rules | Related repos as extra context | no | |
| could | api | Public API + MCP | partial | read endpoints only; no write endpoints, MCP |
| could | knowledge | Auto-generated knowledge base | partial | view and edit; generation not built |
| could | review | Fix with your Agent | partial | prompt pages; no deep links into specific agents |
| could | security | Static rules + dependency CVEs | partial | AI security findings only |

## Behaviour differences

From walking every flow in the clone (e2e suite and flow scripts) against what Greptile's docs describe. The original couldn't be
walked live, so its side is from its docs.

| flow | original does | clone does | fix or keep |
| --- | --- | --- | --- |
| F01 onboarding | ~6 clicks in the app + 3 on GitHub; "first review in under 5 minutes" | 5 clicks + typing an org name, + 3 on GitHub (`scripts/slice.mjs`) | **keep** (fewer clicks). Time to first review is unmeasured: measure on the first live run |
| F02 review speed | median review 2:25 (v5 blog) | unknown: only the fake model has run | **fix**: time real reviews; 3 parallel calls per PR and prompt caching are in place |
| F02 review failure | check run "failure" (docs) | check run "neutral" with a plain message; no credit used; retries before anything is posted | **keep**: a failed review shouldn't block merging |
| F02 drafts | skipped by default, mention overrides | same; "ready for review" now reviews (BUG-004) | keep |
| F03 who can trigger | `@greptileai` from a PR comment (docs don't say who) | `@reptile` only from owners, members and collaborators (BUG-006); not on closed PRs or repos with reviews off | **keep**: outsiders can't spend your reviews |
| F03 stuck reviews | not documented | a review with no progress for an hour is marked failed and can be run again (BUG-008) | keep |
| F04 fix | "Fix with your Agent" opens the agent (Cursor, Claude Code…) with the prompt | opens a REPTILE page with the prompt to copy (sign-in required) | **fix later**: add agent deep links (could) |
| F05 learning | learns from reactions and from the team's own review comments | learns from 👍/👎 (polled every 15 min) and replies under its comments; proposes rules for an admin to accept | **fix**: ingest other human review comments (should) |
| F06 config | greptile.json, `.greptile/` folders, dashboard; path > repo > org | the same three layers with `reptile.json` and `.reptile/`; ignore patterns now honour that order (BUG-010) | keep |
| F09 pricing | $30/dev/month incl. 50 reviews, $1 per extra; free plan (1 dev, 50 credits) | $24/seat incl. 50 reviews per seat, $0.80 per extra; 14-day trial, no free plan | **decide in /replica-launch**; add a free plan (should) |
| F09 trial → paid | not documented | trial reviews are never billed after upgrading (BUG-003) | keep |
| F10 CLI | `greptile review`, `-b`, `--resume` | not built, but **S15 shows install commands for a `reptile-cli` that doesn't exist** | **fix now**: hide that block until the CLI ships (misleading) |
| Emails | sign-up, invites, billing (assumed) | sign-in link, invite, payment failed, trial ending (logged locally until Resend is set up) | keep; check delivery in the manual checklist |
| Remembered between visits | org, settings | active org (cookie), theme, collapsed sidebar, table/chart view | keep |
| Integrations | Jira, Linear, Notion, Slack, Datadog connect | S14 says the OAuth app isn't set up instead of pretending | keep the honesty; build Linear/Jira first if users ask |

## Top five to build next

1. **First live run and a review-quality eval.** Install the GitHub App on a test org with real Claude and Voyage keys. Run
   20–50 real PRs with known bugs and measure precision, recall and review time against strictness. This is the product, and no
   parity score covers it. (backend.md "Before launch")
2. **Close the installation-squatting question** (`bugs.md` "To check" #1). Confirm it with two GitHub accounts, then require
   admin on the account when linking. Do this before anyone outside the team signs up.
3. **Free plan** (should). One developer, a small monthly review allowance; the original has one, and it's how teams try it.
4. **Learn from all human review comments** (should). Ingest `pull_request_review_comment` events that aren't replies to
   REPTILE, so rules are inferred from what the team actually asks for.
5. **Hide the CLI block on S15** (minutes), then build the CLI on a diff-review endpoint (could). It's the next most visible
   gap after integrations and reuses the existing pipeline.

Then: `/replica-build` for 3–5, or `/replica-entrepreneur` now, since must-have parity is there and the gaps left are should/could rows.
