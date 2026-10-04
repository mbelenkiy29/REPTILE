import type { Metadata } from "next";
import Link from "next/link";
import { ChartColumn, Download } from "lucide-react";
import { getAnalytics, listAuthors, listRepos } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { formatNumber } from "@/lib/format";
import { ChartCard, DailyLine, StackedBars } from "@/components/charts";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TD, TH, THead, TRow } from "@/components/ui/table";
import { AnalyticsFilters } from "./filters";

export const metadata: Metadata = { title: "Analytics" };

const pct = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / prev) * 100) : undefined);
const SEVERITY = [
  { key: "P0" as const, label: "P0 Critical", color: "var(--c-sev-p0)" },
  { key: "P1" as const, label: "P1 High", color: "var(--c-sev-p1)" },
  { key: "P2" as const, label: "P2 Medium", color: "var(--c-sev-p2)" },
];

export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const repoId = typeof sp.repo === "string" ? sp.repo : undefined;
  const author = typeof sp.author === "string" ? sp.author : undefined;
  const [a, repos, authors] = await Promise.all([getAnalytics(ctx, { days, repoId, author }), listRepos(ctx), listAuthors(ctx)]);
  const t = a.tiles;
  const exportHref = `/analytics/export?${new URLSearchParams({ days: String(days), ...(repoId ? { repo: repoId } : {}), ...(author ? { author } : {}) })}`;
  const filtered = !!repoId || !!author;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="What reviews caught, what your team fixed, and how fast pull requests merge."
        actions={t.prsReviewed > 0 && <Button asChild variant="secondary" size="sm"><a href={exportHref} download><Download aria-hidden /> Export CSV</a></Button>}
      />
      <div className="flex flex-col gap-6">
        <AnalyticsFilters repos={repos.map((r) => ({ id: r.id, name: r.fullName }))} authors={authors} />

        {t.prsReviewed === 0 ? (
          <div className="rounded-lg border">
            <EmptyState
              icon={ChartColumn}
              title={filtered ? "Nothing in this view" : "Nothing to chart yet"}
              body={filtered ? "No reviewed pull requests match these filters in this period." : "Numbers show up after the first reviewed pull request."}
              action={filtered ? <Button asChild size="sm" variant="secondary"><Link href={`/analytics?days=${days}`}>Clear filters</Link></Button> : undefined}
            />
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Pull requests reviewed" value={formatNumber(t.prsReviewed)} delta={pct(t.prsReviewed, t.prsReviewedPrev)} />
              <StatTile
                label="Findings fixed"
                value={t.addressedRate === null ? "—" : `${Math.round(t.addressedRate * 100)}%`}
                delta={t.addressedRate !== null && t.addressedRatePrev !== null ? Math.round((t.addressedRate - t.addressedRatePrev) * 100) : undefined}
                deltaUnit=" pts"
              />
              <StatTile label="Critical issues caught" value={formatNumber(t.criticalCaught)} delta={pct(t.criticalCaught, t.criticalCaughtPrev)} />
              <StatTile
                label="Median time to merge"
                value={t.medianMergeHours === null ? "—" : t.medianMergeHours < 48 ? `${t.medianMergeHours.toFixed(1)} h` : `${(t.medianMergeHours / 24).toFixed(1)} d`}
                delta={t.medianMergeHours !== null && t.medianMergeHoursPrev ? pct(t.medianMergeHours, t.medianMergeHoursPrev) : undefined}
                goodWhen="down"
              />
            </div>
            <p className="-mt-2 text-sm text-muted">
              Findings fixed counts closed findings the author addressed or resolved, rather than dismissed. Reactions this period: 👍 {t.thumbsUp} · 👎 {t.thumbsDown}.
            </p>

            <div className="grid gap-4 xl:grid-cols-2">
              <ChartCard
                title="Reviews per day"
                table={<DailyTable rows={a.daily.map((d) => ({ date: d.date, values: [d.reviews] }))} cols={["Reviews"]} />}
              >
                <DailyLine data={a.daily.map((d) => ({ date: d.date, value: d.reviews }))} label="Reviews" />
              </ChartCard>
              <ChartCard
                title="Findings by severity"
                description="When each finding was first reported."
                table={<DailyTable rows={a.daily.map((d) => ({ date: d.date, values: [d.P0, d.P1, d.P2] }))} cols={["P0", "P1", "P2"]} />}
              >
                <StackedBars data={a.daily} series={SEVERITY} label="Findings by severity" />
              </ChartCard>
            </div>

            <section aria-labelledby="by-repo">
              <h2 id="by-repo" className="mb-3 text-md font-semibold text-fg">By repository</h2>
              <Table aria-label="By repository">
                <THead>
                  <tr>
                    <TH>Repository</TH>
                    <TH numeric>Reviews</TH>
                    <TH numeric>Findings</TH>
                    <TH numeric>Fixed</TH>
                  </tr>
                </THead>
                <tbody>
                  {a.byRepo.map((r) => (
                    <TRow key={r.repo}>
                      <TD className="max-w-[280px] truncate font-medium" title={r.repo}>{r.repo}</TD>
                      <TD numeric>{r.reviews}</TD>
                      <TD numeric>{r.findings}</TD>
                      <TD numeric>{r.closed ? `${Math.round((r.addressed / r.closed) * 100)}%` : "—"}</TD>
                    </TRow>
                  ))}
                </tbody>
              </Table>
            </section>
          </>
        )}
      </div>
    </>
  );
}

function DailyTable({ rows, cols }: { rows: { date: string; values: number[] }[]; cols: string[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-surface">
        <tr>
          <th scope="col" className="px-3 py-1.5 text-left font-medium text-muted">Day</th>
          {cols.map((c) => <th key={c} scope="col" className="px-3 py-1.5 text-right font-medium text-muted">{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.date} className="border-t">
            <td className="px-3 py-1 text-fg">{r.date}</td>
            {r.values.map((v, i) => <td key={i} className="px-3 py-1 text-right tabular-nums text-fg">{v}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
