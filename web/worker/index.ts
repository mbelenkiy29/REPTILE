// The Countersign worker: one long-running process (Fly.io). Processes the pg-boss queues and runs the schedules.
// Usage: npx tsx worker/index.ts   (needs DATABASE_URL and the provider keys in the environment)
import { db, schema as s } from "@/db";
import { DEAD_LETTER, getBoss, QUEUES, type JobData, type QueueName } from "@/lib/jobs";
import { reportUsage } from "@/lib/billing";
import { runReview } from "./jobs/review-pr";
import { indexRepo } from "./jobs/index-repo";
import { answerThread, billingEmails, cleanup, learnRules, sendEmailJob, syncReactions } from "./jobs/misc";

type Handler<Q extends QueueName> = (data: JobData[Q], job: { id: string; retryCount: number }) => Promise<unknown>;

export const HANDLERS: { [Q in QueueName]: Handler<Q> } = {
  "review-pr": (d, job) => runReview(d.reviewId, { retryCount: job.retryCount, retryLimit: QUEUES["review-pr"].retryLimit }),
  "index-repo": (d) => indexRepo(d.repoId),
  "answer-thread": (d) => answerThread(d),
  "send-email": (d) => sendEmailJob(d),
  "sync-reactions": () => syncReactions(),
  "learn-rules": () => learnRules(),
  "report-usage": () => reportUsage(),
  "cleanup": () => cleanup(),
  "billing-emails": () => billingEmails(),
};

// UTC cron schedules.
const SCHEDULES: [QueueName, string][] = [
  ["sync-reactions", "*/15 * * * *"],
  ["report-usage", "7 * * * *"],
  ["learn-rules", "23 2 * * *"],
  ["cleanup", "41 3 * * *"],
  ["billing-emails", "13 9 * * *"],
];

const CONCURRENCY: Partial<Record<QueueName, number>> = { "review-pr": 4, "index-repo": 2, "send-email": 4 };

async function main() {
  const boss = await getBoss({ worker: true });
  for (const [name, handler] of Object.entries(HANDLERS) as [QueueName, Handler<QueueName>][]) {
    const n = CONCURRENCY[name] ?? 1;
    for (let i = 0; i < n; i++) {
      await boss.work(name, { batchSize: 1 }, async ([job]) => {
        const started = Date.now();
        const result = await handler(job.data as never, { id: job.id, retryCount: (job as { retryCount?: number }).retryCount ?? 0 });
        console.log(`[worker] ${name} ${job.id} ${Date.now() - started}ms ${JSON.stringify(result ?? {})}`);
        return result;
      });
    }
  }
  // Jobs that used up their retries land here: keep a readable record for operators.
  await boss.work(DEAD_LETTER, { batchSize: 1 }, async ([job]) => {
    const j = job as { id: string; name: string; data: Record<string, unknown>; output?: unknown };
    await db.insert(s.jobFailures).values({ queue: String(j.data?.__queue ?? j.name), jobId: j.id, data: j.data ?? {}, error: JSON.stringify(j.output ?? "failed").slice(0, 4000) }).onConflictDoNothing();
    console.error(`[worker] dead letter ${j.id}`);
  });
  for (const [name, cron] of SCHEDULES) await boss.schedule(name, cron, {}, { tz: "UTC" });
  console.log(`[worker] running ${Object.keys(HANDLERS).length} queues`);
  const stop = async () => {
    console.log("[worker] stopping");
    await boss.stop({ graceful: true, timeout: 60_000 });
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
