import * as React from "react";
import { cn } from "@/lib/cn";
import { Tooltip } from "./tooltip";

const tone = {
  neutral: "bg-surface-sunken text-muted border-border",
  info: "bg-info-soft text-info border-transparent",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  accent: "bg-accent-soft text-accent border-transparent",
} as const;

export function Badge({
  tone: t = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tone }) {
  return (
    <span
      className={cn("inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-pill border px-2 text-xs", tone[t], className)}
      {...props}
    />
  );
}

export type Status = "queued" | "indexing" | "running" | "completed" | "failed" | "skipped" | "disabled" | "superseded";

const statusMap: Record<Status, { tone: keyof typeof tone; label: string; pulse?: boolean; dashed?: boolean }> = {
  queued: { tone: "neutral", label: "Queued" },
  indexing: { tone: "info", label: "Indexing", pulse: true },
  running: { tone: "info", label: "Reviewing", pulse: true },
  completed: { tone: "success", label: "Ready" },
  failed: { tone: "danger", label: "Failed" },
  skipped: { tone: "neutral", label: "Skipped" },
  disabled: { tone: "neutral", label: "Off", dashed: true },
  superseded: { tone: "neutral", label: "Superseded" },
};

export function StatusPill({ status, reason, label }: { status: Status; reason?: string; label?: string }) {
  const s = statusMap[status];
  const pill = (
    <Badge tone={s.tone} className={cn(s.dashed && "border-dashed border-border-strong bg-transparent")}>
      <span aria-hidden className={cn("size-1.5 rounded-pill bg-current", s.pulse && "animate-pulse")} />
      {label ?? s.label}
      {reason && <span className="sr-only">: {reason}</span>}
    </Badge>
  );
  return reason ? (
    <Tooltip content={reason}>
      <span tabIndex={0} className="rounded-pill focus-visible:outline-2 focus-visible:outline-focus">
        {pill}
      </span>
    </Tooltip>
  ) : (
    pill
  );
}

const severityMap = {
  P0: { tone: "danger", word: "Critical" },
  P1: { tone: "warning", word: "High" },
  P2: { tone: "info", word: "Medium" },
} as const;

export function SeverityBadge({ severity, showWord }: { severity: keyof typeof severityMap; showWord?: boolean }) {
  const s = severityMap[severity];
  return (
    <Badge tone={s.tone} className="font-mono font-semibold">
      {severity}
      {showWord ? <span className="font-sans font-medium">{s.word}</span> : <span className="sr-only"> {s.word}</span>}
    </Badge>
  );
}

export function ConfidenceScore({ score, className }: { score: 1 | 2 | 3 | 4 | 5; className?: string }) {
  const color = score <= 2 ? "bg-danger" : score === 3 ? "bg-warning" : "bg-success";
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={cn("h-2 w-3 rounded-[2px]", i <= score ? color : "bg-border-strong")} />
        ))}
      </span>
      <span className="text-sm font-medium tabular-nums text-fg">
        {score}/5<span className="sr-only"> confidence</span>
      </span>
    </span>
  );
}
