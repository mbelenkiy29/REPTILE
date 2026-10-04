import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText, Sparkles } from "lucide-react";
import { listRepos, listRules } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { relativeTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { AdminOnlyNotice } from "@/components/no-access";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { RuleActions, RuleEditor, SuggestionActions } from "./client";

export const metadata: Metadata = { title: "Rules" };

const VIEWS = [
  { value: "active", label: "Active" },
  { value: "suggested", label: "Suggested" },
  { value: "disabled", label: "Turned off" },
] as const;

const KIND = { rule: "Rule", style_guide: "Style guide", doc: "Reference" } as const;

export default async function RulesPage({ searchParams }: PageProps<"/rules">) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.value === sp.view)?.value ?? "active";
  const [all, repos] = await Promise.all([listRules(ctx), listRepos(ctx)]);
  const rules = all.filter((r) => r.status === view);
  const isAdmin = ctx.role === "admin";
  const repoName = (id: string) => repos.find((r) => r.id === id)?.fullName ?? "a removed repository";
  const repoOptions = repos.map((r) => ({ id: r.id, name: r.fullName }));

  return (
    <>
      <PageHeader
        title="Rules"
        description="Your team's conventions in plain English. Every review checks the rules that apply to the files it touches, and cites the rule when it comments."
        actions={isAdmin && <RuleEditor repos={repoOptions} />}
      />
      {!isAdmin && <div className="mb-4"><AdminOnlyNotice what="rules" /></div>}

      <nav aria-label="Rule status" className="mb-4 flex gap-4 border-b">
        {VIEWS.map((v) => {
          const n = all.filter((r) => r.status === v.value).length;
          const active = v.value === view;
          return (
            <Link
              key={v.value}
              href={v.value === "active" ? "/rules" : `/rules?view=${v.value}`}
              aria-current={active ? "page" : undefined}
              className={"-mb-px flex h-9 items-center gap-1.5 border-b-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-focus " +
                (active ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}
            >
              {v.label}
              {n > 0 && <Badge tone={v.value === "suggested" ? "accent" : "neutral"}>{n}</Badge>}
            </Link>
          );
        })}
      </nav>

      {view === "suggested" && rules.length > 0 && (
        <p className="mb-4 flex items-center gap-2 text-sm text-muted">
          <Sparkles className="size-4 text-accent" aria-hidden /> Learned from 👍/👎 reactions and your team&apos;s own review comments. Nothing changes until an admin accepts one.
        </p>
      )}

      {rules.length === 0 ? (
        <div className="rounded-lg border">
          {view === "active" ? (
            <EmptyState
              icon={ScrollText}
              title="No rules yet"
              body="Write a rule in plain English and every review checks it. Example: “API handlers validate input with zod before touching the database.”"
              action={isAdmin ? <RuleEditor repos={repoOptions} triggerLabel="Write a rule" /> : undefined}
            />
          ) : view === "suggested" ? (
            <EmptyState icon={Sparkles} title="No suggestions right now" body="As your team reacts to comments and reviews pull requests, patterns show up here as suggested rules." />
          ) : (
            <EmptyState icon={ScrollText} title="Nothing turned off" body="Rules you turn off stay here so you can turn them back on." />
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rules.map((r) => (
            <li key={r.id} className="rounded-lg border bg-bg p-4">
              <div className="flex flex-wrap items-start gap-3">
                <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-fg">{r.text}</p>
                {isAdmin && (view === "suggested"
                  ? <SuggestionActions id={r.id} />
                  : <RuleActions rule={{ id: r.id, text: r.text, kind: r.kind, repoIds: r.repoIds, pathGlobs: r.pathGlobs, status: r.status, source: r.source }} repos={repoOptions} />)}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
                <Badge>{KIND[r.kind]}</Badge>
                <Badge tone={r.source === "learned" ? "accent" : "neutral"}>{r.source === "learned" ? "Learned" : r.source === "file" ? "From a repository file" : "Written by your team"}</Badge>
                <span>{r.repoIds.length ? r.repoIds.map(repoName).join(", ") : "All repositories"}</span>
                {r.pathGlobs.length > 0 && <span className="font-mono text-xs">{r.pathGlobs.join(", ")}</span>}
                <span>· updated {relativeTime(r.updatedAt)}</span>
              </div>
              {r.evidence.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer rounded-sm text-accent focus-visible:outline-2 focus-visible:outline-focus">Why this was suggested ({r.evidence.length})</summary>
                  <ul className="mt-2 flex flex-col gap-1 pl-4">
                    {r.evidence.map((e, i) => (
                      <li key={i}><a className="text-fg hover:underline" href={e.url} target="_blank" rel="noreferrer">{e.excerpt}</a></li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
