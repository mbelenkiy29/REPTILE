# Countersign pricing

Decided on 2026-10-04: **flat pricing, nothing metered.** The bill is always seats × the seat price. Each plan has a
monthly review allowance; when it runs out, reviews pause until the 1st. Countersign never charges an overage. This is
built and tested (`web/src/lib/billing/index.ts`, `worker/jobs/review-pr.ts`, `worker/pipeline.test.ts`).

## The market

All prices were read on **2026-10-04**. The vendors' own pricing pages are blocked from this environment, so these
come from third-party summaries found by web search. Check each vendor's page before publishing any comparison.

| product | model | price | source |
| --- | --- | --- | --- |
| Greptile (the original) | seat + usage | Pro $30 a seat a month with 50 reviews per seat, then $1 a review; Free tier of 50 reviews a month (added June 2026); Enterprise on request | [costbench.com](https://costbench.com/software/ai-code-review/greptile/) |
| CodeRabbit | per developer | Pro $24 a dev a month billed annually, $30 monthly; Pro Plus $48 | [dev.to](https://dev.to/rahulxsingh/coderabbit-pricing-in-2026-free-tier-pro-plans-and-enterprise-costs-1pc4) |
| Cursor Bugbot | per PR author | $40 a user a month, $32 annually | [docs.cursor.com](https://docs.cursor.com/bugbot/pricing) |
| Macroscope | usage | $0.05 per KB reviewed (about $0.95 a review), or Teams $30 an active dev a month (5 seat minimum) with usage credits | [stackpick.net](https://stackpick.net/pricing/macroscope/) |

## What the original's users said about price

From `replica/fixes.md` (30 Reddit posts and comments, one source, so this evidence is thin):

- **6** complaints about per-review overage: the $1 per review, a $30 seat for someone who edits a docs file, one big
  PR eating a month's budget, "the greptile tax wall".
- **3** more who were price-sensitive ("I don't want to pay for it", "not as expensive as these tools").
- **2** about surprise bills and cancelling ("I have NO WAY to cancel it immediately;").
- **1** asking for billing controls.
- **2** on the other side: Greptile is "reasonably priced" (before the overage change) or has "more transparent
  pricing" than CodeRabbit's rate limits.

The pattern: people don't mind paying per seat. What they hate is not knowing what the bill will be.

## The model

Two tiers, named for who they're for. A 14-day Team trial starts with every new organization, with no card. When it
ends, the organization chooses Team or Free.

| | **Solo** (Free) | **Team** |
| --- | --- | --- |
| for | one developer, side projects | teams reviewing every PR |
| price | $0 | **$24 a seat a month**, or **$20 a seat a month billed annually** ($240 a year: 2 months free) |
| members | 1 | unlimited, each is a seat |
| reviews | 50 a month | 50 a month per seat, **shared by the team** |
| past the allowance | reviews pause until the 1st | reviews pause until the 1st; adding a seat adds 50 |
| per-review charges | never | never |
| warning | admins are emailed at 80% | admins are emailed at 80% |
| card | not needed | Stripe Checkout |

Why $24: it matches CodeRabbit's annual price and is $6 under Greptile's seat. It's the price people already accept
for a seat. The annual discount follows the usual 2 months free.

**Check this before launch: the margin is unknown.** No live review has run yet (see `replica/backend.md`), so the
real model cost per review isn't known. At full use, a seat earns $24 / 50 = **$0.48 a review** (or $0.40 on annual).
Run the first live reviews and the review-quality eval on 20 to 50 real PRs, and measure the average Claude plus Voyage
cost per review. If it's above about $0.30, lower the allowance or raise the price **before** launch, not after.
Changing prices on existing customers is exactly the complaint this angle is built on.

Enterprise and self-hosting are left out on purpose: three tiers at most, and there's no sales process yet.

## Billing complaints, fixed in the product

| complaint | fix | status |
| --- | --- | --- |
| per-review overage, surprise bills | no metered price at all; pause at the allowance; email at 80% | built, tested |
| can't cancel without support | "Manage billing" opens Stripe's Customer Portal: cancel, card removal, invoices | built; **configure the portal** (below) |
| charged after cancelling | nothing is metered, so cancelling at the end of the period means no further charges | follows from the model |
| a docs edit costs a seat | seats are members of the organization, not PR authors; a person who only edits docs needn't be a member | true today; F2 (docs-only PRs not counted) is still open |
| per-seat jumps | the seat count follows members, prorated; the billing page shows "Your bill: $X a month" | built; also show the new total in the invite dialog (to do) |
| renewal surprise (annual) | Stripe's upcoming-renewal email for annual subscriptions | **turn on in Stripe** (below) |

## In Stripe (you create these; test mode first)

1. **Product** "Countersign Team".
2. **Price, monthly:** $24.00 USD per unit, recurring every month, licensed (not metered), lookup key
   `team_seat_monthly`. Put its id in `STRIPE_PRICE_SEAT`.
3. **Price, annual:** $240.00 USD per unit, recurring every year, licensed, lookup key `team_seat_annual`. Put its id in
   `STRIPE_PRICE_SEAT_ANNUAL`. Leave that empty to offer monthly only.
4. `PRICE_SEAT_CENTS=2400` and `PRICE_SEAT_ANNUAL_CENTS=2000` (the display prices; they must match).
5. **Customer Portal** (Settings → Billing → Customer portal):
   - allow cancelling, at the end of the billing period
   - allow updating and removing payment methods
   - allow seat quantity changes off (seats follow members)
   - show invoice history
6. **Emails** (Settings → Billing → Subscriptions and emails): send upcoming-renewal reminders for annual plans, and
   receipts.
7. **Webhook** to `/api/webhooks/stripe` with: `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
8. If an earlier setup created the metered overage price or a Meter, archive both. The app no longer uses them, and
   the old `STRIPE_PRICE_OVERAGE` and `STRIPE_METER_EVENT` variables are gone.
