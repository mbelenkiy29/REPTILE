import { NextResponse } from "next/server";
import { getReview, NotFoundError } from "@/lib/data";
import { apiCtx } from "@/lib/api";

export async function GET(req: Request, { params }: RouteContext<"/api/v1/reviews/[id]">) {
  const ctx = await apiCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const r = await getReview(ctx, (await params).id);
    return NextResponse.json({
      id: r.id, status: r.status, repository: r.repo.fullName, pull_request: r.pr.number, head_sha: r.headSha,
      confidence: r.confidenceScore, verdict: r.verdict, summary: r.summaryMd, completed_at: r.completedAt,
      findings: r.findings.map((f) => ({ id: f.id, severity: f.severity, type: f.type, title: f.title, file: f.filePath, line_start: f.lineStart, line_end: f.lineEnd, status: f.status, body: f.bodyMd, suggestion: f.suggestion })),
    });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: "Not found." }, { status: 404 });
    throw e;
  }
}
