"use server";
import { revalidatePath } from "next/cache";
import { connectIntegration, disconnectIntegration, type IntegrationKind } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { attempt } from "@/lib/actions";

const KINDS: IntegrationKind[] = ["jira", "linear", "slack", "notion", "datadog"];

export async function connect(kind: IntegrationKind) {
  const ctx = await requireOrg();
  if (!KINDS.includes(kind)) return { ok: false as const, error: "Unknown integration." };
  const r = await attempt(() => connectIntegration(ctx, kind));
  revalidatePath("/settings/integrations");
  return r;
}
export async function disconnect(kind: IntegrationKind) {
  const ctx = await requireOrg();
  if (!KINDS.includes(kind)) return { ok: false as const, error: "Unknown integration." };
  const r = await attempt(() => disconnectIntegration(ctx, kind));
  revalidatePath("/settings/integrations");
  return r;
}
