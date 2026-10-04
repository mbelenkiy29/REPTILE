"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { continueOnFree, openBillingPortal, startCheckout } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { attempt } from "@/lib/actions";

/** Stripe Checkout for the Team plan (test mode until deploy). */
export async function checkout(interval: "month" | "year" = "month") {
  const ctx = await requireOrg();
  const r = await attempt(() => startCheckout(ctx, interval === "year" ? "year" : "month"));
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

/** Trial over or subscription canceled: keep reviewing on the Free plan (one person, a monthly allowance). */
export async function chooseFree() {
  const ctx = await requireOrg();
  const r = await attempt(() => continueOnFree(ctx));
  revalidatePath("/settings/billing");
  revalidatePath("/settings/members");
  return r;
}
