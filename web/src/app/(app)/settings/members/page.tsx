import type { Metadata } from "next";
import { getBilling, listMembers } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { formatDate, relativeTime, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { AdminOnlyNotice } from "@/components/no-access";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TD, TH, THead, TRow } from "@/components/ui/table";
import { InviteDialog, MemberRowActions, RevokeInvite, RoleSelect } from "./client";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage() {
  const ctx = await requireOrg();
  const [{ members, invites }, billing] = await Promise.all([listMembers(ctx), getBilling(ctx)]);
  const isAdmin = ctx.role === "admin";
  const paid = billing.plan === "pro" || billing.plan === "enterprise";
  const free = billing.plan === "free" && billing.billingStatus === "none";
  return (
    <>
      <PageHeader
        title="Members"
        description={`${members.length} ${members.length === 1 ? "person" : "people"} in ${ctx.org.name}.${paid ? ` Each member is a seat at ${formatMoney(billing.pricePerSeatCents)} a month.` : ""}`}
        actions={isAdmin && !free && <InviteDialog />}
      />
      {!isAdmin && <div className="mb-4"><AdminOnlyNotice what="members and roles" /></div>}
      {free && (
        <Alert className="mb-4" title="The Free plan is for one person">
          To review pull requests for teammates too, choose the Team plan in <a className="text-accent underline underline-offset-2" href="/settings/billing">Billing</a>.
        </Alert>
      )}
      <div className="flex flex-col gap-6">
        <Table aria-label="Members">
          <THead>
            <tr>
              <TH>Member</TH>
              <TH>Role</TH>
              <TH className="hidden md:table-cell">Joined</TH>
              <TH numeric className="hidden sm:table-cell">PRs reviewed this month</TH>
              <TH><span className="sr-only">Actions</span></TH>
            </tr>
          </THead>
          <tbody>
            {members.map((m) => {
              const me = m.user.id === ctx.userId;
              return (
                <TRow key={m.user.id}>
                  <TD className="max-w-[260px] py-2">
                    <span className="block truncate font-medium text-fg">{m.user.name}{me && <span className="font-normal text-muted"> (you)</span>}</span>
                    <span className="block truncate text-sm text-muted">{m.user.email} · {m.user.githubLogin}</span>
                  </TD>
                  <TD>
                    {isAdmin && !me ? <RoleSelect userId={m.user.id} name={m.user.name} role={m.role} /> : <Badge tone={m.role === "admin" ? "accent" : "neutral"}>{m.role === "admin" ? "Admin" : "Member"}</Badge>}
                  </TD>
                  <TD className="hidden whitespace-nowrap text-sm text-muted md:table-cell">{formatDate(m.joinedAt)}</TD>
                  <TD numeric className="hidden sm:table-cell">{m.reviewsThisMonth}</TD>
                  <TD className="w-10">{isAdmin && !me && <MemberRowActions userId={m.user.id} name={m.user.name} />}</TD>
                </TRow>
              );
            })}
          </tbody>
        </Table>

        {invites.length > 0 && (
          <section aria-labelledby="pending">
            <h2 id="pending" className="mb-3 text-md font-semibold text-fg">Pending invites</h2>
            <ul className="divide-y rounded-lg border">
              {invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1 truncate text-fg">{i.email}</span>
                  <Badge>{i.role === "admin" ? "Admin" : "Member"}</Badge>
                  <span className="text-sm text-muted">expires {relativeTime(i.expiresAt)}</span>
                  {isAdmin && <RevokeInvite id={i.id} email={i.email} />}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
