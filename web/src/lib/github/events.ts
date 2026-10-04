// GitHub webhook event handlers. Called after the signature is verified and the delivery id recorded.
// They update the database and queue jobs; anything slow happens in the worker.
import { and, eq, inArray, isNull, or, sql as dsql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { enqueue } from "@/lib/jobs";
import { failStaleReviews } from "@/lib/review/stale";
import { rateLimit, RateLimitError } from "@/lib/rate-limit";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const now = () => new Date().toISOString();
export const botSlug = () => (process.env.GITHUB_APP_SLUG ?? "countersign").toLowerCase();
const mentionsBot = (body: string | undefined | null) => !!body && new RegExp(`(^|\\s)@${botSlug()}(\\[bot\\])?\\b`, "i").test(body);
/** People with write access to the repository. Anyone can comment on a public repo; only these can spend the org's reviews. */
const canTrigger = (association: unknown) => ["OWNER", "MEMBER", "COLLABORATOR"].includes(String(association));

async function installationRow(externalId: number) {
  const [i] = await db.select().from(s.installations).where(and(eq(s.installations.provider, "github"), eq(s.installations.externalInstallationId, externalId)));
  return i ?? null;
}

async function repoRow(installationExternalId: number, providerRepoId: number) {
  const inst = await installationRow(installationExternalId);
  if (!inst) return null;
  const [r] = await db.select().from(s.repositories)
    .where(and(eq(s.repositories.installationId, inst.id), eq(s.repositories.providerRepoId, providerRepoId), isNull(s.repositories.removedAt)));
  return r ? { repo: r, inst } : null;
}

async function upsertPr(repo: typeof s.repositories.$inferSelect, p: Json) {
  const values = {
    orgId: repo.orgId, repoId: repo.id, number: p.number, title: p.title, authorLogin: p.user?.login ?? "ghost", baseBranch: p.base.ref,
    headSha: p.head.sha, state: (p.merged ? "merged" : p.state === "closed" ? "closed" : "open") as "open" | "closed" | "merged",
    isDraft: !!p.draft, labels: (p.labels ?? []).map((l: Json) => l.name), url: p.html_url, openedAt: p.created_at,
    mergedAt: p.merged_at ?? null, closedAt: p.closed_at ?? null,
  };
  const [row] = await db.insert(s.pullRequests).values(values)
    .onConflictDoUpdate({ target: [s.pullRequests.repoId, s.pullRequests.number], set: { ...values, updatedAt: now() } })
    .returning();
  return row;
}

type Trigger = typeof s.reviews.$inferInsert["trigger"];

/** Queue a review; a newer push supersedes the one in flight. Duplicate automatic reviews of a SHA are ignored. */
export async function queueReview(pr: typeof s.pullRequests.$inferSelect, trigger: Trigger, triggeredBy: string | null) {
  try {
    const review = await db.transaction(async (tx) => {
      // Serialize events for one PR so two deliveries can't both supersede and insert.
      await tx.execute(dsql`select pg_advisory_xact_lock(hashtext(${pr.id}))`);
      await failStaleReviews(tx, pr.id);
      const live = await tx.select({ id: s.reviews.id, sha: s.reviews.headSha }).from(s.reviews)
        .where(and(eq(s.reviews.pullRequestId, pr.id), inArray(s.reviews.status, ["queued", "running"])));
      // Already reviewing this commit: nothing to do. Reviewing an older commit: replace it.
      if (live.some((r) => r.sha === pr.headSha)) return null;
      if (live.length) await tx.update(s.reviews).set({ status: "superseded", updatedAt: now() }).where(inArray(s.reviews.id, live.map((r) => r.id)));
      // A draft that is now ready, or a PR that just got a review label, was skipped for a reason that no longer holds:
      // let the new review replace the skipped one, or the once-per-commit rule would block it.
      if (trigger === "ready_for_review" || trigger === "labeled") {
        await tx.update(s.reviews).set({ status: "superseded", updatedAt: now() })
          .where(and(eq(s.reviews.pullRequestId, pr.id), eq(s.reviews.headSha, pr.headSha), eq(s.reviews.status, "skipped")));
      }
      const [r] = await tx.insert(s.reviews).values({
        orgId: pr.orgId, pullRequestId: pr.id, headSha: pr.headSha, trigger, triggeredBy, status: "queued", filesReviewed: [], checked: [],
      }).returning({ id: s.reviews.id });
      return r;
    });
    if (!review) return null;
    await enqueue("review-pr", { reviewId: review.id });
    return review.id;
  } catch (e) {
    const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") return null; // this SHA was already reviewed automatically
    throw e;
  }
}

/**
 * A review comment the team wrote themselves, outside Countersign's threads: what they ask for in review is the best evidence
 * for rules Countersign should suggest (learn-rules job). Only people with write access, and only comments with some substance.
 */
async function recordHumanComment(installationId: number | undefined, p: Json): Promise<string> {
  const body = String(p.comment?.body ?? "").trim();
  if (mentionsBot(body)) return "ignored";
  if (!canTrigger(p.comment?.author_association)) return "not a collaborator";
  if (body.length < 20) return "too short to learn from";
  const hit = installationId ? await repoRow(installationId, p.repository.id) : null;
  if (!hit) return "repo not linked";
  const [pr] = await db.select({ id: s.pullRequests.id }).from(s.pullRequests)
    .where(and(eq(s.pullRequests.repoId, hit.repo.id), eq(s.pullRequests.number, p.pull_request?.number)));
  if (!pr) return "pull request unknown";
  await db.insert(s.feedback).values({
    orgId: hit.repo.orgId, pullRequestId: pr.id, filePath: p.comment.path ?? null, actorLogin: p.comment.user.login,
    kind: "human_comment", body: body.slice(0, 4000), providerId: p.comment.id,
  }).onConflictDoNothing();
  return "human comment recorded";
}

export async function handleGitHubEvent(event: string, p: Json): Promise<string> {
  const installationId: number | undefined = p.installation?.id;

  switch (event) {
    case "ping":
      return "pong";

    case "installation": {
      if (!installationId) return "no installation";
      const inst = await installationRow(installationId);
      if (!inst) return "not linked";
      if (p.action === "deleted") {
        await db.update(s.installations).set({ suspendedAt: now() }).where(eq(s.installations.id, inst.id));
        await db.update(s.repositories).set({ removedAt: now(), reviewEnabled: false }).where(eq(s.repositories.installationId, inst.id));
      } else if (p.action === "suspend") {
        await db.update(s.installations).set({ suspendedAt: now() }).where(eq(s.installations.id, inst.id));
      } else if (p.action === "unsuspend") {
        await db.update(s.installations).set({ suspendedAt: null }).where(eq(s.installations.id, inst.id));
      }
      return `installation ${p.action}`;
    }

    case "installation_repositories": {
      const inst = installationId ? await installationRow(installationId) : null;
      if (!inst) return "not linked";
      for (const r of p.repositories_added ?? []) {
        const [row] = await db.insert(s.repositories).values({
          orgId: inst.orgId, installationId: inst.id, providerRepoId: r.id, fullName: r.full_name, private: !!r.private,
        }).onConflictDoUpdate({ target: [s.repositories.installationId, s.repositories.providerRepoId], set: { removedAt: null, fullName: r.full_name, updatedAt: now() } })
          .returning({ id: s.repositories.id });
        await enqueue("index-repo", { repoId: row.id, full: true }, { singletonKey: row.id });
      }
      const removed = (p.repositories_removed ?? []).map((r: Json) => r.id as number);
      if (removed.length) {
        await db.update(s.repositories).set({ removedAt: now(), updatedAt: now() })
          .where(and(eq(s.repositories.installationId, inst.id), inArray(s.repositories.providerRepoId, removed)));
      }
      return "repositories synced";
    }

    case "pull_request": {
      const hit = installationId ? await repoRow(installationId, p.repository.id) : null;
      if (!hit) return "repo not linked";
      const pr = await upsertPr(hit.repo, p.pull_request);
      if (!hit.repo.reviewEnabled) return "reviews off";
      if (["opened", "reopened", "synchronize", "ready_for_review"].includes(p.action)) {
        const trigger = p.action === "synchronize" ? "synchronize" : p.action === "ready_for_review" ? "ready_for_review" : "opened";
        return (await queueReview(pr, trigger, p.sender?.login ?? null)) ? "review queued" : "already reviewed";
      }
      if (p.action === "labeled") {
        // Only labels that the review settings turn reviews on with start a review: the repository's own settings
        // when it has them, else the org defaults. (Labels set only in countersign.json are applied by the worker on other triggers.)
        const rows = await db.select({ repoId: s.reviewConfigs.repoId, labels: s.reviewConfigs.includeLabels }).from(s.reviewConfigs)
          .where(and(eq(s.reviewConfigs.orgId, hit.repo.orgId), or(isNull(s.reviewConfigs.repoId), eq(s.reviewConfigs.repoId, hit.repo.id))));
        const cfg = rows.find((r) => r.repoId === hit.repo.id) ?? rows.find((r) => r.repoId === null);
        if (cfg?.labels.length && cfg.labels.includes(p.label?.name)) return (await queueReview(pr, "labeled", p.sender?.login ?? null)) ? "review queued" : "already reviewed";
      }
      return `pull request ${p.action}`;
    }

    case "issue_comment": {
      if (p.action !== "created" || !p.issue?.pull_request || p.comment?.user?.type === "Bot" || !mentionsBot(p.comment?.body)) return "ignored";
      if (!canTrigger(p.comment?.author_association)) return "not a collaborator";
      const hit = installationId ? await repoRow(installationId, p.repository.id) : null;
      if (!hit) return "repo not linked";
      if (!hit.repo.reviewEnabled) return "reviews off";
      try {
        await rateLimit(`mention:${hit.repo.id}:${p.issue.number}`, 10, 3600);
      } catch (e) {
        if (e instanceof RateLimitError) return "rate limited";
        throw e;
      }
      let [pr] = await db.select().from(s.pullRequests).where(and(eq(s.pullRequests.repoId, hit.repo.id), eq(s.pullRequests.number, p.issue.number)));
      if (!pr) {
        // Opened before the repository was linked: fetch it now.
        const { gitHost } = await import("./index");
        const info = await (await gitHost()).getPullRequest(installationId!, hit.repo.fullName, p.issue.number);
        pr = await upsertPr(hit.repo, {
          number: info.number, title: info.title, user: { login: info.authorLogin }, base: { ref: info.baseBranch }, head: { sha: info.headSha },
          state: info.state, merged: info.merged, draft: info.isDraft, labels: info.labels.map((name) => ({ name })), html_url: info.url,
          created_at: new Date().toISOString(),
        });
      }
      if (pr.state !== "open") return "pull request closed";
      return (await queueReview(pr, "mention", p.comment.user.login)) ? "review queued" : "already running";
    }

    case "pull_request_review_comment": {
      if (p.action !== "created" || p.comment?.user?.type === "Bot") return "ignored";
      const parent = p.comment?.in_reply_to_id as number | undefined;
      const [f] = parent ? await db.select().from(s.findings).where(eq(s.findings.providerCommentId, parent)) : [];
      if (!f) return recordHumanComment(installationId, p);
      await db.insert(s.feedback).values({ orgId: f.orgId, findingId: f.id, actorLogin: p.comment.user.login, kind: "reply", body: String(p.comment.body).slice(0, 4000), providerId: p.comment.id });
      if (mentionsBot(p.comment.body) && canTrigger(p.comment.author_association)) {
        await enqueue("answer-thread", { findingId: f.id, commentId: parent!, body: String(p.comment.body).slice(0, 4000), author: p.comment.user.login });
        return "answer queued";
      }
      return "reply recorded";
    }

    case "pull_request_review_thread": {
      const ids = (p.thread?.comments ?? []).map((c: Json) => c.id as number);
      if (!ids.length) return "no comments";
      const status = p.action === "resolved" ? "resolved" : "open";
      await db.update(s.findings).set({ status, resolvedAt: status === "resolved" ? now() : null, updatedAt: now() })
        .where(and(inArray(s.findings.providerCommentId, ids), status === "resolved" ? eq(s.findings.status, "open") : eq(s.findings.status, "resolved")));
      return `thread ${p.action}`;
    }

    case "push": {
      const hit = installationId ? await repoRow(installationId, p.repository.id) : null;
      if (!hit) return "repo not linked";
      if (p.ref !== `refs/heads/${p.repository.default_branch}`) return "not the default branch";
      await enqueue("index-repo", { repoId: hit.repo.id }, { singletonKey: hit.repo.id });
      return "re-index queued";
    }

    case "check_run": {
      if (p.action !== "rerequested" || String(p.check_run?.app?.id) !== String(process.env.GITHUB_APP_ID)) return "ignored";
      const prNumber = p.check_run?.pull_requests?.[0]?.number;
      const hit = installationId ? await repoRow(installationId, p.repository.id) : null;
      if (!hit || !prNumber) return "ignored";
      const [pr] = await db.select().from(s.pullRequests).where(and(eq(s.pullRequests.repoId, hit.repo.id), eq(s.pullRequests.number, prNumber)));
      if (!pr) return "pull request unknown";
      return (await queueReview(pr, "manual", p.sender?.login ?? null)) ? "review queued" : "already running";
    }

    case "repository": {
      if (p.action === "renamed" && installationId) {
        const hit = await repoRow(installationId, p.repository.id);
        if (hit) await db.update(s.repositories).set({ fullName: p.repository.full_name, updatedAt: now() }).where(eq(s.repositories.id, hit.repo.id));
      }
      return `repository ${p.action}`;
    }

    default:
      return "ignored";
  }
}
