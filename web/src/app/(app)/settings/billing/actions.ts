"use server";
import { redirect } from "next/navigation";
import { startCheckout } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { attempt } from "@/lib/actions";

/** Real: create a Stripe Checkout session and redirect to it. Fake: upgrade in place. */
export async function checkout() {
  const ctx = await requireOrg();
  const r = await attempt(() => startCheckout(ctx));
  if (!r.ok) return r;
  redirect(r.data.url);
}
