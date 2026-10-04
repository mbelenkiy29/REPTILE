import type { IndexStatus } from "@/lib/data";
import { StatusPill } from "./ui/badge";

/** Index status as people read it: off wins, then the index lifecycle. */
export function RepoStatus({ indexStatus, reviewEnabled, indexError }: { indexStatus: IndexStatus; reviewEnabled: boolean; indexError?: string | null }) {
  if (!reviewEnabled) return <StatusPill status="disabled" label="Reviews off" />;
  if (indexStatus === "completed") return <StatusPill status="completed" />;
  if (indexStatus === "failed") return <StatusPill status="failed" label="Index failed" reason={indexError ?? undefined} />;
  return <StatusPill status="indexing" label={indexStatus === "submitted" ? "Queued" : "Indexing"} />;
}
