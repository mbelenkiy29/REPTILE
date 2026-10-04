"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createOrganization, listInstallations } from "@/lib/data";
import { ORG_COOKIE, SESSION_COOKIE, SIM_COOKIE, getSessionUser, requireOrg } from "@/lib/data/session";
import { resetStore, store } from "@/lib/data/store";
import { ME } from "@/lib/data/seed";
import { attempt } from "@/lib/actions";

const cookieOpts = { httpOnly: true, sameSite: "lax" as const, path: "/" };

/** Fake sign-in: every provider signs in the seeded user. /replica-backend wires Auth.js here. */
export async function signIn(formData: FormData) {
  const next = String(formData.get("next") ?? "");
  (await cookies()).set(SESSION_COOKIE, ME, cookieOpts);
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/repos");
}

export async function signOut() {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
  c.delete(ORG_COOKIE);
  redirect("/login");
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
  const r = await attempt(() => createOrganization(user.id, trimmed));
  if (!r.ok) return r;
  (await cookies()).set(ORG_COOKIE, r.data.id, cookieOpts);
  redirect("/onboarding");
}

/** After sign-in: orgs with nothing connected go to onboarding. */
export async function hasProvider() {
  const ctx = await requireOrg();
  return (await listInstallations(ctx)).length > 0;
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

export async function resetData() {
  if (!devAllowed()) return;
  resetStore();
  void store();
  revalidatePath("/", "layout");
}
