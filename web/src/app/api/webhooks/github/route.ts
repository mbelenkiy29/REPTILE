import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { verify } from "@octokit/webhooks-methods";
import { db, schema as s } from "@/db";
import { handleGitHubEvent } from "@/lib/github/events";

// GitHub App webhooks: verify the signature, record the delivery id (GitHub can redeliver), then handle.
export async function POST(req: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const body = await req.text();
  if (body.length > 25 * 1024 * 1024) return NextResponse.json({ error: "too large" }, { status: 413 });
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  if (!signature || !(await verify(secret, body, signature).catch(() => false))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const event = req.headers.get("x-github-event") ?? "";
  const delivery = req.headers.get("x-github-delivery") ?? "";
  if (!event || !delivery) return NextResponse.json({ error: "missing headers" }, { status: 400 });

  const fresh = await db.insert(s.webhookDeliveries).values({ source: "github", deliveryId: delivery, event })
    .onConflictDoNothing().returning({ id: s.webhookDeliveries.deliveryId });
  if (!fresh.length) return NextResponse.json({ ok: true, result: "duplicate delivery" });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const where = and(eq(s.webhookDeliveries.source, "github"), eq(s.webhookDeliveries.deliveryId, delivery));
  try {
    const result = await handleGitHubEvent(event, payload);
    await db.update(s.webhookDeliveries).set({ processedAt: new Date().toISOString() }).where(where);
    return NextResponse.json({ ok: true, result }, { status: 202 });
  } catch (e) {
    // Forget the delivery so a redelivery is processed, and record nothing sensitive.
    await db.delete(s.webhookDeliveries).where(where);
    console.error(`[github] ${event} ${delivery} failed:`, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}
