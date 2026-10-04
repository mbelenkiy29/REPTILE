"use server";
import { redirect } from "next/navigation";
import { openBillingPortal, startCheckout } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { attempt } from "@/lib/actions";

/** Stripe Checkout for the Team plan (test mode until deploy). */
export async function checkout() {
  const ctx = await requireOrg();
  const r = await attempt(() => startCheckout(ctx));
  if (!r.ok) return r;
  redirect(r.data.url);
}

/** Stripe's Customer Portal: card, invoices, seat changes and one-click cancel. */
export async function portal() {
  const ctx = await requireOrg();
  const r = await attempt(() => openBillingPortal(ctx));
  if (!r.ok) return r;
  redirect(r.data.url);
}
