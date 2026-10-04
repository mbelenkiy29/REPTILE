// Drizzle mirror of db/migrations/*.sql, for typed queries. The SQL files are the source of truth;
// src/db/schema.test.ts fails if a column here doesn't exist in the migrated database.
import {
  bigint, boolean, customType, date, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp, uuid, vector,
} from "drizzle-orm/pg-core";
import type { FindingType, ReviewConfig } from "@/lib/data/types";

const citext = customType<{ data: string }>({ dataType: () => "citext" });
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const created = () => ts("created_at").notNull().defaultNow();
const updated = () => ts("updated_at").notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  // citext in the database (case-insensitive); declared as text so the Auth.js adapter accepts the table.
  email: text("email").unique(),
  name: text("name"),
  image: text("image"),
  githubLogin: text("github_login").unique(),
  // Auth.js reads emailVerified as a Date.
  emailVerified: timestamp("email_verified", { withTimezone: true, mode: "date" }),
  createdAt: created(),
  updatedAt: updated(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  access_token: text("access_token"),
  refresh_token: text("refresh_token"),
  expires_at: bigint("expires_at", { mode: "number" }),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
  createdAt: created(),
  updatedAt: updated(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionToken: text("session_token").notNull().unique(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: citext("slug").notNull().unique(),
  plan: text("plan", { enum: ["free", "trial", "pro", "enterprise"] }).notNull().default("trial"),
  trialEndsAt: ts("trial_ends_at"),
  includedReviewsPerSeat: integer("included_reviews_per_seat").notNull().default(50),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  billingStatus: text("billing_status", { enum: ["none", "active", "past_due", "canceled"] }).notNull().default("none"),
  createdAt: created(),
  updatedAt: updated(),
});

export const memberships = pgTable(
  "memberships",
  {
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: citext("email").notNull(),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: ts("expires_at").notNull(),
  acceptedAt: ts("accepted_at"),
  createdAt: created(),
  updatedAt: updated(),
});

export const installations = pgTable("installations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["github", "gitlab", "ghe"] }).notNull().default("github"),
  externalInstallationId: bigint("external_installation_id", { mode: "number" }).notNull(),
  accountLogin: text("account_login").notNull(),
  accountType: text("account_type", { enum: ["User", "Organization"] }).notNull(),
  repositorySelection: text("repository_selection", { enum: ["all", "selected"] }).notNull().default("selected"),
  suspendedAt: ts("suspended_at"),
  createdAt: created(),
  updatedAt: updated(),
});

export const repositories = pgTable("repositories", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  installationId: uuid("installation_id").notNull().references(() => installations.id, { onDelete: "cascade" }),
  providerRepoId: bigint("provider_repo_id", { mode: "number" }).notNull(),
  fullName: text("full_name").notNull(),
  defaultBranch: text("default_branch").notNull().default("main"),
  private: boolean("private").notNull().default(true),
  reviewEnabled: boolean("review_enabled").notNull().default(true),
  indexStatus: text("index_status", { enum: ["submitted", "cloning", "processing", "completed", "failed"] }).notNull().default("submitted"),
  indexError: text("index_error"),
  indexedSha: text("indexed_sha"),
  filesIndexed: integer("files_indexed").notNull().default(0),
  lastIndexedAt: ts("last_indexed_at"),
  removedAt: ts("removed_at"),
  createdAt: created(),
  updatedAt: updated(),
});

export const codeChunks = pgTable("code_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  repoId: uuid("repo_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  symbol: text("symbol"),
  startLine: integer("start_line").notNull(),
  endLine: integer("end_line").notNull(),
  contentHash: text("content_hash").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 1024 }).notNull(),
  createdAt: created(),
});

export const knowledgeDocs = pgTable("knowledge_docs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  repoId: uuid("repo_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  title: text("title").notNull(),
  bodyMd: text("body_md").notNull(),
  generatedSha: text("generated_sha"),
  editedBy: uuid("edited_by").references(() => users.id, { onDelete: "set null" }),
  editedAt: ts("edited_at"),
  createdAt: created(),
  updatedAt: updated(),
});

export const reviewConfigs = pgTable("review_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  repoId: uuid("repo_id").references(() => repositories.id, { onDelete: "cascade" }),
  strictness: smallint("strictness").notNull().default(2).$type<1 | 2 | 3>(),
  commentTypes: text("comment_types").array().notNull().$type<FindingType[]>(),
  reviewDrafts: boolean("review_drafts").notNull().default(false),
  includeLabels: text("include_labels").array().notNull(),
  disabledLabels: text("disabled_labels").array().notNull(),
  includeAuthors: text("include_authors").array().notNull(),
  excludeAuthors: text("exclude_authors").array().notNull(),
  includeBranches: text("include_branches").array().notNull(),
  excludeBranches: text("exclude_branches").array().notNull(),
  ignorePatterns: text("ignore_patterns").array().notNull(),
  summaryOptions: jsonb("summary_options").notNull().$type<ReviewConfig["summary"]>(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
  updatedAt: updated(),
});

export const rules = pgTable("rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  kind: text("kind", { enum: ["rule", "style_guide", "doc"] }).notNull().default("rule"),
  source: text("source", { enum: ["manual", "learned", "file"] }).notNull().default("manual"),
  status: text("status", { enum: ["active", "suggested", "disabled"] }).notNull().default("active"),
  repoIds: uuid("repo_ids").array().notNull(),
  pathGlobs: text("path_globs").array().notNull(),
  evidence: jsonb("evidence").notNull().$type<{ kind: "thumbs_down" | "human_comment"; url: string; excerpt: string }[]>(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
  updatedAt: updated(),
});

export const pullRequests = pgTable("pull_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  repoId: uuid("repo_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  authorLogin: text("author_login").notNull(),
  baseBranch: text("base_branch").notNull(),
  headSha: text("head_sha").notNull(),
  state: text("state", { enum: ["open", "closed", "merged"] }).notNull().default("open"),
  isDraft: boolean("is_draft").notNull().default(false),
  labels: text("labels").array().notNull(),
  url: text("url").notNull(),
  summaryCommentId: bigint("summary_comment_id", { mode: "number" }),
  openedAt: ts("opened_at").notNull(),
  mergedAt: ts("merged_at"),
  closedAt: ts("closed_at"),
  createdAt: created(),
  updatedAt: updated(),
});

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  pullRequestId: uuid("pull_request_id").notNull().references(() => pullRequests.id, { onDelete: "cascade" }),
  headSha: text("head_sha").notNull(),
  trigger: text("trigger", { enum: ["opened", "synchronize", "ready_for_review", "labeled", "mention", "manual", "api", "cli"] }).notNull(),
  triggeredBy: text("triggered_by"),
  status: text("status", { enum: ["queued", "running", "completed", "failed", "skipped", "superseded"] }).notNull().default("queued"),
  skipReason: text("skip_reason"),
  error: text("error"),
  tier: text("tier", { enum: ["standard", "deep"] }).notNull().default("standard"),
  confidenceScore: smallint("confidence_score").$type<1 | 2 | 3 | 4 | 5>(),
  verdict: text("verdict"),
  summaryMd: text("summary_md"),
  diagramMermaid: text("diagram_mermaid"),
  effectiveConfig: jsonb("effective_config").$type<ReviewConfig>(),
  checkRunId: bigint("check_run_id", { mode: "number" }),
  creditsUsed: smallint("credits_used").notNull().default(0),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  filesReviewed: jsonb("files_reviewed").notNull().$type<{ path: string; summary: string }[]>(),
  checked: text("checked").array().notNull(),
  queuedAt: ts("queued_at").notNull().defaultNow(),
  startedAt: ts("started_at"),
  completedAt: ts("completed_at"),
  createdAt: created(),
  updatedAt: updated(),
});

export const findings = pgTable("findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  pullRequestId: uuid("pull_request_id").notNull().references(() => pullRequests.id, { onDelete: "cascade" }),
  firstReviewId: uuid("first_review_id").notNull().references(() => reviews.id, { onDelete: "cascade" }),
  lastSeenReviewId: uuid("last_seen_review_id").notNull().references(() => reviews.id, { onDelete: "cascade" }),
  fingerprint: text("fingerprint").notNull(),
  filePath: text("file_path").notNull(),
  lineStart: integer("line_start").notNull(),
  lineEnd: integer("line_end").notNull(),
  inDiff: boolean("in_diff").notNull().default(true),
  severity: text("severity", { enum: ["P0", "P1", "P2"] }).notNull(),
  type: text("type", { enum: ["logic", "syntax", "style", "security"] }).notNull(),
  title: text("title").notNull(),
  bodyMd: text("body_md").notNull(),
  suggestion: text("suggestion"),
  ruleId: uuid("rule_id").references(() => rules.id, { onDelete: "set null" }),
  providerCommentId: bigint("provider_comment_id", { mode: "number" }),
  status: text("status", { enum: ["open", "addressed", "resolved", "dismissed"] }).notNull().default("open"),
  resolvedAt: ts("resolved_at"),
  createdAt: created(),
  updatedAt: updated(),
});

export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  findingId: uuid("finding_id").notNull().references(() => findings.id, { onDelete: "cascade" }),
  actorLogin: text("actor_login").notNull(),
  kind: text("kind", { enum: ["thumbs_up", "thumbs_down", "reply", "human_comment"] }).notNull(),
  body: text("body"),
  providerId: bigint("provider_id", { mode: "number" }),
  createdAt: created(),
});

export const usageEvents = pgTable("usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  reviewId: uuid("review_id").unique().references(() => reviews.id, { onDelete: "set null" }),
  credits: smallint("credits").notNull(),
  periodStart: date("period_start", { mode: "string" }).notNull(),
  reportedToStripeAt: ts("reported_to_stripe_at"),
  createdAt: created(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  lastUsedAt: ts("last_used_at"),
  revokedAt: ts("revoked_at"),
  createdAt: created(),
  updatedAt: updated(),
});

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["jira", "linear", "slack", "notion", "datadog"] }).notNull(),
  status: text("status", { enum: ["connected", "error", "disconnected"] }).notNull().default("connected"),
  credentialsEncrypted: bytea("credentials_encrypted").notNull(),
  config: jsonb("config").notNull().default({}),
  detail: text("detail"),
  createdAt: created(),
  updatedAt: updated(),
});

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    source: text("source", { enum: ["github", "stripe"] }).notNull(),
    deliveryId: text("delivery_id").notNull(),
    event: text("event").notNull(),
    receivedAt: ts("received_at").notNull().defaultNow(),
    processedAt: ts("processed_at"),
    error: text("error"),
  },
  (t) => [primaryKey({ columns: [t.source, t.deliveryId] })],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export const jobFailures = pgTable("job_failures", {
  id: uuid("id").primaryKey().defaultRandom(),
  queue: text("queue").notNull(),
  jobId: text("job_id").notNull(),
  data: jsonb("data").notNull(),
  error: text("error").notNull(),
  createdAt: created(),
});
