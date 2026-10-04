// In-memory GitHub for tests and for local development without a GitHub App (GITHUB_FAKE=1 with dev login).
// Records what REPTILE would post so tests can assert on it.
import type { GitHost, PrFile, PrInfo, ReviewCommentInput, UserInstallation } from "./types";

export interface FakePr extends PrInfo { files: PrFile[]; repo: string }

export class FakeGitHub implements GitHost {
  installations: UserInstallation[] = [];
  prs = new Map<string, FakePr>(); // key: repo#number
  files = new Map<string, string>(); // key: repo@ref:path
  checkRuns: { id: number; repo: string; headSha: string; title: string; conclusion?: string; summary?: string }[] = [];
  reviews: { repo: string; number: number; headSha: string; comments: (ReviewCommentInput & { id: number })[] }[] = [];
  issueComments: { id: number; repo: string; number: number; body: string }[] = [];
  replies: { id: number; repo: string; number: number; inReplyTo: number; body: string }[] = [];
  reactions = new Map<number, { id: number; login: string; content: string }[]>();
  private seq = 1000;

  async listUserInstallations() { return this.installations; }
  async installationToken() { return "fake-installation-token"; }
  async getPullRequest(_: number, repo: string, number: number) {
    const p = this.prs.get(`${repo}#${number}`);
    if (!p) throw Object.assign(new Error("Not Found"), { status: 404 });
    return p;
  }
  async listPullRequestFiles(_: number, repo: string, number: number) { return (await this.getPullRequest(0, repo, number)).files; }
  async getFile(_: number, repo: string, path: string, ref: string) { return this.files.get(`${repo}@${ref}:${path}`) ?? null; }
  async createCheckRun(_: number, repo: string, headSha: string, title: string) {
    const id = ++this.seq;
    this.checkRuns.push({ id, repo, headSha, title });
    return id;
  }
  async completeCheckRun(_: number, __: string, id: number, r: { conclusion: string; title: string; summary: string }) {
    Object.assign(this.checkRuns.find((c) => c.id === id)!, { conclusion: r.conclusion, title: r.title, summary: r.summary });
  }
  async createReview(_: number, repo: string, number: number, headSha: string, comments: ReviewCommentInput[]) {
    const withIds = comments.map((c) => ({ ...c, id: ++this.seq }));
    this.reviews.push({ repo, number, headSha, comments: withIds });
    return withIds.map((c) => c.id);
  }
  async createIssueComment(_: number, repo: string, number: number, body: string) {
    const id = ++this.seq;
    this.issueComments.push({ id, repo, number, body });
    return id;
  }
  async updateIssueComment(_: number, __: string, commentId: number, body: string) {
    const c = this.issueComments.find((x) => x.id === commentId);
    if (!c) throw Object.assign(new Error("Not Found"), { status: 404 });
    c.body = body;
  }
  async replyToReviewComment(_: number, repo: string, number: number, inReplyTo: number, body: string) {
    const id = ++this.seq;
    this.replies.push({ id, repo, number, inReplyTo, body });
    return id;
  }
  async listCommentReactions(_: number, __: string, commentId: number) { return this.reactions.get(commentId) ?? []; }
}
