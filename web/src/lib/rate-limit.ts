// Fixed-window rate limits in Postgres (no extra infrastructure). One row per key per window.
import { sql } from "@/db";

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Too many attempts. Try again in ${retryAfterSeconds < 120 ? `${retryAfterSeconds} seconds` : `${Math.ceil(retryAfterSeconds / 60)} minutes`}.`);
    this.name = "RateLimitError";
  }
}

/** Allow `limit` hits per `windowSeconds` for `key`; throws RateLimitError past that. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000);
  const [row] = await sql()<{ count: number }[]>`
    insert into rate_limits (key, window_start, count) values (${key}, ${windowStart.toISOString()}::timestamptz, 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`;
  if (row.count > limit) {
    throw new RateLimitError(Math.max(1, Math.ceil((windowStart.getTime() + windowSeconds * 1000 - Date.now()) / 1000)));
  }
}
