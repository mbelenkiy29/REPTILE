import { NextResponse } from "next/server";
import { listRepos } from "@/lib/data";
import { apiCtx } from "@/lib/api";

export async function GET(req: Request) {
  const ctx = await apiCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  const repos = await listRepos(ctx);
  return NextResponse.json({
    data: repos.map((r) => ({ id: r.id, full_name: r.fullName, review_enabled: r.reviewEnabled, index_status: r.indexStatus, indexed_sha: r.indexedSha, last_indexed_at: r.lastIndexedAt })),
  });
}
