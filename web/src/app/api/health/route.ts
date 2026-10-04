import { sql } from "drizzle-orm";
import { db } from "@/db";

// For uptime checks: 200 when the app can reach its database, 503 when it can't. Public, no data in the response.
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
