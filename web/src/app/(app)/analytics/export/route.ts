import { getAnalytics } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";

/** CSV of the analytics view: one row per day. */
export async function GET(req: Request) {
  const ctx = await requireOrg();
  const sp = new URL(req.url).searchParams;
  const days = [7, 30, 90].includes(Number(sp.get("days"))) ? Number(sp.get("days")) : 30;
  const a = await getAnalytics(ctx, { days, repoId: sp.get("repo") ?? undefined, author: sp.get("author") ?? undefined });
  const csv = ["date,reviews,p0,p1,p2", ...a.daily.map((d) => [d.date, d.reviews, d.P0, d.P1, d.P2].join(","))].join("\n") + "\n";
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="reptile-analytics-${a.range.to.slice(0, 10)}-${days}d.csv"`,
    },
  });
}
