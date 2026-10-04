// Public API (v1): bearer API keys from S15, read-only, rate-limited per key.
import { NextResponse } from "next/server";
import { authenticateApiKey, type Ctx } from "@/lib/data";
import { rateLimit, RateLimitError } from "@/lib/rate-limit";

export async function apiCtx(req: Request): Promise<Ctx | NextResponse> {
  const auth = req.headers.get("authorization") ?? "";
  const key = /^Bearer\s+(\S+)$/i.exec(auth)?.[1];
  const k = key ? await authenticateApiKey(key) : null;
  if (!k) return NextResponse.json({ error: "Missing or invalid API key." }, { status: 401, headers: { "www-authenticate": "Bearer" } });
  try {
    await rateLimit(`api:${k.keyId}`, 600, 60);
  } catch (e) {
    if (e instanceof RateLimitError) return NextResponse.json({ error: e.message }, { status: 429, headers: { "retry-after": String(e.retryAfterSeconds) } });
    throw e;
  }
  // Keys can read their org; nothing in v1 writes.
  return { orgId: k.orgId, userId: k.keyId, role: "member" };
}
