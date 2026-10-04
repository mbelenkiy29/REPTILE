import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { getRepo, getUserName, listKnowledge } from "@/lib/data";
import { orNotFound } from "@/lib/data/guard";
import { requireOrg } from "@/lib/data/session";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { DocBody } from "./doc-body";

export const metadata: Metadata = { title: "Knowledge" };

export default async function RepoKnowledgePage({ params, searchParams }: PageProps<"/knowledge/[repoId]">) {
  const ctx = await requireOrg();
  const { repoId } = await params;
  const sp = await searchParams;
  const repo = await orNotFound(getRepo(ctx, repoId));
  const docs = await listKnowledge(ctx, repoId);
  const doc = docs.find((d) => d.id === sp.doc) ?? docs[0];
  const editor = doc ? await getUserName(doc.editedBy) : null;

  return (
    <>
      <PageHeader crumbs={[{ href: "/knowledge", label: "Knowledge" }]} title={repo.fullName} />
      {!doc ? (
        <div className="rounded-lg border">
          <EmptyState icon={BookOpen} title="Nothing written yet" body="Pages are written after the first full index of this repository." />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
          <nav aria-label="Pages" className="min-w-0 md:sticky md:top-[calc(var(--layout-header)+24px)] md:self-start">
            <ul className="flex gap-1 overflow-x-auto md:flex-col">
              {docs.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/knowledge/${repoId}?doc=${d.id}`}
                    aria-current={d.id === doc.id ? "page" : undefined}
                    className={cn("block whitespace-nowrap rounded-md px-2.5 py-1.5 text-base transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus",
                      d.id === doc.id ? "bg-surface font-medium text-fg" : "text-muted")}
                  >
                    {d.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <article className="min-w-0">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b pb-3">
              <h2 className="text-lg text-fg">{doc.title}</h2>
              <p className="text-sm text-muted">{editor ? `Edited by ${editor}` : "Written by REPTILE"} · {relativeTime(doc.updatedAt)}</p>
            </div>
            <DocBody key={doc.id} repoId={repoId} id={doc.id} body={doc.bodyMd} canEdit={ctx.role === "admin"} />
          </article>
        </div>
      )}
    </>
  );
}
