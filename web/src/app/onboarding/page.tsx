import type { Metadata } from "next";
import Link from "next/link";
import { listInstallations } from "@/lib/data";
import { requireOrg } from "@/lib/data/session";
import { AdminOnlyNotice } from "@/components/no-access";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ProviderCard } from "@/components/ui/provider-card";
import { Steps } from "./steps";
import { startGithubInstall } from "./actions";

export const metadata: Metadata = { title: "Connect a code host" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const installs = await listInstallations(ctx);
  const github = installs.filter((i) => i.provider === "github");
  const isAdmin = ctx.role === "admin";

  return (
    <>
      <Steps current={0} />
      <h1 className="text-xl text-fg">Connect {ctx.org.name} to a code host</h1>
      <p className="mt-1 max-w-xl text-muted">
        REPTILE installs as an app on your GitHub account or organization. You pick which repositories it can read; it
        comments on pull requests and never pushes code.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {sp.error === "failed" && (
          <Alert variant="danger" title="The install didn't finish" live>
            GitHub sent you back before the app was installed. Try again, and pick at least one repository.
          </Alert>
        )}
        {!isAdmin && <AdminOnlyNotice what="code host connections" />}

        <div className="grid gap-4 md:grid-cols-3">
          <form action={startGithubInstall} className="contents">
            <ProviderCardSubmit
              name="GitHub"
              description="Pull requests on github.com."
              connected={github.map((g) => g.accountLogin)}
              disabled={!isAdmin}
            />
          </form>
          <ProviderCard name="GitHub Enterprise" description="Self-hosted GitHub Enterprise Server." state="soon" />
          <ProviderCard name="GitLab" description="Merge requests on gitlab.com." state="soon" />
        </div>

        {github.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-surface p-4">
            <p className="flex-1 text-base text-fg">
              Connected to {github.map((g) => g.accountLogin).join(", ")}. You can add more accounts any time.
            </p>
            <Button asChild>
              <Link href="/repos">Go to repositories</Link>
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function ProviderCardSubmit({ name, description, connected, disabled }: { name: string; description: string; connected: string[]; disabled: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-bg p-4">
      <div>
        <h2 className="text-base font-semibold text-fg">{name}</h2>
        <p className="text-sm text-muted">{connected.length ? `Linked: ${connected.join(", ")}` : description}</p>
      </div>
      <Button type="submit" size="sm" disabled={disabled} variant={connected.length ? "secondary" : "primary"} className="self-start">
        {connected.length ? "Add another account" : `Connect ${name}`}
      </Button>
    </div>
  );
}
