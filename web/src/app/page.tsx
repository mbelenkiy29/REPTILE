import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, GitPullRequest, MessageSquareText, PlugZap } from "lucide-react";
import { FREE_PLAN, PRICING } from "@/lib/billing";
import { getSessionUser } from "@/lib/data/session";
import { formatMoney } from "@/lib/format";
import { LegalFooter } from "@/components/legal-page";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

// The public landing page (replica/launch/landing.md). Signed-in users go straight to their repositories.
// Every claim here is something the product does today; prices come from the same settings the billing code uses.

export const metadata: Metadata = {
  title: { absolute: "Countersign: a second reviewer on every pull request" },
  description: "Countersign reads your whole codebase and comments on what could break. One price per seat, no per-review charges.",
};

const seat = formatMoney(PRICING.seatCents);
const seatAnnual = formatMoney(PRICING.seatAnnualCents);

const STEPS = [
  { icon: PlugZap, title: "Install the GitHub App", body: "Choose the repositories it can read. It comments on pull requests and never pushes code." },
  { icon: GitPullRequest, title: "Open a pull request", body: "Countersign reviews the change against the whole codebase and posts a summary, inline comments ranked by severity, and a check." },
  { icon: MessageSquareText, title: "React and add rules", body: "👍 and 👎 tune future reviews. Write rules in plain English, or point it at your CLAUDE.md and AGENTS.md." },
];

const FEATURES = [
  { title: "One price per seat. Nothing metered.", body: `${FREE_PLAN.reviewsPerMonth} reviews a month per seat, shared by the team. When they run out, reviews pause until the 1st, and admins hear about it at 80%.` },
  { title: "Cancel in one click", body: "Manage billing opens the billing portal: cancel, remove the card, download invoices. No support ticket." },
  { title: "Re-reviews that remember", body: "On a new push, fixed findings are marked addressed and open ones carry forward, instead of a fresh list every time." },
  { title: "Fixes your agent can pick up", body: "Every comment links to a ready-made fix prompt to paste into Claude Code, Codex or Cursor. Nothing in the pull request text gives instructions to agents that read it." },
  { title: "Your rules, your files", body: "Plain-English rules by repository and path, CLAUDE.md and AGENTS.md read as rules, and a countersign.json in the repo that overrides the dashboard." },
  { title: "Learns from your team", body: "Reactions on its comments, and the review comments your own team writes, become suggested rules for an admin to accept." },
];

const FAQ = [
  { q: "What happens when we use all the reviews?", a: "Reviews pause until the 1st of the month, and the pull request shows why. Nothing extra is charged. Adding a seat adds 50 reviews right away." },
  { q: "Does Countersign change our code?", a: "No. It reads the repositories you choose and comments on pull requests. It never pushes commits." },
  { q: "Which code hosts does it support?", a: "GitHub today." },
  { q: "Where does our code go?", a: "To review a change, the changed files and related code are sent to Anthropic's API for the review and to Voyage AI's API for search over your codebase." },
  { q: "How is this different from asking my coding agent to review?", a: "Your agent reviews its own work in the same session. Countersign is a separate reviewer with your whole codebase indexed, and it posts on the pull request where the whole team sees it." },
  { q: "Can I cancel any time?", a: "Yes, from Billing, in one click. You keep access until the end of the period, and nothing more is charged." },
];

function StartFree({ size = "lg" }: { size?: "md" | "lg" }) {
  return <Button asChild size={size}><Link href="/login">Start free</Link></Button>;
}

export default async function Home() {
  if (await getSessionUser()) redirect("/repos");

  return (
    <div className="min-h-dvh bg-bg">
      <header className="mx-auto flex h-[var(--layout-header)] max-w-6xl items-center gap-4 px-4 md:px-6">
        <Logo />
        <nav aria-label="Page" className="ml-4 hidden gap-5 text-sm text-muted sm:flex">
          <a className="hover:text-fg" href="#how">How it works</a>
          <a className="hover:text-fg" href="#pricing">Pricing</a>
          <a className="hover:text-fg" href="#faq">FAQ</a>
        </nav>
        <div className="flex-1" />
        <ThemeToggle />
        <Button asChild size="sm" variant="secondary"><Link href="/login">Sign in</Link></Button>
      </header>

      <main id="content">
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 md:px-6 lg:grid-cols-[1fr_1.1fr] lg:pt-20">
          <div className="flex flex-col gap-5">
            <h1 className="text-xl font-semibold tracking-tight text-fg md:text-display md:leading-tight">
              A second reviewer on every pull request. A bill that doesn&apos;t surprise you.
            </h1>
            <p className="max-w-xl text-lg text-muted">
              Countersign reads your whole codebase and comments on what could break. {seat} a seat a month, with no per-review charges, ever.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <StartFree />
              <Button asChild size="lg" variant="ghost"><a href="#pricing">See pricing</a></Button>
            </div>
            <p className="text-sm text-muted">14 days of Team free, no card.</p>
          </div>
          <figure className="overflow-hidden rounded-lg border bg-surface shadow-pop">
            {/* eslint-disable-next-line @next/next/no-img-element -- a static screenshot; no resizing needed */}
            <img src="/landing/review.png" width={1280} height={800} alt="A Countersign review in the app: a summary, findings ranked by severity, and the files reviewed." className="h-auto w-full" />
          </figure>
        </section>

        <section aria-labelledby="problem" className="border-y bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
            <h2 id="problem" className="text-xl font-semibold tracking-tight text-fg">AI review got useful. The bills got strange.</h2>
            <div className="mt-8 grid gap-8 md:grid-cols-2">
              <div>
                <h3 className="text-md font-semibold text-fg">Per-review pricing turns one busy week into a big invoice.</h3>
                <p className="mt-2 text-muted">One large migration PR, or a team that ships in small commits, and the month&apos;s bill is no longer the number you agreed to.</p>
              </div>
              <div>
                <h3 className="text-md font-semibold text-fg">Reviews that nitpick the name but miss the approach.</h3>
                <p className="mt-2 text-muted">A reviewer that only sees the diff can flag a long function and miss that the change breaks something three files away.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="how" aria-labelledby="how-title" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-16 md:px-6">
          <h2 id="how-title" className="text-xl font-semibold tracking-tight text-fg">How it works</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map((st, i) => (
              <li key={st.title} className="flex flex-col gap-3 rounded-lg border p-5">
                <span className="flex items-center gap-3 text-sm text-muted">
                  <span className="grid size-8 place-items-center rounded-md bg-accent-soft text-accent"><st.icon className="size-4" aria-hidden /></span>
                  Step {i + 1}
                </span>
                <h3 className="text-md font-semibold text-fg">{st.title}</h3>
                <p className="text-muted">{st.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="features" className="mx-auto max-w-6xl px-4 pb-16 md:px-6">
          <h2 id="features" className="text-xl font-semibold tracking-tight text-fg">What you get</h2>
          <ul className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <h3 className="flex items-start gap-2 text-md font-semibold text-fg"><Check className="mt-1 size-4 shrink-0 text-accent" aria-hidden />{f.title}</h3>
                <p className="mt-2 pl-6 text-muted">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-4 border-y bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
            <h2 id="pricing-title" className="text-xl font-semibold tracking-tight text-fg">Pricing</h2>
            <p className="mt-2 text-muted">Your bill is seats × the seat price. Nothing is metered, so it&apos;s the same number every month.</p>
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-4 rounded-lg border bg-bg p-6">
                <div>
                  <h3 className="text-lg font-semibold text-fg">Solo</h3>
                  <p className="text-sm text-muted">For one developer and side projects.</p>
                </div>
                <p><span className="text-xl font-semibold tabular-nums text-fg">{formatMoney(0)}</span></p>
                <ul className="flex flex-col gap-2 text-fg">
                  <li className="flex gap-2"><Check className="mt-1 size-4 shrink-0 text-accent" aria-hidden />One person</li>
                  <li className="flex gap-2"><Check className="mt-1 size-4 shrink-0 text-accent" aria-hidden />{FREE_PLAN.reviewsPerMonth} reviews a month, then a pause until the 1st</li>
                  <li className="flex gap-2"><Check className="mt-1 size-4 shrink-0 text-accent" aria-hidden />No card</li>
                </ul>
                <Button asChild variant="secondary" className="mt-auto self-start"><Link href="/login">Start free</Link></Button>
              </div>
              <div className="flex flex-col gap-4 rounded-lg border-2 border-accent bg-bg p-6">
                <div>
                  <h3 className="text-lg font-semibold text-fg">Team</h3>
                  <p className="text-sm text-muted">For teams that review every pull request.</p>
                </div>
                <p>
                  <span className="text-xl font-semibold tabular-nums text-fg">{seat}</span>
                  <span className="text-muted"> a seat a month, or {seatAnnual} billed annually</span>
                </p>
                <ul className="flex flex-col gap-2 text-fg">
                  <li className="flex gap-2"><Check className="mt-1 size-4 shrink-0 text-accent" aria-hidden />50 reviews a month per seat, shared by the team</li>
                  <li className="flex gap-2"><Check className="mt-1 size-4 shrink-0 text-accent" aria-hidden />No per-review charges, ever</li>
                  <li className="flex gap-2"><Check className="mt-1 size-4 shrink-0 text-accent" aria-hidden />An email to admins at 80%</li>
                  <li className="flex gap-2"><Check className="mt-1 size-4 shrink-0 text-accent" aria-hidden />Cancel in one click</li>
                </ul>
                <div className="mt-auto flex flex-col gap-2">
                  <StartFree size="md" />
                  <p className="text-sm text-muted">Starts with 14 days of Team, no card.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" aria-labelledby="faq-title" className="mx-auto max-w-3xl scroll-mt-4 px-4 py-16 md:px-6">
          <h2 id="faq-title" className="text-xl font-semibold tracking-tight text-fg">Questions</h2>
          <dl className="mt-8 flex flex-col divide-y border-y">
            {FAQ.map((f) => (
              <div key={f.q} className="py-5">
                <dt className="font-semibold text-fg">{f.q}</dt>
                <dd className="mt-2 text-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="cta" className="border-t bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-16 md:px-6">
            <h2 id="cta" className="text-xl font-semibold tracking-tight text-fg">Try it on your next pull request.</h2>
            <p className="text-muted">14 days of Team, no card. Then stay on Team, or keep Solo for free.</p>
            <StartFree />
          </div>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}
