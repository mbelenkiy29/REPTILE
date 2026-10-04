// Session and org context from Auth.js (database sessions) and the memberships table.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, schema as s } from "@/db";
import type { Ctx, Organization, Role, User } from "./types";

export const ORG_COOKIE = "rp_org";
export const SIM_COOKIE = "rp_sim";

export async function getSessionUser(): Promise<User | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const [u] = await db.select().from(s.users).where(eq(s.users.id, id));
  if (!u) return null;
  return { id: u.id, name: u.name ?? u.email ?? "You", email: u.email ?? "", githubLogin: u.githubLogin ?? "" };
}

export interface OrgContext extends Ctx {
  user: User;
  org: Organization;
  orgs: { org: Organization; role: Role }[];
}

const toOrg = (o: typeof s.organizations.$inferSelect): Organization => ({
  id: o.id, name: o.name, slug: o.slug, plan: o.plan, trialEndsAt: o.trialEndsAt ? new Date(o.trialEndsAt).toISOString() : null,
  includedReviewsPerSeat: o.includedReviewsPerSeat, billingStatus: o.billingStatus, createdAt: new Date(o.createdAt).toISOString(),
});

/** For every app page and action: signed in, with an org selected. Redirects otherwise. */
export async function requireOrg(): Promise<OrgContext> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const rows = await db.select({ o: s.organizations, role: s.memberships.role }).from(s.memberships)
    .innerJoin(s.organizations, eq(s.organizations.id, s.memberships.orgId))
    .where(eq(s.memberships.userId, user.id)).orderBy(asc(s.organizations.name));
  const orgs = rows.map((r) => ({ org: toOrg(r.o), role: r.role }));
  if (!orgs.length) redirect("/onboarding/new-org");
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const current = orgs.find((o) => o.org.id === wanted) ?? orgs[0];
  return { user, org: current.org, orgs, userId: user.id, orgId: current.org.id, role: current.role };
}

/** Signed in, org optional (creating the first org, accepting an invite). */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Dev-only switches so error and loading states can be seen without breaking anything. */
export async function simulate() {
  if (process.env.NODE_ENV === "production" && process.env.SHOW_DESIGN !== "1") return;
  let sim: string | undefined;
  try {
    sim = (await cookies()).get(SIM_COOKIE)?.value;
  } catch {
    return; // outside a request (worker, tests)
  }
  if (sim === "slow") await new Promise((r) => setTimeout(r, 1500));
  if (sim === "error") throw new Error("Simulated failure: the data layer is set to fail in the dev panel.");
}
