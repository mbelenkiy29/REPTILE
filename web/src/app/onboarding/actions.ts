"use server";
import { redirect } from "next/navigation";
import { linkInstallation } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { attempt } from "@/lib/actions";

/** Real flow: redirect to github.com/apps/<app>/installations/new with a signed state.
 *  Fake flow: pretend the install finished and come back to the link step. */
export async function startGithubInstall() {
  const ctx = await requireOrg();
  if (ctx.role !== "admin") redirect("/onboarding?error=admin");
  redirect("/onboarding/link?setup_action=install");
}

export async function linkAction(externalInstallationId: number) {
  const ctx = await requireOrg();
  const r = await attempt(() => linkInstallation(ctx, externalInstallationId));
  if (!r.ok) return r;
  redirect(`/repos?linked=${r.data.repoCount}`);
}
