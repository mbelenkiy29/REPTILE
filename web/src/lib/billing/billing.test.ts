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
  const { applyStripeEvent, handleStripeWebhook, recordUsage, reportUsage, stripe, SignatureError } = await import("./index");
  const { createOrganization } = await import("@/lib/data");
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

  it("BUG-003 reviews done during the trial are never billed as overage after upgrading", async () => {
    process.env.STRIPE_METER_EVENT = "reptile_review";
    const sent: unknown[] = [];
    const meter = stripe().billing.meterEvents as unknown as { create: (x: unknown) => Promise<object> };
    const realCreate = meter.create;
    meter.create = async (x) => { sent.push(x); return {}; };
    try {
      const { id } = await createOrganization(seedId("u_lena"), "Trial then paid");
      const [o] = await db.select().from(s.organizations).where(eq(s.organizations.id, id));
      expect(o.plan).toBe("trial");
      // 55 reviews on the trial (1 seat × 50 included would put 5 over).
      for (let i = 0; i < 55; i++) {
        const [rev] = await db.insert(s.reviews).values(await reviewRow(id, i)).returning({ id: s.reviews.id });
        await db.transaction((tx) => recordUsage(tx, o, rev.id, 1));
      }
      await reportUsage(() => {});
      await db.update(s.organizations).set({ plan: "pro", billingStatus: "active", trialEndsAt: null, stripeCustomerId: "cus_trial_then_paid" }).where(eq(s.organizations.id, id));
      expect(await reportUsage(() => {})).toBe(0);
      expect(sent).toHaveLength(0);
      // Paid reviews: the first 50 are included, the 51st is overage.
      const paid = { ...o, plan: "pro" as const };
      for (let i = 0; i < 51; i++) {
        const [rev] = await db.insert(s.reviews).values(await reviewRow(id, 100 + i)).returning({ id: s.reviews.id });
        await db.transaction((tx) => recordUsage(tx, paid, rev.id, 1));
      }
      expect(await reportUsage(() => {})).toBe(1);
    } finally {
      meter.create = realCreate;
      delete process.env.STRIPE_METER_EVENT;
    }
  });

  /** A completed review on a throwaway PR in the given org (usage rows reference reviews). */
  async function reviewRow(orgId: string, n: number) {
    let [inst] = await db.select().from(s.installations).where(eq(s.installations.orgId, orgId));
    if (!inst) [inst] = await db.insert(s.installations).values({ orgId, externalInstallationId: 90_000_000 + Math.floor(Math.random() * 1e6), accountLogin: "trialco", accountType: "Organization" }).returning();
    let [repo] = await db.select().from(s.repositories).where(eq(s.repositories.installationId, inst.id));
    if (!repo) [repo] = await db.insert(s.repositories).values({ orgId, installationId: inst.id, providerRepoId: 90_000_000 + Math.floor(Math.random() * 1e6), fullName: "trialco/app", defaultBranch: "main" }).returning();
    const [pr] = await db.insert(s.pullRequests).values({ orgId, repoId: repo.id, number: 1000 + n, title: `PR ${n}`, authorLogin: "dev", baseBranch: "main", headSha: `sha${n}`, labels: [], url: "https://example.test", openedAt: new Date().toISOString() }).returning();
    return { orgId, pullRequestId: pr.id, headSha: `sha${n}`, trigger: "manual" as const, status: "completed" as const, filesReviewed: [], checked: [] };
  }
});
