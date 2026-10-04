# Countersign landing page

Built at `/` (`web/src/app/page.tsx`). Signed-out visitors see this page; signed-in users go straight to their
repositories. The copy is in the brand voice from `replica/brand.md` (plain, exact, calm). Every claim on the page is
something the product does today. Unbuilt fixes (F2, F5, F8) are not mentioned.

There is no proof section: no testimonials, logos, user counts or star ratings, because none exist yet. Add real beta
users' words later, with their permission. Never use the Reddit quotes from the research.

## 1. Hero

- **Headline:** A second reviewer on every pull request. A bill that doesn't surprise you.
- **Under it:** Countersign reads your whole codebase and comments on what could break. $24 a seat a month, with no
  per-review charges, ever.
- **Button:** Start free (to sign-in). Secondary: See pricing (scrolls down).
- **Image:** a real screenshot of the product: a review in the app (`web/public/landing/review.png`, captured from
  the running app with seed data).

## 2. The problem

Heading: **AI review got useful. The bills got strange.**

1. **Per-review pricing turns one busy week into a big invoice.** One large migration PR, or a team that ships in
   small commits, and the month's bill is no longer the number you agreed to.
2. **Reviews that nitpick the name but miss the approach.** A reviewer that only sees the diff can flag a long
   function and miss that the change breaks something three files away.

(Paraphrased from the top two complaint themes in `fixes.md`: price, 6 reviews; quality, 5. No reviewer is quoted.)

## 3. How it works

1. **Install the GitHub App.** Choose the repositories it can read. It comments on pull requests and never pushes code.
2. **Open a pull request.** Countersign reviews the change against the whole codebase and posts a summary, inline
   comments ranked by severity, and a check.
3. **React and add rules.** 👍 and 👎 tune future reviews. Write rules in plain English, or point it at your
   CLAUDE.md and AGENTS.md.

## 4. Features (fixes first, then parity)

1. **One price per seat. Nothing metered.** 50 reviews a month per seat, shared by the team. When they run out,
   reviews pause until the 1st; admins hear about it at 80%. (Fix: price and billing.)
2. **Cancel in one click.** Manage billing opens the billing portal: cancel, remove the card, download invoices. No
   support ticket. (Fix: cancelling.)
3. **Re-reviews that remember.** On a new push, findings that were fixed are marked addressed and open ones carry
   forward, instead of a fresh list each time. (Fix, in part: review loops.)
4. **Fixes your agent can pick up.** Every comment links to a ready-made fix prompt to paste into Claude Code, Codex or Cursor. Nothing in
   the pull request text gives instructions to agents that read it. (Fix: agent instructions in PR text.)
5. **Your rules, your files.** Plain-English rules by repository and path, CLAUDE.md and AGENTS.md read as rules, and
   a `countersign.json` in the repo that overrides the dashboard.
6. **Learns from your team.** Reactions on its comments, and the review comments your own team writes, become
   suggested rules for an admin to accept.

## 5. Pricing

From `pricing.md`: Solo (Free) $0, one person, 50 reviews a month. Team $24 a seat a month, or $20 billed annually,
50 reviews per seat shared, no per-review charges. A 14-day Team trial, no card. The numbers on the page come from the
same settings the billing code uses (`PRICING`, `FREE_PLAN`), so they can't drift apart.

## 6. FAQ

- **What happens when we use all the reviews?** Reviews pause until the 1st of the month, and the pull request shows
  why. Nothing extra is charged. Adding a seat adds 50 reviews right away.
- **Does Countersign change our code?** No. It reads the repositories you choose and comments on pull requests. It
  never pushes commits.
- **Which code hosts does it support?** GitHub today.
- **Where does our code go?** To review a change, the changed files and related code are sent to Anthropic's API (the
  review) and Voyage AI's API (search over your codebase). Check both providers' data policies, and replace this
  answer with your own privacy policy before launch.
- **How is this different from asking my coding agent to review?** Your agent reviews its own work in the same
  session. Countersign is a separate reviewer with your whole codebase indexed, and it posts on the pull request where
  the whole team sees it.
- **Can I cancel any time?** Yes, from Billing, in one click. You keep access until the end of the period, and nothing
  more is charged.

## 7. Final call to action

**Try it on your next pull request.** 14 days of Team, no card. Then stay on Team, or keep Solo for free.
Button: Start free.
