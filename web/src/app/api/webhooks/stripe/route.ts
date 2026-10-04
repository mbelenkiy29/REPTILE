import { NextResponse } from "next/server";
import { handleStripeWebhook, SignatureError } from "@/lib/billing";

export async function POST(req: Request) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const body = await req.text();
  try {
    const fresh = await handleStripeWebhook(body, req.headers.get("stripe-signature"));
    return NextResponse.json({ received: true, duplicate: !fresh });
  } catch (e) {
    if (e instanceof SignatureError) return NextResponse.json({ error: "invalid signature" }, { status: 400 });
    console.error("[stripe] webhook failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}
