import { describe, expect, it } from "vitest";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("drizzle schema matches the migrated database", () => {
  it("every column in schema.ts exists with the same name", async () => {
    const sql = postgres(url!, { max: 1 });
    const rows = await sql<{ table_name: string; column_name: string }[]>`
      select table_name, column_name from information_schema.columns where table_schema = 'public'`;
    await sql.end();
    const have = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
    const missing: string[] = [];
    for (const t of Object.values(schema)) {
      if (!is(t, PgTable)) continue;
      for (const c of Object.values(getTableColumns(t))) {
        const key = `${getTableName(t)}.${c.name}`;
        if (!have.has(key)) missing.push(key);
      }
    }
    expect(missing).toEqual([]);
  });
});
