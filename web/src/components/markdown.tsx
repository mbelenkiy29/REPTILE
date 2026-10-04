import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";

/** GitHub-flavoured markdown, no raw HTML (safe for content from PRs). <details> blocks become bold labels. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  const text = children
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<details><summary>(.*?)<\/summary>/g, "**$1**")
    .replace(/<\/details>/g, "");
  return (
    <div className={cn("md", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: ({ node, ...props }) => { void node; return <pre tabIndex={0} {...props} />; } }}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
