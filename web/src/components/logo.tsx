import Link from "next/link";

/** Interim mark (a check over a signature line) plus wordmark, until the logo in replica/brand.md is drawn. */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-md text-md font-semibold tracking-tight text-fg focus-visible:outline-2 focus-visible:outline-focus">
      <svg viewBox="0 0 32 32" className="size-6 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="7" className="fill-accent" />
        <path d="M8 15.5l4.5 4.5L24 8.5" fill="none" className="stroke-on-accent" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 24.5h16" className="stroke-on-accent" strokeWidth="2.5" strokeLinecap="round" opacity=".7" />
      </svg>
      Countersign
    </Link>
  );
}
