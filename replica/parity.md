# Parity: REPTILE vs Greptile

Date: 2026-10-04. Build: b34a122 (after the second /replica-build and /replica-test passes).
Original: Greptile, from public docs extracts only (see `recon.md`). Previous report: 91.2 at cf1f9f7.

## Verdict: shippable on paper, not yet proven live

| gate | result |
| --- | --- |
| Must-haves done | **22 of 22** |
| Feature score | **92.9 / 100** (needs 80+; was 91.2) |
| Open S1 bugs | **0** (2 found, 2 fixed) |
| Open S2 bugs | **0** (4 found, 4 fixed) |
| Open S3 / S4 | 3 open S3 (BUG-002, BUG-013, BUG-014), all with workarounds |
| Layout score | **not measured**: no reference screenshots of the original |
| Better than the original | not yet; /replica-entrepreneur hasn't run |

By the rubric this is **shippable**. Three things the scores can't see still stand between that and actually shipping:

1. **No review has run against real GitHub or Claude.** Every review in every test used the fake GitHub and the fake model.
   Review quality, the product itself, is unmeasured.
2. **Installation squatting is unverified** (`bugs.md`, "To check" #1). It's a possible S2 that needs two real GitHub accounts
   to confirm or rule out.
3. **The layout was never compared with the original's.**

## Scores

| | score | notes |
| --- | --- | --- |
| **Overall** | **92.9** | feature score only; no layout score to blend in |
| Feature parity | 92.9 | 51 rows counted (must ×3, should ×2, could ×1, partial = half); 5 `skip` rows left out on purpose |
| Layout parity | n/a | the network policy blocks greptile.com, docs.greptile.com and app.greptile.com, and nobody has an account to capture the dashboard |

### Feature parity by area, weakest first

| area | score | features | change |
| --- | --- | --- | --- |
| integrations | 0.0 | 4 (GitLab, GHE, Jira/Linear, Slack) | |
| cli | 0.0 | 1 | |
| knowledge | 50.0 | 1 | |
| security | 50.0 | 1 | |
| api | 50.0 | 1 | |
| rules | 83.3 | 3 | |
| review | 98.8 | 16 | |
| learning | 100.0 | 2 | was 75: learns from the team's own review comments |
| billing | 100.0 | 2 | was 75: Free plan (one person, 50 reviews a month) |
| onboarding, repos, indexing, config, analytics, team | 100.0 | 20 | |

Every must-have and every should-have is done. Everything still missing is a *could*.

### Layout

There's no layout score against the original. To get one, allow `www.greptile.com` in the environment's network settings or
take screenshots by hand, put them in `replica/screens/` at 1440×900 and 390×844 named by screen ID, then run
`imgdiff.py … --json` per screen and `parity.py --visual`. Public pages only give S01 and S20; the dashboard needs a trial
account.

**Clone regression instead:**
- First pass: all 52 screen states were diffed against their pre-fix versions. Every difference was seed data; no layout
  change.
- Since then: S13-free and S12-free were added (56 states), and S15's CLI block was replaced by the API block.
- All 56 states pass the screen check (axe WCAG 2.2 AA, no console errors, no overflow at 1440 and 390).
- The last UI change, the usage-meter note on S13 (BUG-016), is covered by e2e axe checks.

## Missing features, in build order

| priority | area | feature | clone | what's missing |
| --- | --- | --- | --- | --- |
| could | cli | CLI local review (`review -b`, `--resume`) | no | read API exists; no CLI, no diff-review endpoint |
| could | integrations | GitHub Enterprise Server | no | "coming soon" on S02 |
| could | integrations | GitLab merge requests | no | "coming soon" on S02 |
| could | integrations | Jira/Linear ticket context | no | S14 says it isn't set up |
| could | integrations | Slack Q&A | no | same |
| could | rules | Related repos as extra context | no | |
| could | api | Public API + MCP | partial | two read endpoints (shown on S15); no write endpoints, MCP |
| could | knowledge | Auto-generated knowledge base | partial | view and edit; generation not built |
| could | review | Fix with your Agent | partial | prompt pages; no deep links into specific agents |
| could | security | Static rules + dependency CVEs | partial | AI security findings only |

## Behaviour differences

From walking every flow in the clone (109 e2e cases, flow scripts) against what Greptile's docs describe. The original
couldn't be walked live, so its side is from its docs.

| flow | original does | clone does | fix or keep |
| --- | --- | --- | --- |
| F01 onboarding | ~6 clicks in the app + 3 on GitHub; "first review in under 5 minutes" | 5 clicks + typing an org name, + 3 on GitHub | **keep** (fewer clicks). Time to first review unmeasured until the first live run |
| F01 install from GitHub's page | lands on its setup flow (assumed) | ends on "The install didn't finish" (BUG-014, open) | **fix**: with the installation-squatting check, since both touch linking |
| F02 review speed | median review 2:25 (v5 blog) | unknown: only the fake model has run | **fix**: time real reviews |
| F02 review failure | check run "failure" | "neutral" with a plain message; no credit used; retries before posting | **keep** |
| F02 drafts | skipped, mention overrides | same; "ready for review" reviews | keep |
| F03 who can trigger | `@greptileai` (docs don't say who) | `@reptile` from owners, members, collaborators only; not on closed PRs or repos with reviews off | **keep**: outsiders can't spend your reviews |
| F03 stuck reviews | not documented | no progress for an hour → failed, can run again | keep |
| F04 fix | opens the agent with the prompt | REPTILE page with the prompt to copy; 404 if another of your orgs is active (BUG-013, open) | **fix** BUG-013; agent deep links later (could) |
| F05 learning | reactions and the team's review comments | 👍/👎, replies, and the team's own inline review comments (write access only); rules proposed for an admin to accept | **keep**: now at parity, and suggestions need approval |
| F06 config | greptile.json, `.greptile/`, dashboard; path > repo > org | `reptile.json`, `.reptile/`, dashboard, same order | keep |
| F09 plans | Free (1 dev, 50 credits); $30/dev incl. 50, $1 per extra | Free (one person, 50 reviews a month, no card); Team $24/seat incl. 50 per seat, $0.80 per extra; 14-day trial first | **decide in /replica-launch** (price); plan shape is at parity |
| F09 trial → paid | not documented | trial reviews never billed after upgrading | keep |
| F10 CLI | `greptile review`, `-b`, `--resume` | not built; S15 shows the read API instead of promising a CLI | **build** (could) |
| Saving offline | not documented | the error screen replaces the page and the input is lost (BUG-002, open) | **fix** |
| Emails | sign-up, invites, billing (assumed) | sign-in link, invite, payment failed, trial ending (logged until Resend is set up) | keep; check delivery in the manual checklist |
| Integrations | Jira, Linear, Notion, Slack, Datadog | S14 says the OAuth app isn't set up | keep the honesty; build the one users ask for |

## Top five to build next

1. **First live run and a review-quality eval.** GitHub App on a test org, real Claude and Voyage keys, 20–50 real PRs with
   known bugs: measure precision, recall and review time, and tune strictness. No parity score covers this, and it's the
   product.
2. **Linking safety and the install-from-GitHub flow together.** Confirm or rule out installation squatting with two GitHub
   accounts, require admin on the account when linking, then fix BUG-014 on top of that check.
3. **The two other open S3s.** BUG-013 (fix links when another org is active: switch to the right org automatically if
   you're a member) and BUG-002 (a network-failure wrapper for server actions so forms keep their input).
4. **CLI on a diff-review endpoint** (could). It's the most visible remaining gap and reuses the review pipeline;
   `--resume` can come later.
5. **One ticket integration (Linear or Jira)** (could): reviews checked against what the issue asked for. Let
   /replica-entrepreneur decide which one, from what Greptile's users ask for.

Next: **`/replica-entrepreneur`**. Must-have and should-have parity is there, and the gaps left are *could* rows. A straight
copy has no reason to exist; the next step is finding what Greptile's users hate and fixing it here.
