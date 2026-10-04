# What to fix: Greptile's users, in their own words

Sample: **30 Reddit posts and comments** (April to September 2026), all from **one source**, so every theme below is
thin by the skill's rule (fewer than 3 reviews or a single source). G2, Trustpilot, Hacker News, the App Store and
greptile.com were blocked by this environment's network policy; Reddit was read through the XPOZ connector. No star
ratings exist on Reddit. Treat this as a directional read, not a trend. The skill's target is 100+ reviews from 3+
sources; this falls short and says so.

What was left out: Greptile staff replies (used below only as their own statements of what Greptile shipped), founders
and employees of competing tools promoting their product, comments that only name Greptile in a list, and two
comments that read as promotion for another tool. The rows are in `reviews.csv`; `feedback.md` is the keyword pass
from `reviews.py`, which misfiles some praise as bugs at this size, so the counts below were coded by hand.

The overall tone matters: **12 of the 30 are positive**, mostly about Greptile catching real bugs that other reviews
missed. The complaints are about price, billing and process, not about review quality alone.

## 1. What they hate

| # | problem | reviews | sources | |
| --- | --- | --- | --- | --- |
| 1 | Per-review overage pricing: $1 per review after 50, a $30 seat for anyone who opens a PR, bills that spike | 6 complaints (+3 more who are price-sensitive; 2 call it reasonable or transparent) | 1 | thin |
| 2 | Review quality: inconsistent, shallow on architecture, "worse" lately | 5 (2 of them about AI reviewers generally, Greptile included) | 1 | thin |
| 3 | Billing surprise and no clean way to cancel | 2 | 1 | thin |
| 4 | Slow: 15+ minutes, about 5 min plus 1-2 min per 200 lines | 2 | 1 | thin |
| 5 | Confidence score is distrusted, or trusted too much ("relies on an X/5 star confidence score") | 2 | 1 | thin |
| 6 | Review loops: every fix commit brings new findings | 1 (plus 1 noting the rest of what it flagged was nits) | 1 | thin |
| 7 | Reviewed an old commit, toggle broken, no support contact | 1 | 1 | thin |
| 8 | Instructions for AI agents placed in the PR body ("prompt injection") | 1 | 1 | thin |

Quotes:

1. Price. "the $1 per review is also insane. I used to defend Greptile over Coderabbit for the past year, but I just can't anymore." and "a marketing person in the team pushing a fix to a .md file shouldn't cost us $30."
   https://www.reddit.com/r/codereview/comments/1sqs5iw/comment/ottulqh/ ·
   "Greptile would be calm for a month then one big migration PR would eat the whole budget in a day."
   https://www.reddit.com/r/webdev/comments/1ouapni/comment/oidwjb4/ ·
   "Idk, so far it’s been ok, just very expensive"
   https://www.reddit.com/r/ClaudeCode/comments/1trtis4/comment/opiimoz/
   Against: "Greptile also seems reasonably priced"
   https://www.reddit.com/r/ClaudeCode/comments/1sf1mx9/is_everything_going_to_be_usage_based_now/ (April 7,
   before the overage complaints).
2. Quality. "They'll flag \"this function is too long\" while missing \"this entire approach won't work because
   you're calling Supabase from a client component.\""
   https://www.reddit.com/r/vibecoding/comments/1srxbxe/comment/ohl84fb/ ·
   "even the code reviews seem to be getting worse and I really don't trust their PR ratings either."
   https://www.reddit.com/r/codereview/comments/1sqs5iw/sick_and_tired_of_greptile_what_are_the_best/
3. Billing. "I have NO WAY to cancel it immediately;" and "I have NO WAY to remove my charging credit cards details;"
   https://www.reddit.com/r/codereview/comments/1sqs5iw/comment/okbuq0z/ · Greptile's team replied that it emailed
   users about the change on March 5, 2026 and was "adding a literal \"cancel\" button"
   (https://www.reddit.com/r/codereview/comments/1sqs5iw/comment/oh9w7yw/, staff, not counted).
4. Slow. "I've previously had greptile and coderabbit take 15+ mins to do a code review of similar quality that others took 1-2 mins to do."
   https://www.reddit.com/r/codereview/comments/1vnblkx/should_we_trust_ai_code_review_benchmarks/
5. Score. "most of the time the team just relies on an X/5 star confidence score, and that’s that."
   https://www.reddit.com/r/ProgrammerHumor/comments/1u2qss9/comment/oraklzx/
6. Loops. "But every new commit that fixes an 'issue' triggers 3 more newly generated review findings"
   https://www.reddit.com/r/cursor/comments/1tulzd6/stuck_in_endless_codereview_cascades/ (three bots, Greptile one
   of them)
7. Stale. "It kept running pr reviews on an older commit hash."
   https://www.reddit.com/r/codereview/comments/1sqs5iw/comment/omdimls/
8. Agent instructions. "the text is sitting in the page content any agent ingests."
   https://www.reddit.com/r/ClaudeAI/comments/1vn8zwq/greptile_prompt_injection_in_pr_reviews/ (the poster says
   they are a vibe coder and the finding came from Claude Sonnet; unverified)

What they like, so the clone keeps it: catching the real bug that in-session review missed ("my /code-review max AND /security-review both missed it in session, greptile caught it on the PR",
https://www.reddit.com/r/ClaudeCode/comments/1uadbiw/comment/osyair9/), reading CLAUDE.md rules, not refusing to
review under load (https://www.reddit.com/r/coderabbit/comments/1u62zwi/comment/orpjcn1/), and "ignore the right things" (https://www.reddit.com/r/codex/comments/1t9a91q/what_are_you_doing_for_code_review/).

## 2. What is missing

All single mentions. Listed so they are not lost, not because they are proven.

| request | reviews | quote |
| --- | --- | --- |
| Billing controls / a spend cap | 1 | "give controls over billing OR seat based" (1sqs5iw post, link above) |
| Gitea (and other self-hosted forges) | 1 | "I don't see anything about gitea." https://www.reddit.com/r/selfhosted/comments/1tym7yt/comment/oqpgn6i/ |
| Plain-English explanations to learn from | 1 | "Extra points if it can explain the issues in plain english so I can learn along the way." https://www.reddit.com/r/vibecoding/comments/1srxbxe/best_ai_code_review_for_vibe_coded_projects/ |
| Collaborative features for a team | 1 | "This tool can help if it provides collaborative features." https://www.reddit.com/r/ClaudeCode/comments/1t9dqjs/comment/ol1d42n/ |
| Current self-host model docs | 1 | "Maybe time to update the self-hosted docs" https://www.reddit.com/r/selfhosted/comments/1tym7yt/comment/oq507bw/ |

Already shipped by Greptile, per its own staff posts, so not a gap: a free tier of 50 reviews a month for solo
developers (https://www.reddit.com/r/greptile/comments/1ujady4/greptile_free_tier_for_solo_developers/, June 30,
2026), self-hosting, a cancel button (promised April 20), Fix with your Agent, learning from reactions. Greptile's
changelog itself could not be read (blocked).

## 3. What is unsolved

| group or job | reviews | evidence |
| --- | --- | --- |
| Solo devs and small teams who ship many small PRs: priced out by per-review overage | 6 | 1t9a91q ("I don't want to pay for it"), 1so65oj ("not as expensive as these tools"), ottulqh, opiimoz, oidwjb4, orlb0oo ("the greptile tax wall") |
| Teams where AI agents write the code and loop with review bots | 2 | 1tulzd6, 1vn8zwq |
| Non-developers who touch the repo (docs, marketing) and should not cost a seat | 1 | ottulqh |

## 4. Fix plan

Ranked by evidence times cost to build. All evidence is thin (one source).

| # | change | size | skill | evidence |
| --- | --- | --- | --- | --- |
| F1 | **Hard monthly spend cap** set by the admin, with a warning at 80% and a clear "paused: cap reached" summary on PRs; never bill past it | S | /replica-backend | price 6, billing request 1 |
| F2 | **Docs-only and trivial PRs are free**: PRs that change only docs, config or lockfiles get a light pass that does not count as a review | S | /replica-backend | ottulqh, oidwjb4 |
| F3 | **One-click cancel** in Billing (S13) that cancels now, plus removing the card from the Stripe portal, no support ticket | S | /replica-backend | billing 2 |
| F4 | **Bounded re-reviews**: on a new push, review only what changed since the last review, keep earlier findings rather than inventing new ones on unchanged lines, and post "done" when nothing new is found; at most 3 automatic rounds per PR | M | /replica-build | loops 1 + nits 1 |
| F5 | **Show the commit reviewed** (short SHA) in every summary, and discard a review whose head moved before it finished | S | /replica-build | stale 1 |
| F6 | **Explain the confidence score**: show the 1-5 next to the reasons, and never present it as an approval | S | /replica-build | score 2 |
| F7 | **No agent instructions in PR text**: fix links stay plain links to signed-in prompt pages (already the case); add a test that the summary contains no hidden prompt text | S | /replica-test | 1 |
| F8 | **Speed target**: post a first-pass summary within 2 minutes and the full review after; show time-to-review in analytics | M | /replica-build | slow 2 |

Pricing itself (seats, included reviews, the $1 overage that REPTILE currently copies in `architecture.md`) goes to
`/replica-launch`.

**Status after /replica-launch (2026-10-04):** F1 was solved with flat pricing instead of a spend cap. Nothing is
metered, reviews pause at the monthly allowance, and admins are emailed at 80% (built and tested). F3 is partly done:
Manage billing opens Stripe's Customer Portal for cancelling and card removal, which still has to be configured in
Stripe. F2, F4 (in part), F5, F6, F7 (the test) and F8 are still open. See `launch/pricing.md`. The complaints point at three things to decide there: no per-review overage or a cheap one, no
seat for occasional contributors, and a free tier at least as good as Greptile's 50 reviews a month.

Not in the plan, too thin or too expensive for now: Gitea support (L, 1 request; GitLab is already a could-have),
plain-English learner mode (S, 1 request, a good candidate for later), self-host docs.

## 5. The angle

**A. Predictable bills (recommended)**
For small teams who got a surprise bill from per-review AI code review, REPTILE has a hard spend cap, free docs-only
PRs and a cancel button that works.
Evidence: price and billing, 8 of 30 reviews, 1 source (Reddit).

**B. Reviews that finish**
For teams whose coding agents ping-pong with review bots, REPTILE reviews each change once, remembers what it already
said and tells you when it is done.
Evidence: review loops and nits, 2 of 30 reviews, 1 source.

**C. The second opinion that catches what your agent missed**
For teams writing code with Claude Code or Codex, REPTILE is the outside reviewer that finds the bug your in-session
review did not, at a price that does not punish shipping often.
Evidence: 12 of 30 praise Greptile for exactly this; the price half rests on the 8 above. 1 source.

Recommended: **A**, with C's "outside reviewer" as the supporting line. It rests on the largest complaint group and
the fixes (F1 to F3) are small. It is still one source: re-check it against G2, Hacker News and Trustpilot once the
network allows them, before the brand and launch copy is final. Do not use Greptile's name in REPTILE's name, ads or
listing; a comparison page is a question for a lawyer.

Next: `/replica-brand`.
