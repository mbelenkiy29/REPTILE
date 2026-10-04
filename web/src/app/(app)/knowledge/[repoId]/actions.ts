"use server";
import { revalidatePath } from "next/cache";
import { updateKnowledgeDoc } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { attempt } from "@/lib/actions";

export async function saveDoc(repoId: string, id: string, body: string) {
  const ctx = await requireOrg();
  if (typeof body !== "string" || body.length > 50_000) return { ok: false as const, error: "Keep a page under 50,000 characters." };
  const r = await attempt(() => updateKnowledgeDoc(ctx, id, body));
  revalidatePath(`/knowledge/${repoId}`);
  return r;
}
