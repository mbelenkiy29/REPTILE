import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { GitHost, UserInstallation } from "./types";

export type { GitHost, UserInstallation, PrFile, PrInfo, ReviewCommentInput } from "./types";

const g = globalThis as unknown as { __countersignGitHost?: GitHost };

/** The GitHub implementation in use. Tests replace it with setGitHost(fake). */
export async function gitHost(): Promise<GitHost> {
  if (g.__countersignGitHost) return g.__countersignGitHost;
  if (fakeMode()) return (g.__countersignGitHost = await devFake());
  const { octokitHost } = await import("./octokit");
  return octokitHost;
}

export function setGitHost(h: GitHost | undefined) {
  g.__countersignGitHost = h;
}

/** Local development without a GitHub App: GITHUB_FAKE=1 plus dev login (never on a public URL). */
export function fakeMode() {
  return process.env.GITHUB_FAKE === "1" && process.env.AUTH_DEV_LOGIN === "1" && /^http:\/\/(localhost|127\.0\.0\.1)/.test(process.env.APP_URL ?? "");
}

async function devFake(): Promise<GitHost> {
  const { FakeGitHub } = await import("./fake");
  // Local demo: any pull request it doesn't know gets a small made-up diff, so re-runs work without GitHub.
  class DevFake extends FakeGitHub {
    private ensure(repo: string, number: number) {
      const key = `${repo}#${number}`;
      if (this.prs.has(key)) return;
      const content = ["export function applyDiscount(total: number, pct: number) {", "  // BUG: percentage is applied twice", "  return total - total * pct - total * pct;", "}", ""].join("\n");
      const sha = `demo${number}`;
      this.prs.set(key, { number, title: `Pull request #${number}`, body: null, authorLogin: "demo", baseBranch: "main", baseSha: "base", headSha: sha, isDraft: false,
        labels: [], state: "open", merged: false, url: `https://github.com/${repo}/pull/${number}`, repo,
        files: [{ filename: "src/discount.ts", status: "added", additions: 4, deletions: 0, patch: ["@@ -0,0 +1,4 @@", ...content.split("\n").slice(0, 4).map((l) => "+" + l)].join("\n") }] });
      this.files.set(`${repo}@${sha}:src/discount.ts`, content);
    }
    async getPullRequest(i: number, repo: string, n: number) { this.ensure(repo, n); return super.getPullRequest(i, repo, n); }
    async listPullRequestFiles(i: number, repo: string, n: number) { this.ensure(repo, n); return super.listPullRequestFiles(i, repo, n); }
    async getFile(i: number, repo: string, path: string, ref: string) {
      const hit = await super.getFile(i, repo, path, ref);
      if (hit !== null || !ref.startsWith("demo")) return hit;
      this.ensure(repo, Number(ref.slice(4)));
      return super.getFile(i, repo, path, ref);
    }
  }
  const f = new DevFake();
  f.installations = [
    { externalInstallationId: 61000001, accountLogin: "jordanlee", accountType: "User", repositorySelection: "selected", canAdminister: true,
      repositories: [{ providerRepoId: 9001, fullName: "jordanlee/dotfiles", defaultBranch: "main", private: false }] },
    { externalInstallationId: 61000002, accountLogin: "acme-labs", accountType: "Organization", repositorySelection: "selected", canAdminister: true,
      repositories: ["prototype", "ml-pipeline", "design-tokens"].map((n, i) => ({ providerRepoId: 9100 + i, fullName: `acme-labs/${n}`, defaultBranch: "main", private: true })) },
  ];
  return f;
}

export const githubConfigured = () => !!(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY && process.env.GITHUB_APP_CLIENT_ID);

export class GitHubNotConnectedError extends Error {
  constructor() {
    super("Sign in with GitHub first: we check which installations you can see with your own GitHub account.");
    this.name = "GitHubNotConnectedError";
  }
}

/** The user's GitHub token from sign-in, refreshed when it has expired (GitHub App user tokens last 8 hours). */
export async function userGitHubToken(userId: string): Promise<string> {
  const [acc] = await db.select().from(s.accounts).where(and(eq(s.accounts.userId, userId), eq(s.accounts.provider, "github")));
  if (!acc?.access_token) throw new GitHubNotConnectedError();
  const expired = acc.expires_at && acc.expires_at * 1000 < Date.now() + 60_000;
  if (!expired) return acc.access_token;
  if (!acc.refresh_token) throw new GitHubNotConnectedError();
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: process.env.GITHUB_APP_CLIENT_ID, client_secret: process.env.GITHUB_APP_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: acc.refresh_token }),
  });
  const t = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  if (!t.access_token) throw new GitHubNotConnectedError();
  await db.update(s.accounts).set({
    access_token: t.access_token, refresh_token: t.refresh_token ?? acc.refresh_token,
    expires_at: t.expires_in ? Math.floor(Date.now() / 1000) + t.expires_in : null, updatedAt: new Date().toISOString(),
  }).where(eq(s.accounts.id, acc.id));
  return t.access_token;
}

export async function listUserInstallations(userId: string): Promise<UserInstallation[]> {
  if (!g.__countersignGitHost && !fakeMode() && !githubConfigured()) return [];
  const token = g.__countersignGitHost || fakeMode() ? "fake-user-token" : await userGitHubToken(userId);
  return (await gitHost()).listUserInstallations(token);
}
