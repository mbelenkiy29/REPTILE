import type { Metadata } from "next";
import { peekInvite } from "@/lib/data";
import { getSessionUser } from "@/lib/data/session";
import { Logo } from "@/components/logo";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { acceptInviteAction } from "./actions";

export const metadata: Metadata = { title: "Join an organization", robots: { index: false } };

export default async function InvitePage({ params, searchParams }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const [invite, user] = await Promise.all([peekInvite(token), getSessionUser()]);
  const here = `/invite/${token}`;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-[var(--layout-header)] items-center px-4"><Logo /></header>
      <main id="content" className="mx-auto w-full max-w-[440px] px-4 pt-[8vh]">
        {!invite || invite.accepted ? (
          <Alert variant="danger" title="This invite link doesn't work">It may have been used already or cancelled. Ask whoever invited you for a new one.</Alert>
        ) : invite.expired ? (
          <Alert variant="warning" title="This invite has expired">Invites last 7 days. Ask an admin of {invite.orgName} to send a new one.</Alert>
        ) : (
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="text-xl text-fg">Join {invite.orgName}</h1>
              <p className="mt-1 text-muted">You&apos;re invited as {invite.role === "admin" ? "an admin" : "a member"}. The invite is for <span className="font-medium text-fg">{invite.email}</span>.</p>
            </div>
            {typeof sp.error === "string" && <Alert variant="danger" title="Couldn't accept the invite" live>{sp.error}</Alert>}
            {user ? (
              <form action={acceptInviteAction} className="flex flex-col gap-3">
                <input type="hidden" name="token" value={token} />
                <p className="text-sm text-muted">Signed in as {user.email}.</p>
                <Button type="submit" size="lg">Accept and join</Button>
              </form>
            ) : (
              <Button asChild size="lg"><a href={`/login?next=${encodeURIComponent(here)}`}>Sign in to accept</a></Button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
