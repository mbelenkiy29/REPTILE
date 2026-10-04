"use server";
import { revalidatePath } from "next/cache";
import { clearRepoConfig, saveReviewConfig } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { attempt } from "@/lib/actions";
import { ConfigFileSchema, DEFAULT_CONFIG, fileLayer, mergeConfig, toConfigFile } from "@/lib/review/config";
import type { ReviewConfig } from "@/lib/data";

export async function saveConfig(repoId: string | null, config: ReviewConfig) {
  const ctx = await requireOrg();
  // Validate with the same schema as countersign.json, so the dashboard can't save what a file couldn't say.
  const parsed = ConfigFileSchema.safeParse(toConfigFile(config));
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues.map((i) => i.message).join(" ") };
  const clean = mergeConfig(DEFAULT_CONFIG, fileLayer(parsed.data));
  const r = await attempt(() => saveReviewConfig(ctx, repoId, clean));
  revalidatePath("/settings/review");
  if (repoId) revalidatePath(`/repos/${repoId}`);
  return r;
}

export async function resetRepoConfig(repoId: string) {
  const ctx = await requireOrg();
  const r = await attempt(() => clearRepoConfig(ctx, repoId));
  revalidatePath(`/repos/${repoId}`);
  return r;
}
