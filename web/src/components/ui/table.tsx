import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Skeleton } from "./skeleton";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative overflow-x-auto rounded-lg border bg-bg">
      <table className={cn("w-full border-collapse text-base", className)} {...props} />
    </div>
  );
}

export function THead(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="bg-surface" {...props} />;
}

export function TRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b last:border-b-0 hover:bg-surface/60", className)} {...props} />;
}

export function TH({
  className,
  sort,
  onSort,
  numeric,
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  sort?: "asc" | "desc" | false;
  onSort?: () => void;
  numeric?: boolean;
}) {
  const Icon = sort === "asc" ? ArrowUp : sort === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <th
      scope="col"
      aria-sort={sort === "asc" ? "ascending" : sort === "desc" ? "descending" : onSort ? "none" : undefined}
      className={cn("h-9 border-b px-3 text-left text-xs font-medium text-muted", numeric && "text-right", className)}
      {...props}
    >
      {onSort ? (
        <button
          type="button"
          onClick={onSort}
          className="inline-flex items-center gap-1 rounded-sm hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
        >
          {children}
          <Icon className="size-3" aria-hidden />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function TD({ className, numeric, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <td className={cn("h-11 px-3 text-fg", numeric && "text-right tabular-nums", className)} {...props} />;
}

export function TableSkeleton({ rows = 5, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="border-b last:border-b-0" aria-hidden>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className="h-11 px-3">
              <Skeleton className={cn("h-3.5", c === 0 ? "w-40" : "w-16")} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function TableEmpty({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={cols}>{children}</td>
    </tr>
  );
}
