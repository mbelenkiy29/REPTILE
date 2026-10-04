// The data layer. Screens and server actions import only from here.
// This is the fake implementation over an in-memory store. /replica-backend swaps the bodies for
// Drizzle queries against replica/schema.sql; the signatures and return shapes stay the same.
import { mergeConfig } from "@/lib/review/config";
import { DEFAULT_CONFIG } from "@/lib/review/defaults";
import { simulate } from "./session";
import { nextId, store } from "./store";
import {
  ForbiddenError, NotFoundError,
  type ApiKey, type Ctx, type Finding, type Installation, type Integration, type IntegrationKind, type Invite,
  type KnowledgeDoc, type PullRequest, type Repository, type Review, type ReviewConfig, type ReviewStatus, type Role,
  type Rule, type RuleStatus, type Severity, type User,
} from "./types";

export * from "./types";

const now = () => new Date().toISOString();

function assertAdmin(ctx: Ctx) {
  if (ctx.role !== "admin") throw new ForbiddenError();
}

/* ───────────── orgs & onboarding (F01) ───────────── */

export async function createOrganization(userId: string, name: string) {
  await simulate();
  const s = store();
  const id = nextId("o");
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || id;
  s.orgs.push({
    id, name, slug, plan: "trial", trialEndsAt: new Date(Date.now() + 14 * 864e5).toISOString(),
    includedReviewsPerSeat: 50, billingStatus: "none", createdAt: now(),
  });
  s.memberships.push({ orgId: id, userId, role: "admin", createdAt: now() });
  s.configs.push({ ...DEFAULT_CONFIG, orgId: id, repoId: null, updatedAt: now(), updatedBy: userId });
  return { id };
}

export async function listInstallations(ctx: Ctx): Promise<Installation[]> {
  await simulate();
  return store().installations.filter((i) => i.orgId === ctx.orgId);
}

/** Accounts the GitHub App was just installed on, waiting to be linked (S04). Fake: a fixed catalogue. */
export interface PendingInstallation {
  externalInstallationId: number;
  accountLogin: string;
  accountType: "User" | "Organization";
  repositories: string[];
}

const FAKE_INSTALLS: PendingInstallation[] = [
  { externalInstallationId: 61000001, accountLogin: "jordanlee", accountType: "User", repositories: ["jordanlee/dotfiles", "jordanlee/blog"] },
  { externalInstallationId: 61000002, accountLogin: "acme-labs", accountType: "Organization", repositories: ["acme-labs/prototype", "acme-labs/ml-pipeline", "acme-labs/design-tokens"] },
];

export async function listPendingInstallations(ctx: Ctx): Promise<PendingInstallation[]> {
  await simulate();
  const linked = new Set(store().installations.map((i) => i.externalInstallationId));
  void ctx;
  return FAKE_INSTALLS.filter((i) => !linked.has(i.externalInstallationId));
}

export async function linkInstallation(ctx: Ctx, externalInstallationId: number) {
  await simulate();
  assertAdmin(ctx);
  const s = store();
  const pending = FAKE_INSTALLS.find((i) => i.externalInstallationId === externalInstallationId);
  if (!pending) throw new NotFoundError("That installation");
  if (s.installations.some((i) => i.externalInstallationId === externalInstallationId))
    throw new Error(`${pending.accountLogin} is already linked to an organization.`);
  const id = nextId("ins");
  s.installations.push({
    id, orgId: ctx.orgId, provider: "github", externalInstallationId, accountLogin: pending.accountLogin,
    accountType: pending.accountType, suspendedAt: null, createdAt: now(),
  });
  for (const fullName of pending.repositories) {
    s.repos.push({
      id: nextId("r"), orgId: ctx.orgId, installationId: id, fullName, defaultBranch: "main", private: true,
      reviewEnabled: true, indexStatus: "submitted", indexError: null, indexedSha: null, filesIndexed: 0,
      lastIndexedAt: null, createdAt: now(),
    });
  }
  return { installationId: id, repoCount: pending.repositories.length };
}

/* ───────────── repositories (S05, S06) ───────────── */

export interface RepoRow extends Repository {
  installationLogin: string;
  reviewCount: number;
  lastReviewAt: string | null;
}

export async function listRepos(ctx: Ctx, f: { q?: string; status?: string } = {}): Promise<RepoRow[]> {
  await simulate();
  const s = store();
  const q = f.q?.trim().toLowerCase();
  return s.repos
    .filter((r) => r.orgId === ctx.orgId)
    .filter((r) => !q || r.fullName.toLowerCase().includes(q))
    .filter((r) => {
      if (!f.status || f.status === "all") return true;
      if (f.status === "off") return !r.reviewEnabled;
      if (f.status === "indexing") return ["submitted", "cloning", "processing"].includes(r.indexStatus);
      return r.indexStatus === f.status;
    })
    .map((r) => {
      const prIds = new Set(s.prs.filter((p) => p.repoId === r.id).map((p) => p.id));
      const reviews = s.reviews.filter((v) => prIds.has(v.pullRequestId) && v.status === "completed");
      return {
        ...r,
        installationLogin: s.installations.find((i) => i.id === r.installationId)?.accountLogin ?? "",
        reviewCount: reviews.length,
        lastReviewAt: reviews[0]?.completedAt ?? null,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export async function getRepo(ctx: Ctx, id: string): Promise<RepoRow> {
  const rows = await listRepos(ctx);
  const r = rows.find((x) => x.id === id);
  if (!r) throw new NotFoundError("That repository");
  return r;
}

export async function setRepoReviewEnabled(ctx: Ctx, id: string, enabled: boolean) {
  await simulate();
  assertAdmin(ctx);
  const r = store().repos.find((x) => x.id === id && x.orgId === ctx.orgId);
  if (!r) throw new NotFoundError("That repository");
  r.reviewEnabled = enabled;
}

export async function reindexRepo(ctx: Ctx, id: string) {
  await simulate();
  assertAdmin(ctx);
  const r = store().repos.find((x) => x.id === id && x.orgId === ctx.orgId);
  if (!r) throw new NotFoundError("That repository");
  r.indexStatus = "submitted";
  r.indexError = null;
}

/* ───────────── review config (S07, S06 settings) ───────────── */

export interface ConfigView {
  /** The org default, or the repo override (null when the repo has none). */
  stored: ReviewConfig | null;
  /** What actually applies: defaults < org < repo (repo files are read at review time). */
  effective: ReviewConfig;
  updatedAt: string | null;
  updatedBy: User | null;
}

export async function getReviewConfig(ctx: Ctx, repoId: string | null): Promise<ConfigView> {
  await simulate();
  const s = store();
  const org = s.configs.find((c) => c.orgId === ctx.orgId && c.repoId === null) ?? null;
  const row = repoId ? s.configs.find((c) => c.orgId === ctx.orgId && c.repoId === repoId) ?? null : org;
  const pick = (c: typeof org): ReviewConfig | null => {
    if (!c) return null;
    // Copy only the config fields; the rest of the row is bookkeeping.
    const {
      strictness, commentTypes, reviewDrafts, includeLabels, disabledLabels, includeAuthors, excludeAuthors,
      includeBranches, excludeBranches, ignorePatterns, summary,
    } = c;
    return {
      strictness, commentTypes, reviewDrafts, includeLabels, disabledLabels, includeAuthors, excludeAuthors,
      includeBranches, excludeBranches, ignorePatterns, summary,
    };
  };
  return {
    stored: pick(row),
    effective: mergeConfig(DEFAULT_CONFIG, pick(org), repoId ? pick(row) : null),
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ? s.users.find((u) => u.id === row.updatedBy) ?? null : null,
  };
}

export async function saveReviewConfig(ctx: Ctx, repoId: string | null, config: ReviewConfig) {
  await simulate();
  assertAdmin(ctx);
  const s = store();
  if (repoId && !s.repos.some((r) => r.id === repoId && r.orgId === ctx.orgId)) throw new NotFoundError("That repository");
  const i = s.configs.findIndex((c) => c.orgId === ctx.orgId && c.repoId === repoId);
  const row = { ...config, orgId: ctx.orgId, repoId, updatedAt: now(), updatedBy: ctx.userId };
  if (i >= 0) s.configs[i] = row;
  else s.configs.push(row);
}

export async function clearRepoConfig(ctx: Ctx, repoId: string) {
  await simulate();
  assertAdmin(ctx);
  const s = store();
  s.configs = s.configs.filter((c) => !(c.orgId === ctx.orgId && c.repoId === repoId));
}

/* ───────────── rules (S08) ───────────── */

export interface RuleInput {
  text: string;
  kind: Rule["kind"];
  repoIds: string[];
  pathGlobs: string[];
}

export async function listRules(ctx: Ctx, status?: RuleStatus): Promise<Rule[]> {
  await simulate();
  return store()
    .rules.filter((r) => r.orgId === ctx.orgId && (!status || r.status === status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createRule(ctx: Ctx, input: RuleInput): Promise<Rule> {
  await simulate();
  assertAdmin(ctx);
  const rule: Rule = {
    id: nextId("rule"), orgId: ctx.orgId, ...input, source: "manual", status: "active", evidence: [],
    createdBy: ctx.userId, createdAt: now(), updatedAt: now(),
  };
  store().rules.push(rule);
  return rule;
}

function ownRule(ctx: Ctx, id: string) {
  const r = store().rules.find((x) => x.id === id && x.orgId === ctx.orgId);
  if (!r) throw new NotFoundError("That rule");
  return r;
}

export async function updateRule(ctx: Ctx, id: string, input: RuleInput) {
  await simulate();
  assertAdmin(ctx);
  Object.assign(ownRule(ctx, id), input, { updatedAt: now() });
}

export async function setRuleStatus(ctx: Ctx, id: string, status: RuleStatus) {
  await simulate();
  assertAdmin(ctx);
  Object.assign(ownRule(ctx, id), { status, updatedAt: now() });
}

export async function deleteRule(ctx: Ctx, id: string) {
  await simulate();
  assertAdmin(ctx);
  ownRule(ctx, id);
  const s = store();
  s.rules = s.rules.filter((r) => r.id !== id);
}

/* ───────────── reviews (S11, review detail, S17/S18 preview) ───────────── */

/** Fake worker: re-runs move queued → running (3s) → completed (10s), reusing the PR's last result.
 *  The real worker (pg-boss on Fly) replaces this; nothing calls it outside this file. */
function advanceFakeReviews() {
  const s = store();
  const t = Date.now();
  for (const r of s.reviews) {
    if (r.trigger !== "manual" || (r.status !== "queued" && r.status !== "running")) continue;
    const age = t - Date.parse(r.queuedAt);
    if (age < 3000) continue;
    if (age < 10_000) { r.status = "running"; continue; }
    const prev = s.reviews.find((x) => x.pullRequestId === r.pullRequestId && x.id !== r.id && x.status === "completed");
    Object.assign(r, {
      status: "completed", completedAt: new Date().toISOString(), creditsUsed: 1,
      confidenceScore: prev?.confidenceScore ?? 5, verdict: prev?.verdict ?? "Safe to merge",
      summaryMd: prev?.summaryMd ?? "No changes need attention.", diagramMermaid: prev?.diagramMermaid ?? null,
      filesReviewed: prev?.filesReviewed ?? [], checked: prev?.checked.length ? prev.checked : ["Error handling", "Tenant isolation", "Input validation"],
    });
    for (const f of s.findings) if (f.pullRequestId === r.pullRequestId && f.status === "open") f.lastSeenReviewId = r.id;
    s.usage.push({ orgId: r.orgId, reviewId: r.id, credits: 1, periodStart: new Date().toISOString().slice(0, 8) + "01" });
  }
}

export interface ReviewRow extends Review {
  pr: PullRequest;
  repo: Pick<Repository, "id" | "fullName">;
  counts: Record<Severity, number>;
}

export async function listReviews(
  ctx: Ctx,
  f: { repoId?: string; status?: ReviewStatus | "all"; q?: string; cursor?: string; limit?: number } = {},
): Promise<{ items: ReviewRow[]; nextCursor: string | null; total: number }> {
  await simulate();
  advanceFakeReviews();
  const s = store();
  const limit = f.limit ?? 20;
  const q = f.q?.trim().toLowerCase();
  const all = s.reviews
    .filter((r) => r.orgId === ctx.orgId)
    .map((r) => {
      const pr = s.prs.find((p) => p.id === r.pullRequestId)!;
      const repo = s.repos.find((x) => x.id === pr.repoId)!;
      const fs = s.findings.filter((x) => x.lastSeenReviewId === r.id || x.firstReviewId === r.id);
      return {
        ...r, pr, repo: { id: repo.id, fullName: repo.fullName },
        counts: { P0: fs.filter((x) => x.severity === "P0").length, P1: fs.filter((x) => x.severity === "P1").length, P2: fs.filter((x) => x.severity === "P2").length },
      };
    })
    .filter((r) => !f.repoId || r.repo.id === f.repoId)
    .filter((r) => !f.status || f.status === "all" || r.status === f.status)
    .filter((r) => !q || r.pr.title.toLowerCase().includes(q) || `#${r.pr.number}`.includes(q) || r.pr.authorLogin.toLowerCase().includes(q));
  const start = f.cursor ? all.findIndex((r) => r.id === f.cursor) + 1 : 0;
  const items = all.slice(start, start + limit);
  return { items, nextCursor: start + limit < all.length ? items[items.length - 1].id : null, total: all.length };
}

export async function getReview(ctx: Ctx, id: string): Promise<ReviewRow & { findings: Finding[]; rules: Rule[] }> {
  await simulate();
  advanceFakeReviews();
  const s = store();
  const r = s.reviews.find((x) => x.id === id && x.orgId === ctx.orgId);
  if (!r) throw new NotFoundError("That review");
  const { items } = await listReviews(ctx, { limit: 10_000 });
  const row = items.find((x) => x.id === id)!;
  const findings = s.findings.filter((x) => x.pullRequestId === r.pullRequestId);
  const ruleIds = new Set(findings.map((x) => x.ruleId).filter(Boolean));
  return { ...row, findings, rules: s.rules.filter((x) => ruleIds.has(x.id)) };
}

export async function rerunReview(ctx: Ctx, id: string) {
  await simulate();
  const s = store();
  const r = s.reviews.find((x) => x.id === id && x.orgId === ctx.orgId);
  if (!r) throw new NotFoundError("That review");
  if (s.reviews.some((x) => x.pullRequestId === r.pullRequestId && (x.status === "queued" || x.status === "running")))
    throw new Error("A review is already running for this pull request.");
  const review: Review = {
    ...r, id: nextId("rev"), trigger: "manual", status: "queued", skipReason: null, error: null, confidenceScore: null,
    verdict: null, summaryMd: null, diagramMermaid: null, filesReviewed: [], checked: [], creditsUsed: 0,
    queuedAt: now(), completedAt: null,
  };
  s.reviews.unshift(review);
  return review;
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
  byRepo: { repo: string; reviews: number; findings: number; addressed: number }[];
}

export async function getAnalytics(ctx: Ctx, f: { days: number; repoId?: string; author?: string }): Promise<Analytics> {
  await simulate();
  const s = store();
  const end = Date.now();
  const window = (fromMs: number, toMs: number) => {
    const reviews = s.reviews.filter((r) => {
      if (r.orgId !== ctx.orgId || r.status !== "completed") return false;
      const t = Date.parse(r.queuedAt);
      const pr = s.prs.find((p) => p.id === r.pullRequestId)!;
      return t >= fromMs && t < toMs && (!f.repoId || pr.repoId === f.repoId) && (!f.author || pr.authorLogin === f.author);
    });
    const ids = new Set(reviews.map((r) => r.id));
    const fs = s.findings.filter((x) => ids.has(x.firstReviewId));
    const prs = reviews.map((r) => s.prs.find((p) => p.id === r.pullRequestId)!);
    const closed = fs.filter((x) => x.status !== "open");
    const addressed = closed.filter((x) => x.status === "addressed" || x.status === "resolved").length;
    const merge = prs.filter((p) => p.mergedAt).map((p) => (Date.parse(p.mergedAt!) - Date.parse(p.openedAt)) / 36e5).sort((a, b) => a - b);
    return {
      reviews, fs, prs,
      addressedRate: closed.length ? addressed / closed.length : null,
      critical: fs.filter((x) => x.severity === "P0" && x.status !== "dismissed").length,
      median: merge.length ? merge[Math.floor(merge.length / 2)] : null,
    };
  };
  const span = f.days * 864e5;
  const cur = window(end - span, end + 1);
  const prev = window(end - 2 * span, end - span);

  const daily: Analytics["daily"] = [];
  for (let d = f.days - 1; d >= 0; d--) {
    const day = new Date(end - d * 864e5).toISOString().slice(0, 10);
    const rs = cur.reviews.filter((r) => r.queuedAt.slice(0, 10) === day);
    const ids = new Set(rs.map((r) => r.id));
    const fs = cur.fs.filter((x) => ids.has(x.firstReviewId));
    daily.push({ date: day, reviews: rs.length, P0: fs.filter((x) => x.severity === "P0").length, P1: fs.filter((x) => x.severity === "P1").length, P2: fs.filter((x) => x.severity === "P2").length });
  }

  const byRepo = new Map<string, { repo: string; reviews: number; findings: number; addressed: number }>();
  for (const r of cur.reviews) {
    const pr = s.prs.find((p) => p.id === r.pullRequestId)!;
    const name = s.repos.find((x) => x.id === pr.repoId)!.fullName;
    const row = byRepo.get(name) ?? { repo: name, reviews: 0, findings: 0, addressed: 0 };
    const fs = cur.fs.filter((x) => x.firstReviewId === r.id);
    row.reviews += 1;
    row.findings += fs.length;
    row.addressed += fs.filter((x) => x.status === "addressed" || x.status === "resolved").length;
    byRepo.set(name, row);
  }

  return {
    range: { from: new Date(end - span).toISOString(), to: new Date(end).toISOString(), days: f.days },
    tiles: {
      prsReviewed: new Set(cur.prs.map((p) => p.id)).size, prsReviewedPrev: new Set(prev.prs.map((p) => p.id)).size,
      addressedRate: cur.addressedRate, addressedRatePrev: prev.addressedRate,
      criticalCaught: cur.critical, criticalCaughtPrev: prev.critical,
      medianMergeHours: cur.median, medianMergeHoursPrev: prev.median,
      thumbsUp: cur.fs.reduce((n, x) => n + x.thumbsUp, 0), thumbsDown: cur.fs.reduce((n, x) => n + x.thumbsDown, 0),
    },
    daily,
    byRepo: [...byRepo.values()].sort((a, b) => b.reviews - a.reviews),
  };
}

export async function listAuthors(ctx: Ctx): Promise<string[]> {
  await simulate();
  return [...new Set(store().prs.filter((p) => p.orgId === ctx.orgId).map((p) => p.authorLogin))].sort();
}

/* ───────────── members (S12) ───────────── */

export interface MemberRow {
  user: User;
  role: Role;
  joinedAt: string;
  reviewsThisMonth: number;
}

export async function listMembers(ctx: Ctx): Promise<{ members: MemberRow[]; invites: Invite[] }> {
  await simulate();
  const s = store();
  const month = new Date().toISOString().slice(0, 7);
  const members = s.memberships
    .filter((m) => m.orgId === ctx.orgId)
    .map((m) => {
      const user = s.users.find((u) => u.id === m.userId)!;
      const reviewsThisMonth = s.reviews.filter((r) => {
        const pr = s.prs.find((p) => p.id === r.pullRequestId)!;
        return r.orgId === ctx.orgId && r.status === "completed" && pr.authorLogin === user.githubLogin && r.queuedAt.startsWith(month);
      }).length;
      return { user, role: m.role, joinedAt: m.createdAt, reviewsThisMonth };
    })
    .sort((a, b) => a.user.name.localeCompare(b.user.name));
  return { members, invites: s.invites.filter((i) => i.orgId === ctx.orgId) };
}

export async function inviteMember(ctx: Ctx, email: string, role: Role): Promise<Invite> {
  await simulate();
  assertAdmin(ctx);
  const s = store();
  const e = email.trim().toLowerCase();
  if (s.memberships.some((m) => m.orgId === ctx.orgId && s.users.find((u) => u.id === m.userId)?.email === e))
    throw new Error(`${e} is already a member.`);
  if (s.invites.some((i) => i.orgId === ctx.orgId && i.email === e)) throw new Error(`${e} already has an open invite.`);
  const invite: Invite = { id: nextId("inv"), orgId: ctx.orgId, email: e, role, invitedBy: ctx.userId, expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(), createdAt: now() };
  s.invites.push(invite);
  return invite;
}

export async function revokeInvite(ctx: Ctx, id: string) {
  await simulate();
  assertAdmin(ctx);
  const s = store();
  s.invites = s.invites.filter((i) => !(i.id === id && i.orgId === ctx.orgId));
}

function adminCount(orgId: string) {
  return store().memberships.filter((m) => m.orgId === orgId && m.role === "admin").length;
}

export async function changeRole(ctx: Ctx, userId: string, role: Role) {
  await simulate();
  assertAdmin(ctx);
  const m = store().memberships.find((x) => x.orgId === ctx.orgId && x.userId === userId);
  if (!m) throw new NotFoundError("That member");
  if (m.role === "admin" && role === "member" && adminCount(ctx.orgId) === 1) throw new Error("An organization needs at least one admin.");
  m.role = role;
}

export async function removeMember(ctx: Ctx, userId: string) {
  await simulate();
  assertAdmin(ctx);
  const s = store();
  const m = s.memberships.find((x) => x.orgId === ctx.orgId && x.userId === userId);
  if (!m) throw new NotFoundError("That member");
  if (m.role === "admin" && adminCount(ctx.orgId) === 1) throw new Error("You can't remove the last admin.");
  s.memberships = s.memberships.filter((x) => x !== m);
}

/* ───────────── billing (S13) ───────────── */

export interface Billing {
  plan: "free" | "trial" | "pro" | "enterprise";
  billingStatus: "none" | "active" | "past_due" | "canceled";
  trialEndsAt: string | null;
  seats: number;
  includedReviews: number;
  usedReviews: number;
  periodStart: string;
  periodEnd: string;
  pricePerSeatCents: number;
  overagePerReviewCents: number;
  invoices: { id: string; date: string; amountCents: number; status: "paid" | "open" }[];
}

export async function getBilling(ctx: Ctx): Promise<Billing> {
  await simulate();
  const s = store();
  const org = s.orgs.find((o) => o.id === ctx.orgId)!;
  const d = new Date();
  const periodStart = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  const seats = s.memberships.filter((m) => m.orgId === ctx.orgId).length;
  const used = s.usage.filter((u) => u.orgId === ctx.orgId && u.periodStart === periodStart).reduce((n, u) => n + u.credits, 0);
  const paid = org.plan === "pro" || org.plan === "enterprise";
  return {
    plan: org.plan, billingStatus: org.billingStatus, trialEndsAt: org.trialEndsAt, seats,
    includedReviews: seats * org.includedReviewsPerSeat, usedReviews: used,
    periodStart, periodEnd: next.toISOString().slice(0, 10),
    pricePerSeatCents: 2400, overagePerReviewCents: 80,
    invoices: paid
      ? [1, 2, 3].map((k) => {
          const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - k + 1, 1));
          return { id: `in_${k}`, date: t.toISOString().slice(0, 10), amountCents: seats * 2400 + (k === 2 ? 1600 : 0), status: "paid" as const };
        })
      : [],
  };
}

/** Fake checkout: flips the plan. The real one returns a Stripe Checkout URL. */
export async function startCheckout(ctx: Ctx): Promise<{ url: string }> {
  await simulate();
  assertAdmin(ctx);
  const org = store().orgs.find((o) => o.id === ctx.orgId)!;
  org.plan = "pro";
  org.billingStatus = "active";
  org.trialEndsAt = null;
  return { url: "/settings/billing?upgraded=1" };
}

/* ───────────── API keys (S15) ───────────── */

export async function listApiKeys(ctx: Ctx): Promise<(ApiKey & { createdByName: string })[]> {
  await simulate();
  const s = store();
  return s.apiKeys
    .filter((k) => k.orgId === ctx.orgId)
    .map((k) => ({ ...k, createdByName: s.users.find((u) => u.id === k.createdBy)?.name ?? "Unknown" }))
    .sort((a, b) => Number(!!a.revokedAt) - Number(!!b.revokedAt) || b.createdAt.localeCompare(a.createdAt));
}

/** Returns the secret once. Only a prefix is stored (the real layer stores a hash). */
export async function createApiKey(ctx: Ctx, name: string): Promise<{ key: ApiKey; secret: string }> {
  await simulate();
  assertAdmin(ctx);
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const secret = "rpt_" + Array.from(bytes, (b) => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"[b % 57]).join("");
  const key: ApiKey = { id: nextId("key"), orgId: ctx.orgId, name, prefix: secret.slice(0, 8), createdBy: ctx.userId, lastUsedAt: null, revokedAt: null, createdAt: now() };
  store().apiKeys.push(key);
  return { key, secret };
}

export async function revokeApiKey(ctx: Ctx, id: string) {
  await simulate();
  assertAdmin(ctx);
  const k = store().apiKeys.find((x) => x.id === id && x.orgId === ctx.orgId);
  if (!k) throw new NotFoundError("That key");
  k.revokedAt = now();
}

/* ───────────── integrations (S14) ───────────── */

export async function listIntegrations(ctx: Ctx): Promise<Integration[]> {
  await simulate();
  return store().integrations.filter((i) => i.orgId === ctx.orgId);
}

export async function connectIntegration(ctx: Ctx, kind: IntegrationKind) {
  await simulate();
  assertAdmin(ctx);
  const s = store();
  s.integrations = s.integrations.filter((i) => !(i.orgId === ctx.orgId && i.kind === kind));
  s.integrations.push({ orgId: ctx.orgId, kind, status: "connected", detail: "Connected just now", updatedAt: now() });
}

export async function disconnectIntegration(ctx: Ctx, kind: IntegrationKind) {
  await simulate();
  assertAdmin(ctx);
  const s = store();
  s.integrations = s.integrations.filter((i) => !(i.orgId === ctx.orgId && i.kind === kind));
}

/* ───────────── knowledge (S09) ───────────── */

export async function listKnowledge(ctx: Ctx, repoId: string): Promise<KnowledgeDoc[]> {
  await simulate();
  const order = (p: string) => (p === "index" ? 0 : p === "reverts" ? 2 : 1);
  return store()
    .knowledge.filter((d) => d.orgId === ctx.orgId && d.repoId === repoId)
    .sort((a, b) => order(a.path) - order(b.path) || a.title.localeCompare(b.title));
}

export async function updateKnowledgeDoc(ctx: Ctx, id: string, bodyMd: string) {
  await simulate();
  assertAdmin(ctx);
  const d = store().knowledge.find((x) => x.id === id && x.orgId === ctx.orgId);
  if (!d) throw new NotFoundError("That page");
  d.bodyMd = bodyMd;
  d.editedBy = ctx.userId;
  d.updatedAt = now();
}

export async function getUserName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  return store().users.find((u) => u.id === userId)?.name ?? null;
}

export async function getFinding(ctx: Ctx, id: string): Promise<Finding> {
  await simulate();
  const f = store().findings.find((x) => x.id === id && x.orgId === ctx.orgId);
  if (!f) throw new NotFoundError("That finding");
  return f;
}
