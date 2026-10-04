import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  secondary,
  className,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <span className="grid size-10 place-items-center rounded-pill bg-accent-soft text-accent">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <h3 className="text-md font-semibold text-fg">{title}</h3>
        <p className="text-sm text-muted">{body}</p>
      </div>
      {(action || secondary) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
          {action}
          {secondary}
        </div>
      )}
    </div>
  );
}
