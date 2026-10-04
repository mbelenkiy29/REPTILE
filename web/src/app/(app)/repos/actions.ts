"use server";
import { revalidatePath } from "next/cache";
import { reindexRepo, setRepoReviewEnabled } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { attempt } from "@/lib/actions";

export async function toggleReview(repoId: string, enabled: boolean) {
  const ctx = await requireOrg();
  const r = await attempt(() => setRepoReviewEnabled(ctx, repoId, enabled));
  revalidatePath("/repos");
  return r;
}

export async function reindex(repoId: string) {
  const ctx = await requireOrg();
  const r = await attempt(() => reindexRepo(ctx, repoId));
  revalidatePath("/repos");
  revalidatePath(`/repos/${repoId}`);
  return r;
}
