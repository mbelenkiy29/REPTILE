import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { signIn } from "@/app/actions/session";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  denied: "Sign-in was cancelled on the provider's page. Nothing was connected.",
  expired: "That sign-in link has expired. Ask for a new one below.",
  unknown: "We couldn't sign you in. Try again, or use a different method.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "";
  const sent = typeof sp.sent === "string" ? sp.sent : null;
  const error = typeof sp.error === "string" ? ERRORS[sp.error] ?? ERRORS.unknown : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-[var(--layout-header)] items-center justify-between px-4">
        <Logo />
        <ThemeToggle />
      </header>
      <main id="content" className="flex flex-1 items-start justify-center px-4 pb-16 pt-[8vh]">
        <div className="flex w-full max-w-[400px] flex-col gap-6">
          <div>
            <h1 className="text-xl text-fg">{sent ? "Check your email" : "Sign in to REPTILE"}</h1>
            <p className="mt-1 text-muted">
              {sent
                ? <>We sent a sign-in link to <span className="font-medium text-fg">{sent}</span>. It works once and expires in 15 minutes.</>
                : "Code review on every pull request, with your whole codebase as context."}
            </p>
          </div>

          {error && <Alert variant="danger" title="Not signed in" live>{error}</Alert>}

          {sent ? (
            <form action={signIn} className="flex flex-col gap-3">
              <input type="hidden" name="next" value={next} />
              <Button type="submit" size="lg">Open the link (dev)</Button>
              <Button variant="link" asChild className="self-start">
                <a href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Use a different email</a>
              </Button>
            </form>
          ) : (
            <>
              <form action={signIn} className="flex flex-col gap-2">
                <input type="hidden" name="next" value={next} />
                <Button type="submit" name="provider" value="github" size="lg">Continue with GitHub</Button>
                <Button type="submit" name="provider" value="gitlab" size="lg" variant="secondary">Continue with GitLab</Button>
                <Button type="submit" name="provider" value="google" size="lg" variant="secondary">Continue with Google</Button>
              </form>
              <div className="flex items-center gap-3 text-sm text-muted" aria-hidden>
                <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
              </div>
              <form action="/login" method="get" className="flex flex-col gap-3">
                {next && <input type="hidden" name="next" value={next} />}
                <Field label="Work email">
                  {(p) => <Input {...p} name="sent" type="email" required autoComplete="email" placeholder="you@company.com" />}
                </Field>
                <Button type="submit" variant="secondary" size="lg"><Mail aria-hidden /> Email me a sign-in link</Button>
              </form>
              <p className="text-sm text-muted">
                Signing in with GitHub doesn&apos;t give REPTILE access to any code. You choose repositories in the next step.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
