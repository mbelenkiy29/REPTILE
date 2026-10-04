import Link from "next/link";

/** Placeholder wordmark. /replica-brand replaces it with the real logo. */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-md text-md font-semibold tracking-tight text-fg focus-visible:outline-2 focus-visible:outline-focus">
      <span className="grid size-6 place-items-center rounded-md bg-accent text-xs text-on-accent" aria-hidden>R</span>
      REPTILE
    </Link>
  );
}
