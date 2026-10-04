import * as React from "react";
import { cn } from "@/lib/cn";
import { Skeleton } from "./skeleton";

export function Card({
  title,
  description,
  actions,
  footer,
  className,
  children,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-lg border bg-bg shadow-card", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-md font-semibold text-fg">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children !== undefined && <div className="p-4">{children}</div>}
      {footer && <footer className="flex justify-end gap-2 border-t bg-surface px-4 py-3">{footer}</footer>}
    </section>
  );
}

export function StatTile({
  label,
  value,
  delta,
  goodWhen = "up",
  deltaUnit = "%",
  loading,
}: {
  label: string;
  value?: React.ReactNode;
  /** Percent change vs. the previous period. */
  delta?: number;
  goodWhen?: "up" | "down";
  /** "%" for relative change, " pts" for a change in a percentage. */
  deltaUnit?: "%" | " pts";
  loading?: boolean;
}) {
  const good = delta !== undefined && (goodWhen === "up" ? delta >= 0 : delta <= 0);
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-bg p-4 shadow-card">
      <span className="text-sm text-muted">{label}</span>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <span className="text-xl tabular-nums text-fg">{value}</span>
      )}
      {!loading && delta !== undefined && (
        <span className={cn("text-sm tabular-nums", good ? "text-success" : "text-danger")}>
          {delta >= 0 ? "↑ +" : "↓ −"}
          {Math.abs(delta)}
          {deltaUnit} <span className="text-muted">vs. previous period</span>
        </span>
      )}
    </div>
  );
}

/** `overNote` explains what happens past the included amount; it depends on the plan (null shows nothing). */
export function UsageMeter({ label, used, included, overNote = (n) => `${n} over this month's allowance.` }: {
  label: string; used: number; included: number; overNote?: ((over: string) => string) | null;
}) {
  const pct = included ? (used / included) * 100 : 0;
  const bar = pct > 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-accent";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="font-medium text-fg">{label}</span>
        <span className="tabular-nums text-muted">
          {used.toLocaleString()} / {included.toLocaleString()}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={included}
        aria-valuenow={used}
        aria-valuetext={`${used} of ${included} used`}
        className="h-2 overflow-hidden rounded-pill bg-surface-sunken"
      >
        <div className={cn("h-full rounded-pill transition-[width]", bar)} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      {pct > 100 && overNote && (
        <p className="text-sm text-danger">
          {overNote((used - included).toLocaleString())}
        </p>
      )}
    </div>
  );
}
