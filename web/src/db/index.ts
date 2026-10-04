import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function make() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  const client = postgres(url, { max: Number(process.env.DATABASE_POOL ?? 10), onnotice: () => {} });
  return { client, db: drizzle({ client, schema }) };
}
export type DB = ReturnType<typeof make>["db"];

// One pool per process, created on first use (so builds and tests without a database don't connect),
// and kept on globalThis so dev hot-reloads don't open new pools.
const g = globalThis as unknown as { __reptileDb?: ReturnType<typeof make> };
const inst = () => (g.__reptileDb ??= make());

export const db: DB = new Proxy({} as DB, {
  get(_, k) {
    const real = inst().db;
    const v = Reflect.get(real, k, real);
    return typeof v === "function" ? v.bind(real) : v;
  },
});

/** The real Drizzle instance (some libraries check its class, which the lazy proxy above can't pass). */
export const getDb = (): DB => inst().db;

/** Raw client for the few queries Drizzle can't express (pgvector search, advisory locks). */
export const sql = () => inst().client;

/** For tests and scripts: close the pool. */
export async function closeDb() {
  if (g.__reptileDb) await g.__reptileDb.client.end();
  g.__reptileDb = undefined;
}

export { schema };
