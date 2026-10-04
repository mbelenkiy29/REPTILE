// review-pr: the core loop. One job per queued review.
//   decide (filters, plan) → context (rules, guides, related code) → model review → filter by strictness →
//   match against earlier findings → post one GitHub review + edit the summary comment → complete the check → bill.
// Retries are only allowed before anything is posted to GitHub.
import { and, eq, inArray, sql as dsql } from "drizzle-orm";
import picomatch from "picomatch";
import { db, schema as s, sql } from "@/db";
import { ALLOWANCE_WARNING, allowance, FREE_PLAN, onFreePlan, periodStart, recordUsage } from "@/lib/billing";
import { enqueue } from "@/lib/jobs";
import { toFinding } from "@/lib/data";
import { gitHost, type GitHost, type PrFile, type ReviewCommentInput } from "@/lib/github";
import { checkRunTitle, fingerprint, renderInlineComment, renderSummary, SUMMARY_MARKER } from "@/lib/review/markdown";
import { shouldReview } from "@/lib/review/should-review";
import { embedder, reviewModel } from "../ai";
import { RefusedError } from "../ai/claude";
import type { FindingOut, ReviewFileInput } from "../ai/types";
import { anchor, parsePatch, type ParsedPatch } from "../lib/diff";
import { isSkippable, looksBinary } from "../lib/files";
import { loadPrConfig, matchesAny } from "../lib/config";

const MAX_FILES = 80;
const MAX_FILE_LINES = 2000;
const BATCH_CHARS = 120_000;
const CONTEXT_CHARS = 60_000;

export class Superseded extends Error {}

const now = () => new Date().toISOString();
const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Strictness filter, applied after the model reports everything it believes. */
export function keep(f: FindingOut, strictness: 1 | 2 | 3, types: string[]) {
  if (!types.includes(f.type)) return false;
  if (strictness === 3) return f.severity === "P0" || (f.severity === "P1" && f.type === "security" && f.confidence >= 0.6);
  if (strictness === 2) return f.confidence >= 0.5 && (f.severity !== "P2" || (f.type !== "style" && f.confidence >= 0.7));
  return f.confidence >= 0.3;
}

export async function runReview(reviewId: string, attempt: { retryCount: number; retryLimit: number }) {
  const [review] = await db.select().from(s.reviews).where(eq(s.reviews.id, reviewId));
  if (!review || !["queued", "running"].includes(review.status)) return { result: "nothing to do" };
  const [pr] = await db.select().from(s.pullRequests).where(eq(s.pullRequests.id, review.pullRequestId));
  const [repo] = await db.select().from(s.repositories).where(eq(s.repositories.id, pr.repoId));
  const [inst] = await db.select().from(s.installations).where(eq(s.installations.id, repo.installationId));
  const [org] = await db.select().from(s.organizations).where(eq(s.organizations.id, review.orgId));
  const gh = await gitHost();
  const instId = inst.externalInstallationId;
  let posted = false;

  const stillCurrent = async () => {
    const [r] = await db.select({ status: s.reviews.status }).from(s.reviews).where(eq(s.reviews.id, reviewId));
    if (r?.status !== "running") throw new Superseded();
  };
  const finishSkipped = async (reason: string) => {
    await db.update(s.reviews).set({ status: "skipped", skipReason: reason, completedAt: now(), updatedAt: now() }).where(eq(s.reviews.id, reviewId));
    return { result: `skipped: ${reason}` };
  };

  // Plan gate: an ended trial or a canceled subscription pauses reviews (nothing is posted, nothing billed).
  if (org.plan === "trial" && org.trialEndsAt && Date.parse(new Date(org.trialEndsAt).toISOString()) < Date.now()) return finishSkipped("The trial has ended. Choose a plan to resume reviews.");
  if (org.billingStatus === "canceled" && org.plan !== "trial" && org.plan !== "enterprise") return finishSkipped("The subscription is canceled. Choose a plan to resume reviews.");
  // Allowance gate (Free and Team): past the month's reviews, reviews pause until the 1st. Nothing is ever charged per review.
  if (onFreePlan(org) || org.plan === "pro") {
    const free = onFreePlan(org);
    const a = await allowance(org);
    if (free && a.seats > FREE_PLAN.members) return finishSkipped("The Free plan covers one member. Choose the Team plan to review for the whole team.");
    if (a.used >= a.included) {
      return finishSkipped(free
        ? `This month's ${a.included} free reviews are used. Reviews resume on the 1st, or choose the Team plan.`
        : `This month's ${a.included} Team reviews are used. Reviews resume on the 1st. Adding a seat adds ${org.includedReviewsPerSeat} more; nothing is charged per review.`);
    }
    if (a.used + 1 >= Math.ceil(a.included * ALLOWANCE_WARNING)) await warnAllowance(org, a);
  }
  if (inst.suspendedAt || repo.removedAt) return finishSkipped("The GitHub App no longer has access to this repository.");

  await db.update(s.reviews).set({ status: "running", startedAt: now(), updatedAt: now() }).where(eq(s.reviews.id, reviewId));

  try {
    const [info, files] = await Promise.all([
      gh.getPullRequest(instId, repo.fullName, pr.number),
      gh.listPullRequestFiles(instId, repo.fullName, pr.number),
    ]);
    const cfg = await loadPrConfig(gh, instId, repo, review.headSha, files.map((f) => f.filename));
    // Ignore patterns were applied per file above (the nearest .countersign/ config wins), so don't apply the repo's again.
    const decision = shouldReview({ ...cfg.repo, ignorePatterns: [] }, {
      isDraft: pr.isDraft, authorLogin: pr.authorLogin, baseBranch: pr.baseBranch, labels: pr.labels, trigger: review.trigger,
      changedFiles: files.filter((f) => f.status !== "removed").map((f) => f.filename).filter((p) => !matchesAny(cfg.forFile(p).ignorePatterns, p)),
    });
    if (!decision.review) return await finishSkipped(decision.reason);

    const reviewable = files.filter((f) => decision.files.includes(f.filename) && !isSkippable(f.filename) && f.patch).slice(0, MAX_FILES);
    if (!reviewable.length) return await finishSkipped("Only generated, binary or very large files changed");

    // A retry keeps the check run its first attempt started, so none is left "in progress" on the PR.
    const checkRunId = review.checkRunId ?? await gh.createCheckRun(instId, repo.fullName, review.headSha, "Countersign is reviewing");
    await db.update(s.reviews).set({ checkRunId, effectiveConfig: cfg.repo }).where(eq(s.reviews.id, reviewId));

    // Context.
    const [rules, guides, contents] = await Promise.all([
      activeRules(repo.orgId, repo.id, reviewable.map((f) => f.filename)),
      repoGuides(gh, instId, repo.fullName, review.headSha),
      Promise.all(reviewable.map(async (f) => {
        const text = await gh.getFile(instId, repo.fullName, f.filename, review.headSha).catch(() => null);
        return text && !looksBinary(text) && text.split("\n").length <= MAX_FILE_LINES ? text : null;
      })),
    ]);
    const patches = new Map<string, ParsedPatch>(reviewable.map((f) => [f.filename, parsePatch(f.patch)]));
    const related = await relatedCode(repo.id, repo.orgId, reviewable, patches);
    const inputs: ReviewFileInput[] = reviewable.map((f, i) => ({ path: f.filename, status: f.status, patch: f.patch ?? "", content: contents[i] }));

    // Review in batches, a few at a time.
    const model = await reviewModel();
    const batches = batch(inputs);
    const results = await mapLimit(batches, 3, (b) => model.review({ repo: repo.fullName, prTitle: info.title, prBody: info.body, rules: rules.map((r) => r.text), repoGuides: guides, context: related, files: b }));
    await stillCurrent();
    let inputTokens = results.reduce((n, r) => n + r.usage.inputTokens, 0);
    let outputTokens = results.reduce((n, r) => n + r.usage.outputTokens, 0);
    const fileSummaries = results.flatMap((r) => r.out.file_summaries).filter((f) => patches.has(f.path));

    // Filter, dedupe and anchor.
    const lineCount = new Map(inputs.map((f) => [f.path, f.content?.split("\n").length ?? Infinity]));
    const seen = new Set<string>();
    const candidates = results.flatMap((r) => r.out.findings).filter((f) => {
      if (!patches.has(f.file)) return false;
      const fc = cfg.forFile(f.file);
      if (!keep(f, fc.strictness, fc.commentTypes)) return false;
      if (f.line_start < 1 || f.line_end > (lineCount.get(f.file) ?? Infinity)) return false;
      return true;
    }).map((f) => {
      const content = inputs.find((x) => x.path === f.file)?.content ?? "";
      const anchorText = content.split("\n").slice(f.line_start - 1, f.line_end).join("\n");
      const fp = fingerprint(f.file, f.title, anchorText);
      return { f, fp, place: anchor(patches.get(f.file)!, f.line_start, f.line_end) };
    }).filter((x) => (seen.has(x.fp) ? false : (seen.add(x.fp), true)))
      .sort((a, b) => a.f.severity.localeCompare(b.f.severity) || b.f.confidence - a.f.confidence)
      .slice(0, 40);

    // Match against earlier findings on this PR.
    const existing = await db.select().from(s.findings).where(eq(s.findings.pullRequestId, pr.id));
    const byFp = new Map(existing.map((f) => [f.fingerprint, f]));
    const fresh = candidates.filter((c) => !byFp.has(c.fp));
    const stillOpen = candidates.filter((c) => byFp.get(c.fp)?.status === "open");

    const sum = await model.summarize({
      repo: repo.fullName, prTitle: info.title, prBody: info.body, fileSummaries,
      findings: candidates.filter((c) => byFp.get(c.fp)?.status !== "dismissed").map((c) => ({ severity: c.f.severity, title: c.f.title, file: c.f.file })),
    });
    inputTokens += sum.usage.inputTokens;
    outputTokens += sum.usage.outputTokens;
    await stillCurrent();

    // Persist findings before posting, so a crash after posting can't lose the comment ids.
    const inserted = fresh.length
      ? await db.insert(s.findings).values(fresh.map((c) => ({
          orgId: repo.orgId, pullRequestId: pr.id, firstReviewId: reviewId, lastSeenReviewId: reviewId, fingerprint: c.fp,
          filePath: c.f.file, lineStart: c.f.line_start, lineEnd: c.f.line_end, inDiff: !!c.place, severity: c.f.severity, type: c.f.type,
          title: c.f.title.slice(0, 200), bodyMd: c.f.body.slice(0, 4000), suggestion: c.f.suggestion?.slice(0, 4000) ?? null,
          ruleId: c.f.rule_index !== null && rules[c.f.rule_index] ? rules[c.f.rule_index].id : null,
        }))).onConflictDoNothing().returning()
      : [];
    if (stillOpen.length) {
      await db.update(s.findings).set({ lastSeenReviewId: reviewId, updatedAt: now() })
        .where(and(eq(s.findings.pullRequestId, pr.id), inArray(s.findings.fingerprint, stillOpen.map((c) => c.fp))));
    }
    // Open findings this review no longer reports were addressed by the new commits.
    const reported = new Set(candidates.map((c) => c.fp));
    const gone = existing.filter((f) => f.status === "open" && !reported.has(f.fingerprint) && patches.has(f.filePath));
    if (gone.length) await db.update(s.findings).set({ status: "addressed", updatedAt: now() }).where(inArray(s.findings.id, gone.map((f) => f.id)));

    // Post one review with the new in-diff comments.
    const toPost = inserted.filter((f) => f.inDiff);
    const comments: ReviewCommentInput[] = toPost.map((f) => {
      const place = fresh.find((c) => c.fp === f.fingerprint)!.place!;
      return { path: f.filePath, line: place.line, startLine: place.startLine, side: "RIGHT", body: renderInlineComment(toFinding(f), `${appUrl()}/fix/${f.id}`) };
    });
    if (comments.length) {
      posted = true;
      const ids = await gh.createReview(instId, repo.fullName, pr.number, review.headSha, comments);
      for (let i = 0; i < toPost.length; i++) if (ids[i]) await db.update(s.findings).set({ providerCommentId: ids[i] }).where(eq(s.findings.id, toPost[i].id));
    }

    // Summary comment, edited in place on later reviews.
    const rows = await db.select().from(s.findings).where(eq(s.findings.pullRequestId, pr.id));
    const commentIds = new Map(rows.map((f) => [f.id, f.providerCommentId]));
    const all = rows.map((f) => toFinding(f));
    const reviewBits = { confidenceScore: Math.min(5, Math.max(1, Math.round(sum.out.confidence))) as 1 | 2 | 3 | 4 | 5, verdict: sum.out.verdict, summaryMd: sum.out.summary, diagramMermaid: sum.out.diagram, filesReviewed: fileSummaries, checked: sum.out.checked };
    let body = renderSummary({
      review: reviewBits, findings: all, options: cfg.repo.summary, fixAllUrl: `${appUrl()}/fix/pr/${pr.id}`,
      commentUrl: (f) => (commentIds.get(f.id) ? `${pr.url}#discussion_r${commentIds.get(f.id)}` : undefined),
    });
    if (cfg.problems.length) body += `\n> Config file problems (ignored): ${cfg.problems.join(" · ")}\n`;
    posted = true;
    await upsertSummary(gh, instId, repo.fullName, pr, body);

    const check = checkRunTitle(all);
    await gh.completeCheckRun(instId, repo.fullName, checkRunId, { conclusion: check.conclusion, title: check.title, summary: sum.out.summary });

    const credits = review.tier === "deep" ? 3 : 1;
    await db.transaction(async (tx) => {
      await tx.update(s.reviews).set({
        status: "completed", ...reviewBits, creditsUsed: credits, inputTokens, outputTokens, completedAt: now(), updatedAt: now(), error: null,
      }).where(eq(s.reviews.id, reviewId));
      await recordUsage(tx, org, reviewId, credits);
    });
    return { result: "completed", findings: candidates.length, posted: comments.length };
  } catch (e) {
    if (e instanceof Superseded) return { result: "superseded" };
    const canRetry = !posted && attempt.retryCount < attempt.retryLimit && !(e instanceof RefusedError);
    if (canRetry) {
      await db.update(s.reviews).set({ status: "queued", updatedAt: now() }).where(and(eq(s.reviews.id, reviewId), eq(s.reviews.status, "running")));
      throw e;
    }
    const message = e instanceof RefusedError
      ? "The model declined to review this change. Comment @countersign to try again, or review it by hand."
      : "The review couldn't finish and no credit was used. Comment @countersign on the pull request to try again.";
    await db.update(s.reviews).set({ status: "failed", error: message, completedAt: now(), updatedAt: now() }).where(eq(s.reviews.id, reviewId));
    const [r] = await db.select({ checkRunId: s.reviews.checkRunId }).from(s.reviews).where(eq(s.reviews.id, reviewId));
    if (r?.checkRunId) await gh.completeCheckRun(instId, repo.fullName, r.checkRunId, { conclusion: "neutral", title: "Countersign · review failed", summary: message }).catch(() => undefined);
    console.error(`[review-pr] ${reviewId} failed:`, e instanceof Error ? e.message : e);
    return { result: "failed" };
  }
}

async function upsertSummary(gh: GitHost, instId: number, repo: string, pr: typeof s.pullRequests.$inferSelect, body: string) {
  if (pr.summaryCommentId) {
    try {
      await gh.updateIssueComment(instId, repo, pr.summaryCommentId, body);
      return;
    } catch (e) {
      if ((e as { status?: number }).status !== 404) throw e; // deleted by someone: post a new one
    }
  }
  const id = await gh.createIssueComment(instId, repo, pr.number, body.startsWith(SUMMARY_MARKER) ? body : `${SUMMARY_MARKER}\n${body}`);
  await db.update(s.pullRequests).set({ summaryCommentId: id }).where(eq(s.pullRequests.id, pr.id));
}

async function activeRules(orgId: string, repoId: string, paths: string[]) {
  const rows = await db.select().from(s.rules).where(and(eq(s.rules.orgId, orgId), eq(s.rules.status, "active"))).orderBy(s.rules.createdAt);
  return rows.filter((r) => (!r.repoIds.length || r.repoIds.includes(repoId)) && (!r.pathGlobs.length || paths.some((p) => r.pathGlobs.some((g) => picomatch.isMatch(p, g, { dot: true }))))).slice(0, 50);
}

/** Agent guide files at the repository root, read as extra context (not enforced rules). */
async function repoGuides(gh: GitHost, instId: number, repo: string, sha: string) {
  const out: { path: string; text: string }[] = [];
  for (const path of ["CLAUDE.md", "AGENTS.md", ".cursorrules"]) {
    const text = await gh.getFile(instId, repo, path, sha).catch(() => null);
    if (text) out.push({ path, text });
  }
  return out;
}

/** Nearest indexed chunks to each changed hunk, from other files in the same repository (org-scoped). */
async function relatedCode(repoId: string, orgId: string, files: PrFile[], patches: Map<string, ParsedPatch>) {
  const [{ n }] = await db.select({ n: dsql<number>`count(*)` }).from(s.codeChunks).where(eq(s.codeChunks.repoId, repoId));
  if (!Number(n)) return [];
  const queries = files.flatMap((f) => patches.get(f.filename)!.hunks.slice(0, 3).map((h) => ({ path: f.filename, text: h.slice(0, 4000) }))).slice(0, 24);
  if (!queries.length) return [];
  const vectors = await (await embedder()).embed(queries.map((q) => q.text), "query");
  const changed = files.map((f) => f.filename);
  const picked = new Map<string, { path: string; startLine: number; endLine: number; content: string }>();
  let chars = 0;
  for (const v of vectors) {
    const rows = await sql()<{ id: string; path: string; start_line: number; end_line: number; content: string }[]>`
      select id, path, start_line, end_line, content from code_chunks
      where repo_id = ${repoId} and org_id = ${orgId} and not (path = any(${changed}))
      order by embedding <=> ${JSON.stringify(v)}::vector limit 4`;
    for (const r of rows) {
      if (picked.has(r.id) || chars + r.content.length > CONTEXT_CHARS) continue;
      picked.set(r.id, { path: r.path, startLine: r.start_line, endLine: r.end_line, content: r.content });
      chars += r.content.length;
    }
  }
  return [...picked.values()];
}

function batch(files: ReviewFileInput[]) {
  const out: ReviewFileInput[][] = [];
  let cur: ReviewFileInput[] = [];
  let size = 0;
  for (const f of files) {
    const n = f.patch.length + (f.content?.length ?? 0);
    if (cur.length && (size + n > BATCH_CHARS || cur.length >= 8)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(f);
    size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}

/** One email per org per month to its admins when usage reaches ALLOWANCE_WARNING of the allowance. */
async function warnAllowance(org: typeof s.organizations.$inferSelect, a: { used: number; included: number }) {
  // rate_limits doubles as a "sent" marker. Dated the 1st of next month, so the daily cleanup (rows over 2 days old)
  // keeps it for the whole month.
  const d = new Date();
  const nextMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
  const marker = await db.execute(dsql`insert into rate_limits (key, window_start, count) values (${`allowance-warning:${org.id}:${periodStart()}`}, ${nextMonth}::timestamptz, 1) on conflict do nothing returning key`);
  if (!marker.length) return;
  const admins = await db.select({ email: s.users.email }).from(s.memberships).innerJoin(s.users, eq(s.users.id, s.memberships.userId))
    .where(and(eq(s.memberships.orgId, org.id), eq(s.memberships.role, "admin")));
  const url = `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/settings/billing`;
  for (const ad of admins) {
    if (ad.email) await enqueue("send-email", { to: ad.email, template: "allowance-warning", vars: { org: org.name, used: String(a.used + 1), included: String(a.included), url } });
  }
}
