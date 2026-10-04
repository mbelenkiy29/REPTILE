import type { Metadata } from "next";
import { getAccount } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { signOutEverywhere } from "@/app/actions/session";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteAccount } from "./delete-account";

export const metadata: Metadata = { title: "Your account" };

const NAMES: Record<string, string> = { github: "GitHub", google: "Google", resend: "Email link" };

export default async function AccountPage() {
  const ctx = await requireOrg();
  const a = await getAccount(ctx.userId);
  return (
    <>
      <PageHeader title="Your account" description="Your sign-in, your sessions, and deleting your account." />
      <div className="flex max-w-2xl flex-col gap-4">
        <Card title="Profile">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-base">
            <dt className="text-muted">Name</dt><dd className="text-fg">{a.user.name}</dd>
            <dt className="text-muted">Email</dt><dd className="break-all text-fg">{a.user.email || "—"}</dd>
            <dt className="text-muted">GitHub</dt><dd className="text-fg">{a.user.githubLogin || "Not linked"}</dd>
            <dt className="text-muted">Signs in with</dt>
            <dd className="flex flex-wrap gap-1">{a.providers.length ? a.providers.map((p) => <Badge key={p}>{NAMES[p] ?? p}</Badge>) : <span className="text-muted">Email link</span>}</dd>
          </dl>
        </Card>
        <Card title="Sessions" description={`You're signed in on ${a.activeSessions} ${a.activeSessions === 1 ? "device" : "devices"}.`}>
          <form action={signOutEverywhere}>
            <Button type="submit" variant="secondary" size="sm">Sign out everywhere</Button>
          </form>
          <p className="mt-2 text-sm text-muted">Ends every session, including this one. Use it if you signed in on a computer that isn&apos;t yours.</p>
        </Card>
        <Card title="Delete account">
          <p className="text-fg">Deletes your account, your sessions and your memberships. Organizations where you&apos;re the only member are deleted too, with their repositories, reviews and settings, and their subscriptions are cancelled.</p>
          <p className="mt-2 text-sm text-muted">If you&apos;re the only admin of an organization with other members, make someone else an admin first.</p>
          <div className="mt-4"><DeleteAccount email={a.user.email} /></div>
        </Card>
      </div>
    </>
  );
}
