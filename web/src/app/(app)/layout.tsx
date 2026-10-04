import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { requireOrg, SIM_COOKIE } from "@/lib/data/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireOrg();
  const devAllowed = process.env.NODE_ENV !== "production" || process.env.SHOW_DESIGN === "1";
  const sim = ((await cookies()).get(SIM_COOKIE)?.value ?? "none") as "none" | "slow" | "error";
  return (
    <AppShell
      orgs={ctx.orgs.map((o) => ({ id: o.org.id, name: o.org.name, role: o.role }))}
      currentOrgId={ctx.orgId}
      user={{ name: ctx.user.name, email: ctx.user.email }}
      dev={devAllowed ? { sim } : null}
    >
      {children}
    </AppShell>
  );
}
