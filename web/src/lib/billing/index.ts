// Stripe billing: Checkout to subscribe, the Customer Portal for changes and one-click cancel,
// webhooks as the source of truth for plan status. Flat pricing: the bill is seats × the seat price, nothing
// metered. Each plan has a monthly review allowance; past it, reviews pause until the 1st (never an overage).
// Test-mode keys until /replica-deploy. Nothing here trusts the client.
import Stripe from "stripe";
import { and, count, eq, isNull, sql as dsql } from "drizzle-orm";
import { db, schema as s } from "@/db";

export const PRICING = {
  seatCents: Number(process.env.PRICE_SEAT_CENTS ?? 2400),
  /** Annual billing, shown per month (billed yearly: 12 × this). */
  seatAnnualCents: Number(process.env.PRICE_SEAT_ANNUAL_CENTS ?? 2000),
};

/** Admins get one email per month when usage reaches this share of the allowance. */
export const ALLOWANCE_WARNING = 0.8;

/** The Free plan: one person, a monthly review allowance, no card. Past the allowance reviews pause until the 1st. */
export const FREE_PLAN = { members: 1, reviewsPerMonth: 50 } as const;

/** plan "free" also marks a canceled subscription (paused, billingStatus "canceled"); Free is active only without one. */
export const onFreePlan = (org: { plan: string; billingStatus: string }) => org.plan === "free" && org.billingStatus === "none";

let client: Stripe | null = null;
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Billing isn't set up on this server yet (STRIPE_SECRET_KEY is missing).");
  if (process.env.NODE_ENV !== "production" && key.startsWith("sk_live_")) throw new Error("Refusing a live Stripe key outside production.");
  client ??= new Stripe(key);
  return client;
}
export const billingConfigured = () => !!process.env.STRIPE_SECRET_KEY;

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function ensureCustomer(orgId: string, userId: string) {
  const [org] = await db.select().from(s.organizations).where(eq(s.organizations.id, orgId));
  if (org.stripeCustomerId) return org.stripeCustomerId;
  const [u] = await db.select({ email: s.users.email }).from(s.users).where(eq(s.users.id, userId));
  const customer = await stripe().customers.create(
    { name: org.name, email: u?.email ?? undefined, metadata: { orgId } },
    { idempotencyKey: `customer-${orgId}` },
  );
  await db.update(s.organizations).set({ stripeCustomerId: customer.id }).where(and(eq(s.organizations.id, orgId), isNull(s.organizations.stripeCustomerId)));
  return customer.id;
}

async function seatCount(orgId: string) {
  const [{ n }] = await db.select({ n: count() }).from(s.memberships).where(eq(s.memberships.orgId, orgId));
  return Math.max(1, Number(n));
}

export type Interval = "month" | "year";
const seatPriceIds = () => [process.env.STRIPE_PRICE_SEAT, process.env.STRIPE_PRICE_SEAT_ANNUAL].filter(Boolean) as string[];
export const annualConfigured = () => !!process.env.STRIPE_PRICE_SEAT_ANNUAL;

/** Checkout for the Team plan: one per-seat price, monthly or annual. Nothing metered. */
export async function createCheckout(orgId: string, userId: string, interval: Interval = "month"): Promise<{ url: string }> {
  const seatPrice = interval === "year" ? process.env.STRIPE_PRICE_SEAT_ANNUAL : process.env.STRIPE_PRICE_SEAT;
  if (!seatPrice) throw new Error("Billing isn't set up on this server yet (the Stripe seat price id is missing).");
  const [org] = await db.select().from(s.organizations).where(eq(s.organizations.id, orgId));
  if (org.stripeSubscriptionId && org.billingStatus !== "canceled") return createPortal(orgId);
  const customer = await ensureCustomer(orgId, userId);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: orgId,
    line_items: [{ price: seatPrice, quantity: await seatCount(orgId) }],
    subscription_data: { metadata: { orgId } },
    success_url: `${appUrl()}/settings/billing?upgraded=1`,
    cancel_url: `${appUrl()}/settings/billing`,
    allow_promotion_codes: true,
  });
  if (!session.url) throw new Error("Stripe didn't return a checkout link. Try again.");
  return { url: session.url };
}

export async function createPortal(orgId: string): Promise<{ url: string }> {
  const [org] = await db.select().from(s.organizations).where(eq(s.organizations.id, orgId));
  if (!org.stripeCustomerId) throw new Error("There's no billing account yet. Choose a plan first.");
  const p = await stripe().billingPortal.sessions.create({ customer: org.stripeCustomerId, return_url: `${appUrl()}/settings/billing` });
  return { url: p.url };
}

export async function listInvoices(customerId: string) {
  if (!billingConfigured()) return [];
  try {
    const list = await stripe().invoices.list({ customer: customerId, limit: 12 });
    return list.data.map((i) => ({
      id: i.id ?? "",
      date: new Date(i.created * 1000).toISOString().slice(0, 10),
      amountCents: i.amount_due,
      status: (i.status === "paid" ? "paid" : "open") as "paid" | "open",
      url: i.hosted_invoice_url ?? undefined,
    }));
  } catch (e) {
    console.error("[billing] listing invoices failed", e);
    return [];
  }
}

/**
 * Cancel subscriptions before their orgs are deleted. One that's already gone is fine; any other failure throws, so the
 * caller deletes nothing while a subscription could keep charging with no org left to cancel it from.
 */
export async function cancelSubscriptions(subscriptionIds: string[]) {
  for (const id of subscriptionIds) {
    try {
      await stripe().subscriptions.cancel(id);
    } catch (e) {
      if ((e as { code?: string }).code === "resource_missing") continue;
      console.error("[billing] cancelling a subscription failed", id, e);
      throw new Error("We couldn't cancel the subscription, so nothing was deleted. Try again in a minute, or cancel it from Billing first.");
    }
  }
}

/** Keep the subscription's seat quantity equal to the member count. */
export async function updateSeats(orgId: string) {
  if (!billingConfigured()) return;
  const [org] = await db.select().from(s.organizations).where(eq(s.organizations.id, orgId));
  if (!org.stripeSubscriptionId || org.billingStatus === "canceled") return;
  const sub = await stripe().subscriptions.retrieve(org.stripeSubscriptionId);
  const item = sub.items.data.find((i) => seatPriceIds().includes(i.price.id));
  const qty = await seatCount(orgId);
  if (item && item.quantity !== qty) await stripe().subscriptionItems.update(item.id, { quantity: qty, proration_behavior: "create_prorations" });
}

/* ───────────── webhook ───────────── */

type Plan = typeof s.organizations.$inferSelect["plan"];
type Status = typeof s.organizations.$inferSelect["billingStatus"];

function fromSubscription(sub: Stripe.Subscription): { plan: Plan; billingStatus: Status } {
  switch (sub.status) {
    case "active":
    case "trialing":
      return { plan: "pro", billingStatus: "active" };
    case "past_due":
    case "unpaid":
      return { plan: "pro", billingStatus: "past_due" };
    default:
      return { plan: "free", billingStatus: "canceled" };
  }
}

/** Verify, record and apply a Stripe event. Returns false for a duplicate delivery. */
export async function handleStripeWebhook(rawBody: string, signature: string | null): Promise<boolean> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is missing");
  if (!signature) throw new SignatureError();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    throw new SignatureError();
  }
  return applyStripeEvent(event);
}

export class SignatureError extends Error {
  constructor() {
    super("Invalid signature");
    this.name = "SignatureError";
  }
}

/** Idempotent: the event id is stored first; a replay is a no-op. Exported for tests. */
export async function applyStripeEvent(event: Stripe.Event): Promise<boolean> {
  const inserted = await db.insert(s.webhookDeliveries).values({ source: "stripe", deliveryId: event.id, event: event.type })
    .onConflictDoNothing().returning({ id: s.webhookDeliveries.deliveryId });
  if (!inserted.length) return false;
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const cs = event.data.object;
        const orgId = cs.client_reference_id;
        if (orgId && typeof cs.subscription === "string") {
          await db.update(s.organizations).set({
            stripeSubscriptionId: cs.subscription, stripeCustomerId: typeof cs.customer === "string" ? cs.customer : undefined,
            plan: "pro", billingStatus: "active", trialEndsAt: null, updatedAt: new Date().toISOString(),
          }).where(eq(s.organizations.id, orgId));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const next = event.type === "customer.subscription.deleted" ? { plan: "free" as const, billingStatus: "canceled" as const } : fromSubscription(sub);
        await db.update(s.organizations).set({ ...next, stripeSubscriptionId: sub.id, updatedAt: new Date().toISOString() })
          .where(sub.metadata?.orgId ? eq(s.organizations.id, sub.metadata.orgId) : eq(s.organizations.stripeCustomerId, String(sub.customer)));
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object;
        const [org] = await db.update(s.organizations).set({ billingStatus: "past_due", updatedAt: new Date().toISOString() })
          .where(eq(s.organizations.stripeCustomerId, String(inv.customer))).returning({ id: s.organizations.id, name: s.organizations.name });
        if (org) {
          const { enqueue } = await import("@/lib/jobs");
          const admins = await db.select({ email: s.users.email }).from(s.memberships).innerJoin(s.users, eq(s.users.id, s.memberships.userId))
            .where(and(eq(s.memberships.orgId, org.id), eq(s.memberships.role, "admin")));
          for (const a of admins) if (a.email) await enqueue("send-email", { to: a.email, template: "payment-failed", vars: { org: org.name, url: `${appUrl()}/settings/billing` } });
        }
        break;
      }
    }
    await db.update(s.webhookDeliveries).set({ processedAt: new Date().toISOString() })
      .where(and(eq(s.webhookDeliveries.source, "stripe"), eq(s.webhookDeliveries.deliveryId, event.id)));
    return true;
  } catch (e) {
    // Let Stripe retry: forget the delivery so the retry isn't treated as a duplicate.
    await db.delete(s.webhookDeliveries).where(and(eq(s.webhookDeliveries.source, "stripe"), eq(s.webhookDeliveries.deliveryId, event.id)));
    throw e;
  }
}

/* ───────────── usage and the monthly allowance ───────────── */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Org = Pick<typeof s.organizations.$inferSelect, "id" | "plan" | "billingStatus" | "includedReviewsPerSeat">;

/**
 * One usage row per completed review (the worker calls this in the transaction that completes the review).
 * billable marks reviews done on the paid plan; only those count toward the Team allowance, so reviews used on a trial
 * never eat into the first paid month.
 */
export async function recordUsage(tx: Tx, org: Pick<typeof s.organizations.$inferSelect, "id" | "plan">, reviewId: string, credits: number) {
  await tx.insert(s.usageEvents).values({
    orgId: org.id, reviewId, credits, billable: org.plan === "pro", periodStart: new Date().toISOString().slice(0, 8) + "01",
  }).onConflictDoNothing();
}

export const periodStart = (d = new Date()) => d.toISOString().slice(0, 8) + "01";

/** This month's reviews used and included for the org. Free: 50 for one person. Team: 50 per seat, pooled. */
export async function allowance(org: Org, conn: typeof db | Tx = db): Promise<{ used: number; included: number; seats: number }> {
  const [{ n }] = await conn.select({ n: count() }).from(s.memberships).where(eq(s.memberships.orgId, org.id));
  const seats = Number(n);
  const team = org.plan === "pro";
  const [{ used }] = await conn.select({ used: dsql<number>`coalesce(sum(${s.usageEvents.credits}), 0)::int` }).from(s.usageEvents)
    .where(and(eq(s.usageEvents.orgId, org.id), eq(s.usageEvents.periodStart, periodStart()), team ? eq(s.usageEvents.billable, true) : undefined));
  const included = onFreePlan(org) ? FREE_PLAN.reviewsPerMonth : Math.max(1, seats) * org.includedReviewsPerSeat;
  return { used: Number(used), included, seats };
}
