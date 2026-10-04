"use server";
import { redirect } from "next/navigation";
import { linkInstallation } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { attempt } from "@/lib/actions";

export async function linkAction(externalInstallationId: number) {
  const ctx = await requireOrg();
  if (!Number.isSafeInteger(externalInstallationId)) return { ok: false as const, error: "Pick an installation." };
  const r = await attempt(() => linkInstallation(ctx, externalInstallationId));
  if (!r.ok) return r;
  redirect(`/repos?linked=${r.data.repoCount}`);
}
