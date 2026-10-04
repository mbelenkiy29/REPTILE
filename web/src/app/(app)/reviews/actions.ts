"use server";
import { revalidatePath } from "next/cache";
import { rerunReview } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { attempt } from "@/lib/actions";

export async function rerun(reviewId: string) {
  const ctx = await requireOrg();
  const r = await attempt(async () => (await rerunReview(ctx, reviewId)).id);
  revalidatePath("/reviews");
  return r;
}
