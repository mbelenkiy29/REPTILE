// Everything REPTILE asks of GitHub, as one interface. The real implementation is octokit.ts (official REST API,
// our own GitHub App); tests use a fake. Keep this list short: every call here is a scope we have to request.

export interface UserInstallation {
  externalInstallationId: number;
  accountLogin: string;
  accountType: "User" | "Organization";
  repositorySelection: "all" | "selected";
  repositories: { providerRepoId: number; fullName: string; defaultBranch: string; private: boolean }[];
}

export interface PrFile {
  filename: string;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  patch?: string;
  additions: number;
  deletions: number;
}

export interface PrInfo {
  number: number;
  title: string;
  body: string | null;
  authorLogin: string;
  baseBranch: string;
  baseSha: string;
  headSha: string;
  isDraft: boolean;
  labels: string[];
  state: "open" | "closed";
  merged: boolean;
  url: string;
}

export interface ReviewCommentInput {
  path: string;
  line: number;
  startLine?: number;
  side: "RIGHT";
  body: string;
}

export interface GitHost {
  /** Installations the user can see with their own token (proves they may link it). */
  listUserInstallations(userToken: string): Promise<UserInstallation[]>;
  installationToken(installationId: number): Promise<string>;
  getPullRequest(installationId: number, repo: string, number: number): Promise<PrInfo>;
  listPullRequestFiles(installationId: number, repo: string, number: number): Promise<PrFile[]>;
  /** File contents at a ref, or null when it doesn't exist. Text files only. */
  getFile(installationId: number, repo: string, path: string, ref: string): Promise<string | null>;
  createCheckRun(installationId: number, repo: string, headSha: string, title: string): Promise<number>;
  completeCheckRun(installationId: number, repo: string, id: number, r: { conclusion: "success" | "neutral" | "failure" | "skipped"; title: string; summary: string }): Promise<void>;
  /** One review with all inline comments. Returns the ids of the created comments, in order. */
  createReview(installationId: number, repo: string, number: number, headSha: string, comments: ReviewCommentInput[]): Promise<number[]>;
  createIssueComment(installationId: number, repo: string, number: number, body: string): Promise<number>;
  updateIssueComment(installationId: number, repo: string, commentId: number, body: string): Promise<void>;
  replyToReviewComment(installationId: number, repo: string, number: number, commentId: number, body: string): Promise<number>;
  /** 👍/👎 on one of our review comments. GitHub sends no webhook for reactions, so this is polled. */
  listCommentReactions(installationId: number, repo: string, commentId: number): Promise<{ id: number; login: string; content: string }[]>;
}
