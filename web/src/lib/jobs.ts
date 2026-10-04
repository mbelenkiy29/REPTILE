// Job queue (pg-boss, in the same Postgres). The web app only sends; the worker (worker/index.ts) processes.
import { PgBoss, type SendOptions } from "pg-boss";

export const QUEUES = {
  "index-repo": { retryLimit: 2, retryDelay: 60, retryBackoff: true, expireInSeconds: 30 * 60, policy: "singleton" },
  "review-pr": { retryLimit: 2, retryDelay: 30, retryBackoff: true, expireInSeconds: 15 * 60, policy: "standard" },
  "answer-thread": { retryLimit: 2, retryDelay: 30, retryBackoff: true, expireInSeconds: 5 * 60, policy: "standard" },
  "send-email": { retryLimit: 5, retryDelay: 30, retryBackoff: true, expireInSeconds: 60, policy: "standard" },
  "sync-reactions": { retryLimit: 1, expireInSeconds: 10 * 60, policy: "singleton" },
  "learn-rules": { retryLimit: 1, expireInSeconds: 30 * 60, policy: "singleton" },
  "report-usage": { retryLimit: 3, retryDelay: 60, expireInSeconds: 5 * 60, policy: "singleton" },
  "cleanup": { retryLimit: 1, expireInSeconds: 30 * 60, policy: "singleton" },
  "billing-emails": { retryLimit: 1, expireInSeconds: 10 * 60, policy: "singleton" },
} as const;
export type QueueName = keyof typeof QUEUES;
export const DEAD_LETTER = "dead-letter";

export interface JobData {
  "index-repo": { repoId: string; full?: boolean };
  "review-pr": { reviewId: string };
  "answer-thread": { findingId: string; commentId: number; body: string; author: string };
  "send-email": { to: string; template: string; vars: Record<string, string> };
  "sync-reactions": Record<string, never>;
  "learn-rules": Record<string, never>;
  "report-usage": Record<string, never>;
  "cleanup": Record<string, never>;
  "billing-emails": Record<string, never>;
}

type Sender = <Q extends QueueName>(name: Q, data: JobData[Q], opts?: SendOptions) => Promise<string | null>;

const g = globalThis as unknown as { __countersignBoss?: Promise<PgBoss>; __countersignSender?: Sender };

export async function getBoss(opts: { worker?: boolean } = {}): Promise<PgBoss> {
  g.__countersignBoss ??= (async () => {
    const boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      // Only the worker supervises queues and runs cron schedules.
      supervise: !!opts.worker,
      schedule: !!opts.worker,
    });
    boss.on("error", (e) => console.error("[jobs]", e));
    await boss.start();
    await ensureQueues(boss);
    return boss;
  })();
  return g.__countersignBoss;
}

export async function ensureQueues(boss: PgBoss) {
  const existing = new Set((await boss.getQueues()).map((q) => q.name));
  if (!existing.has(DEAD_LETTER)) await boss.createQueue(DEAD_LETTER, { retentionSeconds: 30 * 86400 });
  for (const [name, o] of Object.entries(QUEUES)) {
    if (!existing.has(name)) await boss.createQueue(name, { ...o, deadLetter: DEAD_LETTER });
  }
}

/** Queue a job. Tests can swap the sender with setJobSender to capture jobs instead. */
export const enqueue: Sender = async (name, data, opts) => {
  if (g.__countersignSender) return g.__countersignSender(name, data, opts);
  const boss = await getBoss();
  return boss.send(name, data as object, opts);
};

export function setJobSender(s: Sender | undefined) {
  g.__countersignSender = s;
}
