"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { changeRole, inviteMember, removeMember, revokeInvite, type Role } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { attempt } from "@/lib/actions";

const done = <T,>(r: T) => { revalidatePath("/settings/members"); return r; };

export async function invite(email: string, role: Role) {
  const ctx = await requireOrg();
  const e = z.email("Enter an email address, like dev@company.com.").safeParse(email.trim());
  if (!e.success) return { ok: false as const, error: e.error.issues[0].message };
  return done(await attempt(() => inviteMember(ctx, e.data, role)));
}
export async function revoke(id: string) {
  const ctx = await requireOrg();
  return done(await attempt(() => revokeInvite(ctx, id)));
}
export async function setRole(userId: string, role: Role) {
  const ctx = await requireOrg();
  return done(await attempt(() => changeRole(ctx, userId, role)));
}
export async function remove(userId: string) {
  const ctx = await requireOrg();
  return done(await attempt(() => removeMember(ctx, userId)));
}
