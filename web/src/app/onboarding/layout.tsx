import { signOut } from "@/app/actions/session";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { requireUser } from "@/lib/data/session";

export default async function OnboardingLayout({ children }: LayoutProps<"/onboarding">) {
  const user = await requireUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-[var(--layout-header)] items-center gap-2 border-b px-4">
        <Logo href="/repos" />
        <div className="flex-1" />
        <span className="hidden truncate text-sm text-muted sm:inline">{user.email}</span>
        <ThemeToggle />
        <form action={signOut}>
          <Button variant="ghost" size="sm" type="submit">Sign out</Button>
        </form>
      </header>
      <main id="content" className="mx-auto w-full max-w-[720px] flex-1 px-4 py-10">{children}</main>
    </div>
  );
}
