import type { Metadata } from "next";
import { getBilling } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { formatDate, formatMoney, relativeTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { AdminOnlyNotice } from "@/components/no-access";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, UsageMeter } from "@/components/ui/card";
import { Table, TD, TH, THead, TRow } from "@/components/ui/table";
import { CheckoutButton, ContinueFreeButton, PortalButton } from "./client";

export const metadata: Metadata = { title: "Billing" };

const PLAN = { free: "Free", trial: "Trial", pro: "Team", enterprise: "Enterprise" } as const;

export default async function BillingPage({ searchParams }: PageProps<"/settings/billing">) {
  const ctx = await requireOrg();
  const b = await getBilling(ctx);
  const sp = await searchParams;
  const isAdmin = ctx.role === "admin";
  const paid = b.plan === "pro" || b.plan === "enterprise";
  const over = Math.max(0, b.usedReviews - b.includedReviews);
  const estimate = b.seats * b.pricePerSeatCents + over * b.overagePerReviewCents;
  const trialDays = b.trialDaysLeft;
  const free = b.plan === "free" && b.billingStatus === "none";
  // Free is offered when nothing is being paid for and the org is one person.
  const canGoFree = isAdmin && b.seats <= 1;
  const paused = (b.plan === "trial" && trialDays === 0) || (b.billingStatus === "canceled" && b.plan !== "trial");
  const choices = isAdmin && <span className="flex flex-wrap gap-2"><CheckoutButton />{canGoFree && <ContinueFreeButton />}</span>;
  const freeNote = b.seats <= 1 ? " Or continue on Free: one person, 50 reviews a month." : " Free is for one person, so it needs the other members removed first.";

  return (
    <>
      <PageHeader title="Billing" description="Your plan, seats and review usage this month." />
      {!isAdmin && <div className="mb-4"><AdminOnlyNotice what="billing" /></div>}
      <div className="flex max-w-4xl flex-col gap-6">
        {sp.upgraded && <Alert variant="success" title="You're on the Team plan" live>Thanks. Reviews continue without interruption; the first invoice arrives at the end of this month.</Alert>}
        {b.plan === "trial" && trialDays !== null && (
          <Alert variant={trialDays <= 3 ? "warning" : "info"} title={trialDays === 0 ? "Your trial has ended" : `Your trial ends ${relativeTime(b.trialEndsAt)}`}
            action={paused ? choices : isAdmin && <CheckoutButton />}>
            {trialDays === 0 ? `Reviews are paused. Choose the Team plan to start them again; settings and rules are kept.${freeNote}` : "Reviews pause when it ends unless you choose a plan. Your settings, rules and history stay."}
          </Alert>
        )}
        {free && b.usedReviews >= b.includedReviews && (
          <Alert variant="warning" title={`This month's ${b.includedReviews} free reviews are used`} action={isAdmin && <CheckoutButton />}>
            Reviews resume on {formatDate(b.periodEnd)}. The Team plan has 50 reviews per member and keeps going after that.
          </Alert>
        )}
        {b.billingStatus === "past_due" && <Alert variant="danger" title="The last payment failed" action={isAdmin && <PortalButton label="Update card" />}>Update your card to keep reviews running.</Alert>}
        {b.billingStatus === "canceled" && b.plan !== "trial" && <Alert variant="warning" title="The subscription is canceled" action={choices}>{`Reviews are paused. Choose the Team plan to start them again; settings and history are kept.${freeNote}`}</Alert>}

        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Plan" actions={paid && isAdmin && b.billingStatus !== "canceled" && <PortalButton />}>
            <div className="flex flex-col gap-3">
              <p className="flex items-center gap-2 text-lg text-fg">{PLAN[b.plan]} <Badge tone={paid || free ? "success" : "neutral"}>{paid || free ? "Active" : b.plan === "trial" ? "Trial" : "Paused"}</Badge></p>
              {free ? (
                <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-base">
                  <dt className="text-muted">Members</dt><dd className="tabular-nums text-fg">1 (the Free plan is for one person)</dd>
                  <dt className="text-muted">Included reviews</dt><dd className="tabular-nums text-fg">{b.includedReviews} a month</dd>
                  <dt className="text-muted">After that</dt><dd className="text-fg">Reviews pause until the 1st</dd>
                  <dt className="text-muted">Price</dt><dd className="tabular-nums text-fg">{formatMoney(0)}</dd>
                </dl>
              ) : (
              <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-base">
                <dt className="text-muted">Seats</dt><dd className="tabular-nums text-fg">{b.seats} × {formatMoney(b.pricePerSeatCents)} / month</dd>
                <dt className="text-muted">Included reviews</dt><dd className="tabular-nums text-fg">{b.includedReviews} a month (50 per seat)</dd>
                <dt className="text-muted">After that</dt><dd className="tabular-nums text-fg">{formatMoney(b.overagePerReviewCents)} per review</dd>
                {paid && <><dt className="text-muted">This month so far</dt><dd className="tabular-nums text-fg">{formatMoney(estimate)}</dd></>}
              </dl>
              )}
              {!paid && isAdmin && <CheckoutButton className="self-start" />}
              {paid && isAdmin && <p className="text-sm text-muted">Change seats, update the card or cancel in one click from Manage billing.</p>}
            </div>
          </Card>
          <Card title="Usage this month" description={`${formatDate(b.periodStart)} to ${formatDate(b.periodEnd)}`}>
            <UsageMeter label="Reviews" used={b.usedReviews} included={b.includedReviews}
              overNote={paid ? undefined : b.plan === "trial" ? (n) => `${n} over the Team plan's included amount. Trial reviews aren't billed.` : null} />
            <p className="mt-3 text-sm text-muted">Skipped reviews and failed attempts don&apos;t count. A re-run on new commits counts as a review.</p>
          </Card>
        </div>

        <section aria-labelledby="invoices">
          <h2 id="invoices" className="mb-3 text-md font-semibold text-fg">Invoices</h2>
          {b.invoices.length === 0 ? (
            <p className="rounded-lg border bg-surface p-4 text-muted">No invoices yet. They appear here after your first paid month.</p>
          ) : (
            <Table>
              <THead><tr><TH>Date</TH><TH numeric>Amount</TH><TH>Status</TH></tr></THead>
              <tbody>
                {b.invoices.map((i) => (
                  <TRow key={i.id}>
                    <TD>{formatDate(i.date)}</TD>
                    <TD numeric>{formatMoney(i.amountCents)}</TD>
                    <TD>
                      <span className="flex items-center gap-3">
                        <Badge tone={i.status === "paid" ? "success" : "warning"}>{i.status === "paid" ? "Paid" : "Open"}</Badge>
                        {i.url && <a className="text-sm text-accent underline underline-offset-2" href={i.url} target="_blank" rel="noreferrer">View</a>}
                      </span>
                    </TD>
                  </TRow>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      </div>
    </>
  );
}
