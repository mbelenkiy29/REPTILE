// Seed data for the fake data layer. Everything here is invented for REPTILE.
// Deterministic: a seeded PRNG, with dates relative to the moment the store is created.
import { DEFAULT_CONFIG } from "@/lib/review/defaults";
import type {
  ApiKey, Finding, FindingStatus, FindingType, Installation, Integration, Invite, KnowledgeDoc, Membership,
  Organization, PullRequest, Repository, Review, Rule, Severity, StoredReviewConfig, UsageEvent, User,
} from "./types";

export interface Store {
  users: User[];
  orgs: Organization[];
  memberships: Membership[];
  invites: Invite[];
  installations: Installation[];
  repos: Repository[];
  configs: StoredReviewConfig[];
  rules: Rule[];
  prs: PullRequest[];
  reviews: Review[];
  findings: Finding[];
  knowledge: KnowledgeDoc[];
  apiKeys: ApiKey[];
  integrations: Integration[];
  usage: UsageEvent[];
  seq: number;
}

export { DEFAULT_CONFIG };

function prng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;

export const ME = "u_jordan";

// Finding templates: the kind of issue a reviewer would raise. Written for this seed.
const TEMPLATES: { severity: Severity; type: FindingType; title: string; body: string; path: string; suggestion?: string }[] = [
  {
    severity: "P0", type: "logic", path: "src/billing/retry.ts",
    title: "Retry loop can charge the card twice",
    body: "`chargeInvoice` is retried on any error, including a timeout after the provider already accepted the charge. Without an idempotency key the second attempt creates a new charge.",
    suggestion: "await provider.charge(invoice.id, { idempotencyKey: `invoice-${invoice.id}` });",
  },
  {
    severity: "P0", type: "security", path: "src/api/routes/export.ts",
    title: "Export endpoint skips the org check",
    body: "The handler loads the report by id but never compares `report.orgId` with the caller's org, so any signed-in user can download another org's export by guessing ids.",
    suggestion: "if (report.orgId !== ctx.orgId) throw new NotFoundError();",
  },
  {
    severity: "P1", type: "logic", path: "src/jobs/sync.ts",
    title: "Cursor is saved before the batch is written",
    body: "If the insert fails after `saveCursor` runs, the next sync starts past the failed batch and those rows are never imported. Save the cursor after the write succeeds, in the same transaction.",
  },
  {
    severity: "P1", type: "logic", path: "src/web/hooks/useSearch.ts",
    title: "Stale results can overwrite newer ones",
    body: "Responses are applied in arrival order. A slow request for an older query can land after a fast one for the current query and replace its results. Track the latest request and ignore older responses.",
  },
  {
    severity: "P1", type: "security", path: "src/api/upload.ts",
    title: "File name is used in the storage path unescaped",
    body: "`file.name` goes straight into the object key. A name like `../../config.json` escapes the user's folder on backends that resolve paths. Generate the key server-side.",
    suggestion: "const key = `${ctx.orgId}/${crypto.randomUUID()}${extname(file.name)}`;",
  },
  {
    severity: "P1", type: "syntax", path: "src/lib/date.ts",
    title: "Missing await on the timezone lookup",
    body: "`getTimezone` returns a promise, so `tz` is always a Promise object here and every date falls back to UTC.",
    suggestion: "const tz = await getTimezone(user.id);",
  },
  {
    severity: "P2", type: "style", path: "src/web/components/Table.tsx",
    title: "Index used as the React key",
    body: "Rows can be re-sorted and filtered, so index keys make React reuse the wrong row state (open menus, checkboxes). Use `row.id`.",
    suggestion: "{rows.map((row) => <Row key={row.id} row={row} />)}",
  },
  {
    severity: "P2", type: "logic", path: "src/api/pagination.ts",
    title: "Off-by-one on the last page",
    body: "`hasMore` compares with `>=` against the page size, so a result set that exactly fills the page reports another page that comes back empty.",
  },
  {
    severity: "P2", type: "style", path: "src/services/email.ts",
    title: "Duplicated template rendering",
    body: "This block repeats `renderTemplate` from `notifications.ts` with one argument changed. Reusing it keeps escaping rules in one place.",
  },
  {
    severity: "P2", type: "syntax", path: "src/config/env.ts",
    title: "Unused import left behind",
    body: "`parseBoolean` is no longer used after this change.",
  },
];

const PR_TITLES = [
  "Add idempotency to invoice retries", "Move export to background job", "Search: debounce and cancel stale requests",
  "Upgrade auth library", "Bulk import for contacts", "Fix timezone handling in reminders", "Add rate limiting to public API",
  "Refactor table component", "Paginate audit log", "Dark mode for settings", "Cache feature flags per request",
  "Remove legacy webhook handler", "Add retries to Slack notifications", "Split billing service", "Speed up dashboard query",
  "Support SSO domain verification", "Add CSV export for reports", "Clean up env parsing",
];

const AUTHORS = ["jordanlee", "priya-r", "mateo-silva", "ada-okafor", "samwu", "dependabot[bot]"];

export function createSeed(now = Date.now()): Store {
  const rnd = prng(42);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const iso = (t: number) => new Date(t).toISOString();
  const sha = () => Math.floor(rnd() * 0xfffffff).toString(16).padStart(7, "0");

  const users: User[] = [
    { id: ME, name: "Jordan Lee", email: "jordan@acme.dev", githubLogin: "jordanlee" },
    { id: "u_priya", name: "Priya Raman", email: "priya@acme.dev", githubLogin: "priya-r" },
    { id: "u_mateo", name: "Mateo Silva", email: "mateo@acme.dev", githubLogin: "mateo-silva" },
    { id: "u_ada", name: "Ada Okafor", email: "ada@acme.dev", githubLogin: "ada-okafor" },
    { id: "u_sam", name: "Sam Wu", email: "sam@acme.dev", githubLogin: "samwu" },
    { id: "u_lena", name: "Lena Fischer", email: "lena@contoso.dev", githubLogin: "lenaf" },
  ];

  const orgs: Organization[] = [
    { id: "o_acme", name: "Acme", slug: "acme", plan: "pro", trialEndsAt: null, includedReviewsPerSeat: 50, billingStatus: "active", createdAt: iso(now - 120 * DAY) },
    { id: "o_side", name: "Side project", slug: "side-project", plan: "trial", trialEndsAt: iso(now + 3 * DAY), includedReviewsPerSeat: 50, billingStatus: "none", createdAt: iso(now - 11 * DAY) },
    { id: "o_contoso", name: "Contoso", slug: "contoso", plan: "pro", trialEndsAt: null, includedReviewsPerSeat: 50, billingStatus: "active", createdAt: iso(now - 300 * DAY) },
    { id: "o_solo", name: "Solo", slug: "solo", plan: "free", trialEndsAt: null, includedReviewsPerSeat: 50, billingStatus: "none", createdAt: iso(now - 60 * DAY) },
  ];

  const memberships: Membership[] = [
    { orgId: "o_acme", userId: ME, role: "admin", createdAt: iso(now - 120 * DAY) },
    { orgId: "o_acme", userId: "u_priya", role: "admin", createdAt: iso(now - 110 * DAY) },
    { orgId: "o_acme", userId: "u_mateo", role: "member", createdAt: iso(now - 90 * DAY) },
    { orgId: "o_acme", userId: "u_ada", role: "member", createdAt: iso(now - 60 * DAY) },
    { orgId: "o_acme", userId: "u_sam", role: "member", createdAt: iso(now - 20 * DAY) },
    { orgId: "o_side", userId: ME, role: "admin", createdAt: iso(now - 11 * DAY) },
    { orgId: "o_contoso", userId: "u_lena", role: "admin", createdAt: iso(now - 300 * DAY) },
    { orgId: "o_contoso", userId: ME, role: "member", createdAt: iso(now - 40 * DAY) },
    { orgId: "o_solo", userId: ME, role: "admin", createdAt: iso(now - 60 * DAY) },
  ];

  const invites: Invite[] = [
    { id: "inv_1", orgId: "o_acme", email: "new.hire@acme.dev", role: "member", invitedBy: ME, expiresAt: iso(now + 5 * DAY), createdAt: iso(now - 2 * DAY) },
  ];

  const installations: Installation[] = [
    { id: "ins_acme", orgId: "o_acme", provider: "github", externalInstallationId: 51200871, accountLogin: "acme", accountType: "Organization", suspendedAt: null, createdAt: iso(now - 119 * DAY) },
    { id: "ins_contoso", orgId: "o_contoso", provider: "github", externalInstallationId: 50210044, accountLogin: "contoso", accountType: "Organization", suspendedAt: null, createdAt: iso(now - 299 * DAY) },
  ];

  const repo = (id: string, orgId: string, inst: string, name: string, extra: Partial<Repository> = {}): Repository => ({
    id, orgId, installationId: inst, fullName: name, defaultBranch: "main", private: true, reviewEnabled: true,
    indexStatus: "completed", indexError: null, indexedSha: sha(), filesIndexed: 400 + Math.floor(rnd() * 3000),
    lastIndexedAt: iso(now - Math.floor(rnd() * 48) * HOUR), createdAt: iso(now - 119 * DAY), ...extra,
  });

  const repos: Repository[] = [
    repo("r_api", "o_acme", "ins_acme", "acme/api"),
    repo("r_web", "o_acme", "ins_acme", "acme/web"),
    repo("r_mobile", "o_acme", "ins_acme", "acme/mobile", { indexStatus: "processing", indexedSha: null, filesIndexed: 0, lastIndexedAt: null, createdAt: iso(now - HOUR) }),
    repo("r_infra", "o_acme", "ins_acme", "acme/infra", {
      indexStatus: "failed", indexError: "The clone timed out after 10 minutes. Very large binary files usually cause this; add them to ignore patterns and re-index.",
    }),
    repo("r_legacy", "o_acme", "ins_acme", "acme/legacy-billing", { reviewEnabled: false }),
    // 60 characters on purpose: long-name layouts.
    repo("r_long", "o_acme", "ins_acme", "acme/platform-observability-and-incident-response-tooling-v2"),
    repo("r_contoso", "o_contoso", "ins_contoso", "contoso/storefront"),
  ];

  const configs: StoredReviewConfig[] = [
    { ...DEFAULT_CONFIG, orgId: "o_acme", repoId: null, ignorePatterns: ["**/*.generated.ts", "dist/**"], disabledLabels: ["no-review"], excludeAuthors: ["dependabot[bot]"], updatedAt: iso(now - 9 * DAY), updatedBy: ME },
    { ...DEFAULT_CONFIG, orgId: "o_acme", repoId: "r_web", strictness: 3, updatedAt: iso(now - 4 * DAY), updatedBy: "u_priya" },
    { ...DEFAULT_CONFIG, orgId: "o_side", repoId: null, updatedAt: iso(now - 11 * DAY), updatedBy: ME },
    { ...DEFAULT_CONFIG, orgId: "o_solo", repoId: null, updatedAt: iso(now - 60 * DAY), updatedBy: ME },
    { ...DEFAULT_CONFIG, orgId: "o_contoso", repoId: null, updatedAt: iso(now - 200 * DAY), updatedBy: "u_lena" },
  ];

  const rules: Rule[] = [
    {
      id: "rule_1", orgId: "o_acme", kind: "rule", source: "manual", status: "active", repoIds: [], pathGlobs: [],
      text: "Every query that reads tenant data must filter by the caller's org id, even when the id looks unguessable.",
      evidence: [], createdBy: ME, createdAt: iso(now - 60 * DAY), updatedAt: iso(now - 60 * DAY),
    },
    {
      id: "rule_2", orgId: "o_acme", kind: "rule", source: "manual", status: "active", repoIds: ["r_web"], pathGlobs: ["src/web/**/*.tsx"],
      text: "Components don't fetch data directly; they receive it from a server component or a hook in src/web/hooks.",
      evidence: [], createdBy: "u_priya", createdAt: iso(now - 30 * DAY), updatedAt: iso(now - 30 * DAY),
    },
    {
      id: "rule_3", orgId: "o_acme", kind: "style_guide", source: "file", status: "active", repoIds: ["r_api"], pathGlobs: [],
      text: "From CLAUDE.md in acme/api: use the shared `logger`, never console.log, and include the request id in every log line.",
      evidence: [], createdBy: null, createdAt: iso(now - 20 * DAY), updatedAt: iso(now - 20 * DAY),
    },
    {
      id: "rule_4", orgId: "o_acme", kind: "rule", source: "learned", status: "suggested", repoIds: [], pathGlobs: ["**/*.test.ts"],
      text: "Don't flag missing error handling in test files; the team treats thrown errors as test failures.",
      evidence: [
        { kind: "thumbs_down", url: "https://github.com/acme/api/pull/412#discussion_r1", excerpt: "👎 on “Unhandled promise rejection in test setup”" },
        { kind: "thumbs_down", url: "https://github.com/acme/web/pull/233#discussion_r2", excerpt: "👎 on “Missing try/catch around fixture load”" },
        { kind: "human_comment", url: "https://github.com/acme/api/pull/418#discussion_r3", excerpt: "“tests are allowed to throw, that's the point”" },
      ],
      createdBy: null, createdAt: iso(now - 2 * DAY), updatedAt: iso(now - 2 * DAY),
    },
    {
      id: "rule_5", orgId: "o_acme", kind: "rule", source: "learned", status: "suggested", repoIds: ["r_api"], pathGlobs: [],
      text: "Money amounts are integers in cents; flag any arithmetic on prices that uses floating point.",
      evidence: [
        { kind: "human_comment", url: "https://github.com/acme/api/pull/401#discussion_r4", excerpt: "“please keep this in cents, floats bit us last quarter”" },
        { kind: "human_comment", url: "https://github.com/acme/api/pull/409#discussion_r5", excerpt: "“same as before: integer cents”" },
      ],
      createdBy: null, createdAt: iso(now - DAY), updatedAt: iso(now - DAY),
    },
  ];

  const prs: PullRequest[] = [];
  const reviews: Review[] = [];
  const findings: Finding[] = [];
  const usage: UsageEvent[] = [];
  const acmeReviewable = repos.filter((r) => r.orgId === "o_acme" && r.indexStatus === "completed" && r.reviewEnabled);
  let n = 380;
  let fid = 0;

  for (let i = 0; i < 64; i++) {
    const r = i === 0 ? repos[0] : pick(acmeReviewable);
    const opened = now - Math.floor(rnd() * 30 * DAY) - 2 * HOUR;
    const author = i === 0 ? "priya-r" : pick(AUTHORS);
    const draft = i !== 0 && rnd() < 0.06;
    const merged = i !== 0 && !draft && rnd() < 0.7 && opened < now - 6 * HOUR;
    const pr: PullRequest = {
      id: `pr_${i}`, orgId: r.orgId, repoId: r.id, number: n++, title: i === 0 ? PR_TITLES[0] : pick(PR_TITLES),
      authorLogin: author, baseBranch: "main", headSha: sha(), state: merged ? "merged" : i !== 0 && rnd() < 0.1 ? "closed" : "open",
      isDraft: draft, labels: rnd() < 0.3 ? ["backend"] : [], url: `https://github.com/${r.fullName}/pull/${n - 1}`,
      openedAt: iso(opened), mergedAt: merged ? iso(opened + (2 + rnd() * 40) * HOUR) : null,
    };
    prs.push(pr);

    const skipped = draft || author === "dependabot[bot]";
    const failed = i !== 0 && !skipped && rnd() < 0.04;
    const running = i === 1;
    const status: Review["status"] = running ? "running" : skipped ? "skipped" : failed ? "failed" : "completed";
    const reviewId = `rev_${i}`;
    const nFindings = status === "completed" ? (i === 0 ? 4 : Math.floor(rnd() * 5)) : 0;
    const chosen = i === 0 ? TEMPLATES.slice(0, 4) : Array.from({ length: nFindings }, () => pick(TEMPLATES));
    const hasP0 = chosen.some((t) => t.severity === "P0");
    const score = (status === "completed" ? (hasP0 ? 2 : nFindings > 2 ? 3 : nFindings ? 4 : 5) : null) as Review["confidenceScore"];
    const verdict = score === null ? null
      : score <= 2 ? "Fix the critical issues before merging"
      : score === 3 ? "Safe to merge after the fixes below"
      : score === 4 ? "Safe to merge; minor follow-ups"
      : "Safe to merge";

    reviews.push({
      id: reviewId, orgId: r.orgId, pullRequestId: pr.id, headSha: pr.headSha,
      trigger: rnd() < 0.15 ? "mention" : "opened", status,
      skipReason: skipped ? (draft ? "Draft pull request" : "Author is excluded in review settings") : null,
      error: failed ? "The model request timed out twice. Comment @reptile to try again." : null,
      confidenceScore: score, verdict,
      summaryMd: status === "completed"
        ? `${pr.title}. The change touches ${2 + (i % 5)} files in the ${r.fullName.split("/")[1]} service.`
        : null,
      diagramMermaid: status === "completed"
        ? "sequenceDiagram\n  participant C as Client\n  participant A as API\n  participant Q as Queue\n  C->>A: POST /exports\n  A->>Q: enqueue(export)\n  A-->>C: 202 Accepted\n  Q->>A: export.done\n"
        : null,
      filesReviewed: status === "completed"
        ? [...new Set(chosen.map((t) => t.path))].concat(["README.md"]).map((p) => ({ path: p, summary: `Updated ${p.split("/").pop()}` }))
        : [],
      checked: status === "completed" ? ["Error handling on new code paths", "Tenant isolation in queries", "Behaviour of retries and timeouts"] : [],
      creditsUsed: status === "completed" || status === "failed" ? 1 : 0,
      queuedAt: iso(opened + 30_000), completedAt: status === "completed" || status === "failed" ? iso(opened + (90 + rnd() * 200) * 1000) : null,
    });

    chosen.forEach((t, k) => {
      const statusRoll = rnd();
      const fStatus: FindingStatus = pr.state === "merged" ? (statusRoll < 0.62 ? "addressed" : statusRoll < 0.8 ? "resolved" : "dismissed") : "open";
      findings.push({
        id: `f_${fid++}`, orgId: r.orgId, pullRequestId: pr.id, firstReviewId: reviewId, lastSeenReviewId: reviewId,
        fingerprint: `${t.path}:${t.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        filePath: t.path, lineStart: 20 + k * 17, lineEnd: 22 + k * 17, inDiff: !(i === 0 && k === 3),
        severity: t.severity, type: t.type, title: t.title, bodyMd: t.body, suggestion: t.suggestion ?? null,
        ruleId: t.type === "security" && t.title.includes("org check") ? "rule_1" : null,
        status: fStatus, thumbsUp: rnd() < 0.4 ? 1 : 0, thumbsDown: rnd() < 0.08 ? 1 : 0, createdAt: iso(opened + 200_000),
      });
    });

    if (status === "completed" || status === "failed") {
      const d = new Date(opened);
      usage.push({ orgId: r.orgId, reviewId, credits: 1, periodStart: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01` });
    }
  }
  // Newest first, like every list in the app.
  prs.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  reviews.sort((a, b) => b.queuedAt.localeCompare(a.queuedAt));

  const knowledge: KnowledgeDoc[] = [
    {
      id: "kb_1", orgId: "o_acme", repoId: "r_api", path: "index", title: "acme/api at a glance", editedBy: null, updatedAt: iso(now - 3 * DAY),
      bodyMd: "## What this service does\n\nThe API serves the web and mobile apps. It owns accounts, billing and exports.\n\n## Layout\n\n- `src/api/routes`: HTTP handlers, one file per resource\n- `src/services`: business logic, no HTTP types\n- `src/jobs`: background jobs run by the worker\n\n## Glossary\n\n- **Tenant**: an organization; every table has `org_id`\n- **Credit**: one billable review\n",
    },
    {
      id: "kb_2", orgId: "o_acme", repoId: "r_api", path: "area/billing", title: "Billing", editedBy: "u_priya", updatedAt: iso(now - 6 * DAY),
      bodyMd: "## How a charge happens\n\n1. `invoice.finalize` job builds the invoice\n2. `chargeInvoice` calls the payment provider with an idempotency key\n3. Webhooks confirm or fail the charge\n\n## Risks\n\n- Retries without idempotency keys double-charge (see reverts)\n- Amounts are integer cents everywhere\n",
    },
    {
      id: "kb_3", orgId: "o_acme", repoId: "r_api", path: "area/exports", title: "Exports", editedBy: null, updatedAt: iso(now - 3 * DAY),
      bodyMd: "## Flow\n\nExports are requested over HTTP, built by a background job and stored for 7 days.\n\n## Risks\n\n- Every export lookup must check `org_id`\n",
    },
    {
      id: "kb_4", orgId: "o_acme", repoId: "r_api", path: "reverts", title: "Reverts and incidents", editedBy: null, updatedAt: iso(now - 3 * DAY),
      bodyMd: "- **#291 Revert retry change**: removing the idempotency key caused duplicate charges for 40 minutes.\n- **#318 Revert cache layer**: cached feature flags leaked between tenants.\n",
    },
    {
      id: "kb_5", orgId: "o_acme", repoId: "r_web", path: "index", title: "acme/web at a glance", editedBy: null, updatedAt: iso(now - 2 * DAY),
      bodyMd: "## What this app does\n\nThe customer-facing web app.\n\n## Layout\n\n- `src/web/pages`: routes\n- `src/web/components`: UI\n- `src/web/hooks`: data fetching\n",
    },
  ];

  const apiKeys: ApiKey[] = [
    { id: "key_1", orgId: "o_acme", name: "CI pipeline", prefix: "rpt_7Hc2", createdBy: ME, lastUsedAt: iso(now - 3 * HOUR), revokedAt: null, createdAt: iso(now - 50 * DAY) },
    { id: "key_2", orgId: "o_acme", name: "Local CLI (Priya)", prefix: "rpt_Qm81", createdBy: "u_priya", lastUsedAt: null, revokedAt: null, createdAt: iso(now - 5 * DAY) },
  ];

  const integrations: Integration[] = [
    { orgId: "o_acme", kind: "linear", status: "connected", detail: "Workspace: acme", updatedAt: iso(now - 30 * DAY) },
    { orgId: "o_acme", kind: "slack", status: "error", detail: "The bot was removed from #eng-reviews.", updatedAt: iso(now - DAY) },
  ];

  return {
    users, orgs, memberships, invites, installations, repos, configs, rules, prs, reviews, findings,
    knowledge, apiKeys, integrations, usage, seq: 1000,
  };
}
