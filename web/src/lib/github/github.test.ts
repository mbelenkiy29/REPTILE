// GitHub App: webhook signature, idempotency and event handling, install state, and linking — against Postgres.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { sign } from "@octokit/webhooks-methods";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
process.env.GITHUB_WEBHOOK_SECRET = "test-webhook-secret";
process.env.AUTH_SECRET = "test-auth-secret";
process.env.GITHUB_APP_SLUG = "countersign";

describe.skipIf(!url)("GitHub App", async () => {
  const { seed } = await import("../../../db/seed");
  const { closeDb, db, schema: s } = await import("@/db");
  const { seedId } = await import("@/db/ids");
  const { setJobSender } = await import("@/lib/jobs");
  const { setGitHost } = await import("./index");
  const { FakeGitHub } = await import("./fake");
  const { signState, verifyState } = await import("./state");
  const { POST } = await import("@/app/api/webhooks/github/route");
  const data = await import("@/lib/data");

  const jobs: { name: string; data: Record<string, unknown> }[] = [];
  const gh = new FakeGitHub();
  let n = 0;

  // Seeded: contoso/storefront is repo index 6 → provider id 700006, installation 50210044.
  const CONTOSO_INSTALL = 50210044;
  const STOREFRONT = 700006;
  const LEGACY = 700004; // acme/legacy-billing, reviews off
  const ACME_INSTALL = 51200871;

  async function deliver(event: string, payload: object, opts: { secret?: string; delivery?: string } = {}) {
    const body = JSON.stringify(payload);
    const signature = await sign(opts.secret ?? "test-webhook-secret", body);
    const res = await POST(new Request("http://localhost/api/webhooks/github", {
      method: "POST", body,
      headers: { "x-hub-signature-256": signature, "x-github-event": event, "x-github-delivery": opts.delivery ?? `d-${++n}` },
    }));
    return { status: res.status, json: (await res.json()) as { result?: string; error?: string } };
  }

  const pr = (number: number, sha: string, extra: object = {}) => ({
    number, title: `PR ${number}`, user: { login: "lenaf" }, base: { ref: "main" }, head: { sha }, state: "open", draft: false,
    labels: [], html_url: `https://github.com/contoso/storefront/pull/${number}`, created_at: new Date().toISOString(), ...extra,
  });
  const prEvent = (action: string, p: object, repoId = STOREFRONT, inst = CONTOSO_INSTALL) => ({ action, installation: { id: inst }, repository: { id: repoId }, pull_request: p, sender: { login: "lenaf" } });

  beforeAll(async () => {
    setJobSender(async (name, d) => { jobs.push({ name, data: d as Record<string, unknown> }); return "job"; });
    setGitHost(gh);
    await seed({ reset: true });
  });
  beforeEach(() => { jobs.length = 0; });
  afterAll(async () => { setJobSender(undefined); setGitHost(undefined); await closeDb(); });

  describe("webhook endpoint", () => {
    it("rejects a bad or missing signature", async () => {
      expect((await deliver("ping", {}, { secret: "wrong" })).status).toBe(401);
      const res = await POST(new Request("http://x", { method: "POST", body: "{}", headers: { "x-github-event": "ping", "x-github-delivery": "nosig" } }));
      expect(res.status).toBe(401);
    });
    it("handles a delivery once", async () => {
      expect((await deliver("ping", {}, { delivery: "same" })).json.result).toBe("pong");
      expect((await deliver("ping", {}, { delivery: "same" })).json.result).toBe("duplicate delivery");
    });
  });

  describe("pull requests", () => {
    it("opening a PR records it and queues a review", async () => {
      const r = await deliver("pull_request", prEvent("opened", pr(7, "aaa111")));
      expect(r.json.result).toBe("review queued");
      const [row] = await db.select().from(s.pullRequests).where(and(eq(s.pullRequests.repoId, seedId("r_contoso")), eq(s.pullRequests.number, 7)));
      expect(row.headSha).toBe("aaa111");
      expect(jobs.map((j) => j.name)).toEqual(["review-pr"]);
    });
    it("the same commit isn't reviewed twice automatically", async () => {
      expect((await deliver("pull_request", prEvent("reopened", pr(7, "aaa111")))).json.result).toBe("already reviewed");
      expect(jobs).toEqual([]);
    });
    it("a new push supersedes the review in flight", async () => {
      expect((await deliver("pull_request", prEvent("synchronize", pr(7, "bbb222")))).json.result).toBe("review queued");
      const [row] = await db.select().from(s.pullRequests).where(and(eq(s.pullRequests.repoId, seedId("r_contoso")), eq(s.pullRequests.number, 7)));
      const reviews = await db.select().from(s.reviews).where(eq(s.reviews.pullRequestId, row.id));
      expect(reviews.map((r) => `${r.headSha}:${r.status}`).sort()).toEqual(["aaa111:superseded", "bbb222:queued"]);
    });
    it("repos with reviews off are recorded but not reviewed", async () => {
      expect((await deliver("pull_request", prEvent("opened", pr(1, "ccc"), LEGACY, ACME_INSTALL))).json.result).toBe("reviews off");
    });
    it("unknown repos are ignored", async () => {
      expect((await deliver("pull_request", prEvent("opened", pr(1, "ddd"), 123456789, 999))).json.result).toBe("repo not linked");
    });
    it("closing as merged updates the state", async () => {
      await deliver("pull_request", prEvent("closed", pr(7, "bbb222", { state: "closed", merged: true, merged_at: new Date().toISOString() })));
      const [row] = await db.select().from(s.pullRequests).where(and(eq(s.pullRequests.repoId, seedId("r_contoso")), eq(s.pullRequests.number, 7)));
      expect(row.state).toBe("merged");
    });
  });

  describe("comments", () => {
    const comment = (body: string, user = { login: "lenaf", type: "User" }) => ({
      action: "created", installation: { id: CONTOSO_INSTALL }, repository: { id: STOREFRONT }, issue: { number: 7, pull_request: {} }, comment: { body, user, author_association: "MEMBER" },
    });
    it("@countersign on a PR queues a review; other comments and bots don't", async () => {
      // PR 7 was merged above; reopen it (mentions on closed PRs are ignored, BUG-007), and finish its review
      // so the mention isn't blocked by the queued one.
      await deliver("pull_request", prEvent("reopened", pr(7, "bbb222")));
      await db.update(s.reviews).set({ status: "completed" }).where(eq(s.reviews.headSha, "bbb222"));
      expect((await deliver("issue_comment", comment("looks good"))).json.result).toBe("ignored");
      expect((await deliver("issue_comment", comment("@countersign please look", { login: "x[bot]", type: "Bot" }))).json.result).toBe("ignored");
      expect((await deliver("issue_comment", comment("@countersign please look again"))).json.result).toBe("review queued");
    });
    it("a mention on a PR opened before linking fetches it first", async () => {
      gh.prs.set("contoso/storefront#42", { ...{ number: 42, title: "Old PR", body: null, authorLogin: "lenaf", baseBranch: "main", baseSha: "b0", headSha: "eee", isDraft: false, labels: [], state: "open", merged: false, url: "https://x/42" }, files: [], repo: "contoso/storefront" });
      const c = { ...comment("@countersign"), issue: { number: 42, pull_request: {} } };
      expect((await deliver("issue_comment", c)).json.result).toBe("review queued");
    });
    it("a reply under our comment is recorded, and a mention asks for an answer", async () => {
      const [f] = await db.select().from(s.findings).limit(1);
      await db.update(s.findings).set({ providerCommentId: 555 }).where(eq(s.findings.id, f.id));
      const reply = (body: string) => ({ action: "created", installation: { id: ACME_INSTALL }, repository: { id: 700000 }, comment: { id: 556, in_reply_to_id: 555, body, user: { login: "priya-r", type: "User" }, author_association: "MEMBER" } });
      expect((await deliver("pull_request_review_comment", reply("good catch"))).json.result).toBe("reply recorded");
      expect((await deliver("pull_request_review_comment", reply("@countersign why is this a problem?"))).json.result).toBe("answer queued");
      expect(jobs.at(-1)?.name).toBe("answer-thread");
      await deliver("pull_request_review_thread", { action: "resolved", thread: { comments: [{ id: 555 }] } });
      const [after] = await db.select().from(s.findings).where(eq(s.findings.id, f.id));
      expect(after.status === "resolved" || f.status !== "open").toBe(true);
    });
  });

  describe("installation and push", () => {
    it("push to the default branch re-indexes; other branches don't", async () => {
      const push = (ref: string) => ({ ref, installation: { id: CONTOSO_INSTALL }, repository: { id: STOREFRONT, default_branch: "main" } });
      expect((await deliver("push", push("refs/heads/feature"))).json.result).toBe("not the default branch");
      expect((await deliver("push", push("refs/heads/main"))).json.result).toBe("re-index queued");
      expect(jobs[0]).toMatchObject({ name: "index-repo", data: { repoId: seedId("r_contoso") } });
    });
    it("uninstalling marks the repositories removed", async () => {
      await deliver("installation", { action: "deleted", installation: { id: CONTOSO_INSTALL } });
      const [r] = await db.select().from(s.repositories).where(eq(s.repositories.id, seedId("r_contoso")));
      expect(r.removedAt).not.toBeNull();
      expect(await data.listRepos({ userId: seedId("u_lena"), orgId: seedId("o_contoso"), role: "admin" })).toEqual([]);
    });
  });

  describe("install state and linking", () => {
    it("state is signed and expires", () => {
      const st = signState({ orgId: "o", userId: "u" });
      expect(verifyState(st)).toEqual({ orgId: "o", userId: "u" });
      const [body, sig] = st.split(".");
      const forged = Buffer.from(JSON.stringify({ orgId: "other", userId: "u", exp: Date.now() + 1e6 })).toString("base64url");
      expect(verifyState(`${forged}.${sig}`)).toBeNull();
      expect(verifyState(`${body}.x`)).toBeNull();
      expect(verifyState(signState({ orgId: "o", userId: "u" }, -1))).toBeNull();
    });
    it("links an installation the user can see, once", async () => {
      gh.installations = [{ externalInstallationId: 777, accountLogin: "side-co", accountType: "Organization", repositorySelection: "selected",
        repositories: [{ providerRepoId: 8801, fullName: "side-co/app", defaultBranch: "main", private: true }] }];
      const ctx = { userId: seedId("u_jordan"), orgId: seedId("o_side"), role: "admin" as const };
      expect(await data.listPendingInstallations(ctx)).toHaveLength(1);
      expect(await data.linkInstallation(ctx, 777)).toEqual({ installationId: 777, repoCount: 1 });
      expect(jobs.map((j) => j.name)).toEqual(["index-repo"]);
      expect(await data.listPendingInstallations(ctx)).toEqual([]);
      await expect(data.linkInstallation(ctx, 777)).rejects.toThrow();
      await expect(data.linkInstallation(ctx, 888)).rejects.toBeInstanceOf(data.NotFoundError);
    });
  });

  describe("found by /replica-test", () => {
    // acme/api (provider id 700000); the Contoso installation is uninstalled by an earlier test.
    const API = 700000;
    const ev = (action: string, p: object) => prEvent(action, p, API, ACME_INSTALL);
    const mention = (number: number, association: string, repoId = API, inst = ACME_INSTALL) => ({
      action: "created", installation: { id: inst }, repository: { id: repoId }, issue: { number, pull_request: {} },
      comment: { body: "@countersign review this", user: { login: "someone", type: "User" }, author_association: association },
    });

    it("BUG-004 a draft marked ready for review is reviewed automatically", async () => {
      expect((await deliver("pull_request", ev("opened", pr(301, "draft1", { draft: true })))).json.result).toBe("review queued");
      // The worker skips drafts.
      await db.update(s.reviews).set({ status: "skipped", skipReason: "Draft pull request" }).where(eq(s.reviews.headSha, "draft1"));
      jobs.length = 0;
      expect((await deliver("pull_request", ev("ready_for_review", pr(301, "draft1")))).json.result).toBe("review queued");
      expect(jobs.map((j) => j.name)).toEqual(["review-pr"]);
      // Still only one automatic review of that commit once it has run.
      expect((await deliver("pull_request", ev("synchronize", pr(301, "draft1")))).json.result).toBe("already reviewed");
    });

    it("BUG-005 a mention doesn't review a repository with reviews turned off", async () => {
      await deliver("pull_request", prEvent("opened", pr(303, "off1"), LEGACY, ACME_INSTALL));
      expect((await deliver("issue_comment", mention(303, "MEMBER", LEGACY, ACME_INSTALL))).json.result).toBe("reviews off");
      expect(jobs.filter((j) => j.name === "review-pr")).toHaveLength(0);
    });

    it("BUG-006 only people with write access can start a review by mention", async () => {
      await deliver("pull_request", ev("opened", pr(305, "out1")));
      await db.update(s.reviews).set({ status: "completed" }).where(eq(s.reviews.headSha, "out1"));
      jobs.length = 0;
      for (const association of ["NONE", "FIRST_TIME_CONTRIBUTOR", "CONTRIBUTOR", "FIRST_TIMER", undefined]) {
        expect((await deliver("issue_comment", mention(305, association as string))).json.result, String(association)).toBe("not a collaborator");
      }
      expect(jobs).toHaveLength(0);
      expect((await deliver("issue_comment", mention(305, "COLLABORATOR"))).json.result).toBe("review queued");
    });

    it("BUG-006 outsiders' questions in a thread are recorded but not answered", async () => {
      const [f] = await db.select().from(s.findings).limit(1);
      await db.update(s.findings).set({ providerCommentId: 777 }).where(eq(s.findings.id, f.id));
      const reply = { action: "created", installation: { id: ACME_INSTALL }, repository: { id: 700000 }, comment: { id: 778, in_reply_to_id: 777, body: "@countersign explain", user: { login: "rando", type: "User" }, author_association: "NONE" } };
      expect((await deliver("pull_request_review_comment", reply)).json.result).toBe("reply recorded");
      expect(jobs.filter((j) => j.name === "answer-thread")).toHaveLength(0);
    });

    it("BUG-011 a label from the repository's own settings starts a review", async () => {
      await db.insert(s.reviewConfigs).values({
        orgId: seedId("o_acme"), repoId: seedId("r_api"), strictness: 2, commentTypes: ["logic"], reviewDrafts: false, includeLabels: ["needs-review"],
        disabledLabels: [], includeAuthors: [], excludeAuthors: [], includeBranches: [], excludeBranches: [], ignorePatterns: [], summaryOptions: { diagram: true, fileTable: true, confidence: true },
      }).onConflictDoNothing();
      await deliver("pull_request", ev("opened", pr(306, "lab1")));
      await db.update(s.reviews).set({ status: "skipped", skipReason: "Not labeled" }).where(eq(s.reviews.headSha, "lab1"));
      jobs.length = 0;
      const labeled = { ...ev("labeled", pr(306, "lab1", { labels: [{ name: "needs-review" }] })), label: { name: "needs-review" } };
      expect((await deliver("pull_request", labeled)).json.result).toBe("review queued");
      expect(jobs.map((j) => j.name)).toEqual(["review-pr"]);
    });

    it("a teammate's own review comment is kept for learning; outsiders', bots' and short ones aren't", async () => {
      await deliver("pull_request", ev("opened", pr(320, "hc1")));
      const comment = (id: number, body: string, association = "MEMBER", type = "User") => ({
        action: "created", installation: { id: ACME_INSTALL }, repository: { id: API }, pull_request: { number: 320 },
        comment: { id, body, path: "src/billing/invoice.ts", user: { login: "priya-r", type }, author_association: association },
      });
      const body = "Money should be integer cents here, never floats; rounding drifts on invoices.";
      expect((await deliver("pull_request_review_comment", comment(9001, body))).json.result).toBe("human comment recorded");
      expect((await deliver("pull_request_review_comment", comment(9001, body))).json.result).toBe("human comment recorded"); // redelivered by GitHub with a new delivery id
      expect((await deliver("pull_request_review_comment", comment(9002, body, "NONE"))).json.result).toBe("not a collaborator");
      expect((await deliver("pull_request_review_comment", comment(9003, body, "MEMBER", "Bot"))).json.result).toBe("ignored");
      expect((await deliver("pull_request_review_comment", comment(9004, "nit"))).json.result).toBe("too short to learn from");
      const rows = await db.select().from(s.feedback).where(eq(s.feedback.kind, "human_comment"));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ findingId: null, filePath: "src/billing/invoice.ts", body, actorLogin: "priya-r", providerId: 9001 });
    });

    it("BUG-007 a mention on a closed or merged pull request is ignored", async () => {
      await deliver("pull_request", ev("closed", pr(304, "m1", { state: "closed", merged: true, merged_at: new Date().toISOString() })));
      await db.update(s.reviews).set({ status: "completed" }).where(eq(s.reviews.headSha, "m1"));
      jobs.length = 0;
      expect((await deliver("issue_comment", mention(304, "OWNER"))).json.result).toBe("pull request closed");
      expect(jobs).toHaveLength(0);
    });
  });
});
