// Authorization and constraint tests against a real Postgres (TEST_DATABASE_URL).
// The rule under test: every read is scoped to the caller's org, every write checks the role,
// and a second user in another org gets nothing back.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql as dsql } from "drizzle-orm";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

const run = describe.skipIf(!url);

run("data layer", async () => {
  const { seed } = await import("../../../db/seed");
  const { closeDb, db, schema: s } = await import("@/db");
  const { seedId } = await import("@/db/ids");
  const { setJobSender } = await import("@/lib/jobs");
  const data = await import("./index");
  const { ForbiddenError, NotFoundError } = data;

  const jobs: { name: string; data: unknown }[] = [];
  const ACME = seedId("o_acme");
  const CONTOSO = seedId("o_contoso");
  const jordanAcme = { userId: seedId("u_jordan"), orgId: ACME, role: "admin" as const };
  const jordanContoso = { userId: seedId("u_jordan"), orgId: CONTOSO, role: "member" as const };
  const lenaContoso = { userId: seedId("u_lena"), orgId: CONTOSO, role: "admin" as const };
  const acmeRepo = seedId("r_api");
  const acmeReview = seedId("rev_0");

  beforeAll(async () => {
    setJobSender(async (name, d) => { jobs.push({ name, data: d }); return "job"; });
    await seed({ reset: true });
  });
  beforeEach(() => { jobs.length = 0; });
  afterAll(async () => { setJobSender(undefined); await closeDb(); });

  describe("a second user in another org gets nothing", () => {
    it("lists only their own org's rows", async () => {
      const repos = await data.listRepos(lenaContoso);
      expect(repos.map((r) => r.fullName)).toEqual(["contoso/storefront"]);
      expect((await data.listReviews(lenaContoso, { limit: 200 })).total).toBe(0);
      expect(await data.listRules(lenaContoso)).toEqual([]);
      expect(await data.listApiKeys(lenaContoso)).toEqual([]);
      expect(await data.listKnowledge(lenaContoso, acmeRepo)).toEqual([]);
      expect((await data.listMembers(lenaContoso)).members.map((m) => m.user.name).sort()).toEqual(["Jordan Lee", "Lena Fischer"]);
      expect(await data.listAuthors(lenaContoso)).toEqual([]);
      expect((await data.getAnalytics(lenaContoso, { days: 30 })).tiles.prsReviewed).toBe(0);
    });

    it("can't read another org's rows by id", async () => {
      await expect(data.getRepo(lenaContoso, acmeRepo)).rejects.toBeInstanceOf(NotFoundError);
      await expect(data.getReview(lenaContoso, acmeReview)).rejects.toBeInstanceOf(NotFoundError);
      await expect(data.getFinding(lenaContoso, seedId("f_0"))).rejects.toBeInstanceOf(NotFoundError);
      await expect(data.getReviewConfig(lenaContoso, acmeRepo)).rejects.toBeInstanceOf(NotFoundError);
      expect((await data.listReviews(lenaContoso, { repoId: acmeRepo })).items).toEqual([]);
    });

    it("can't change another org's rows by id, even as an admin", async () => {
      await expect(data.setRepoReviewEnabled(lenaContoso, acmeRepo, false)).rejects.toBeInstanceOf(NotFoundError);
      await expect(data.reindexRepo(lenaContoso, acmeRepo)).rejects.toBeInstanceOf(NotFoundError);
      await expect(data.saveReviewConfig(lenaContoso, acmeRepo, (await data.getReviewConfig(jordanAcme, null)).effective)).rejects.toBeInstanceOf(NotFoundError);
      await expect(data.deleteRule(lenaContoso, seedId("rule_1"))).rejects.toBeInstanceOf(NotFoundError);
      await expect(data.updateKnowledgeDoc(lenaContoso, seedId("kb_1"), "x")).rejects.toBeInstanceOf(NotFoundError);
      await expect(data.revokeApiKey(lenaContoso, seedId("key_1"))).rejects.toBeInstanceOf(NotFoundError);
      await expect(data.changeRole(lenaContoso, seedId("u_priya"), "member")).rejects.toBeInstanceOf(NotFoundError);
      await expect(data.rerunReview(lenaContoso, acmeReview)).rejects.toBeInstanceOf(NotFoundError);
      await expect(data.createRule(lenaContoso, { text: "Scoped to someone else's repo", kind: "rule", repoIds: [acmeRepo], pathGlobs: [] })).rejects.toBeInstanceOf(NotFoundError);
      await data.revokeInvite(lenaContoso, seedId("inv_1"));
      const [repo] = await db.select().from(s.repositories).where(eq(s.repositories.id, acmeRepo));
      expect(repo.reviewEnabled).toBe(true);
      expect(repo.indexStatus).toBe("completed");
      expect((await db.select().from(s.invites).where(eq(s.invites.id, seedId("inv_1")))).length).toBe(1);
      expect(jobs).toEqual([]);
    });

    it("treats malformed ids as not found, not as errors", async () => {
      await expect(data.getRepo(jordanAcme, "r_api")).rejects.toBeInstanceOf(NotFoundError);
      await expect(data.getReview(jordanAcme, "'; drop table reviews; --")).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("members can read but not write", () => {
    it("reads their org", async () => {
      expect((await data.listRepos(jordanContoso)).length).toBe(1);
    });
    it("every write is refused", async () => {
      const repo = seedId("r_contoso");
      const cfg = (await data.getReviewConfig(jordanContoso, null)).effective;
      const writes = [
        () => data.setRepoReviewEnabled(jordanContoso, repo, false),
        () => data.reindexRepo(jordanContoso, repo),
        () => data.saveReviewConfig(jordanContoso, null, cfg),
        () => data.clearRepoConfig(jordanContoso, repo),
        () => data.createRule(jordanContoso, { text: "Members can't add rules", kind: "rule", repoIds: [], pathGlobs: [] }),
        () => data.createApiKey(jordanContoso, "nope"),
        () => data.inviteMember(jordanContoso, "x@contoso.dev", "member"),
        () => data.changeRole(jordanContoso, seedId("u_lena"), "member"),
        () => data.removeMember(jordanContoso, seedId("u_lena")),
        () => data.disconnectIntegration(jordanContoso, "slack"),
        () => data.startCheckout(jordanContoso),
        () => data.linkInstallation(jordanContoso, 1),
      ];
      for (const w of writes) await expect(w()).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("constraints the database enforces", () => {
    it("one live review per pull request", async () => {
      const first = await data.rerunReview(jordanAcme, acmeReview);
      expect(first.status).toBe("queued");
      await expect(data.rerunReview(jordanAcme, acmeReview)).rejects.toThrow("already running");
      expect(jobs).toEqual([{ name: "review-pr", data: { reviewId: first.id } }]);
    });

    it("BUG-008 a review whose job died stops blocking new reviews after an hour", async () => {
      // The review queued by the previous test never finishes: the worker crashed, or its job expired every attempt.
      const [stuck] = await db.select().from(s.reviews).where(eq(s.reviews.status, "queued"));
      // Backdate it past the set_updated_at trigger.
      await db.transaction(async (tx) => {
        await tx.execute(dsql`set local session_replication_role = replica`);
        await tx.update(s.reviews).set({ status: "running", updatedAt: new Date(Date.now() - 2 * 3600_000).toISOString() }).where(eq(s.reviews.id, stuck.id));
      });
      const next = await data.rerunReview(jordanAcme, acmeReview);
      expect(next.status).toBe("queued");
      const [old] = await db.select().from(s.reviews).where(eq(s.reviews.id, stuck.id));
      expect(old.status).toBe("failed");
      expect(old.error).toMatch(/didn't finish/);
      // A live review that is still within its time isn't touched.
      await expect(data.rerunReview(jordanAcme, acmeReview)).rejects.toThrow("already running");
    });

    it("an org keeps at least one admin", async () => {
      await expect(data.changeRole(lenaContoso, seedId("u_lena"), "member")).rejects.toThrow("at least one admin");
      await expect(data.removeMember(lenaContoso, seedId("u_lena"))).rejects.toThrow("last admin");
    });

    it("invites: duplicates refused, email must match, single use", async () => {
      await expect(data.inviteMember(jordanAcme, "New.Hire@acme.dev", "member")).rejects.toThrow("already has an open invite");
      await expect(data.inviteMember(jordanAcme, "priya@acme.dev", "member")).rejects.toThrow("already a member");
      await data.inviteMember(jordanAcme, "sam.new@acme.dev", "member");
      const email = jobs.find((j) => j.name === "send-email")!.data as { vars: { url: string } };
      const token = email.vars.url.split("/invite/")[1];
      expect((await data.peekInvite(token))?.orgName).toBe("Acme");
      await expect(data.acceptInvite(seedId("u_lena"), token)).rejects.toThrow("This invite is for sam.new@acme.dev");
      const [u] = await db.insert(s.users).values({ email: "sam.new@acme.dev", name: "Sam New" }).returning();
      expect(await data.acceptInvite(u.id, token)).toEqual({ orgId: ACME });
      await expect(data.acceptInvite(u.id, token)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("API keys: stored hashed, shown once, revocable", async () => {
      const { secret, key } = await data.createApiKey(jordanAcme, "Test key");
      const [row] = await db.select().from(s.apiKeys).where(eq(s.apiKeys.id, key.id));
      expect(row.keyHash).not.toContain(secret.slice(4));
      expect(await data.authenticateApiKey(secret)).toEqual({ orgId: ACME, keyId: key.id });
      await data.revokeApiKey(jordanAcme, key.id);
      expect(await data.authenticateApiKey(secret)).toBeNull();
      expect(await data.authenticateApiKey("rpt_" + "x".repeat(24))).toBeNull();
    });

    it("repo settings override and reset", async () => {
      const org = (await data.getReviewConfig(jordanAcme, acmeRepo)).effective;
      await data.saveReviewConfig(jordanAcme, acmeRepo, { ...org, strictness: 1 });
      expect((await data.getReviewConfig(jordanAcme, acmeRepo)).effective.strictness).toBe(1);
      expect((await data.getReviewConfig(jordanAcme, null)).effective.strictness).toBe(org.strictness);
      await data.clearRepoConfig(jordanAcme, acmeRepo);
      expect((await data.getReviewConfig(jordanAcme, acmeRepo)).stored).toBeNull();
    });

    it("new orgs get a trial, an admin and default settings; slugs stay unique", async () => {
      const a = await data.createOrganization(seedId("u_lena"), "Acme");
      const [org] = await db.select().from(s.organizations).where(eq(s.organizations.id, a.id));
      expect(org.slug).toBe("acme-2");
      expect(org.plan).toBe("trial");
      const ctx = { userId: seedId("u_lena"), orgId: a.id, role: "admin" as const };
      expect((await data.getReviewConfig(ctx, null)).effective.strictness).toBe(2);
      expect((await data.listMembers(ctx)).members[0].role).toBe("admin");
    });
  });

  describe("reads used by the screens", () => {
    it("paginates reviews with a cursor and filters them", async () => {
      const p1 = await data.listReviews(jordanAcme, { limit: 10 });
      const p2 = await data.listReviews(jordanAcme, { limit: 10, cursor: p1.nextCursor! });
      expect(p1.items).toHaveLength(10);
      expect(new Set([...p1.items, ...p2.items].map((r) => r.id)).size).toBe(20);
      expect(p2.items[0].queuedAt <= p1.items[9].queuedAt).toBe(true);
      const skipped = await data.listReviews(jordanAcme, { status: "skipped", limit: 200 });
      expect(skipped.items.every((r) => r.status === "skipped")).toBe(true);
      const byNumber = await data.listReviews(jordanAcme, { q: "#380" });
      expect(byNumber.items.every((r) => r.pr.number === 380)).toBe(true);
    });

    it("review detail carries findings with reaction counts and cited rules", async () => {
      const r = await data.getReview(jordanAcme, acmeReview);
      expect(r.findings.length).toBeGreaterThan(0);
      expect(r.findings.some((f) => f.ruleId)).toBe(true);
      expect(r.rules.length).toBeGreaterThan(0);
      expect(r.counts.P0 + r.counts.P1 + r.counts.P2).toBeGreaterThan(0);
    });

    it("analytics adds up", async () => {
      const a = await data.getAnalytics(jordanAcme, { days: 30 });
      expect(a.daily).toHaveLength(30);
      expect(a.daily.reduce((n, d) => n + d.reviews, 0)).toBeGreaterThan(0);
      expect(a.byRepo.reduce((n, r) => n + r.reviews, 0)).toBe(a.daily.reduce((n, d) => n + d.reviews, 0));
    });
  });
});
