import { and, eq, inArray, lt, type SQL } from "drizzle-orm";
import { db, schema as s } from "@/db";

/**
 * A review job runs at most 3 attempts of 15 minutes plus backoff (src/lib/jobs.ts), so a review still queued or running
 * an hour after its last update has lost its job (worker crash, expiry on every attempt, enqueue failure). Mark it failed
 * so it stops blocking new reviews of the pull request, which "one live review per PR" would otherwise do forever.
 */
export const STALE_AFTER_MS = 60 * 60_000;

type Executor = Pick<typeof db, "update">;

export async function failStaleReviews(tx: Executor = db, pullRequestId?: string) {
  const conds: SQL[] = [
    inArray(s.reviews.status, ["queued", "running"]),
    lt(s.reviews.updatedAt, new Date(Date.now() - STALE_AFTER_MS).toISOString()),
  ];
  if (pullRequestId) conds.push(eq(s.reviews.pullRequestId, pullRequestId));
  const at = new Date().toISOString();
  return tx.update(s.reviews)
    .set({ status: "failed", error: "The review didn't finish within an hour. Run it again.", completedAt: at, updatedAt: at })
    .where(and(...conds)).returning({ id: s.reviews.id });
}
