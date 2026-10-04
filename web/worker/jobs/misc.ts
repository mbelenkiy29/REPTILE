// The smaller jobs: answer-thread, sync-reactions, learn-rules, cleanup, billing-emails, send-email.
import { and, desc, eq, gte, inArray, isNotNull, lt, sql as dsql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { failStaleReviews } from "@/lib/review/stale";
import { gitHost } from "@/lib/github";
import { sendEmail } from "@/lib/email";
import { enqueue } from "@/lib/jobs";
import { reviewModel } from "../ai";

const now = () => new Date().toISOString();
const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Reply in the thread under one of our comments. */
export async function answerThread(d: { findingId: string; commentId: number; body: string; author: string }) {
  const [row] = await db.select({ f: s.findings, pr: s.pullRequests, repo: s.repositories, inst: s.installations }).from(s.findings)
    .innerJoin(s.pullRequests, eq(s.pullRequests.id, s.findings.pullRequestId))
    .innerJoin(s.repositories, eq(s.repositories.id, s.pullRequests.repoId))
    .innerJoin(s.installations, eq(s.installations.id, s.repositories.installationId))
    .where(eq(s.findings.id, d.findingId));
  if (!row) return { result: "gone" };
  const gh = await gitHost();
  const file = await gh.getFile(row.inst.externalInstallationId, row.repo.fullName, row.f.filePath, row.pr.headSha).catch(() => null);
  const code = file ? file.split("\n").slice(Math.max(0, row.f.lineStart - 15), row.f.lineEnd + 15).join("\n") : null;
  const { text } = await (await reviewModel()).answer({
    repo: row.repo.fullName, question: d.body,
    finding: { title: row.f.title, body: row.f.bodyMd, file: row.f.filePath, line: row.f.lineStart }, code,
  });
  await gh.replyToReviewComment(row.inst.externalInstallationId, row.repo.fullName, row.pr.number, d.commentId, text);
  return { result: "answered" };
}

/** GitHub has no reaction webhooks: poll 👍/👎 on our comments from the last 14 days. */
export async function syncReactions(limit = 500) {
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const rows = await db.select({ f: s.findings, repo: s.repositories.fullName, inst: s.installations.externalInstallationId }).from(s.findings)
    .innerJoin(s.pullRequests, eq(s.pullRequests.id, s.findings.pullRequestId))
    .innerJoin(s.repositories, eq(s.repositories.id, s.pullRequests.repoId))
    .innerJoin(s.installations, eq(s.installations.id, s.repositories.installationId))
    .where(and(isNotNull(s.findings.providerCommentId), gte(s.findings.createdAt, since)))
    .limit(limit);
  const gh = await gitHost();
  let added = 0;
  for (const { f, repo, inst } of rows) {
    const reactions = await gh.listCommentReactions(inst, repo, f.providerCommentId!).catch(() => []);
    const values = reactions.filter((r) => r.content === "+1" || r.content === "-1").map((r) => ({
      orgId: f.orgId, findingId: f.id, actorLogin: r.login, kind: (r.content === "+1" ? "thumbs_up" : "thumbs_down") as "thumbs_up" | "thumbs_down", providerId: r.id,
    }));
    if (values.length) added += (await db.insert(s.feedback).values(values).onConflictDoNothing().returning({ id: s.feedback.id })).length;
    // A 👎 dismisses the finding, so it isn't repeated on later pushes (and feeds learn-rules).
    if (values.some((v) => v.kind === "thumbs_down") && f.status === "open") {
      await db.update(s.findings).set({ status: "dismissed", updatedAt: now() }).where(eq(s.findings.id, f.id));
    }
  }
  return { result: "synced", checked: rows.length, added };
}

/** Propose rules from the last 30 days of 👎 and replies. Suggestions only; an admin accepts them. */
export async function learnRules() {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const kinds = ["thumbs_down", "reply", "human_comment"] as const;
  const orgs = await db.selectDistinct({ orgId: s.feedback.orgId }).from(s.feedback)
    .where(and(gte(s.feedback.createdAt, since), inArray(s.feedback.kind, kinds)));
  const model = await reviewModel();
  let proposed = 0;
  for (const { orgId } of orgs) {
    // Feedback on REPTILE's findings, and the team's own review comments (no finding; PR and file on the row).
    const fb = await db.select({ fb: s.feedback, f: s.findings, url: s.pullRequests.url }).from(s.feedback)
      .leftJoin(s.findings, eq(s.findings.id, s.feedback.findingId))
      .innerJoin(s.pullRequests, eq(s.pullRequests.id, dsql`coalesce(${s.feedback.pullRequestId}, ${s.findings.pullRequestId})`))
      .where(and(eq(s.feedback.orgId, orgId), gte(s.feedback.createdAt, since), inArray(s.feedback.kind, kinds)))
      .orderBy(desc(s.feedback.createdAt))
      .limit(80);
    if (fb.length < 2) continue;
    const existing = await db.select({ text: s.rules.text }).from(s.rules).where(eq(s.rules.orgId, orgId));
    const quote = (t: string | null) => `"${(t ?? "").slice(0, 300)}"`;
    const evidence = fb.map(({ fb: x, f }) =>
      x.kind === "thumbs_down" ? `👎 on "${f!.title}" in ${f!.filePath}`
      : x.kind === "reply" ? `Reply to "${f!.title}" in ${f!.filePath}: ${quote(x.body)}`
      : `Reviewer comment on ${x.filePath ?? "the pull request"}: ${quote(x.body)}`);
    const { out } = await model.proposeRules({ evidence, existing: existing.map((r) => r.text) });
    const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const known = new Set(existing.map((r) => norm(r.text)));
    for (const r of out.rules.slice(0, 5)) {
      if (known.has(norm(r.text)) || r.text.length < 10) continue;
      await db.insert(s.rules).values({
        orgId, text: r.text.slice(0, 4000), kind: "rule", source: "learned", status: "suggested", repoIds: [], pathGlobs: r.path_globs.slice(0, 10),
        evidence: r.evidence_indexes.filter((i) => fb[i]).slice(0, 10).map((i) => ({
          kind: fb[i].fb.kind === "thumbs_down" ? "thumbs_down" as const : "human_comment" as const, url: fb[i].url, excerpt: evidence[i].slice(0, 200),
        })),
      });
      proposed++;
    }
  }
  return { result: "done", proposed };
}

/** Daily housekeeping. Removed repositories lose their code index after 7 days; history stays. */
export async function cleanup() {
  const day = 864e5;
  await db.delete(s.webhookDeliveries).where(lt(s.webhookDeliveries.receivedAt, new Date(Date.now() - 30 * day).toISOString()));
  await db.delete(s.rateLimits).where(lt(s.rateLimits.windowStart, new Date(Date.now() - 2 * day).toISOString()));
  await db.delete(s.invites).where(and(lt(s.invites.expiresAt, new Date(Date.now() - 7 * day).toISOString())));
  await db.delete(s.sessions).where(lt(s.sessions.expires, new Date()));
  await db.delete(s.verificationTokens).where(lt(s.verificationTokens.expires, new Date()));
  const gone = await db.select({ id: s.repositories.id }).from(s.repositories).where(lt(s.repositories.removedAt, new Date(Date.now() - 7 * day).toISOString()));
  if (gone.length) {
    await db.delete(s.codeChunks).where(inArray(s.codeChunks.repoId, gone.map((r) => r.id)));
    await db.delete(s.knowledgeDocs).where(inArray(s.knowledgeDocs.repoId, gone.map((r) => r.id)));
  }
  await db.delete(s.jobFailures).where(lt(s.jobFailures.createdAt, new Date(Date.now() - 90 * day).toISOString()));
  const stale = await failStaleReviews();
  return { result: "clean", purgedRepos: gone.length, staleReviews: stale.length };
}

/** Trials ending in about 3 days get one email per admin. */
export async function billingEmails() {
  const from = new Date(Date.now() + 2 * 864e5).toISOString();
  const to = new Date(Date.now() + 3 * 864e5).toISOString();
  const orgs = await db.select().from(s.organizations).where(and(eq(s.organizations.plan, "trial"), gte(s.organizations.trialEndsAt, from), lt(s.organizations.trialEndsAt, to)));
  let sent = 0;
  for (const o of orgs) {
    // One per org: the rate-limit table doubles as a "sent" marker for the 3-day window.
    const marker = await db.execute(dsql`insert into rate_limits (key, window_start, count) values (${`trial-email:${o.id}`}, ${o.trialEndsAt}::timestamptz, 1) on conflict do nothing returning key`);
    if (!marker.length) continue;
    const admins = await db.select({ email: s.users.email }).from(s.memberships).innerJoin(s.users, eq(s.users.id, s.memberships.userId))
      .where(and(eq(s.memberships.orgId, o.id), eq(s.memberships.role, "admin")));
    for (const a of admins) if (a.email) { await enqueue("send-email", { to: a.email, template: "trial-ending", vars: { org: o.name, days: "3", url: `${appUrl()}/settings/billing` } }); sent++; }
  }
  return { result: "done", sent };
}

export async function sendEmailJob(d: { to: string; template: string; vars: Record<string, string> }) {
  await sendEmail(d.to, d.template, d.vars);
  return { result: "sent" };
}
