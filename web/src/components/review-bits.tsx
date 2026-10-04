import type { ReviewStatus, Severity } from "@/lib/data";
import { SeverityBadge, StatusPill, type Status } from "./ui/badge";

const map: Record<ReviewStatus, { status: Status; label: string }> = {
  queued: { status: "queued", label: "Queued" },
  running: { status: "running", label: "Reviewing" },
  completed: { status: "completed", label: "Reviewed" },
  failed: { status: "failed", label: "Failed" },
  skipped: { status: "skipped", label: "Skipped" },
  superseded: { status: "superseded", label: "Replaced" },
};

export function ReviewStatusPill({ status, reason }: { status: ReviewStatus; reason?: string | null }) {
  const m = map[status];
  return <StatusPill status={m.status} label={m.label} reason={reason ?? undefined} />;
}

export function FindingCounts({ counts }: { counts: Record<Severity, number> }) {
  const shown = (["P0", "P1", "P2"] as const).filter((s) => counts[s] > 0);
  if (!shown.length) return <span className="text-sm text-muted">None</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((s) => (
        <span key={s} className="inline-flex items-center gap-1">
          <SeverityBadge severity={s} />
          <span className="text-sm tabular-nums text-fg">×{counts[s]}</span>
        </span>
      ))}
    </span>
  );
}
