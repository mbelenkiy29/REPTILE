import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { CodeBlock } from "@/components/ui/code-block";

export function FixView({ title, prompt, reviewHref, repo }: { title: string; prompt: string; reviewHref: string; repo: string }) {
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/reviews", label: "Reviews" }, { href: reviewHref, label: "Review" }]}
        title={title}
        description={`Copy this prompt into your coding agent, in a checkout of ${repo} on the pull request's branch.`}
      />
      <div className="flex max-w-3xl flex-col gap-4">
        <CodeBlock title="prompt.txt" code={prompt} />
        <p className="text-sm text-muted">
          With Claude Code: run <code className="font-mono text-fg">claude</code> in the repository and paste the prompt. Other agents work the same way.
          Then push; REPTILE reviews the new commits and marks fixed findings. <Link href={reviewHref} className="text-accent underline underline-offset-2">Back to the review</Link>
        </p>
      </div>
    </>
  );
}
