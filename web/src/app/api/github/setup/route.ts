import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, ORG_COOKIE } from "@/lib/data/session";
import { verifyState } from "@/lib/github/state";

// GitHub's "Setup URL": where it sends the admin back after installing or changing the app.
// The state must be ours, unexpired, and issued to this same user; then S04 lists what their token can see.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, url));
  const state = verifyState(url.searchParams.get("state"));
  // GitHub also calls this when a repository selection changes from GitHub's side (no state). Send them to their repos.
  if (!state) return NextResponse.redirect(new URL(url.searchParams.get("setup_action") === "update" ? "/repos" : "/onboarding?error=failed", url));
  if (state.userId !== user.id) return NextResponse.redirect(new URL("/onboarding?error=failed", url));
  (await cookies()).set(ORG_COOKIE, state.orgId, { httpOnly: true, sameSite: "lax", path: "/", secure: url.protocol === "https:" });
  return NextResponse.redirect(new URL("/onboarding/link?setup_action=install", url));
}
