import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { listKnowledge, listRepos } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { relativeTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Knowledge" };

export default async function KnowledgePage() {
  const ctx = await requireOrg();
  const repos = await listRepos(ctx);
  const rows = await Promise.all(repos.map(async (r) => ({ repo: r, docs: await listKnowledge(ctx, r.id) })));
  const withDocs = rows.filter((r) => r.docs.length);
  return (
    <>
      <PageHeader
        title="Knowledge"
        description="Docs REPTILE writes about each repository: how it's laid out, what each area does, and what broke before. Reviews read them, and your team can correct them."
      />
      {withDocs.length === 0 ? (
        <div className="rounded-lg border">
          <EmptyState icon={BookOpen} title="Nothing written yet" body="Knowledge pages are written after a repository's first full index." />
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ repo, docs }) => (
            <li key={repo.id} className="flex flex-col gap-2 rounded-lg border bg-bg p-4">
              <h2 className="truncate font-semibold text-fg" title={repo.fullName}>
                {docs.length ? <Link className="hover:underline focus-visible:outline-2 focus-visible:outline-focus" href={`/knowledge/${repo.id}`}>{repo.fullName}</Link> : repo.fullName}
              </h2>
              <p className="text-sm text-muted">
                {docs.length ? `${docs.length} pages · updated ${relativeTime(docs.map((d) => d.updatedAt).sort().at(-1))}` : repo.indexStatus === "completed" ? "Being written" : "Waiting for the first index"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
