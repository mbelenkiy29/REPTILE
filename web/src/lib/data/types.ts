// Domain types. They mirror replica/schema.sql (snake_case columns → camelCase fields)
// so the Drizzle layer in /replica-backend can return the same shapes.

export type Role = "admin" | "member";
export type Plan = "free" | "trial" | "pro" | "enterprise";
export type IndexStatus = "submitted" | "cloning" | "processing" | "completed" | "failed";
export type ReviewStatus = "queued" | "running" | "completed" | "failed" | "skipped" | "superseded";
export type ReviewTrigger = "opened" | "synchronize" | "ready_for_review" | "labeled" | "mention" | "manual" | "api" | "cli";
export type Severity = "P0" | "P1" | "P2";
export type FindingType = "logic" | "syntax" | "style" | "security";
export type FindingStatus = "open" | "addressed" | "resolved" | "dismissed";
export type RuleKind = "rule" | "style_guide" | "doc";
export type RuleSource = "manual" | "learned" | "file";
export type RuleStatus = "active" | "suggested" | "disabled";
export type IntegrationKind = "jira" | "linear" | "slack" | "notion" | "datadog";

export interface User {
  id: string;
  name: string;
  email: string;
  githubLogin: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  trialEndsAt: string | null;
  includedReviewsPerSeat: number;
  billingStatus: "none" | "active" | "past_due" | "canceled";
  createdAt: string;
}

export interface Membership {
  orgId: string;
  userId: string;
  role: Role;
  createdAt: string;
}

export interface Invite {
  id: string;
  orgId: string;
  email: string;
  role: Role;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
}

export interface Installation {
  id: string;
  orgId: string;
  provider: "github" | "gitlab" | "ghe";
  externalInstallationId: number;
  accountLogin: string;
  accountType: "User" | "Organization";
  suspendedAt: string | null;
  createdAt: string;
}

export interface Repository {
  id: string;
  orgId: string;
  installationId: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  reviewEnabled: boolean;
  indexStatus: IndexStatus;
  indexError: string | null;
  indexedSha: string | null;
  filesIndexed: number;
  lastIndexedAt: string | null;
  createdAt: string;
}

export interface ReviewConfig {
  strictness: 1 | 2 | 3;
  commentTypes: FindingType[];
  reviewDrafts: boolean;
  includeLabels: string[];
  disabledLabels: string[];
  includeAuthors: string[];
  excludeAuthors: string[];
  includeBranches: string[];
  excludeBranches: string[];
  ignorePatterns: string[];
  summary: { diagram: boolean; fileTable: boolean; confidence: boolean };
}

export interface StoredReviewConfig extends ReviewConfig {
  orgId: string;
  repoId: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface Rule {
  id: string;
  orgId: string;
  text: string;
  kind: RuleKind;
  source: RuleSource;
  status: RuleStatus;
  repoIds: string[];
  pathGlobs: string[];
  evidence: { kind: "thumbs_down" | "human_comment"; url: string; excerpt: string }[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PullRequest {
  id: string;
  orgId: string;
  repoId: string;
  number: number;
  title: string;
  authorLogin: string;
  baseBranch: string;
  headSha: string;
  state: "open" | "closed" | "merged";
  isDraft: boolean;
  labels: string[];
  url: string;
  openedAt: string;
  mergedAt: string | null;
}

export interface Review {
  id: string;
  orgId: string;
  pullRequestId: string;
  headSha: string;
  trigger: ReviewTrigger;
  status: ReviewStatus;
  skipReason: string | null;
  error: string | null;
  confidenceScore: 1 | 2 | 3 | 4 | 5 | null;
  verdict: string | null;
  summaryMd: string | null;
  diagramMermaid: string | null;
  filesReviewed: { path: string; summary: string }[];
  checked: string[];
  creditsUsed: number;
  queuedAt: string;
  completedAt: string | null;
}

export interface Finding {
  id: string;
  orgId: string;
  pullRequestId: string;
  firstReviewId: string;
  lastSeenReviewId: string;
  fingerprint: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  inDiff: boolean;
  severity: Severity;
  type: FindingType;
  title: string;
  bodyMd: string;
  suggestion: string | null;
  ruleId: string | null;
  status: FindingStatus;
  thumbsUp: number;
  thumbsDown: number;
  createdAt: string;
}

export interface KnowledgeDoc {
  id: string;
  orgId: string;
  repoId: string;
  path: string;
  title: string;
  bodyMd: string;
  editedBy: string | null;
  updatedAt: string;
}

export interface ApiKey {
  id: string;
  orgId: string;
  name: string;
  prefix: string;
  createdBy: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface Integration {
  orgId: string;
  kind: IntegrationKind;
  status: "connected" | "error" | "disconnected";
  detail: string | null;
  updatedAt: string;
}

export interface UsageEvent {
  orgId: string;
  reviewId: string;
  credits: number;
  periodStart: string;
}

/** Who is asking. Every data function takes this first; the real layer builds it from the session. */
export interface Ctx {
  userId: string;
  orgId: string;
  role: Role;
}

export class ForbiddenError extends Error {
  constructor(message = "Only admins can do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(what = "That item") {
    super(`${what} was not found.`);
    this.name = "NotFoundError";
  }
}
