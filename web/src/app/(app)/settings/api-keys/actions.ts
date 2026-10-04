"use server";
import { revalidatePath } from "next/cache";
import { createApiKey, revokeApiKey } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { attempt } from "@/lib/actions";

export async function create(name: string) {
  const ctx = await requireOrg();
  const n = name.trim();
  if (n.length < 2 || n.length > 60) return { ok: false as const, error: "Name it in 2 to 60 characters, like “CI pipeline”." };
  const r = await attempt(async () => (await createApiKey(ctx, n)).secret);
  revalidatePath("/settings/api-keys");
  return r;
}

export async function revoke(id: string) {
  const ctx = await requireOrg();
  const r = await attempt(() => revokeApiKey(ctx, id));
  revalidatePath("/settings/api-keys");
  return r;
}
