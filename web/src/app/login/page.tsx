import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/safe-next";
import { Mail } from "lucide-react";
import { enabledProviders } from "@/auth";
import { emailSignIn, signIn } from "@/app/actions/session";
import { getSessionUser } from "@/lib/data/session";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Sign in" };

// Auth.js error codes → plain words.
const ERRORS: Record<string, string> = {
  AccessDenied: "Sign-in was cancelled or refused. Nothing was connected.",
  Verification: "That sign-in link has expired or was already used. Ask for a new one below.",
  OAuthAccountNotLinked: "That email is already linked to a different sign-in method. Use the one you signed up with.",
  rate: "Too many sign-in emails for that address. Wait an hour, or use another method.",
  email: "Enter a valid email address.",
  Configuration: "Sign-in isn't fully set up on this server. If you run it, check the provider keys.",
  unknown: "We couldn't sign you in. Try again, or use a different method.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  if (await getSessionUser()) redirect(safeRedirectPath(sp.next));
  const next = typeof sp.next === "string" ? sp.next : (typeof sp.callbackUrl === "string" ? new URL(sp.callbackUrl, "http://x").pathname : "");
  const sent = sp.sent === "1";
  const error = typeof sp.error === "string" ? ERRORS[sp.error] ?? ERRORS.unknown : null;
  const p = enabledProviders();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-[var(--layout-header)] items-center justify-between px-4">
        <Logo />
        <ThemeToggle />
      </header>
      <main id="content" className="flex flex-1 items-start justify-center px-4 pb-16 pt-[8vh]">
        <div className="flex w-full max-w-[400px] flex-col gap-6">
          <div>
            <h1 className="text-xl text-fg">{sent ? "Check your email" : "Sign in to Countersign"}</h1>
            <p className="mt-1 text-muted">
              {sent ? "We sent you a sign-in link. It works once and expires in 15 minutes." : "A second reviewer on every pull request, reading your whole codebase."}
            </p>
          </div>

          {error && <Alert variant="danger" title="Not signed in" live>{error}</Alert>}
          {sp.signedout === "all" && <Alert variant="success" title="Signed out everywhere">Every device that was signed in has been signed out.</Alert>}
          {sp.deleted === "1" && <Alert variant="success" title="Account deleted">Your account and its data have been deleted. Thanks for trying Countersign.</Alert>}

          {sent ? (
            <Button variant="link" asChild className="self-start">
              <a href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Use a different email</a>
            </Button>
          ) : (
            <>
              {(p.github || p.google || p.dev) && (
                <form action={signIn} className="flex flex-col gap-2">
                  <input type="hidden" name="next" value={next} />
                  {p.github && <Button type="submit" name="provider" value="github" size="lg">Continue with GitHub</Button>}
                  {p.google && <Button type="submit" name="provider" value="google" size="lg" variant="secondary">Continue with Google</Button>}
                  {p.dev && (
                    <Button asChild size="lg" variant="secondary">
                      <a href={`/api/dev/login?next=${encodeURIComponent(next || "/repos")}`}>Continue as the demo user (local only)</a>
                    </Button>
                  )}
                </form>
              )}
              {p.email && (
                <>
                  {(p.github || p.google || p.dev) && (
                    <div className="flex items-center gap-3 text-sm text-muted" aria-hidden>
                      <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <form action={emailSignIn} className="flex flex-col gap-3">
                    <input type="hidden" name="next" value={next} />
                    <Field label="Work email">
                      {(f) => <Input {...f} name="email" type="email" required autoComplete="email" maxLength={254} placeholder="you@company.com" />}
                    </Field>
                    <Button type="submit" variant="secondary" size="lg"><Mail aria-hidden /> Email me a sign-in link</Button>
                  </form>
                </>
              )}
              <p className="text-sm text-muted">
                Signing in with GitHub doesn&apos;t give Countersign access to any code. You choose repositories in the next step.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
