"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createRule, deleteRule, setRuleStatus, updateRule, type RuleStatus } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { attempt } from "@/lib/actions";

const RuleInput = z.object({
  text: z.string().trim().min(3, "Write at least a few words.").max(4000, "Keep rules under 4,000 characters."),
  kind: z.enum(["rule", "style_guide", "doc"]),
  repoIds: z.array(z.string()).max(200),
  pathGlobs: z.array(z.string().trim().min(1).refine((s) => !/\s/.test(s), "Patterns can't contain spaces.")).max(50),
});

export type RuleForm = z.infer<typeof RuleInput>;

export async function saveRule(id: string | null, input: RuleForm) {
  const ctx = await requireOrg();
  const parsed = RuleInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const r = await attempt(async () => {
    if (id && typeof id !== "string") throw new Error("Bad id.");
    if (id) await updateRule(ctx, id, parsed.data);
    else await createRule(ctx, parsed.data);
  });
  revalidatePath("/rules");
  return r;
}

export async function changeRuleStatus(id: string, status: RuleStatus) {
  const ctx = await requireOrg();
  if (!["active", "suggested", "disabled"].includes(status)) return { ok: false as const, error: "Unknown status." };
  const r = await attempt(() => setRuleStatus(ctx, id, status));
  revalidatePath("/rules");
  return r;
}

export async function removeRule(id: string) {
  const ctx = await requireOrg();
  const r = await attempt(() => deleteRule(ctx, id));
  revalidatePath("/rules");
  return r;
}
