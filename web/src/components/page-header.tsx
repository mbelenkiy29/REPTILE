import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function PageHeader({
  title,
  description,
  actions,
  crumbs,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  crumbs?: { href: string; label: string }[];
}) {
  return (
    <div className="mb-6 flex flex-col gap-3">
      {crumbs && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
            {crumbs.map((c) => (
              <li key={c.href} className="flex items-center gap-1">
                <Link href={c.href} className="rounded-sm hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-focus">
                  {c.label}
                </Link>
                <ChevronRight className="size-3.5" aria-hidden />
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-xl text-fg">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
