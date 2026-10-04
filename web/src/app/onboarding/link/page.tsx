import type { Metadata } from "next";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { listPendingInstallations } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminOnlyNotice } from "@/components/no-access";
import { Steps } from "../steps";
import { LinkForm } from "./link-form";

export const metadata: Metadata = { title: "Link your account" };

export default async function LinkPage() {
  const ctx = await requireOrg();
  const pending = await listPendingInstallations(ctx);

  return (
    <>
      <Steps current={1} />
      <h1 className="text-xl text-fg">Link a GitHub account to {ctx.org.name}</h1>
      <p className="mt-1 max-w-xl text-muted">
        The app is installed. Choose which account to link; its repositories start indexing right away, and reviews begin as soon as
        indexing finishes.
      </p>
      <div className="mt-6">
        {ctx.role !== "admin" ? (
          <AdminOnlyNotice what="code host connections" />
        ) : pending.length === 0 ? (
          <div className="rounded-lg border">
            <EmptyState
              icon={RefreshCw}
              title="No new installations found"
              body="If you just installed the app, GitHub can take a few seconds to tell us. Refresh, or start the install again."
              action={<Button asChild size="sm"><Link href="/onboarding/link">Refresh</Link></Button>}
              secondary={<Button asChild size="sm" variant="secondary"><Link href="/onboarding">Back</Link></Button>}
            />
          </div>
        ) : (
          <LinkForm installations={pending} />
        )}
      </div>
    </>
  );
}
