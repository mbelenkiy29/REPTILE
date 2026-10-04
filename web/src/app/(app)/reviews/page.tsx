import type { Metadata } from "next";
import Link from "next/link";
import { History, SearchX } from "lucide-react";
import { listRepos, listReviews, type ReviewStatus } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { relativeTime, plural } from "@/lib/format";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/page-header";
import { FindingCounts, ReviewStatusPill } from "@/components/review-bits";
import { Button } from "@/components/ui/button";
import { ConfidenceScore } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { Table, TableEmpty, TD, TH, THead, TRow } from "@/components/ui/table";
import { RepoFilter } from "./repo-filter";

export const metadata: Metadata = { title: "Reviews" };

const STATUSES: { value: ReviewStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "completed", label: "Reviewed" },
  { value: "running", label: "In progress" },
  { value: "skipped", label: "Skipped" },
  { value: "failed", label: "Failed" },
];

export default async function ReviewsPage({ searchParams }: PageProps<"/reviews">) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const status = (STATUSES.find((s) => s.value === str("status"))?.value ?? "all") as ReviewStatus | "all";
  const repoId = str("repo") || undefined;
  const q = str("q");
  const cursor = str("after") || undefined;
  const [{ items, nextCursor, total }, repos] = await Promise.all([
    listReviews(ctx, { status, repoId, q, cursor, limit: 20 }),
    listRepos(ctx),
  ]);
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status: status === "all" ? undefined : status, repo: repoId, q: q || undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/reviews${p.size ? `?${p}` : ""}`;
  };
  const filtered = status !== "all" || !!repoId || !!q;

  if (!filtered && total === 0) {
    return (
      <>
        <PageHeader title="Reviews" />
        <div className="rounded-lg border">
          <EmptyState
            icon={History}
            title="No reviews yet"
            body={repos.length ? "Open a pull request on a repository with reviews turned on. The first review shows up here within a few minutes." : "Connect GitHub and pick repositories first."}
            action={<Button asChild size="sm"><Link href={repos.length ? "/repos" : "/onboarding"}>{repos.length ? "See repositories" : "Connect GitHub"}</Link></Button>}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <AutoRefresh active={items.some((r) => r.status === "running" || r.status === "queued")} />
      <PageHeader title="Reviews" description={`${plural(total, "review")}${filtered ? " match these filters" : " across your repositories"}.`} />
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <form role="search" action="/reviews" className="contents">
            <label htmlFor="rev-q" className="sr-only">Search by title, number or author</label>
            <Input id="rev-q" name="q" type="search" defaultValue={q} placeholder="Title, #number or author" className="w-full sm:w-64" />
            {status !== "all" && <input type="hidden" name="status" value={status} />}
            {repoId && <input type="hidden" name="repo" value={repoId} />}
          </form>
          <RepoFilter repos={repos.map((r) => ({ id: r.id, name: r.fullName }))} value={repoId ?? ""} />
          <nav aria-label="Filter by status" className="flex flex-wrap gap-1">
            {STATUSES.map((s) => {
              const active = s.value === status;
              return (
                <Link
                  key={s.value}
                  href={href({ status: s.value === "all" ? undefined : s.value, after: undefined })}
                  aria-current={active ? "page" : undefined}
                  className={
                    "h-7 rounded-pill border px-3 text-sm leading-[26px] transition-colors focus-visible:outline-2 focus-visible:outline-focus " +
                    (active ? "border-transparent bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface hover:text-fg")
                  }
                >
                  {s.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <Table aria-label="Reviews">
          <THead>
            <tr>
              <TH>Pull request</TH>
              <TH className="hidden sm:table-cell">Status</TH>
              <TH className="hidden sm:table-cell">Findings</TH>
              <TH className="hidden lg:table-cell">Confidence</TH>
              <TH className="hidden md:table-cell">When</TH>
            </tr>
          </THead>
          <tbody>
            {items.length === 0 ? (
              <TableEmpty cols={5}>
                <EmptyState icon={SearchX} title="No reviews match" body="Try a different filter or search."
                  action={<Button asChild size="sm" variant="secondary"><Link href="/reviews">Clear filters</Link></Button>} />
              </TableEmpty>
            ) : (
              items.map((r) => (
                <TRow key={r.id}>
                  <TD className="max-w-[300px] py-2 sm:max-w-[420px]">
                    <Link href={`/reviews/${r.id}`} className="block truncate font-medium text-fg hover:underline focus-visible:outline-2 focus-visible:outline-focus">
                      {r.pr.title}
                    </Link>
                    <span className="block truncate text-sm text-muted">
                      {r.repo.fullName} #{r.pr.number} · {r.pr.authorLogin}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 sm:hidden">
                      <ReviewStatusPill status={r.status} reason={r.skipReason} />
                      {r.status === "completed" && <FindingCounts counts={r.counts} />}
                    </span>
                  </TD>
                  <TD className="hidden sm:table-cell"><ReviewStatusPill status={r.status} reason={r.skipReason} /></TD>
                  <TD className="hidden sm:table-cell">{r.status === "completed" ? <FindingCounts counts={r.counts} /> : <span className="text-sm text-muted">—</span>}</TD>
                  <TD className="hidden lg:table-cell">{r.confidenceScore ? <ConfidenceScore score={r.confidenceScore} /> : <span className="text-sm text-muted">—</span>}</TD>
                  <TD className="hidden whitespace-nowrap text-sm text-muted md:table-cell">{relativeTime(r.queuedAt)}</TD>
                </TRow>
              ))
            )}
          </tbody>
        </Table>
        {(cursor || nextCursor) && (
          <nav aria-label="Pages" className="flex justify-between gap-2">
            {cursor ? <Button asChild variant="secondary" size="sm"><Link href={href({ after: undefined })}>Back to newest</Link></Button> : <span />}
            {nextCursor && <Button asChild variant="secondary" size="sm"><Link href={href({ after: nextCursor })}>Older reviews</Link></Button>}
          </nav>
        )}
      </div>
    </>
  );
}
