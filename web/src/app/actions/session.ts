"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { signIn as authSignIn, signOut as authSignOut, devLoginEnabled } from "@/auth";
import { db, schema as s } from "@/db";
import { createOrganization, listInstallations } from "@/lib/data";
import { ORG_COOKIE, SIM_COOKIE, getSessionUser, requireOrg, requireUser } from "@/lib/data/session";
import { attempt } from "@/lib/actions";
import { rateLimit, RateLimitError } from "@/lib/rate-limit";

const cookieOpts = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production" && !devLoginEnabled() };
const safeNext = (n: unknown) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/repos");

export async function signIn(formData: FormData) {
  const provider = String(formData.get("provider") ?? "");
  const redirectTo = safeNext(formData.get("next"));
  if (!["github", "google"].includes(provider)) redirect("/login?error=unknown");
  await authSignIn(provider, { redirectTo });
}

export async function emailSignIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const redirectTo = safeNext(formData.get("next"));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) redirect("/login?error=email");
  try {
    await authSignIn("resend", { email, redirectTo });
  } catch (e) {
    if (e instanceof RateLimitError || (e as { cause?: { err?: unknown } })?.cause?.err instanceof RateLimitError) redirect("/login?error=rate");
    throw e;
  }
}

export async function signOut() {
  (await cookies()).delete(ORG_COOKIE);
  await authSignOut({ redirectTo: "/login" });
}

/** Ends every session for this user on every device, including this one. */
export async function signOutEverywhere() {
  const user = await requireUser();
  await db.delete(s.sessions).where(eq(s.sessions.userId, user.id));
  (await cookies()).delete(ORG_COOKIE);
  redirect("/login?signedout=all");
}

export async function switchOrg(orgId: string) {
  const ctx = await requireOrg();
  if (!ctx.orgs.some((o) => o.org.id === orgId)) return;
  (await cookies()).set(ORG_COOKIE, orgId, cookieOpts);
  redirect("/repos");
}

export async function createOrg(name: string) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 60) return { ok: false as const, error: "Use 2 to 60 characters." };
  try {
    await rateLimit(`create-org:${user.id}`, 10, 86400);
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
  const r = await attempt(() => createOrganization(user.id, trimmed));
  if (!r.ok) return r;
  (await cookies()).set(ORG_COOKIE, r.data.id, cookieOpts);
  redirect("/onboarding");
}

export async function hasProvider() {
  const ctx = await requireOrg();
  return (await listInstallations(ctx)).length > 0;
}

/**
 * Deletes the account for real: memberships, sessions, linked sign-ins and the user row (cascades).
 * Orgs where this user is the only member are deleted with it (subscriptions cancelled first).
 * Refused while the user is the only admin of an org that has other members.
 */
export async function deleteAccount(confirmEmail: string) {
  const user = await requireUser();
  if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) return { ok: false as const, error: "Type your email address exactly to confirm." };
  const mine = await db.select({ orgId: s.memberships.orgId, role: s.memberships.role, name: s.organizations.name, sub: s.organizations.stripeSubscriptionId })
    .from(s.memberships).innerJoin(s.organizations, eq(s.organizations.id, s.memberships.orgId)).where(eq(s.memberships.userId, user.id));
  const blocking: string[] = [];
  const toDelete: { id: string; sub: string | null }[] = [];
  for (const m of mine) {
    const others = await db.select({ role: s.memberships.role }).from(s.memberships).where(and(eq(s.memberships.orgId, m.orgId), ne(s.memberships.userId, user.id)));
    if (!others.length) toDelete.push({ id: m.orgId, sub: m.sub });
    else if (m.role === "admin" && !others.some((o) => o.role === "admin")) blocking.push(m.name);
  }
  if (blocking.length) return { ok: false as const, error: `Make someone else an admin of ${blocking.join(", ")} first, or remove its other members.` };
  if (toDelete.some((o) => o.sub)) {
    const { stripe } = await import("@/lib/billing");
    for (const o of toDelete) if (o.sub) await stripe().subscriptions.cancel(o.sub).catch(() => undefined);
  }
  await db.transaction(async (tx) => {
    for (const o of toDelete) await tx.delete(s.organizations).where(eq(s.organizations.id, o.id));
    await tx.delete(s.users).where(eq(s.users.id, user.id));
  });
  const c = await cookies();
  c.delete(ORG_COOKIE);
  for (const name of ["authjs.session-token", "__Secure-authjs.session-token"]) c.delete(name);
  redirect("/login?deleted=1");
}

/* Dev panel (dev builds, or SHOW_DESIGN=1). */
function devAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.SHOW_DESIGN === "1";
}

export async function setSim(mode: "none" | "slow" | "error") {
  if (!devAllowed()) return;
  const c = await cookies();
  if (mode === "none") c.delete(SIM_COOKIE);
  else c.set(SIM_COOKIE, mode, cookieOpts);
  revalidatePath("/", "layout");
}

/** Reloads the seed data. Only with dev login on (a local database). Signs you back in as the seeded user. */
export async function resetData() {
  if (!devAllowed() || !devLoginEnabled()) return;
  const { seed } = await import("../../../db/seed");
  await seed({ reset: true });
  return "/api/dev/login?next=/repos";
}
