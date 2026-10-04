"use server";
import { redirect } from "next/navigation";
import { linkInstallation } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { attempt } from "@/lib/actions";

/** Goes to /api/github/install, which redirects to GitHub with a signed state (or, in local fake mode, to the link step). */
export async function startGithubInstall() {
  const ctx = await requireOrg();
  if (ctx.role !== "admin") redirect("/onboarding?error=admin");
  redirect("/api/github/install");
}

export async function linkAction(externalInstallationId: number) {
  const ctx = await requireOrg();
  const r = await attempt(() => linkInstallation(ctx, externalInstallationId));
  if (!r.ok) return r;
  redirect(`/repos?linked=${r.data.repoCount}`);
}
