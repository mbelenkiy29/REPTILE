"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { acceptInvite } from "@/lib/data";
import { ORG_COOKIE, requireUser } from "@/lib/data/session";
import { attempt } from "@/lib/actions";

export async function acceptInviteAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const user = await requireUser();
  const r = await attempt(() => acceptInvite(user.id, token));
  if (!r.ok) redirect(`/invite/${encodeURIComponent(token)}?error=${encodeURIComponent(r.error)}`);
  (await cookies()).set(ORG_COOKIE, r.data.orgId, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/repos");
}
