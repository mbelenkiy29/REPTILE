// Applies db/migrations/*.sql in order, each in its own transaction, recording them in schema_migrations.
// Usage: DATABASE_URL=postgres://... npx tsx db/migrate.ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

export async function migrate(url = process.env.DATABASE_URL, log = console.log) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    // The web deploy (vercel-build) and the worker deploy (Fly release_command) both migrate; the lock makes the second
    // one wait for the first, then find nothing left to apply.
    await sql`select pg_advisory_lock(727274)`;
    await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const done = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
    const dir = join(import.meta.dirname, "migrations");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (done.has(file)) continue;
      const body = readFileSync(join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name) values (${file})`;
      });
      log(`applied ${file}`);
    }
  } finally {
    await sql`select pg_advisory_unlock(727274)`.catch(() => {});
    await sql.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
