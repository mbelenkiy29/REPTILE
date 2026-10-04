import type { Metadata } from "next";
import Link from "next/link";
import { FolderGit2, SearchX } from "lucide-react";
import { listInstallations, listRepos } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { relativeTime, plural } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { RepoStatus } from "@/components/repo-status";
import { AdminOnlyNotice } from "@/components/no-access";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { Table, TableEmpty, TD, TH, THead, TRow } from "@/components/ui/table";
import { RepoToggle, RepoActions } from "./row-controls";

export const metadata: Metadata = { title: "Repositories" };

const FILTERS = [
  { value: "all", label: "All" },
  { value: "completed", label: "Ready" },
  { value: "indexing", label: "Indexing" },
  { value: "failed", label: "Failed" },
  { value: "off", label: "Reviews off" },
];

export default async function ReposPage({ searchParams }: PageProps<"/repos">) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" && FILTERS.some((f) => f.value === sp.status) ? sp.status : "all";
  const [repos, all, installs] = await Promise.all([listRepos(ctx, { q, status }), listRepos(ctx), listInstallations(ctx)]);
  const isAdmin = ctx.role === "admin";
  const failed = all.filter((r) => r.indexStatus === "failed" && r.reviewEnabled);
  const indexing = all.filter((r) => ["submitted", "cloning", "processing"].includes(r.indexStatus));
  const linked = typeof sp.linked === "string" ? Number(sp.linked) : null;

  if (!all.length) {
    return (
      <>
        <PageHeader title="Repositories" />
        <div className="rounded-lg border">
          <EmptyState
            icon={FolderGit2}
            title="No repositories yet"
            body={
              installs.length
                ? "The GitHub App is installed but has no repositories selected. Add some in the app's settings on GitHub."
                : "Install the GitHub App on an account or organization to start reviewing pull requests."
            }
            action={isAdmin ? <Button asChild size="sm"><Link href="/onboarding">Connect GitHub</Link></Button> : undefined}
          />
        </div>
        {!isAdmin && <div className="mt-4"><AdminOnlyNotice what="code host connections" /></div>}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Repositories"
        description={`${plural(all.filter((r) => r.reviewEnabled).length, "repository", "repositories")} reviewed on every pull request.`}
        actions={isAdmin && <Button asChild variant="secondary" size="sm"><Link href="/onboarding">Add repositories</Link></Button>}
      />

      <div className="flex flex-col gap-4">
        {linked !== null && (
          <Alert variant="success" title="Account linked" live>
            {plural(linked, "repository is", "repositories are")} indexing now. Reviews start on new pull requests as soon as each one is ready.
          </Alert>
        )}
        {failed.length > 0 && (
          <Alert variant="danger" title={`${plural(failed.length, "repository", "repositories")} couldn't be indexed`}>
            Reviews still run on those, but only see the diff. Open the repository to see why and retry.
          </Alert>
        )}
        {indexing.length > 0 && linked === null && (
          <Alert variant="info" title={`Indexing ${plural(indexing.length, "repository", "repositories")}`}>
            Reviews use the whole codebase once indexing finishes. Large repositories can take up to 30 minutes.
          </Alert>
        )}
        {!isAdmin && <AdminOnlyNotice what="which repositories are reviewed" />}

        <form role="search" className="flex flex-wrap items-center gap-2" action="/repos">
          <label htmlFor="repo-q" className="sr-only">Search repositories</label>
          <Input id="repo-q" name="q" defaultValue={q} placeholder="Search repositories" className="w-full sm:w-64" type="search" />
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <nav aria-label="Filter by status" className="flex flex-wrap gap-1">
            {FILTERS.map((f) => {
              const params = new URLSearchParams({ ...(q ? { q } : {}), ...(f.value !== "all" ? { status: f.value } : {}) });
              const active = f.value === status;
              return (
                <Link
                  key={f.value}
                  href={`/repos${params.size ? `?${params}` : ""}`}
                  aria-current={active ? "page" : undefined}
                  className={
                    "h-7 rounded-pill border px-3 text-sm leading-[26px] transition-colors focus-visible:outline-2 focus-visible:outline-focus " +
                    (active ? "border-transparent bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface hover:text-fg")
                  }
                >
                  {f.label}
                </Link>
              );
            })}
          </nav>
        </form>

        <Table aria-label="Repositories">
          <THead>
            <tr>
              <TH>Repository</TH>
              <TH className="hidden sm:table-cell">Status</TH>
              <TH numeric className="hidden sm:table-cell">Reviews</TH>
              <TH className="hidden md:table-cell">Last review</TH>
              <TH>Review PRs</TH>
              <TH><span className="sr-only">Actions</span></TH>
            </tr>
          </THead>
          <tbody>
            {repos.length === 0 ? (
              <TableEmpty cols={6}>
                <EmptyState
                  icon={SearchX}
                  title="No repositories match"
                  body="Try a different search or filter."
                  action={<Button asChild size="sm" variant="secondary"><Link href="/repos">Clear filters</Link></Button>}
                />
              </TableEmpty>
            ) : (
              repos.map((r) => (
                <TRow key={r.id}>
                  <TD className="max-w-[200px] py-2 sm:max-w-[320px]">
                    <Link href={`/repos/${r.id}`} className="block truncate font-medium text-fg hover:underline focus-visible:outline-2 focus-visible:outline-focus" title={r.fullName}>
                      {r.fullName}
                    </Link>
                    <span className="mt-1 block sm:hidden"><RepoStatus {...r} /></span>
                  </TD>
                  <TD className="hidden sm:table-cell"><RepoStatus {...r} /></TD>
                  <TD numeric className="hidden sm:table-cell">{r.reviewCount}</TD>
                  <TD className="hidden whitespace-nowrap text-sm text-muted md:table-cell">{relativeTime(r.lastReviewAt)}</TD>
                  <TD><RepoToggle id={r.id} name={r.fullName} enabled={r.reviewEnabled} disabled={!isAdmin} /></TD>
                  <TD className="w-10"><RepoActions id={r.id} name={r.fullName} isAdmin={isAdmin} /></TD>
                </TRow>
              ))
            )}
          </tbody>
        </Table>
      </div>
    </>
  );
}
