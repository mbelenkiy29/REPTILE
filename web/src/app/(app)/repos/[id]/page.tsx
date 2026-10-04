import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getRepo, getReviewConfig, listKnowledge, listReviews } from "@/lib/data";
import { orNotFound } from "@/lib/data/guard";
import { requireOrg } from "@/lib/data/session";
import { formatDate, formatNumber, relativeTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { RepoStatus } from "@/components/repo-status";
import { FindingCounts, ReviewStatusPill } from "@/components/review-bits";
import { AdminOnlyNotice } from "@/components/no-access";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, StatTile } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Inbox } from "lucide-react";
import { RepoToggle } from "../row-controls";
import { ReindexButton, RepoSettings } from "./client";

export async function generateMetadata({ params }: PageProps<"/repos/[id]">): Promise<Metadata> {
  const ctx = await requireOrg();
  try {
    return { title: (await getRepo(ctx, (await params).id)).fullName };
  } catch {
    return { title: "Repository" };
  }
}

const TABS = ["overview", "reviews", "settings", "knowledge"] as const;

export default async function RepoPage({ params, searchParams }: PageProps<"/repos/[id]">) {
  const ctx = await requireOrg();
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.find((t) => t === sp.tab) ?? "overview";
  const repo = await orNotFound(getRepo(ctx, id));
  const [config, reviews, docs] = await Promise.all([getReviewConfig(ctx, id), listReviews(ctx, { repoId: id, limit: 8 }), listKnowledge(ctx, id)]);
  const isAdmin = ctx.role === "admin";
  const indexing = ["submitted", "cloning", "processing"].includes(repo.indexStatus);

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/repos", label: "Repositories" }]}
        title={repo.fullName}
        description={<span className="flex flex-wrap items-center gap-3"><RepoStatus {...repo} /> <span>Default branch <code className="font-mono">{repo.defaultBranch}</code></span></span>}
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <a href={`https://github.com/${repo.fullName}`} target="_blank" rel="noreferrer"><ExternalLink aria-hidden /> Open on GitHub</a>
            </Button>
            {isAdmin && <ReindexButton repoId={repo.id} name={repo.fullName} disabled={indexing} />}
          </>
        }
      />

      <Tabs defaultValue={tab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="settings">Settings{config.stored ? " (custom)" : ""}</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4">
          {repo.indexStatus === "failed" && (
            <Alert variant="danger" title="Indexing failed" action={isAdmin && <ReindexButton repoId={repo.id} name={repo.fullName} variant="secondary" label="Retry" />}>
              {repo.indexError} Until it&apos;s fixed, reviews only see the diff, not the rest of the codebase.
            </Alert>
          )}
          {indexing && (
            <Alert variant="info" title="Indexing">Reading the codebase so reviews can follow calls across files. Large repositories take up to 30 minutes.</Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Files indexed" value={repo.filesIndexed ? formatNumber(repo.filesIndexed) : "—"} />
            <StatTile label="Indexed commit" value={<span className="font-mono text-lg">{repo.indexedSha ?? "—"}</span>} />
            <StatTile label="Reviews" value={formatNumber(repo.reviewCount)} />
            <StatTile label="Last review" value={<span className="text-lg">{relativeTime(repo.lastReviewAt)}</span>} />
          </div>
          <Card title="Review pull requests" description="When off, new pull requests here aren't reviewed automatically. Commenting @countersign still works.">
            <label className="flex items-center gap-3">
              <RepoToggle id={repo.id} name={repo.fullName} enabled={repo.reviewEnabled} disabled={!isAdmin} />
              <span className="text-base text-fg">{repo.reviewEnabled ? "On" : "Off"}</span>
            </label>
          </Card>
          <p className="text-sm text-muted">
            Last indexed {formatDate(repo.lastIndexedAt, true)} · installed through {repo.installationLogin}
          </p>
        </TabsContent>

        <TabsContent value="reviews">
          {reviews.items.length === 0 ? (
            <div className="rounded-lg border">
              <EmptyState icon={Inbox} title="No reviews yet" body="Reviews appear here when pull requests are opened on this repository." />
            </div>
          ) : (
            <ul className="divide-y rounded-lg border">
              {reviews.items.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Link href={`/reviews/${r.id}`} className="min-w-0 flex-1 truncate font-medium text-fg hover:underline">
                    {r.pr.title} <span className="font-normal text-muted">#{r.pr.number}</span>
                  </Link>
                  <ReviewStatusPill status={r.status} reason={r.skipReason} />
                  {r.status === "completed" && <FindingCounts counts={r.counts} />}
                  <span className="text-sm text-muted">{relativeTime(r.queuedAt)}</span>
                </li>
              ))}
            </ul>
          )}
          {reviews.total > reviews.items.length && (
            <Button asChild variant="link" className="mt-3"><Link href={`/reviews?repo=${repo.id}`}>See all {reviews.total} reviews</Link></Button>
          )}
        </TabsContent>

        <TabsContent value="settings" className="max-w-3xl">
          {!isAdmin && <div className="mb-4"><AdminOnlyNotice what="repository settings" /></div>}
          <RepoSettings repoId={repo.id} hasOverride={!!config.stored} effective={config.effective} readOnly={!isAdmin} />
        </TabsContent>

        <TabsContent value="knowledge">
          <Card
            title="Knowledge base"
            description={docs.length ? `${docs.length} pages written from the code, kept up to date on every index.` : "Written after the first full index."}
            actions={docs.length > 0 && <Button asChild size="sm"><Link href={`/knowledge/${repo.id}`}>Open</Link></Button>}
          >
            {docs.length ? (
              <ul className="flex flex-col gap-1">
                {docs.map((d) => (
                  <li key={d.id}><Link className="text-accent hover:underline" href={`/knowledge/${repo.id}?doc=${d.id}`}>{d.title}</Link></li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">Nothing yet.</p>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
