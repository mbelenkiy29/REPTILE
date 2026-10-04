import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { GitHost, UserInstallation } from "./types";

export type { GitHost, UserInstallation, PrFile, PrInfo, ReviewCommentInput } from "./types";

const g = globalThis as unknown as { __reptileGitHost?: GitHost };

/** The GitHub implementation in use. Tests replace it with setGitHost(fake). */
export async function gitHost(): Promise<GitHost> {
  if (g.__reptileGitHost) return g.__reptileGitHost;
  const { octokitHost } = await import("./octokit");
  return octokitHost;
}

export function setGitHost(h: GitHost | undefined) {
  g.__reptileGitHost = h;
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
  if (!g.__reptileGitHost && !githubConfigured()) return [];
  const token = await userGitHubToken(userId);
  return (await gitHost()).listUserInstallations(token);
}
