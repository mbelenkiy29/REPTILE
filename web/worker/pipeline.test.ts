// The worker end to end against Postgres, with a fake GitHub, a fake model and a real local git repository.
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
process.env.APP_URL = "http://localhost:3000";

describe.skipIf(!url)("worker pipeline", async () => {
  const { seed } = await import("../db/seed");
  const { closeDb, db, schema: s } = await import("@/db");
  const { seedId } = await import("@/db/ids");
  const { setJobSender } = await import("@/lib/jobs");
  const { setGitHost } = await import("@/lib/github");
  const { FakeGitHub } = await import("@/lib/github/fake");
  const { queueReview } = await import("@/lib/github/events");
  const { setAi } = await import("./ai");
  const { FakeReviewModel, FakeEmbedder } = await import("./ai/fake");
  const { runReview } = await import("./jobs/review-pr");
  const { indexRepo, chunkFile } = await import("./jobs/index-repo");
  const { answerThread, cleanup, learnRules, syncReactions } = await import("./jobs/misc");

  const gh = new FakeGitHub();
  const model = new FakeReviewModel();
  const jobs: { name: string; data: unknown }[] = [];
  const REPO = "contoso/storefront";
  const repoId = seedId("r_contoso");
  const attempt = { retryCount: 0, retryLimit: 2 };

  const file1 = ["export function total(items) {", "  let sum = 0;", "  for (const i of items) sum += i.price; // BUG: ignores quantity", "  const key = 'SECRET_live_123';", "  return sum; // nit: name", "}", ""].join("\n");
  const patch1 = ["@@ -0,0 +1,6 @@", ...file1.split("\n").slice(0, 6).map((l) => "+" + l)].join("\n");

  async function openPr(number: number, sha: string, content: string, patch: string, path = "src/cart.ts") {
    gh.prs.set(`${REPO}#${number}`, { number, title: "Cart totals", body: "Adds totals.", authorLogin: "lenaf", baseBranch: "main", baseSha: "base", headSha: sha, isDraft: false, labels: [], state: "open", merged: false, url: `https://github.com/${REPO}/pull/${number}`, files: [{ filename: path, status: "added", patch, additions: 6, deletions: 0 }], repo: REPO });
    gh.files.set(`${REPO}@${sha}:${path}`, content);
    const [pr] = await db.insert(s.pullRequests).values({ orgId: seedId("o_contoso"), repoId, number, title: "Cart totals", authorLogin: "lenaf", baseBranch: "main", headSha: sha, labels: [], url: `https://github.com/${REPO}/pull/${number}`, openedAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: [s.pullRequests.repoId, s.pullRequests.number], set: { headSha: sha } }).returning();
    return pr;
  }

  beforeAll(async () => {
    setJobSender(async (name, d) => { jobs.push({ name, data: d }); return "job"; });
    setGitHost(gh);
    setAi({ model, embedder: new FakeEmbedder() });
    await seed({ reset: true });
    // A real git repository for indexing.
    const base = mkdtempSync(join(tmpdir(), "reptile-git-"));
    const work = join(base, "work");
    mkdirSync(join(work, "src"), { recursive: true });
    writeFileSync(join(work, "src/price.ts"), "export function price(item) {\n  return item.price * item.quantity;\n}\n");
    writeFileSync(join(work, "src/cart.ts"), "export const empty = [];\n");
    writeFileSync(join(work, "package-lock.json"), "{}");
    const git = (...a: string[]) => execFileSync("git", ["-C", work, ...a], { stdio: "pipe" });
    execFileSync("git", ["init", "-q", "-b", "main", work]);
    git("-c", "user.email=t@t", "-c", "user.name=t", "add", ".");
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init");
    mkdirSync(join(base, "contoso"));
    execFileSync("git", ["clone", "-q", "--bare", work, join(base, "contoso/storefront.git")]);
    process.env.REPTILE_GIT_BASE = `file://${base}`;
  });
  afterAll(async () => { setJobSender(undefined); setGitHost(undefined); setAi({ model: undefined, embedder: undefined }); await closeDb(); });

  describe("index-repo", () => {
    it("chunks with overlap and finds symbols", () => {
      const text = Array.from({ length: 130 }, (_, i) => (i === 70 ? "export function later() {" : `line ${i}`)).join("\n");
      const c = chunkFile("a.ts", text);
      expect(c[0].startLine).toBe(1);
      expect(c.length).toBeGreaterThan(1);
      expect(c[1].startLine).toBeLessThan(c[0].endLine + 1);
      expect(c.some((x) => x.symbol === "later")).toBe(true);
    });
    it("indexes the repository, skipping lockfiles, and re-indexes incrementally", async () => {
      const r1 = await indexRepo(repoId);
      expect(r1).toMatchObject({ result: "completed", files: 2 });
      const [repo] = await db.select().from(s.repositories).where(eq(s.repositories.id, repoId));
      expect(repo.indexStatus).toBe("completed");
      expect(repo.indexedSha).toMatch(/^[0-9a-f]{40}$/);
      const chunks = await db.select().from(s.codeChunks).where(eq(s.codeChunks.repoId, repoId));
      expect(chunks.map((c) => c.path).sort()).toEqual(["src/cart.ts", "src/price.ts"]);
      expect(await indexRepo(repoId)).toMatchObject({ embedded: 0 });
    });
    it("records a readable failure", async () => {
      const prev = process.env.REPTILE_GIT_BASE;
      process.env.REPTILE_GIT_BASE = "file:///nonexistent";
      await expect(indexRepo(repoId)).rejects.toThrow("The clone failed");
      const [repo] = await db.select().from(s.repositories).where(eq(s.repositories.id, repoId));
      expect(repo.indexStatus).toBe("failed");
      process.env.REPTILE_GIT_BASE = prev;
      await indexRepo(repoId);
    });
  });

  describe("review-pr", () => {
    let prId = "";
    it("reviews a PR: filters by strictness, posts one review, a summary and a check, and bills it", async () => {
      const pr = await openPr(9, "sha1", file1, patch1);
      prId = pr.id;
      const reviewId = (await queueReview(pr, "opened", "lenaf"))!;
      const r = await runReview(reviewId, attempt);
      expect(r).toMatchObject({ result: "completed", posted: 2 });
      // Strictness 2 drops the 0.4-confidence style nit.
      const posted = gh.reviews.at(-1)!;
      expect(posted.comments.map((c) => `${c.line}:${c.body.split("\n")[0]}`)).toEqual([
        "4:**P0** · Security · Hard-coded secret",
        "3:**P1** · Logic · Bug: ignores quantity",
      ]);
      expect(posted.comments[1].body).toContain("```suggestion");
      const summary = gh.issueComments.at(-1)!;
      expect(summary.body).toContain("<!-- reptile:summary -->");
      expect(summary.body).toContain("Hard-coded secret](https://github.com/contoso/storefront/pull/9#discussion_r");
      expect(gh.checkRuns.at(-1)).toMatchObject({ conclusion: "neutral", title: "REPTILE · 2 findings (1 critical)" });
      const [row] = await db.select().from(s.reviews).where(eq(s.reviews.id, reviewId));
      expect(row).toMatchObject({ status: "completed", confidenceScore: 2, creditsUsed: 1 });
      expect((await db.select().from(s.usageEvents).where(eq(s.usageEvents.reviewId, reviewId))).length).toBe(1);
      // Retrieval used the index: related code from the other file was in the request.
      expect(model.calls.at(-1)!.context.some((c) => c.path === "src/price.ts")).toBe(true);
      const findings = await db.select().from(s.findings).where(eq(s.findings.pullRequestId, pr.id));
      expect(findings.every((f) => f.providerCommentId)).toBe(true);
    });

    it("on a new push: fixed findings are marked addressed, open ones aren't re-posted, the summary is edited in place", async () => {
      const fixed = file1.replace(" // BUG: ignores quantity", "");
      const pr = await openPr(9, "sha2", fixed, ["@@ -0,0 +1,6 @@", ...fixed.split("\n").slice(0, 6).map((l) => "+" + l)].join("\n"));
      const before = gh.reviews.length;
      const comments = gh.issueComments.length;
      const reviewId = (await queueReview(pr, "synchronize", "lenaf"))!;
      expect(await runReview(reviewId, attempt)).toMatchObject({ result: "completed", posted: 0 });
      expect(gh.reviews.length).toBe(before);
      expect(gh.issueComments.length).toBe(comments);
      expect(gh.issueComments.at(-1)!.body).not.toContain("ignores quantity");
      const fs = await db.select().from(s.findings).where(eq(s.findings.pullRequestId, prId));
      expect(fs.map((f) => `${f.title}:${f.status}`).sort()).toEqual(["Bug: ignores quantity:addressed", "Hard-coded secret:open"]);
    });

    it("reptile.json in the repository overrides the dashboard", async () => {
      gh.files.set(`${REPO}@sha3:reptile.json`, JSON.stringify({ ignorePatterns: ["src/**"] }));
      const pr = await openPr(10, "sha3", file1, patch1);
      const reviewId = (await queueReview(pr, "opened", "lenaf"))!;
      expect(await runReview(reviewId, attempt)).toEqual({ result: "skipped: Only ignored files changed" });
    });

    it("drafts are skipped, an ended trial pauses reviews", async () => {
      const pr = await openPr(11, "sha4", file1, patch1);
      await db.update(s.pullRequests).set({ isDraft: true }).where(eq(s.pullRequests.id, pr.id));
      const draft = (await queueReview({ ...pr, isDraft: true }, "opened", "lenaf"))!;
      expect(await runReview(draft, attempt)).toEqual({ result: "skipped: Draft pull request" });
      await db.update(s.organizations).set({ plan: "trial", trialEndsAt: new Date(Date.now() - 864e5).toISOString() }).where(eq(s.organizations.id, seedId("o_contoso")));
      const r2 = (await queueReview({ ...pr, headSha: "sha5" }, "mention", "lenaf"))!;
      expect((await runReview(r2, attempt)).result).toMatch(/trial has ended/);
      await db.update(s.organizations).set({ plan: "pro", trialEndsAt: null }).where(eq(s.organizations.id, seedId("o_contoso")));
    });

    it("the Free plan reviews for one member up to 50 a month, then pauses until the 1st", async () => {
      const contoso = seedId("o_contoso");
      const setOrg = (v: Partial<typeof s.organizations.$inferInsert>) => db.update(s.organizations).set(v).where(eq(s.organizations.id, contoso));
      const run = async (n: number, sha: string) => runReview((await queueReview(await openPr(n, sha, file1, patch1), "opened", "lenaf"))!, attempt);
      await setOrg({ plan: "free", billingStatus: "none" });
      try {
        // Contoso has two members.
        expect((await run(30, "free1")).result).toMatch(/Free plan covers one member/);
        await db.delete(s.memberships).where(and(eq(s.memberships.orgId, contoso), eq(s.memberships.userId, seedId("u_jordan"))));
        const period = new Date().toISOString().slice(0, 8) + "01";
        await db.delete(s.usageEvents).where(eq(s.usageEvents.orgId, contoso));
        await db.insert(s.usageEvents).values(Array.from({ length: 50 }, () => ({ orgId: contoso, credits: 1, periodStart: period, billable: false })));
        expect((await run(31, "free2")).result).toMatch(/50 free reviews/);
        await db.delete(s.usageEvents).where(eq(s.usageEvents.orgId, contoso));
        expect((await run(32, "free3")).result).toBe("completed");
        const [u] = await db.select().from(s.usageEvents).where(eq(s.usageEvents.orgId, contoso));
        expect(u.billable).toBe(false);
      } finally {
        await setOrg({ plan: "pro", billingStatus: "active" });
        await db.insert(s.memberships).values({ orgId: contoso, userId: seedId("u_jordan"), role: "member" }).onConflictDoNothing();
      }
    });

    it("retries before posting, and records a failure on the last attempt without billing", async () => {
      const pr = await openPr(12, "sha6", file1, patch1);
      const original = model.review.bind(model);
      model.review = async () => { throw new Error("upstream timeout"); };
      const id = (await queueReview(pr, "opened", "lenaf"))!;
      await expect(runReview(id, { retryCount: 0, retryLimit: 2 })).rejects.toThrow("upstream timeout");
      expect((await db.select().from(s.reviews).where(eq(s.reviews.id, id)))[0].status).toBe("queued");
      expect(await runReview(id, { retryCount: 2, retryLimit: 2 })).toEqual({ result: "failed" });
      const [row] = await db.select().from(s.reviews).where(eq(s.reviews.id, id));
      expect(row.status).toBe("failed");
      expect(row.error).toMatch(/no credit was used/);
      expect((await db.select().from(s.usageEvents).where(eq(s.usageEvents.reviewId, id))).length).toBe(0);
      model.review = original;
    });

    it("BUG-009 a retried review completes the one check run it started", async () => {
      const pr = await openPr(20, "sha20", file1, patch1);
      const original = model.review.bind(model);
      let calls = 0;
      model.review = async (...a: Parameters<typeof original>) => { if (calls++ === 0) throw new Error("upstream timeout"); return original(...a); };
      const id = (await queueReview(pr, "opened", "lenaf"))!;
      await expect(runReview(id, { retryCount: 0, retryLimit: 2 })).rejects.toThrow("upstream timeout");
      expect((await runReview(id, { retryCount: 1, retryLimit: 2 })).result).toBe("completed");
      model.review = original;
      const runs = gh.checkRuns.filter((c) => c.headSha === "sha20");
      expect(runs).toHaveLength(1);
      expect(runs[0].conclusion).toBeDefined();
    });

    it("BUG-010 a .reptile/config.json nearer the file can un-ignore what reptile.json ignores", async () => {
      const doc = ["# Guide", "", "BUG: the install step is wrong", ""].join("\n");
      const pr = await openPr(21, "sha21", doc, ["@@ -0,0 +1,3 @@", "+# Guide", "+", "+BUG: the install step is wrong"].join("\n"), "docs/guide.md");
      gh.files.set(`${REPO}@sha21:reptile.json`, JSON.stringify({ ignorePatterns: ["**/*.md"] }));
      gh.files.set(`${REPO}@sha21:docs/.reptile/config.json`, JSON.stringify({ ignorePatterns: [] }));
      const id = (await queueReview(pr, "opened", "lenaf"))!;
      const out = await runReview(id, attempt);
      expect(out.result).toBe("completed");
    });

    it("a superseded review stops without posting", async () => {
      const pr = await openPr(13, "sha7", file1, patch1);
      const id = (await queueReview(pr, "opened", "lenaf"))!;
      const original = model.review.bind(model);
      model.review = async (req) => {
        await db.update(s.reviews).set({ status: "superseded" }).where(eq(s.reviews.id, id));
        return original(req);
      };
      const before = gh.reviews.length;
      expect(await runReview(id, attempt)).toEqual({ result: "superseded" });
      expect(gh.reviews.length).toBe(before);
      model.review = original;
    });
  });

  describe("feedback loop", () => {
    it("syncs 👎 reactions, dismisses the finding and doesn't repeat it", async () => {
      const [secret] = await db.select().from(s.findings).where(and(eq(s.findings.title, "Hard-coded secret"), eq(s.findings.status, "open")));
      gh.reactions.set(secret.providerCommentId!, [{ id: 1, login: "lenaf", content: "-1" }, { id: 2, login: "sam", content: "eyes" }]);
      const r = await syncReactions();
      expect(r.added).toBe(1);
      expect(await syncReactions()).toMatchObject({ added: 0 });
      const [after] = await db.select().from(s.findings).where(eq(s.findings.id, secret.id));
      expect(after.status).toBe("dismissed");
    });
    it("answers a question in the thread", async () => {
      const [f] = await db.select().from(s.findings).where(eq(s.findings.title, "Hard-coded secret")).limit(1);
      await answerThread({ findingId: f.id, commentId: f.providerCommentId!, body: "@reptile why?", author: "lenaf" });
      expect(gh.replies.at(-1)).toMatchObject({ inReplyTo: f.providerCommentId, body: expect.stringContaining("Hard-coded secret") });
    });
    it("proposes rules from repeated feedback, as suggestions", async () => {
      const [f] = await db.select().from(s.findings).where(eq(s.findings.orgId, seedId("o_contoso"))).limit(1);
      await db.insert(s.feedback).values({ orgId: f.orgId, findingId: f.id, actorLogin: "lenaf", kind: "reply", body: "tests may throw" });
      const r = await learnRules();
      expect(r.proposed).toBeGreaterThan(0);
      const suggested = await db.select().from(s.rules).where(and(eq(s.rules.orgId, seedId("o_contoso")), eq(s.rules.status, "suggested")));
      expect(suggested[0].evidence.length).toBeGreaterThan(0);
      expect((await learnRules()).proposed).toBe(0); // not proposed twice
    });
    it("cleanup runs", async () => {
      expect(await cleanup()).toMatchObject({ result: "clean" });
    });
  });
});
