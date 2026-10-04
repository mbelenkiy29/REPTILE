import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Ban } from "lucide-react";
import { getReview, getReviewConfig, type Finding } from "@/lib/data";
import { orNotFound } from "@/lib/data/guard";
import { requireOrg } from "@/lib/data/session";
import { formatDate, relativeTime, plural } from "@/lib/format";
import { checkRunTitle, renderInlineComment, renderSummary, sortFindings } from "@/lib/review/markdown";
import { AutoRefresh } from "@/components/auto-refresh";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { ReviewStatusPill } from "@/components/review-bits";
import { Alert } from "@/components/ui/alert";
import { Badge, ConfidenceScore, SeverityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RerunButton } from "./rerun-button";

export async function generateMetadata({ params }: PageProps<"/reviews/[id]">): Promise<Metadata> {
  const ctx = await requireOrg();
  try {
    const r = await getReview(ctx, (await params).id);
    return { title: `#${r.pr.number} ${r.pr.title}` };
  } catch {
    return { title: "Review" };
  }
}

const STATUS_WORD: Record<Finding["status"], string> = { open: "Open", addressed: "Fixed", resolved: "Resolved", dismissed: "Dismissed" };

export default async function ReviewPage({ params }: PageProps<"/reviews/[id]">) {
  const ctx = await requireOrg();
  const { id } = await params;
  const r = await orNotFound(getReview(ctx, id));
  const { effective } = await getReviewConfig(ctx, r.repo.id);
  const findings = sortFindings(r.findings);
  const open = findings.filter((f) => f.status === "open");
  const inProgress = r.status === "running" || r.status === "queued";
  const fixAllUrl = `/fix/pr/${r.pullRequestId}`;
  const summary = r.status === "completed"
    ? renderSummary({ review: r, findings: r.findings, options: effective.summary, fixAllUrl, commentUrl: (f) => `#finding-${f.id}` })
    : null;
  const check = r.status === "completed" ? checkRunTitle(r.findings) : null;

  return (
    <>
      <AutoRefresh active={inProgress} />
      <PageHeader
        crumbs={[{ href: "/reviews", label: "Reviews" }]}
        title={<>{r.pr.title} <span className="font-normal text-muted">#{r.pr.number}</span></>}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href={`/repos/${r.repo.id}`} className="hover:text-fg hover:underline">{r.repo.fullName}</Link>
            <span>by {r.pr.authorLogin}</span>
            <span>opened {relativeTime(r.pr.openedAt)}</span>
            {r.pr.isDraft && <Badge>Draft</Badge>}
            {r.pr.state !== "open" && <Badge tone={r.pr.state === "merged" ? "accent" : "neutral"}>{r.pr.state === "merged" ? "Merged" : "Closed"}</Badge>}
          </span>
        }
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <a href={r.pr.url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden /> Open on GitHub</a>
            </Button>
            <RerunButton reviewId={r.id} disabled={inProgress} label={r.status === "skipped" ? "Review anyway" : "Run again"} />
          </>
        }
      />

      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-surface px-4 py-3">
          <ReviewStatusPill status={r.status} />
          {r.confidenceScore && <ConfidenceScore score={r.confidenceScore} />}
          {r.verdict && <span className="font-medium text-fg">{r.verdict}</span>}
          <span className="ml-auto text-sm text-muted">
            {r.completedAt ? `Finished ${relativeTime(r.completedAt)}` : `Queued ${relativeTime(r.queuedAt)}`} · commit <span className="font-mono">{r.headSha}</span>
          </span>
        </div>

        {r.status === "skipped" && (
          <Alert variant="info" title={`Skipped: ${r.skipReason}`}>
            Automatic reviews follow your <Link className="underline" href="/settings/review">review settings</Link>. Use “Review anyway”, or comment <code>@reptile</code> on the pull request.
          </Alert>
        )}
        {r.status === "failed" && (
          <Alert variant="danger" title="This review didn't finish" live>{r.error} No credit was used for the failed attempt.</Alert>
        )}

        {inProgress ? (
          <Card title="Reviewing" description="Reading the changes and the code around them. This usually takes 2 to 4 minutes.">
            <div className="flex flex-col gap-2" role="status" aria-busy aria-label="Review in progress">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          </Card>
        ) : r.status === "completed" ? (
          <Tabs defaultValue="findings">
            <TabsList>
              <TabsTrigger value="findings">Findings ({open.length} open)</TabsTrigger>
              <TabsTrigger value="github">As posted on GitHub</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>

            <TabsContent value="findings">
              {r.summaryMd && <p className="mb-4 max-w-3xl text-fg">{r.summaryMd}</p>}
              {findings.length === 0 ? (
                <div className="rounded-lg border">
                  <EmptyState icon={Ban} title="No issues found" body={`Checked: ${r.checked.join("; ")}.`} />
                </div>
              ) : (
                <ol className="flex flex-col gap-3">
                  {findings.map((f) => (
                    <li key={f.id} id={`finding-${f.id}`} className="scroll-mt-20 rounded-lg border bg-bg">
                      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
                        <SeverityBadge severity={f.severity} showWord />
                        <Badge>{f.type[0].toUpperCase() + f.type.slice(1)}</Badge>
                        <h3 className="min-w-0 flex-1 font-semibold text-fg">{f.title}</h3>
                        <Badge tone={f.status === "open" ? "warning" : f.status === "dismissed" ? "neutral" : "success"}>{STATUS_WORD[f.status]}</Badge>
                      </div>
                      <div className="flex flex-col gap-3 px-4 py-3">
                        <p className="font-mono text-sm text-muted">
                          {f.filePath}:{f.lineStart}{f.lineEnd !== f.lineStart && `–${f.lineEnd}`}
                          {!f.inDiff && " · outside the changed lines"}
                        </p>
                        <Markdown>{f.bodyMd}</Markdown>
                        {f.suggestion && (
                          <div>
                            <p className="mb-1 text-sm font-medium text-fg">Suggested change</p>
                            <pre tabIndex={0} aria-label="Suggested change" className="overflow-x-auto rounded-md border bg-surface-sunken p-3 font-mono text-sm text-fg"><code>{f.suggestion}</code></pre>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
                          {f.ruleId && (
                            <span>Rule: <Link className="text-accent underline underline-offset-2" href="/rules">{r.rules.find((x) => x.id === f.ruleId)?.text.slice(0, 60) ?? "custom rule"}…</Link></span>
                          )}
                          <span aria-label={`${f.thumbsUp} thumbs up, ${f.thumbsDown} thumbs down`}>👍 {f.thumbsUp} · 👎 {f.thumbsDown}</span>
                          <Link className="text-accent hover:underline" href={`/fix/${f.id}`}>Fix with your agent</Link>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </TabsContent>

            <TabsContent value="github" className="flex flex-col gap-4">
              <p className="text-sm text-muted">
                This is the comment, inline notes and check that REPTILE posts. The summary comment is edited in place on each new review.
              </p>
              {check && (
                <Card title="Check run">
                  <p className="font-mono text-sm text-fg">{check.title}</p>
                  <p className="mt-1 text-sm text-muted">
                    Result: {check.conclusion === "neutral" ? "neutral (critical findings; doesn't block merging)" : "success"}
                  </p>
                </Card>
              )}
              {summary && <Card title="Summary comment"><Markdown>{summary}</Markdown></Card>}
              {open.filter((f) => f.inDiff).map((f) => (
                <Card key={f.id} title={<span className="font-mono text-sm font-normal">{f.filePath}:{f.lineStart}</span>}>
                  <Markdown>{renderInlineComment(f, `/fix/${f.id}`)}</Markdown>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="details">
              <dl className="grid max-w-2xl grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-base">
                <dt className="text-muted">Triggered by</dt><dd className="text-fg">{r.trigger === "mention" ? "A @reptile comment" : r.trigger === "manual" ? "Run again from the dashboard" : "Pull request opened"}</dd>
                <dt className="text-muted">Queued</dt><dd className="text-fg">{formatDate(r.queuedAt, true)}</dd>
                <dt className="text-muted">Finished</dt><dd className="text-fg">{formatDate(r.completedAt, true)}</dd>
                <dt className="text-muted">Credits used</dt><dd className="text-fg">{r.creditsUsed}</dd>
                <dt className="text-muted">Strictness</dt><dd className="text-fg">{effective.strictness} of 3</dd>
                <dt className="text-muted">Files reviewed</dt><dd className="text-fg">{plural(r.filesReviewed.length, "file")}</dd>
              </dl>
            </TabsContent>
          </Tabs>
        ) : null}
      </div>
    </>
  );
}
