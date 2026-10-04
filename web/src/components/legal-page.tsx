import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

/**
 * Company details for the legal pages. Fill these in, have a lawyer review both pages, then set LEGAL_REVIEWED to true
 * to remove the draft notice (replica/deploy.md, preflight).
 */
export const LEGAL = {
  company: "[Company legal name]",
  address: "[Registered address]",
  contact: "[privacy@your-domain]",
  law: "[the laws of your country or state]",
  updated: "[date of the reviewed version]",
};
export const LEGAL_REVIEWED = false;

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="mx-auto flex h-[var(--layout-header)] max-w-3xl items-center gap-4 px-4 md:px-6">
        <Logo />
        <div className="flex-1" />
        <ThemeToggle />
      </header>
      <main id="content" className="mx-auto max-w-3xl px-4 pb-16 pt-8 md:px-6">
        {!LEGAL_REVIEWED && (
          <p role="note" className="mb-8 rounded-md border border-warning bg-warning-soft p-4 text-sm text-fg">
            Draft for legal review. The bracketed details are placeholders, and this page isn&apos;t final until a lawyer
            has reviewed it.
          </p>
        )}
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated: {LEGAL.updated}</p>
        <div className="legal mt-8 flex flex-col gap-4 text-fg [&_h2]:mt-6 [&_h2]:text-md [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-fg [&_td]:border-t [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top [&_th]:pb-2 [&_th]:pr-4 [&_th]:text-left [&_th]:text-sm [&_th]:font-semibold">
          {children}
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}

export function LegalFooter() {
  return (
    <footer className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-sm text-muted md:px-6">
      <span>© {new Date().getFullYear()} Countersign</span>
      <Link className="hover:text-fg" href="/privacy">Privacy</Link>
      <Link className="hover:text-fg" href="/terms">Terms</Link>
      <a className="hover:text-fg" href={`mailto:${LEGAL.contact}`}>Contact</a>
    </footer>
  );
}
