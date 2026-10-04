import { App } from "@octokit/app";
import type { GitHost, PrFile, UserInstallation } from "./types";

type O = Awaited<ReturnType<App["getInstallationOctokit"]>>;

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`GitHub isn't set up on this server yet (${name} is missing).`);
  return v;
}

let app: App | null = null;
export function githubApp(): App {
  app ??= new App({
    appId: env("GITHUB_APP_ID"),
    // Env vars can't hold newlines everywhere; accept "\n"-escaped keys.
    privateKey: env("GITHUB_APP_PRIVATE_KEY").replace(/\\n/g, "\n"),
    webhooks: { secret: env("GITHUB_WEBHOOK_SECRET") },
    oauth: { clientId: env("GITHUB_APP_CLIENT_ID"), clientSecret: env("GITHUB_APP_CLIENT_SECRET") },
  });
  return app;
}

const split = (repo: string) => {
  const [owner, name] = repo.split("/");
  return { owner, repo: name };
};

async function inst(id: number): Promise<O> {
  return githubApp().getInstallationOctokit(id);
}

export const octokitHost: GitHost = {
  async listUserInstallations(userToken) {
    const { Octokit } = await import("@octokit/rest");
    const user = new Octokit({ auth: userToken });
    const appId = Number(env("GITHUB_APP_ID"));
    const installs = await user.paginate(user.apps.listInstallationsForAuthenticatedUser, { per_page: 100 });
    const out: UserInstallation[] = [];
    for (const i of installs) {
      if (i.app_id !== appId || !i.account) continue;
      const repos = await user.paginate(user.apps.listInstallationReposForAuthenticatedUser, { installation_id: i.id, per_page: 100 });
      const account = i.account as { login?: string; slug?: string; type?: string };
      out.push({
        externalInstallationId: i.id,
        accountLogin: account.login ?? account.slug ?? "unknown",
        accountType: account.type === "Organization" ? "Organization" : "User",
        repositorySelection: i.repository_selection === "all" ? "all" : "selected",
        repositories: repos.map((r) => ({ providerRepoId: r.id, fullName: r.full_name, defaultBranch: r.default_branch ?? "main", private: r.private })),
      });
    }
    return out;
  },

  async installationToken(installationId) {
    const o = await inst(installationId);
    const { token } = (await o.auth({ type: "installation" })) as { token: string };
    return token;
  },

  async getPullRequest(installationId, repo, number) {
    const o = await inst(installationId);
    const { data: p } = await o.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", { ...split(repo), pull_number: number });
    return {
      number: p.number, title: p.title, body: p.body, authorLogin: p.user?.login ?? "ghost", baseBranch: p.base.ref, baseSha: p.base.sha,
      headSha: p.head.sha, isDraft: !!p.draft, labels: p.labels.map((l) => l.name ?? "").filter(Boolean), state: p.state as "open" | "closed",
      merged: !!p.merged, url: p.html_url,
    };
  },

  async listPullRequestFiles(installationId, repo, number) {
    const o = await inst(installationId);
    const files: PrFile[] = [];
    for (let page = 1; page <= 30; page++) {
      const { data } = await o.request("GET /repos/{owner}/{repo}/pulls/{pull_number}/files", { ...split(repo), pull_number: number, per_page: 100, page });
      files.push(...data.map((f) => ({ filename: f.filename, status: f.status, patch: f.patch, additions: f.additions, deletions: f.deletions })));
      if (data.length < 100) break;
    }
    return files;
  },

  async getFile(installationId, repo, path, ref) {
    const o = await inst(installationId);
    try {
      const { data } = await o.request("GET /repos/{owner}/{repo}/contents/{path}", { ...split(repo), path, ref });
      if (Array.isArray(data) || data.type !== "file" || !("content" in data)) return null;
      return Buffer.from(data.content, "base64").toString("utf8");
    } catch (e) {
      if ((e as { status?: number }).status === 404) return null;
      throw e;
    }
  },

  async createCheckRun(installationId, repo, headSha, title) {
    const o = await inst(installationId);
    const { data } = await o.request("POST /repos/{owner}/{repo}/check-runs", {
      ...split(repo), name: "REPTILE", head_sha: headSha, status: "in_progress", output: { title, summary: "Reviewing the changes." },
    });
    return Number(data.id);
  },

  async completeCheckRun(installationId, repo, id, r) {
    const o = await inst(installationId);
    await o.request("PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}", {
      ...split(repo), check_run_id: id, status: "completed", conclusion: r.conclusion, output: { title: r.title, summary: r.summary },
    });
  },

  async createReview(installationId, repo, number, headSha, comments) {
    const o = await inst(installationId);
    const { data } = await o.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews", {
      ...split(repo), pull_number: number, commit_id: headSha, event: "COMMENT",
      comments: comments.map((c) => ({ path: c.path, line: c.line, side: c.side, body: c.body, ...(c.startLine && c.startLine < c.line ? { start_line: c.startLine, start_side: c.side } : {}) })),
    });
    const list: { id: number; path: string; body: string }[] = [];
    for (let page = 1; page <= 10; page++) {
      const { data: batch } = await o.request("GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/comments", { ...split(repo), pull_number: number, review_id: Number(data.id), per_page: 100, page });
      list.push(...batch.map((x) => ({ id: Number(x.id), path: x.path, body: x.body })));
      if (batch.length < 100) break;
    }
    // Match by path + body: the response order isn't documented.
    return comments.map((c) => list.find((x) => x.path === c.path && x.body === c.body)?.id ?? 0);
  },

  async createIssueComment(installationId, repo, number, body) {
    const o = await inst(installationId);
    const { data } = await o.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", { ...split(repo), issue_number: number, body });
    return Number(data.id);
  },

  async updateIssueComment(installationId, repo, commentId, body) {
    const o = await inst(installationId);
    await o.request("PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}", { ...split(repo), comment_id: commentId, body });
  },

  async replyToReviewComment(installationId, repo, number, commentId, body) {
    const o = await inst(installationId);
    const { data } = await o.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies", { ...split(repo), pull_number: number, comment_id: commentId, body });
    return Number(data.id);
  },

  async listCommentReactions(installationId, repo, commentId) {
    const o = await inst(installationId);
    const out: { id: number; login: string; content: string }[] = [];
    for (let page = 1; page <= 10; page++) {
      const { data } = await o.request("GET /repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions", { ...split(repo), comment_id: commentId, per_page: 100, page });
      out.push(...data.map((r) => ({ id: Number(r.id), login: r.user?.login ?? "ghost", content: r.content })));
      if (data.length < 100) break;
    }
    return out;
  },
};
