import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/data/session";
import { fakeMode } from "@/lib/github";
import { signState } from "@/lib/github/state";

// Starts the GitHub App install with a signed state that the setup callback checks.
export async function GET(req: Request) {
  const ctx = await requireOrg();
  const base = new URL(req.url);
  if (ctx.role !== "admin") return NextResponse.redirect(new URL("/onboarding?error=admin", base));
  if (fakeMode()) return NextResponse.redirect(new URL("/onboarding/link?setup_action=install", base));
  const slug = process.env.GITHUB_APP_SLUG;
  if (!slug) return NextResponse.redirect(new URL("/onboarding?error=config", base));
  const state = signState({ orgId: ctx.orgId, userId: ctx.userId });
  return NextResponse.redirect(`https://github.com/apps/${encodeURIComponent(slug)}/installations/new?state=${encodeURIComponent(state)}`);
}
