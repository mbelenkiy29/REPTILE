# Countersign launch plan

The angle (from `fixes.md` and `brand.md`): **a second reviewer on every pull request, with a bill that doesn't
surprise you.** Every channel below leads with that, and with the fix behind it: one price per seat, nothing metered.

## 0. Gates before anything public

None of these exist yet, and each one blocks launch. `/replica-deploy` checks the first two.

- [~] **Privacy policy and terms** pages (drafts live at `/privacy` and `/terms`; lawyer review pending), linked from the landing page footer and the sign-in page. The landing FAQ's
      "Where does our code go?" answer must match the privacy policy. Get a lawyer to read both.
- [~] **Error tracking** (Sentry wired; set the DSN) live in the web app and the worker (Sentry or similar), with an alert on failed reviews and
      dead-letter jobs (`job_failures`).
- [ ] **Product analytics** on the funnel, cookie-light and disclosed in the privacy policy: landing → sign-in →
      GitHub App installed → first review posted → Team checkout.
- [ ] **Margin check.** Run the first live reviews with real keys, then the quality eval on 20 to 50 real PRs. Measure
      the average model cost per review. At full use a seat earns $0.48 a review ($0.40 annual). If the cost is above
      about $0.30, change the allowance or the price now (`pricing.md`).
- [ ] **Name checks** from `brand.md` (US/EU trademark, domain, handles), then buy the domain.
- [ ] **Stripe** set up as in `pricing.md`: two seat prices, the Customer Portal with cancel and card removal, renewal
      emails, the webhook.
- [ ] **Support address** on the landing page and in every email (a shared inbox is enough).
- [~] **Installation squatting** fixed in code (owners only); still check with two GitHub accounts (a possible S2 in `bugs.md`).
- [ ] **Encrypt stored GitHub tokens** (`accounts.access_token`, `refresh_token`; found in /replica-deploy).

## 1. Beta (2 to 3 weeks before launch)

There's no waitlist page, and none is needed: sign-up already starts a 14-day Team trial with no card, so the trial is
the beta.

- Invite 10 to 20 teams by hand (section 4). Give each a direct line to you, and read every review Countersign posts on
  their pull requests in the first week.
- What to watch, weekly:
  - reviews per seat per month (margin, and whether 50 is the right allowance)
  - how many orgs hit the pause, and what they did next
  - 👍 / 👎 ratio on comments, and the comments that got 👎
  - median time from push to review
  - trial → Team conversion, and the reasons people give for not converting
- Ask each beta team, with permission, for one sentence you may quote on the landing page. Only those words go in a
  proof section, and only with their name and consent.

## 2. Where the original's unhappy users talk

From the research (`reviews.csv`). Treat these as places to listen and answer, not to advertise.

| where | what was said there | how to show up |
| --- | --- | --- |
| r/codereview, the "SICK and tired of Greptile, what are the best alternatives?" thread and the "Greptile, CodeRabbit or Other?" threads | overage bills, cancelling, alternatives | answer the question asked, say plainly that you built Countersign, link once |
| r/coderabbit | rate limits, people moving between tools | only when someone asks for alternatives |
| r/ClaudeCode, r/codex, r/cursor, r/vibecoding | review workflows with coding agents, "is it worth the money", review loops | contribute to the workflow discussion; mention Countersign where it answers the question |
| r/selfhosted | self-hosting, Gitea | not yet: Countersign is hosted and GitHub-only; say so if asked |

Rules, because the research showed how this goes wrong: in the r/codereview complaint thread, people from at least two
competing tools (Gitar and Macroscope, both disclosed) replied with pitches, and the top replies were "Who are all these bots?!" and "I’ve never seen so many
obvious ones in a single post lol".

- Always disclose that you're the founder, in the first sentence.
- One reply per thread, only where it answers the question. Never reply to someone's complaint with a pitch.
- No sock puppets, no paid or fake reviews, no reviews of the original. The FTC's 2024 rule makes fake reviews
  illegal in the US.
- Follow each subreddit's self-promotion rules; ask the moderators when unsure.
- Never DM people from those threads uninvited.

## 3. Launch posts

Lead with the fix, not with "AI code review" (there are dozens).

**Show HN** (a weekday morning, US Eastern):

> Show HN: Countersign – AI code review for GitHub PRs with one flat price per seat
>
> I built Countersign after watching teams get surprised by per-review billing on AI code review tools. It reviews
> pull requests against the whole codebase and posts a summary, inline comments by severity, and a check. Pricing is
> $24 a seat a month with 50 reviews per seat, shared by the team. When the allowance runs out, reviews pause until
> the 1st, and nothing is ever charged per review. Re-reviews carry open findings forward instead of starting over.
> It reads your CLAUDE.md and AGENTS.md as rules. It's GitHub-only for now. I'd like to hear where it misses bugs, and
> whether 50 reviews per seat is the right number.

Be in the thread all day. Answer the hard questions (model, data handling, accuracy) directly, and don't claim benchmark
numbers you haven't measured.

**Product Hunt** (a separate week, so each launch gets its own attention):

- Name: Countersign. Tagline (60 characters max): "A second reviewer on every PR, with one flat price per seat".
- Gallery: the real product. The review page, the summary as posted on GitHub, the billing page showing "Your bill",
  and the rules page. Rebuild the screenshots in the new brand first (`node scripts/screens.mjs`).
- First comment: the Show HN text, shortened, plus what's next (F2 docs-only PRs not counted, F5 the reviewed commit
  shown in every summary).

**Also:** a post on your own blog or site explaining the pricing decision. Why flat, why 50, what happens at the
limit. It's the most linkable thing you have.

## 4. The first 10 users, by hand

Who to look for:

1. Small teams (2 to 10 developers) shipping many small PRs: the group the research says per-review pricing hurts most.
2. Teams already running a coding agent (Claude Code, Codex, Cursor) that want an outside reviewer.
3. Solo developers on side projects, for the free Solo plan. They become word of mouth, not revenue.

Where to find them: your own network first; founders and engineers who post their workflows publicly (ask in public,
or by email when they list one); people who reply to the launch posts.

What to ask in a 20-minute call, after a week of use:

- Which comment was the most useful? Which one was noise?
- Did it miss something a person caught?
- Is 50 reviews per seat enough? When did you hit the pause, if you did?
- What would make you pay for Team, or what stopped you?
- Would you let us quote one sentence of what you just said?

Write the answers down in one place. They decide the next fixes: F2, F5 and F8 in `fixes.md` are waiting for evidence.

## 5. Not doing

- No App Store or Google Play release: Countersign is a web app (`listing.json` is ready if that changes).
- No comparison page naming the original. That's a legal question for a lawyer in your country.
- No ads using the original's name or its users' quotes.

Next: `/replica-deploy`.
