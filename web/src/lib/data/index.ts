// The data layer. Screens and server actions import only from here.
// Postgres via Drizzle. Every function takes the caller's Ctx first; every query is scoped to ctx.orgId
// and every write checks the role. src/lib/data/data.test.ts proves a second org and a member get nothing.
import { createHash, randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, or, sql as dsql, sum } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { failStaleReviews } from "@/lib/review/stale";
import { enqueue } from "@/lib/jobs";
import { mergeConfig } from "@/lib/review/config";
import { DEFAULT_CONFIG } from "@/lib/review/defaults";
import { simulate } from "./session";
import {
  ForbiddenError, NotFoundError,
  type ApiKey, type Ctx, type Finding, type Installation, type Integration, type IntegrationKind, type Invite,
  type KnowledgeDoc, type PullRequest, type Repository, type Review, type ReviewConfig, type ReviewStatus, type Role,
  type Rule, type RuleStatus, type Severity, type User,
} from "./types";

export * from "./types";

const now = () => new Date().toISOString();
const iso = (v: string | Date | null | undefined) => (v == null ? null : new Date(v).toISOString());

function assertAdmin(ctx: Ctx) {
  if (ctx.role !== "admin") throw new ForbiddenError();
}

function isUniqueViolation(e: unknown) {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

const toUser = (u: typeof s.users.$inferSelect): User => ({ id: u.id, name: u.name ?? u.email ?? "Unknown", email: u.email ?? "", githubLogin: u.githubLogin ?? "" });

/* ───────────── orgs & onboarding (F01) ───────────── */

export async function createOrganization(userId: string, name: string) {
  await simulate();
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "org";
  return db.transaction(async (tx) => {
    let slug = base;
    for (let i = 2; (await tx.select({ id: s.organizations.id }).from(s.organizations).where(eq(s.organizations.slug, slug))).length; i++) slug = `${base}-${i}`;
    const [org] = await tx.insert(s.organizations).values({
      name, slug, plan: "trial", trialEndsAt: new Date(Date.now() + 14 * 864e5).toISOString(),
    }).returning({ id: s.organizations.id });
    await tx.insert(s.memberships).values({ orgId: org.id, userId, role: "admin" });
    await tx.insert(s.reviewConfigs).values(configRow(org.id, null, DEFAULT_CONFIG, userId));
    return { id: org.id };
  });
}

export async function listInstallations(ctx: Ctx): Promise<Installation[]> {
  await simulate();
  const rows = await db.select().from(s.installations).where(eq(s.installations.orgId, ctx.orgId));
  return rows.map((i) => ({
    id: i.id, orgId: i.orgId, provider: i.provider, externalInstallationId: i.externalInstallationId, accountLogin: i.accountLogin,
    accountType: i.accountType, suspendedAt: iso(i.suspendedAt), createdAt: iso(i.createdAt)!,
  }));
}

/** An app installation the signed-in user can see on GitHub, ready to link (S04). */
export interface PendingInstallation {
  externalInstallationId: number;
  accountLogin: string;
  accountType: "User" | "Organization";
  repositories: string[];
}

/** Installations the user's own GitHub token can see and that aren't linked to any org yet. */
export async function listPendingInstallations(ctx: Ctx): Promise<PendingInstallation[]> {
  await simulate();
  const { listUserInstallations } = await import("@/lib/github");
  const visible = await listUserInstallations(ctx.userId);
  if (!visible.length) return [];
  const linked = new Set(
    (await db.select({ id: s.installations.externalInstallationId }).from(s.installations)
      .where(inArray(s.installations.externalInstallationId, visible.map((v) => v.externalInstallationId)))).map((r) => r.id),
  );
  return visible.filter((v) => !linked.has(v.externalInstallationId)).map(({ externalInstallationId, accountLogin, accountType, repositories }) => ({
    externalInstallationId, accountLogin, accountType, repositories: repositories.map((r) => r.fullName),
  }));
}

/** Links an installation the user can see (checked against their GitHub token) and starts indexing its repos. */
export async function linkInstallation(ctx: Ctx, externalInstallationId: number) {
  await simulate();
  assertAdmin(ctx);
  const { listUserInstallations } = await import("@/lib/github");
  const inst = (await listUserInstallations(ctx.userId)).find((i) => i.externalInstallationId === externalInstallationId);
  if (!inst) throw new NotFoundError("That installation");
  const repoIds = await db.transaction(async (tx) => {
    const existing = await tx.select({ orgId: s.installations.orgId }).from(s.installations)
      .where(and(eq(s.installations.provider, "github"), eq(s.installations.externalInstallationId, externalInstallationId)));
    if (existing.length) throw new Error(`${inst.accountLogin} is already linked to an organization.`);
    const [row] = await tx.insert(s.installations).values({
      orgId: ctx.orgId, provider: "github", externalInstallationId, accountLogin: inst.accountLogin, accountType: inst.accountType,
      repositorySelection: inst.repositorySelection,
    }).returning({ id: s.installations.id });
    if (!inst.repositories.length) return [];
    const repos = await tx.insert(s.repositories).values(inst.repositories.map((r) => ({
      orgId: ctx.orgId, installationId: row.id, providerRepoId: r.providerRepoId, fullName: r.fullName,
      defaultBranch: r.defaultBranch, private: r.private,
    }))).onConflictDoNothing().returning({ id: s.repositories.id });
    return repos.map((r) => r.id);
  });
  for (const repoId of repoIds) await enqueue("index-repo", { repoId, full: true }, { singletonKey: repoId });
  return { installationId: externalInstallationId, repoCount: repoIds.length };
}

/* ───────────── repositories (S05, S06) ───────────── */

export interface RepoRow extends Repository {
  installationLogin: string;
  reviewCount: number;
  lastReviewAt: string | null;
}

const reviewStats = db
  .select({
    repoId: s.pullRequests.repoId,
    n: count(s.reviews.id).as("n"),
    last: dsql<string | null>`max(${s.reviews.completedAt})`.as("last"),
  })
  .from(s.reviews)
  .innerJoin(s.pullRequests, eq(s.pullRequests.id, s.reviews.pullRequestId))
  .where(eq(s.reviews.status, "completed"))
  .groupBy(s.pullRequests.repoId)
  .as("stats");

export async function listRepos(ctx: Ctx, f: { q?: string; status?: string } = {}): Promise<RepoRow[]> {
  await simulate();
  const conds = [eq(s.repositories.orgId, ctx.orgId), isNull(s.repositories.removedAt)];
  const q = f.q?.trim();
  if (q) conds.push(dsql`${s.repositories.fullName} ilike ${"%" + q.replace(/[%_\\]/g, (c) => "\\" + c) + "%"}`);
  if (f.status && f.status !== "all") {
    if (f.status === "off") conds.push(eq(s.repositories.reviewEnabled, false));
    else if (f.status === "indexing") conds.push(inArray(s.repositories.indexStatus, ["submitted", "cloning", "processing"]));
    else if (["completed", "failed"].includes(f.status)) conds.push(eq(s.repositories.indexStatus, f.status as "completed" | "failed"));
  }
  const rows = await db
    .select({ r: s.repositories, login: s.installations.accountLogin, n: reviewStats.n, last: reviewStats.last })
    .from(s.repositories)
    .innerJoin(s.installations, eq(s.installations.id, s.repositories.installationId))
    .leftJoin(reviewStats, eq(reviewStats.repoId, s.repositories.id))
    .where(and(...conds))
    .orderBy(asc(s.repositories.fullName));
  return rows.map(({ r, login, n, last }) => ({
    id: r.id, orgId: r.orgId, installationId: r.installationId, fullName: r.fullName, defaultBranch: r.defaultBranch, private: r.private,
    reviewEnabled: r.reviewEnabled, indexStatus: r.indexStatus, indexError: r.indexError, indexedSha: r.indexedSha, filesIndexed: r.filesIndexed,
    lastIndexedAt: iso(r.lastIndexedAt), createdAt: iso(r.createdAt)!, installationLogin: login, reviewCount: Number(n ?? 0), lastReviewAt: iso(last),
  }));
}

export async function getRepo(ctx: Ctx, id: string): Promise<RepoRow> {
  if (!isUuid(id)) throw new NotFoundError("That repository");
  const r = (await listRepos(ctx)).find((x) => x.id === id);
  if (!r) throw new NotFoundError("That repository");
  return r;
}

async function ownRepo(ctx: Ctx, id: string) {
  if (!isUuid(id)) throw new NotFoundError("That repository");
  const [r] = await db.select({ id: s.repositories.id }).from(s.repositories).where(and(eq(s.repositories.id, id), eq(s.repositories.orgId, ctx.orgId)));
  if (!r) throw new NotFoundError("That repository");
}

export async function setRepoReviewEnabled(ctx: Ctx, id: string, enabled: boolean) {
  await simulate();
  assertAdmin(ctx);
  await ownRepo(ctx, id);
  await db.update(s.repositories).set({ reviewEnabled: enabled, updatedAt: now() }).where(and(eq(s.repositories.id, id), eq(s.repositories.orgId, ctx.orgId)));
}

export async function reindexRepo(ctx: Ctx, id: string) {
  await simulate();
  assertAdmin(ctx);
  await ownRepo(ctx, id);
  await db.update(s.repositories).set({ indexStatus: "submitted", indexError: null, updatedAt: now() }).where(eq(s.repositories.id, id));
  await enqueue("index-repo", { repoId: id, full: true }, { singletonKey: id });
}

/* ───────────── review config (S07, S06 settings) ───────────── */

export interface ConfigView {
  stored: ReviewConfig | null;
  effective: ReviewConfig;
  updatedAt: string | null;
  updatedBy: User | null;
}

function configRow(orgId: string, repoId: string | null, c: ReviewConfig, userId: string | null) {
  return {
    orgId, repoId, strictness: c.strictness, commentTypes: c.commentTypes, reviewDrafts: c.reviewDrafts, includeLabels: c.includeLabels,
    disabledLabels: c.disabledLabels, includeAuthors: c.includeAuthors, excludeAuthors: c.excludeAuthors, includeBranches: c.includeBranches,
    excludeBranches: c.excludeBranches, ignorePatterns: c.ignorePatterns, summaryOptions: c.summary, updatedBy: userId,
  };
}

export function rowToConfig(r: typeof s.reviewConfigs.$inferSelect | undefined | null): ReviewConfig | null {
  if (!r) return null;
  return {
    strictness: r.strictness, commentTypes: r.commentTypes, reviewDrafts: r.reviewDrafts, includeLabels: r.includeLabels,
    disabledLabels: r.disabledLabels, includeAuthors: r.includeAuthors, excludeAuthors: r.excludeAuthors, includeBranches: r.includeBranches,
    excludeBranches: r.excludeBranches, ignorePatterns: r.ignorePatterns, summary: { ...DEFAULT_CONFIG.summary, ...r.summaryOptions },
  };
}

export async function getReviewConfig(ctx: Ctx, repoId: string | null): Promise<ConfigView> {
  await simulate();
  if (repoId) await ownRepo(ctx, repoId);
  const rows = await db.select().from(s.reviewConfigs)
    .where(and(eq(s.reviewConfigs.orgId, ctx.orgId), repoId ? or(isNull(s.reviewConfigs.repoId), eq(s.reviewConfigs.repoId, repoId)) : isNull(s.reviewConfigs.repoId)));
  const org = rows.find((r) => r.repoId === null);
  const row = repoId ? rows.find((r) => r.repoId === repoId) : org;
  const [by] = row?.updatedBy ? await db.select().from(s.users).where(eq(s.users.id, row.updatedBy)) : [];
  return {
    stored: rowToConfig(row),
    effective: mergeConfig(DEFAULT_CONFIG, rowToConfig(org), repoId ? rowToConfig(row) : null),
    updatedAt: iso(row?.updatedAt),
    updatedBy: by ? toUser(by) : null,
  };
}

export async function saveReviewConfig(ctx: Ctx, repoId: string | null, config: ReviewConfig) {
  await simulate();
  assertAdmin(ctx);
  if (repoId) await ownRepo(ctx, repoId);
  const values = { ...configRow(ctx.orgId, repoId, config, ctx.userId), updatedAt: now() };
  const where = and(eq(s.reviewConfigs.orgId, ctx.orgId), repoId ? eq(s.reviewConfigs.repoId, repoId) : isNull(s.reviewConfigs.repoId));
  const updated = await db.update(s.reviewConfigs).set(values).where(where).returning({ id: s.reviewConfigs.id });
  if (!updated.length) await db.insert(s.reviewConfigs).values(values);
}

export async function clearRepoConfig(ctx: Ctx, repoId: string) {
  await simulate();
  assertAdmin(ctx);
  await ownRepo(ctx, repoId);
  await db.delete(s.reviewConfigs).where(and(eq(s.reviewConfigs.orgId, ctx.orgId), eq(s.reviewConfigs.repoId, repoId)));
}

/* ───────────── rules (S08) ───────────── */

export interface RuleInput {
  text: string;
  kind: Rule["kind"];
  repoIds: string[];
  pathGlobs: string[];
}

const toRule = (r: typeof s.rules.$inferSelect): Rule => ({
  id: r.id, orgId: r.orgId, text: r.text, kind: r.kind, source: r.source, status: r.status, repoIds: r.repoIds, pathGlobs: r.pathGlobs,
  evidence: r.evidence, createdBy: r.createdBy, createdAt: iso(r.createdAt)!, updatedAt: iso(r.updatedAt)!,
});

export async function listRules(ctx: Ctx, status?: RuleStatus): Promise<Rule[]> {
  await simulate();
  const rows = await db.select().from(s.rules)
    .where(and(eq(s.rules.orgId, ctx.orgId), status ? eq(s.rules.status, status) : undefined))
    .orderBy(desc(s.rules.updatedAt));
  return rows.map(toRule);
}

async function checkRuleRepos(ctx: Ctx, repoIds: string[]) {
  if (!repoIds.length) return;
  if (!repoIds.every(isUuid)) throw new NotFoundError("A selected repository");
  const found = await db.select({ id: s.repositories.id }).from(s.repositories)
    .where(and(eq(s.repositories.orgId, ctx.orgId), inArray(s.repositories.id, repoIds)));
  if (found.length !== new Set(repoIds).size) throw new NotFoundError("A selected repository");
}

export async function createRule(ctx: Ctx, input: RuleInput): Promise<Rule> {
  await simulate();
  assertAdmin(ctx);
  await checkRuleRepos(ctx, input.repoIds);
  const [r] = await db.insert(s.rules).values({ orgId: ctx.orgId, ...input, source: "manual", status: "active", evidence: [], createdBy: ctx.userId }).returning();
  return toRule(r);
}

async function ownRule(ctx: Ctx, id: string) {
  if (!isUuid(id)) throw new NotFoundError("That rule");
  const [r] = await db.select({ id: s.rules.id }).from(s.rules).where(and(eq(s.rules.id, id), eq(s.rules.orgId, ctx.orgId)));
  if (!r) throw new NotFoundError("That rule");
}

export async function updateRule(ctx: Ctx, id: string, input: RuleInput) {
  await simulate();
  assertAdmin(ctx);
  await ownRule(ctx, id);
  await checkRuleRepos(ctx, input.repoIds);
  await db.update(s.rules).set({ ...input, updatedAt: now() }).where(and(eq(s.rules.id, id), eq(s.rules.orgId, ctx.orgId)));
}

export async function setRuleStatus(ctx: Ctx, id: string, status: RuleStatus) {
  await simulate();
  assertAdmin(ctx);
  await ownRule(ctx, id);
  await db.update(s.rules).set({ status, updatedAt: now() }).where(and(eq(s.rules.id, id), eq(s.rules.orgId, ctx.orgId)));
}

export async function deleteRule(ctx: Ctx, id: string) {
  await simulate();
  assertAdmin(ctx);
  await ownRule(ctx, id);
  await db.delete(s.rules).where(and(eq(s.rules.id, id), eq(s.rules.orgId, ctx.orgId)));
}

/* ───────────── reviews (S11, review detail) ───────────── */

export interface ReviewRow extends Review {
  pr: PullRequest;
  repo: Pick<Repository, "id" | "fullName">;
  counts: Record<Severity, number>;
}

export const toReview = (r: typeof s.reviews.$inferSelect): Review => ({
  id: r.id, orgId: r.orgId, pullRequestId: r.pullRequestId, headSha: r.headSha, trigger: r.trigger, status: r.status, skipReason: r.skipReason,
  error: r.error, confidenceScore: r.confidenceScore ?? null, verdict: r.verdict, summaryMd: r.summaryMd, diagramMermaid: r.diagramMermaid,
  filesReviewed: r.filesReviewed, checked: r.checked, creditsUsed: r.creditsUsed, queuedAt: iso(r.queuedAt)!, completedAt: iso(r.completedAt),
});

export const toPr = (p: typeof s.pullRequests.$inferSelect): PullRequest => ({
  id: p.id, orgId: p.orgId, repoId: p.repoId, number: p.number, title: p.title, authorLogin: p.authorLogin, baseBranch: p.baseBranch,
  headSha: p.headSha, state: p.state, isDraft: p.isDraft, labels: p.labels, url: p.url, openedAt: iso(p.openedAt)!, mergedAt: iso(p.mergedAt),
});

const severityCounts = db
  .select({
    reviewId: s.reviews.id,
    p0: dsql<number>`count(*) filter (where ${s.findings.severity} = 'P0')`.as("p0"),
    p1: dsql<number>`count(*) filter (where ${s.findings.severity} = 'P1')`.as("p1"),
    p2: dsql<number>`count(*) filter (where ${s.findings.severity} = 'P2')`.as("p2"),
  })
  .from(s.reviews)
  .innerJoin(s.findings, or(eq(s.findings.firstReviewId, s.reviews.id), eq(s.findings.lastSeenReviewId, s.reviews.id)))
  .groupBy(s.reviews.id)
  .as("sev");

export async function listReviews(
  ctx: Ctx,
  f: { repoId?: string; status?: ReviewStatus | "all"; q?: string; cursor?: string; limit?: number } = {},
): Promise<{ items: ReviewRow[]; nextCursor: string | null; total: number }> {
  await simulate();
  const limit = Math.min(f.limit ?? 20, 200);
  const conds = [eq(s.reviews.orgId, ctx.orgId)];
  if (f.repoId) {
    if (!isUuid(f.repoId)) return { items: [], nextCursor: null, total: 0 };
    conds.push(eq(s.pullRequests.repoId, f.repoId));
  }
  if (f.status && f.status !== "all") conds.push(eq(s.reviews.status, f.status));
  const q = f.q?.trim();
  if (q) {
    const like = "%" + q.replace(/[%_\\]/g, (c) => "\\" + c) + "%";
    const num = /^#?(\d+)$/.exec(q)?.[1];
    conds.push(or(dsql`${s.pullRequests.title} ilike ${like}`, dsql`${s.pullRequests.authorLogin} ilike ${like}`, num ? eq(s.pullRequests.number, Number(num)) : undefined)!);
  }
  const base = and(...conds);
  const [{ total }] = await db.select({ total: count() }).from(s.reviews).innerJoin(s.pullRequests, eq(s.pullRequests.id, s.reviews.pullRequestId)).where(base);
  let page = base;
  if (f.cursor && isUuid(f.cursor)) {
    const [c] = await db.select({ q: s.reviews.queuedAt, id: s.reviews.id }).from(s.reviews).where(and(eq(s.reviews.id, f.cursor), eq(s.reviews.orgId, ctx.orgId)));
    if (c) page = and(base, dsql`(${s.reviews.queuedAt}, ${s.reviews.id}) < (${c.q}::timestamptz, ${c.id}::uuid)`);
  }
  const rows = await db
    .select({ r: s.reviews, pr: s.pullRequests, repoName: s.repositories.fullName, p0: severityCounts.p0, p1: severityCounts.p1, p2: severityCounts.p2 })
    .from(s.reviews)
    .innerJoin(s.pullRequests, eq(s.pullRequests.id, s.reviews.pullRequestId))
    .innerJoin(s.repositories, eq(s.repositories.id, s.pullRequests.repoId))
    .leftJoin(severityCounts, eq(severityCounts.reviewId, s.reviews.id))
    .where(page)
    .orderBy(desc(s.reviews.queuedAt), desc(s.reviews.id))
    .limit(limit + 1);
  const items = rows.slice(0, limit).map(({ r, pr, repoName, p0, p1, p2 }) => ({
    ...toReview(r), pr: toPr(pr), repo: { id: pr.repoId, fullName: repoName },
    counts: { P0: Number(p0 ?? 0), P1: Number(p1 ?? 0), P2: Number(p2 ?? 0) },
  }));
  return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null, total: Number(total) };
}

export const toFinding = (f: typeof s.findings.$inferSelect, up = 0, down = 0): Finding => ({
  id: f.id, orgId: f.orgId, pullRequestId: f.pullRequestId, firstReviewId: f.firstReviewId, lastSeenReviewId: f.lastSeenReviewId,
  fingerprint: f.fingerprint, filePath: f.filePath, lineStart: f.lineStart, lineEnd: f.lineEnd, inDiff: f.inDiff, severity: f.severity,
  type: f.type, title: f.title, bodyMd: f.bodyMd, suggestion: f.suggestion, ruleId: f.ruleId, status: f.status, thumbsUp: up, thumbsDown: down,
  createdAt: iso(f.createdAt)!,
});

const reactionCounts = db
  .select({
    findingId: s.feedback.findingId,
    up: dsql<number>`count(*) filter (where ${s.feedback.kind} = 'thumbs_up')`.as("up"),
    down: dsql<number>`count(*) filter (where ${s.feedback.kind} = 'thumbs_down')`.as("down"),
  })
  .from(s.feedback)
  .groupBy(s.feedback.findingId)
  .as("rx");

async function findingsWhere(where: ReturnType<typeof and>) {
  const rows = await db.select({ f: s.findings, up: reactionCounts.up, down: reactionCounts.down }).from(s.findings)
    .leftJoin(reactionCounts, eq(reactionCounts.findingId, s.findings.id)).where(where);
  return rows.map(({ f, up, down }) => toFinding(f, Number(up ?? 0), Number(down ?? 0)));
}

/** The newest completed review of a pull request in this org (for "Fix all" links), or null. */
export async function latestCompletedReviewId(ctx: Ctx, pullRequestId: string): Promise<string | null> {
  if (!isUuid(pullRequestId)) return null;
  const [r] = await db.select({ id: s.reviews.id }).from(s.reviews)
    .where(and(eq(s.reviews.orgId, ctx.orgId), eq(s.reviews.pullRequestId, pullRequestId), eq(s.reviews.status, "completed")))
    .orderBy(desc(s.reviews.queuedAt), desc(s.reviews.id)).limit(1);
  return r?.id ?? null;
}

export async function getReview(ctx: Ctx, id: string): Promise<ReviewRow & { findings: Finding[]; rules: Rule[] }> {
  await simulate();
  if (!isUuid(id)) throw new NotFoundError("That review");
  const [row] = await db
    .select({ r: s.reviews, pr: s.pullRequests, repoName: s.repositories.fullName, p0: severityCounts.p0, p1: severityCounts.p1, p2: severityCounts.p2 })
    .from(s.reviews)
    .innerJoin(s.pullRequests, eq(s.pullRequests.id, s.reviews.pullRequestId))
    .innerJoin(s.repositories, eq(s.repositories.id, s.pullRequests.repoId))
    .leftJoin(severityCounts, eq(severityCounts.reviewId, s.reviews.id))
    .where(and(eq(s.reviews.id, id), eq(s.reviews.orgId, ctx.orgId)));
  if (!row) throw new NotFoundError("That review");
  const findings = await findingsWhere(and(eq(s.findings.pullRequestId, row.r.pullRequestId), eq(s.findings.orgId, ctx.orgId)));
  const ruleIds = [...new Set(findings.map((x) => x.ruleId).filter((x): x is string => !!x))];
  const rules = ruleIds.length ? (await db.select().from(s.rules).where(and(eq(s.rules.orgId, ctx.orgId), inArray(s.rules.id, ruleIds)))).map(toRule) : [];
  return {
    ...toReview(row.r), pr: toPr(row.pr), repo: { id: row.pr.repoId, fullName: row.repoName },
    counts: { P0: Number(row.p0 ?? 0), P1: Number(row.p1 ?? 0), P2: Number(row.p2 ?? 0) },
    findings, rules,
  };
}

export async function getFinding(ctx: Ctx, id: string): Promise<Finding> {
  await simulate();
  if (!isUuid(id)) throw new NotFoundError("That finding");
  const [f] = await findingsWhere(and(eq(s.findings.id, id), eq(s.findings.orgId, ctx.orgId)));
  if (!f) throw new NotFoundError("That finding");
  return f;
}

/** Queue a fresh review of the PR's current head. The partial unique index rejects a second live review. */
export async function rerunReview(ctx: Ctx, id: string): Promise<Review> {
  await simulate();
  if (!isUuid(id)) throw new NotFoundError("That review");
  const [r] = await db.select().from(s.reviews).where(and(eq(s.reviews.id, id), eq(s.reviews.orgId, ctx.orgId)));
  if (!r) throw new NotFoundError("That review");
  const [pr] = await db.select().from(s.pullRequests).where(eq(s.pullRequests.id, r.pullRequestId));
  await failStaleReviews(db, r.pullRequestId);
  try {
    const [created] = await db.insert(s.reviews).values({
      orgId: ctx.orgId, pullRequestId: r.pullRequestId, headSha: pr.headSha, trigger: "manual", triggeredBy: ctx.userId, status: "queued",
      filesReviewed: [], checked: [],
    }).returning();
    await enqueue("review-pr", { reviewId: created.id });
    return toReview(created);
  } catch (e) {
    if (isUniqueViolation(e)) throw new Error("A review is already running for this pull request.");
    throw e;
  }
}

/* ───────────── analytics (S10) ───────────── */

export interface Analytics {
  range: { from: string; to: string; days: number };
  tiles: {
    prsReviewed: number; prsReviewedPrev: number;
    addressedRate: number | null; addressedRatePrev: number | null;
    criticalCaught: number; criticalCaughtPrev: number;
    medianMergeHours: number | null; medianMergeHoursPrev: number | null;
    thumbsUp: number; thumbsDown: number;
  };
  daily: { date: string; reviews: number; P0: number; P1: number; P2: number }[];
  byRepo: { repo: string; reviews: number; findings: number; closed: number; addressed: number }[];
}

export async function getAnalytics(ctx: Ctx, f: { days: number; repoId?: string; author?: string }): Promise<Analytics> {
  await simulate();
  const days = [7, 30, 90].includes(f.days) ? f.days : 30;
  // Whole UTC days, so the totals and the per-day chart count the same reviews.
  const end = Date.now();
  const startToday = Date.UTC(new Date(end).getUTCFullYear(), new Date(end).getUTCMonth(), new Date(end).getUTCDate());
  const span = days * 864e5;
  const curStart = startToday - (days - 1) * 864e5;
  const from = new Date(curStart - span).toISOString();
  const conds = [eq(s.reviews.orgId, ctx.orgId), eq(s.reviews.status, "completed"), gte(s.reviews.queuedAt, from)];
  if (f.repoId && isUuid(f.repoId)) conds.push(eq(s.pullRequests.repoId, f.repoId));
  if (f.author) conds.push(eq(s.pullRequests.authorLogin, f.author));
  // Two periods of completed reviews with their PRs, aggregated in memory: bounded by 2×period per org.
  const reviews = await db.select({ r: s.reviews, pr: s.pullRequests, repo: s.repositories.fullName }).from(s.reviews)
    .innerJoin(s.pullRequests, eq(s.pullRequests.id, s.reviews.pullRequestId))
    .innerJoin(s.repositories, eq(s.repositories.id, s.pullRequests.repoId))
    .where(and(...conds));
  const ids = reviews.map((x) => x.r.id);
  const fs = ids.length ? await findingsWhere(and(eq(s.findings.orgId, ctx.orgId), inArray(s.findings.firstReviewId, ids))) : [];

  const window = (a: number, b: number) => {
    const rs = reviews.filter((x) => { const t = Date.parse(iso(x.r.queuedAt)!); return t >= a && t < b; });
    const set = new Set(rs.map((x) => x.r.id));
    const ff = fs.filter((x) => set.has(x.firstReviewId));
    const closed = ff.filter((x) => x.status !== "open");
    const addressed = closed.filter((x) => x.status === "addressed" || x.status === "resolved").length;
    const merge = [...new Map(rs.map((x) => [x.pr.id, x.pr])).values()].filter((p) => p.mergedAt)
      .map((p) => (Date.parse(iso(p.mergedAt)!) - Date.parse(iso(p.openedAt)!)) / 36e5).sort((x, y) => x - y);
    return {
      rs, ff,
      prs: new Set(rs.map((x) => x.pr.id)).size,
      addressedRate: closed.length ? addressed / closed.length : null,
      critical: ff.filter((x) => x.severity === "P0" && x.status !== "dismissed").length,
      median: merge.length ? merge[Math.floor(merge.length / 2)] : null,
    };
  };
  const cur = window(curStart, end + 1);
  const prev = window(curStart - span, curStart);

  const daily: Analytics["daily"] = [];
  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(startToday - d * 864e5).toISOString().slice(0, 10);
    const rs = cur.rs.filter((x) => iso(x.r.queuedAt)!.slice(0, 10) === day);
    const set = new Set(rs.map((x) => x.r.id));
    const ff = cur.ff.filter((x) => set.has(x.firstReviewId));
    daily.push({ date: day, reviews: rs.length, P0: ff.filter((x) => x.severity === "P0").length, P1: ff.filter((x) => x.severity === "P1").length, P2: ff.filter((x) => x.severity === "P2").length });
  }
  const byRepo = new Map<string, Analytics["byRepo"][number]>();
  for (const x of cur.rs) {
    const row = byRepo.get(x.repo) ?? { repo: x.repo, reviews: 0, findings: 0, closed: 0, addressed: 0 };
    const ff = cur.ff.filter((y) => y.firstReviewId === x.r.id);
    row.reviews += 1;
    row.findings += ff.length;
    row.closed += ff.filter((y) => y.status !== "open").length;
    row.addressed += ff.filter((y) => y.status === "addressed" || y.status === "resolved").length;
    byRepo.set(x.repo, row);
  }
  return {
    range: { from: new Date(curStart).toISOString(), to: new Date(end).toISOString(), days },
    tiles: {
      prsReviewed: cur.prs, prsReviewedPrev: prev.prs, addressedRate: cur.addressedRate, addressedRatePrev: prev.addressedRate,
      criticalCaught: cur.critical, criticalCaughtPrev: prev.critical, medianMergeHours: cur.median, medianMergeHoursPrev: prev.median,
      thumbsUp: cur.ff.reduce((n, x) => n + x.thumbsUp, 0), thumbsDown: cur.ff.reduce((n, x) => n + x.thumbsDown, 0),
    },
    daily,
    byRepo: [...byRepo.values()].sort((a, b) => b.reviews - a.reviews),
  };
}

export async function listAuthors(ctx: Ctx): Promise<string[]> {
  await simulate();
  const rows = await db.selectDistinct({ a: s.pullRequests.authorLogin }).from(s.pullRequests).where(eq(s.pullRequests.orgId, ctx.orgId)).orderBy(asc(s.pullRequests.authorLogin));
  return rows.map((r) => r.a);
}

/* ───────────── members (S12) ───────────── */

export interface MemberRow {
  user: User;
  role: Role;
  joinedAt: string;
  reviewsThisMonth: number;
}

const toInvite = (i: typeof s.invites.$inferSelect): Invite => ({
  id: i.id, orgId: i.orgId, email: i.email, role: i.role, invitedBy: i.invitedBy ?? "", expiresAt: iso(i.expiresAt)!, createdAt: iso(i.createdAt)!,
});

export async function listMembers(ctx: Ctx): Promise<{ members: MemberRow[]; invites: Invite[] }> {
  await simulate();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const rows = await db
    .select({
      u: s.users, role: s.memberships.role, joined: s.memberships.createdAt,
      n: dsql<number>`(select count(*) from ${s.reviews} r join ${s.pullRequests} p on p.id = r.pull_request_id
                      where r.org_id = ${ctx.orgId} and r.status = 'completed' and p.author_login = ${s.users.githubLogin} and r.queued_at >= ${monthStart})`,
    })
    .from(s.memberships)
    .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
    .where(eq(s.memberships.orgId, ctx.orgId))
    .orderBy(asc(s.users.name));
  const invites = await db.select().from(s.invites)
    .where(and(eq(s.invites.orgId, ctx.orgId), isNull(s.invites.acceptedAt), gte(s.invites.expiresAt, now())))
    .orderBy(desc(s.invites.createdAt));
  return {
    members: rows.map((r) => ({ user: toUser(r.u), role: r.role, joinedAt: iso(r.joined)!, reviewsThisMonth: Number(r.n) })),
    invites: invites.map(toInvite),
  };
}

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function inviteMember(ctx: Ctx, email: string, role: Role): Promise<Invite> {
  await simulate();
  assertAdmin(ctx);
  const { rateLimit } = await import("@/lib/rate-limit");
  await rateLimit(`invite:${ctx.orgId}`, 30, 3600);
  const e = email.trim().toLowerCase();
  await assertRoomForMember(ctx.orgId);
  const [member] = await db.select({ id: s.users.id }).from(s.memberships).innerJoin(s.users, eq(s.users.id, s.memberships.userId))
    .where(and(eq(s.memberships.orgId, ctx.orgId), eq(s.users.email, e)));
  if (member) throw new Error(`${e} is already a member.`);
  // Expired, unaccepted invites don't block a new one.
  await db.delete(s.invites).where(and(eq(s.invites.orgId, ctx.orgId), eq(s.invites.email, e), isNull(s.invites.acceptedAt), lt(s.invites.expiresAt, now())));
  const token = randomBytes(32).toString("base64url");
  try {
    const [inv] = await db.insert(s.invites).values({
      orgId: ctx.orgId, email: e, role, tokenHash: hashToken(token), invitedBy: ctx.userId, expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
    }).returning();
    const [org] = await db.select({ name: s.organizations.name }).from(s.organizations).where(eq(s.organizations.id, ctx.orgId));
    const [inviter] = await db.select({ name: s.users.name }).from(s.users).where(eq(s.users.id, ctx.userId));
    await enqueue("send-email", {
      to: e, template: "invite",
      vars: { org: org.name, inviter: inviter?.name ?? "A teammate", role, url: `${appUrl()}/invite/${token}` },
    });
    return toInvite(inv);
  } catch (err) {
    if (isUniqueViolation(err)) throw new Error(`${e} already has an open invite.`);
    throw err;
  }
}

export async function revokeInvite(ctx: Ctx, id: string) {
  await simulate();
  assertAdmin(ctx);
  if (!isUuid(id)) return;
  await db.delete(s.invites).where(and(eq(s.invites.id, id), eq(s.invites.orgId, ctx.orgId)));
}

/** For /invite/[token]: what the invite is for, without accepting it. */
export async function peekInvite(token: string) {
  const [row] = await db.select({ i: s.invites, org: s.organizations.name }).from(s.invites)
    .innerJoin(s.organizations, eq(s.organizations.id, s.invites.orgId)).where(eq(s.invites.tokenHash, hashToken(token)));
  if (!row) return null;
  return { orgName: row.org, email: row.i.email, role: row.i.role, expired: Date.parse(iso(row.i.expiresAt)!) < Date.now(), accepted: !!row.i.acceptedAt };
}

const FREE_FULL = "The Free plan is for one person. Choose the Team plan to invite teammates.";

/** The Free plan has room for one member; every other plan takes as many as you pay seats for. */
async function assertRoomForMember(orgId: string, tx: Pick<typeof db, "select"> = db, joining = false) {
  const { onFreePlan } = await import("@/lib/billing");
  const [org] = await tx.select({ name: s.organizations.name, plan: s.organizations.plan, billingStatus: s.organizations.billingStatus }).from(s.organizations).where(eq(s.organizations.id, orgId));
  if (!org || !onFreePlan(org)) return;
  // The person accepting can't change the plan; tell them who can.
  throw new Error(joining ? `${org.name} is on the Free plan, which is for one person. Ask an admin of ${org.name} to choose the Team plan, then open this link again.` : FREE_FULL);
}

/** Accept an invite as the signed-in user. The email must match: invite links can be forwarded. */
export async function acceptInvite(userId: string, token: string): Promise<{ orgId: string }> {
  const r = await db.transaction(async (tx) => {
    const [inv] = await tx.select().from(s.invites).where(eq(s.invites.tokenHash, hashToken(token))).for("update");
    if (!inv || inv.acceptedAt) throw new NotFoundError("That invite");
    if (Date.parse(iso(inv.expiresAt)!) < Date.now()) throw new Error("This invite has expired. Ask for a new one.");
    const [u] = await tx.select().from(s.users).where(eq(s.users.id, userId));
    if (!u?.email || u.email.toLowerCase() !== inv.email.toLowerCase())
      throw new Error(`This invite is for ${inv.email}. Sign in with that email to accept it.`);
    await assertRoomForMember(inv.orgId, tx, true);
    await tx.insert(s.memberships).values({ orgId: inv.orgId, userId, role: inv.role }).onConflictDoNothing();
    await tx.update(s.invites).set({ acceptedAt: now() }).where(eq(s.invites.id, inv.id));
    return { orgId: inv.orgId };
  });
  await syncSeats(r.orgId);
  return r;
}

async function adminCount(orgId: string) {
  const [{ n }] = await db.select({ n: count() }).from(s.memberships).where(and(eq(s.memberships.orgId, orgId), eq(s.memberships.role, "admin")));
  return Number(n);
}

export async function changeRole(ctx: Ctx, userId: string, role: Role) {
  await simulate();
  assertAdmin(ctx);
  if (!isUuid(userId)) throw new NotFoundError("That member");
  const [m] = await db.select().from(s.memberships).where(and(eq(s.memberships.orgId, ctx.orgId), eq(s.memberships.userId, userId)));
  if (!m) throw new NotFoundError("That member");
  if (m.role === "admin" && role === "member" && (await adminCount(ctx.orgId)) === 1) throw new Error("An organization needs at least one admin.");
  await db.update(s.memberships).set({ role, updatedAt: now() }).where(and(eq(s.memberships.orgId, ctx.orgId), eq(s.memberships.userId, userId)));
}

export async function removeMember(ctx: Ctx, userId: string) {
  await simulate();
  assertAdmin(ctx);
  if (!isUuid(userId)) throw new NotFoundError("That member");
  const [m] = await db.select().from(s.memberships).where(and(eq(s.memberships.orgId, ctx.orgId), eq(s.memberships.userId, userId)));
  if (!m) throw new NotFoundError("That member");
  if (m.role === "admin" && (await adminCount(ctx.orgId)) === 1) throw new Error("You can't remove the last admin.");
  await db.delete(s.memberships).where(and(eq(s.memberships.orgId, ctx.orgId), eq(s.memberships.userId, userId)));
  await syncSeats(ctx.orgId);
}

async function syncSeats(orgId: string) {
  const { updateSeats } = await import("@/lib/billing");
  await updateSeats(orgId).catch((e) => console.error("[billing] seat sync failed", e));
}

/* ───────────── billing (S13) ───────────── */

export interface Billing {
  plan: "free" | "trial" | "pro" | "enterprise";
  billingStatus: "none" | "active" | "past_due" | "canceled";
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  seats: number;
  includedReviews: number;
  usedReviews: number;
  periodStart: string;
  periodEnd: string;
  pricePerSeatCents: number;
  overagePerReviewCents: number;
  invoices: { id: string; date: string; amountCents: number; status: "paid" | "open"; url?: string }[];
}

export async function getBilling(ctx: Ctx): Promise<Billing> {
  await simulate();
  const { FREE_PLAN, PRICING, listInvoices, onFreePlan } = await import("@/lib/billing");
  const [org] = await db.select().from(s.organizations).where(eq(s.organizations.id, ctx.orgId));
  const d = new Date();
  const periodStart = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  const [{ seats }] = await db.select({ seats: count() }).from(s.memberships).where(eq(s.memberships.orgId, ctx.orgId));
  const [{ used }] = await db.select({ used: sum(s.usageEvents.credits) }).from(s.usageEvents)
    .where(and(eq(s.usageEvents.orgId, ctx.orgId), eq(s.usageEvents.periodStart, periodStart)));
  return {
    plan: org.plan, billingStatus: org.billingStatus, trialEndsAt: iso(org.trialEndsAt),
    trialDaysLeft: org.plan === "trial" && org.trialEndsAt ? Math.max(0, Math.ceil((Date.parse(iso(org.trialEndsAt)!) - Date.now()) / 864e5)) : null,
    seats: Number(seats), usedReviews: Number(used ?? 0),
    includedReviews: onFreePlan(org) ? FREE_PLAN.reviewsPerMonth : Number(seats) * org.includedReviewsPerSeat,
    periodStart, periodEnd: next.toISOString().slice(0, 10),
    pricePerSeatCents: PRICING.seatCents, overagePerReviewCents: PRICING.overageCents,
    invoices: org.stripeCustomerId ? await listInvoices(org.stripeCustomerId) : [],
  };
}

/** Returns a Stripe Checkout URL. */
export async function startCheckout(ctx: Ctx): Promise<{ url: string }> {
  await simulate();
  assertAdmin(ctx);
  const { createCheckout } = await import("@/lib/billing");
  return createCheckout(ctx.orgId, ctx.userId);
}

/** Returns a Stripe Customer Portal URL (cards, invoices, one-click cancel). */
export async function openBillingPortal(ctx: Ctx): Promise<{ url: string }> {
  await simulate();
  assertAdmin(ctx);
  const { createPortal } = await import("@/lib/billing");
  return createPortal(ctx.orgId);
}

/** Move an org that isn't paying (trial over, or subscription canceled) to the Free plan. */
export async function continueOnFree(ctx: Ctx) {
  await simulate();
  assertAdmin(ctx);
  const { FREE_PLAN } = await import("@/lib/billing");
  const [{ n }] = await db.select({ n: count() }).from(s.memberships).where(eq(s.memberships.orgId, ctx.orgId));
  if (Number(n) > FREE_PLAN.members) throw new Error("The Free plan is for one person. Remove the other members first, or choose the Team plan.");
  const [org] = await db.select().from(s.organizations).where(eq(s.organizations.id, ctx.orgId));
  if ((org.plan === "pro" || org.plan === "enterprise") && org.billingStatus !== "canceled") {
    throw new Error("Cancel the Team plan in Manage billing first; it moves to Free when the subscription ends.");
  }
  await db.update(s.organizations).set({ plan: "free", billingStatus: "none", trialEndsAt: null }).where(eq(s.organizations.id, ctx.orgId));
}

/* ───────────── API keys (S15) ───────────── */

export async function listApiKeys(ctx: Ctx): Promise<(ApiKey & { createdByName: string })[]> {
  await simulate();
  const rows = await db.select({ k: s.apiKeys, name: s.users.name }).from(s.apiKeys).leftJoin(s.users, eq(s.users.id, s.apiKeys.createdBy))
    .where(eq(s.apiKeys.orgId, ctx.orgId)).orderBy(dsql`${s.apiKeys.revokedAt} is not null`, desc(s.apiKeys.createdAt));
  return rows.map(({ k, name }) => ({
    id: k.id, orgId: k.orgId, name: k.name, prefix: k.prefix, createdBy: k.createdBy ?? "", lastUsedAt: iso(k.lastUsedAt),
    revokedAt: iso(k.revokedAt), createdAt: iso(k.createdAt)!, createdByName: name ?? "A former member",
  }));
}

/** Returns the secret once; only its SHA-256 is stored. */
export async function createApiKey(ctx: Ctx, name: string): Promise<{ key: ApiKey; secret: string }> {
  await simulate();
  assertAdmin(ctx);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(24);
  const secret = "csk_" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  const [k] = await db.insert(s.apiKeys).values({ orgId: ctx.orgId, name, prefix: secret.slice(0, 8), keyHash: hashToken(secret), createdBy: ctx.userId }).returning();
  return {
    key: { id: k.id, orgId: k.orgId, name: k.name, prefix: k.prefix, createdBy: ctx.userId, lastUsedAt: null, revokedAt: null, createdAt: iso(k.createdAt)! },
    secret,
  };
}

export async function revokeApiKey(ctx: Ctx, id: string) {
  await simulate();
  assertAdmin(ctx);
  if (!isUuid(id)) throw new NotFoundError("That key");
  const r = await db.update(s.apiKeys).set({ revokedAt: now(), updatedAt: now() })
    .where(and(eq(s.apiKeys.id, id), eq(s.apiKeys.orgId, ctx.orgId), isNull(s.apiKeys.revokedAt))).returning({ id: s.apiKeys.id });
  if (!r.length) throw new NotFoundError("That key");
}

/** For /api/v1: resolve a bearer key to its org. Updates last-used at most once a minute. */
export async function authenticateApiKey(secret: string): Promise<{ orgId: string; keyId: string } | null> {
  if (!/^csk_[A-Za-z0-9]{24}$/.test(secret)) return null;
  const [k] = await db.select().from(s.apiKeys).where(and(eq(s.apiKeys.keyHash, hashToken(secret)), isNull(s.apiKeys.revokedAt)));
  if (!k) return null;
  await db.update(s.apiKeys).set({ lastUsedAt: now() })
    .where(and(eq(s.apiKeys.id, k.id), or(isNull(s.apiKeys.lastUsedAt), lt(s.apiKeys.lastUsedAt, new Date(Date.now() - 60_000).toISOString()))));
  return { orgId: k.orgId, keyId: k.id };
}

/* ───────────── integrations (S14) ───────────── */

export async function listIntegrations(ctx: Ctx): Promise<Integration[]> {
  await simulate();
  const rows = await db.select().from(s.integrations).where(eq(s.integrations.orgId, ctx.orgId));
  return rows.map((i) => ({ orgId: i.orgId, kind: i.kind, status: i.status, detail: i.detail, updatedAt: iso(i.updatedAt)! }));
}

/** Each integration needs its own OAuth app (see replica/backend.md). Until one is configured this says so. */
export async function connectIntegration(ctx: Ctx, kind: IntegrationKind): Promise<void> {
  await simulate();
  assertAdmin(ctx);
  const name = kind[0].toUpperCase() + kind.slice(1);
  const envKey = `${kind.toUpperCase()}_CLIENT_ID`;
  if (!process.env[envKey]) throw new Error(`Connecting ${name} isn't set up on this server yet (${envKey} is missing).`);
  throw new Error(`Connecting ${name} ships in a later release.`);
}

export async function disconnectIntegration(ctx: Ctx, kind: IntegrationKind) {
  await simulate();
  assertAdmin(ctx);
  await db.delete(s.integrations).where(and(eq(s.integrations.orgId, ctx.orgId), eq(s.integrations.kind, kind)));
}

/* ───────────── knowledge (S09) ───────────── */

export async function listKnowledge(ctx: Ctx, repoId: string): Promise<KnowledgeDoc[]> {
  await simulate();
  if (!isUuid(repoId)) return [];
  const rows = await db.select().from(s.knowledgeDocs).where(and(eq(s.knowledgeDocs.orgId, ctx.orgId), eq(s.knowledgeDocs.repoId, repoId)));
  const order = (p: string) => (p === "index" ? 0 : p === "reverts" ? 2 : 1);
  return rows
    .map((d) => ({ id: d.id, orgId: d.orgId, repoId: d.repoId, path: d.path, title: d.title, bodyMd: d.bodyMd, editedBy: d.editedBy, updatedAt: iso(d.updatedAt)! }))
    .sort((a, b) => order(a.path) - order(b.path) || a.title.localeCompare(b.title));
}

export async function updateKnowledgeDoc(ctx: Ctx, id: string, bodyMd: string) {
  await simulate();
  assertAdmin(ctx);
  if (!isUuid(id)) throw new NotFoundError("That page");
  const r = await db.update(s.knowledgeDocs).set({ bodyMd, editedBy: ctx.userId, editedAt: now(), updatedAt: now() })
    .where(and(eq(s.knowledgeDocs.id, id), eq(s.knowledgeDocs.orgId, ctx.orgId))).returning({ id: s.knowledgeDocs.id });
  if (!r.length) throw new NotFoundError("That page");
}

export async function getUserName(userId: string | null): Promise<string | null> {
  if (!userId || !isUuid(userId)) return null;
  const [u] = await db.select({ name: s.users.name }).from(s.users).where(eq(s.users.id, userId));
  return u?.name ?? null;
}

/* ───────────── helpers ───────────── */

export function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/* ───────────── account ───────────── */

export async function getAccount(userId: string) {
  const [u] = await db.select().from(s.users).where(eq(s.users.id, userId));
  if (!u) throw new NotFoundError("Your account");
  const accs = await db.select({ provider: s.accounts.provider }).from(s.accounts).where(eq(s.accounts.userId, userId));
  const [{ n }] = await db.select({ n: count() }).from(s.sessions).where(and(eq(s.sessions.userId, userId), gte(s.sessions.expires, new Date())));
  return { user: toUser(u), providers: [...new Set(accs.map((a) => a.provider))], activeSessions: Number(n) };
}
