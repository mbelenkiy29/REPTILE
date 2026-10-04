// Loads realistic fake data (invented people and repos, see src/lib/data/seed.ts) into an empty database.
// Usage: DATABASE_URL=... npx tsx db/seed.ts [--reset]
import { createHash, randomBytes } from "node:crypto";
import { createSeed } from "../src/lib/data/seed";
import { seedId } from "../src/db/ids";
import { closeDb, db, schema as s, sql } from "../src/db";

const id = (k: string | null | undefined) => (k ? seedId(k) : null);

export async function seed({ reset = false } = {}) {
  const x = createSeed();
  if (reset) {
    await sql().unsafe(`truncate users, organizations, webhook_deliveries, rate_limits, job_failures cascade`);
  }
  await db.transaction(async (tx) => {
    await tx.insert(s.users).values(x.users.map((u) => ({ id: id(u.id)!, name: u.name, email: u.email, githubLogin: u.githubLogin, emailVerified: new Date() })));
    await tx.insert(s.organizations).values(x.orgs.map((o) => ({
      id: id(o.id)!, name: o.name, slug: o.slug, plan: o.plan, trialEndsAt: o.trialEndsAt, includedReviewsPerSeat: o.includedReviewsPerSeat,
      billingStatus: o.billingStatus, createdAt: o.createdAt,
    })));
    await tx.insert(s.memberships).values(x.memberships.map((m) => ({ orgId: id(m.orgId)!, userId: id(m.userId)!, role: m.role, createdAt: m.createdAt })));
    await tx.insert(s.invites).values(x.invites.map((i) => ({
      id: id(i.id)!, orgId: id(i.orgId)!, email: i.email, role: i.role, invitedBy: id(i.invitedBy),
      tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"), expiresAt: i.expiresAt, createdAt: i.createdAt,
    })));
    await tx.insert(s.installations).values(x.installations.map((i) => ({
      id: id(i.id)!, orgId: id(i.orgId)!, provider: i.provider, externalInstallationId: i.externalInstallationId,
      accountLogin: i.accountLogin, accountType: i.accountType, suspendedAt: i.suspendedAt, createdAt: i.createdAt,
    })));
    await tx.insert(s.repositories).values(x.repos.map((r, n) => ({
      id: id(r.id)!, orgId: id(r.orgId)!, installationId: id(r.installationId)!, providerRepoId: 700000 + n, fullName: r.fullName,
      defaultBranch: r.defaultBranch, private: r.private, reviewEnabled: r.reviewEnabled, indexStatus: r.indexStatus, indexError: r.indexError,
      indexedSha: r.indexedSha, filesIndexed: r.filesIndexed, lastIndexedAt: r.lastIndexedAt, createdAt: r.createdAt,
    })));
    await tx.insert(s.reviewConfigs).values(x.configs.map((c) => ({
      orgId: id(c.orgId)!, repoId: id(c.repoId), strictness: c.strictness, commentTypes: c.commentTypes, reviewDrafts: c.reviewDrafts,
      includeLabels: c.includeLabels, disabledLabels: c.disabledLabels, includeAuthors: c.includeAuthors, excludeAuthors: c.excludeAuthors,
      includeBranches: c.includeBranches, excludeBranches: c.excludeBranches, ignorePatterns: c.ignorePatterns, summaryOptions: c.summary,
      updatedBy: id(c.updatedBy), updatedAt: c.updatedAt,
    })));
    await tx.insert(s.rules).values(x.rules.map((r) => ({
      id: id(r.id)!, orgId: id(r.orgId)!, text: r.text, kind: r.kind, source: r.source, status: r.status, repoIds: r.repoIds.map((k) => id(k)!),
      pathGlobs: r.pathGlobs, evidence: r.evidence, createdBy: id(r.createdBy), createdAt: r.createdAt, updatedAt: r.updatedAt,
    })));
    await tx.insert(s.pullRequests).values(x.prs.map((p) => ({
      id: id(p.id)!, orgId: id(p.orgId)!, repoId: id(p.repoId)!, number: p.number, title: p.title, authorLogin: p.authorLogin,
      baseBranch: p.baseBranch, headSha: p.headSha, state: p.state, isDraft: p.isDraft, labels: p.labels, url: p.url,
      openedAt: p.openedAt, mergedAt: p.mergedAt, closedAt: p.state === "closed" ? p.openedAt : null,
    })));
    await tx.insert(s.reviews).values(x.reviews.map((r) => ({
      id: id(r.id)!, orgId: id(r.orgId)!, pullRequestId: id(r.pullRequestId)!, headSha: r.headSha, trigger: r.trigger, status: r.status,
      skipReason: r.skipReason, error: r.error, confidenceScore: r.confidenceScore, verdict: r.verdict, summaryMd: r.summaryMd,
      diagramMermaid: r.diagramMermaid, filesReviewed: r.filesReviewed, checked: r.checked, creditsUsed: r.creditsUsed,
      queuedAt: r.queuedAt, startedAt: r.status === "queued" ? null : r.queuedAt, completedAt: r.completedAt,
    })));
    await tx.insert(s.findings).values(x.findings.map((f) => ({
      id: id(f.id)!, orgId: id(f.orgId)!, pullRequestId: id(f.pullRequestId)!, firstReviewId: id(f.firstReviewId)!,
      lastSeenReviewId: id(f.lastSeenReviewId)!, fingerprint: `${f.fingerprint}-${f.id}`, filePath: f.filePath, lineStart: f.lineStart,
      lineEnd: f.lineEnd, inDiff: f.inDiff, severity: f.severity, type: f.type, title: f.title, bodyMd: f.bodyMd, suggestion: f.suggestion,
      ruleId: id(f.ruleId), status: f.status, createdAt: f.createdAt,
    })));
    const fb = x.findings.flatMap((f) => [
      ...(f.thumbsUp ? [{ orgId: id(f.orgId)!, findingId: id(f.id)!, actorLogin: "priya-r", kind: "thumbs_up" as const }] : []),
      ...(f.thumbsDown ? [{ orgId: id(f.orgId)!, findingId: id(f.id)!, actorLogin: "mateo-silva", kind: "thumbs_down" as const }] : []),
    ]);
    if (fb.length) await tx.insert(s.feedback).values(fb);
    await tx.insert(s.knowledgeDocs).values(x.knowledge.map((k) => ({
      id: id(k.id)!, orgId: id(k.orgId)!, repoId: id(k.repoId)!, path: k.path, title: k.title, bodyMd: k.bodyMd,
      editedBy: id(k.editedBy), editedAt: k.editedBy ? k.updatedAt : null, updatedAt: k.updatedAt,
    })));
    await tx.insert(s.apiKeys).values(x.apiKeys.map((k) => ({
      id: id(k.id)!, orgId: id(k.orgId)!, name: k.name, prefix: k.prefix, keyHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
      createdBy: id(k.createdBy), lastUsedAt: k.lastUsedAt, revokedAt: k.revokedAt, createdAt: k.createdAt,
    })));
    await tx.insert(s.integrations).values(x.integrations.map((i) => ({
      orgId: id(i.orgId)!, kind: i.kind, status: i.status, detail: i.detail, credentialsEncrypted: Buffer.alloc(0), updatedAt: i.updatedAt,
    })));
    await tx.insert(s.usageEvents).values(x.usage.map((u) => ({ orgId: id(u.orgId)!, reviewId: id(u.reviewId), credits: u.credits, periodStart: u.periodStart })));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed({ reset: process.argv.includes("--reset") })
    .then(() => console.log("seeded"))
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => closeDb());
}
