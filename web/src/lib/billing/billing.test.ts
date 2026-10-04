// Stripe webhooks: signature check, idempotency, and plan status driven only by events.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
process.env.STRIPE_SECRET_KEY = "sk_test_offline";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

describe.skipIf(!url)("Stripe billing", async () => {
  const { seed } = await import("../../../db/seed");
  const { closeDb, db, schema: s } = await import("@/db");
  const { seedId } = await import("@/db/ids");
  const { setJobSender } = await import("@/lib/jobs");
  const { applyStripeEvent, handleStripeWebhook, SignatureError } = await import("./index");
  const org = seedId("o_side");
  const jobs: { name: string; data: unknown }[] = [];
  const event = (id: string, type: string, object: object) => ({ id, type, object: "event", data: { object } }) as unknown as Stripe.Event;
  const orgRow = async () => (await db.select().from(s.organizations).where(eq(s.organizations.id, org)))[0];

  beforeAll(async () => { setJobSender(async (n, d) => { jobs.push({ name: n, data: d }); return "j"; }); await seed({ reset: true }); });
  afterAll(async () => { setJobSender(undefined); await closeDb(); });

  it("rejects missing or forged signatures", async () => {
    await expect(handleStripeWebhook("{}", null)).rejects.toBeInstanceOf(SignatureError);
    await expect(handleStripeWebhook("{}", "t=1,v1=bad")).rejects.toBeInstanceOf(SignatureError);
  });

  it("accepts a correctly signed event", async () => {
    const payload = JSON.stringify({ id: "evt_signed", type: "customer.created", object: "event", data: { object: {} } });
    const header = new Stripe("sk_test_offline").webhooks.generateTestHeaderString({ payload, secret: "whsec_test" });
    expect(await handleStripeWebhook(payload, header)).toBe(true);
    expect(await handleStripeWebhook(payload, header)).toBe(false); // retried delivery: no-op
  });

  it("checkout completed → Team plan, active, trial cleared", async () => {
    await applyStripeEvent(event("evt_1", "checkout.session.completed", { client_reference_id: org, subscription: "sub_1", customer: "cus_1" }));
    expect(await orgRow()).toMatchObject({ plan: "pro", billingStatus: "active", trialEndsAt: null, stripeSubscriptionId: "sub_1", stripeCustomerId: "cus_1" });
  });

  it("each event applies once, even when Stripe retries", async () => {
    expect(await applyStripeEvent(event("evt_1", "checkout.session.completed", { client_reference_id: org, subscription: "sub_1", customer: "cus_1" }))).toBe(false);
  });

  it("payment failure → past due and admins are emailed", async () => {
    await applyStripeEvent(event("evt_2", "invoice.payment_failed", { customer: "cus_1" }));
    expect((await orgRow()).billingStatus).toBe("past_due");
    expect(jobs.filter((j) => j.name === "send-email")).toHaveLength(1);
  });

  it("subscription updated / deleted drive the plan", async () => {
    await applyStripeEvent(event("evt_3", "customer.subscription.updated", { id: "sub_1", customer: "cus_1", status: "active", metadata: { orgId: org } }));
    expect((await orgRow()).billingStatus).toBe("active");
    await applyStripeEvent(event("evt_4", "customer.subscription.deleted", { id: "sub_1", customer: "cus_1", status: "canceled", metadata: { orgId: org } }));
    expect(await orgRow()).toMatchObject({ plan: "free", billingStatus: "canceled" });
  });

  it("a failing handler forgets the event so Stripe's retry is processed", async () => {
    const bad = event("evt_5", "checkout.session.completed", { client_reference_id: "not-a-uuid", subscription: "sub_x", customer: "cus_x" });
    await expect(applyStripeEvent(bad)).rejects.toThrow();
    const rows = await db.select().from(s.webhookDeliveries).where(eq(s.webhookDeliveries.deliveryId, "evt_5"));
    expect(rows).toHaveLength(0);
  });
});
