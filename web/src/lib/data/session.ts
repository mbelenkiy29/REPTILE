// Session and org context. Fake auth for now: a cookie holds the user id.
// /replica-backend replaces getSessionUserId with Auth.js; the Ctx shape stays.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { store } from "./store";
import type { Ctx, Organization, Role, User } from "./types";

export const SESSION_COOKIE = "rp_session";
export const ORG_COOKIE = "rp_org";
export const SIM_COOKIE = "rp_sim";

export async function getSessionUser(): Promise<User | null> {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  return (id && store().users.find((u) => u.id === id)) || null;
}

export interface OrgContext extends Ctx {
  user: User;
  org: Organization;
  orgs: { org: Organization; role: Role }[];
}

/** For every app page: signed in, with an org selected. Redirects otherwise. */
export async function requireOrg(): Promise<OrgContext> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const s = store();
  const orgs = s.memberships
    .filter((m) => m.userId === user.id)
    .map((m) => ({ org: s.orgs.find((o) => o.id === m.orgId)!, role: m.role }))
    .filter((x) => x.org);
  if (!orgs.length) redirect("/onboarding/new-org");
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const current = orgs.find((o) => o.org.id === wanted) ?? orgs[0];
  return { user, org: current.org, orgs, userId: user.id, orgId: current.org.id, role: current.role };
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

/** Signed in, org optional (creating the first org). */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
