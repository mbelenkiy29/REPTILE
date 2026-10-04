import type { Metadata } from "next";
import Link from "next/link";
import { FREE_PLAN, PRICING } from "@/lib/billing";
import { formatMoney } from "@/lib/format";
import { LEGAL, LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service">
      <p>
        These terms are an agreement between you (and the organization you sign up for) and {LEGAL.company}, which runs
        Countersign. By using Countersign you accept them.
      </p>

      <h2>The service</h2>
      <p>
        Countersign reviews pull requests in the GitHub repositories you connect and posts comments on them. It reads
        your code and never pushes commits. Reviews are written by an AI model and can be wrong or incomplete: they
        support your own review, they don&apos;t replace it, and you decide what to merge.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your sign-in secure and tell us about any misuse. Organization admins manage members, settings and billing,
        and are responsible for having the right to connect the repositories they connect.
      </p>

      <h2>Your code and content</h2>
      <p>
        Your code stays yours. You give us permission to process it only to provide the service, as described in the{" "}
        <Link className="text-accent underline underline-offset-2" href="/privacy">privacy policy</Link>. We don&apos;t
        use it to train models.
      </p>

      <h2>Plans and payment</h2>
      <ul>
        <li>New organizations get a 14-day trial of Team. No card is needed.</li>
        <li>Solo is free: one person, {FREE_PLAN.reviewsPerMonth} reviews a month.</li>
        <li>
          Team is {formatMoney(PRICING.seatCents)} per member per month, or {formatMoney(PRICING.seatAnnualCents)} per
          member per month billed yearly, with 50 reviews a month per member, shared by the organization.
        </li>
        <li>
          When an organization uses its monthly reviews, reviews pause until the first day of the next month. We never
          charge per review.
        </li>
        <li>Adding or removing members changes the seat count, prorated by Stripe. Prices exclude taxes where taxes apply.</li>
        <li>
          You can cancel any time from Billing. You keep access until the end of the period you paid for, and you
          won&apos;t be charged again. We don&apos;t refund partial periods unless the law requires it.
        </li>
        <li>We&apos;ll give at least 30 days&apos; notice by email before changing the price of a plan you&apos;re on.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>
        Don&apos;t use Countersign to break the law, to attack or overload it or anyone else, to get around its limits, or
        on code you have no right to share with it.
      </p>

      <h2>Availability</h2>
      <p>
        We work to keep Countersign running, but it&apos;s provided &quot;as is&quot;, without guarantees of availability
        or that reviews will catch every problem.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, we aren&apos;t liable for indirect or consequential losses, and our total liability
        is limited to what you paid us in the 12 months before the claim. Nothing here limits liability that can&apos;t be
        limited by law.
      </p>

      <h2>Ending</h2>
      <p>
        You can stop using Countersign and delete your account at any time. We may suspend accounts that break these
        terms, and will tell you why unless the law prevents it.
      </p>

      <h2>Changes and law</h2>
      <p>
        We&apos;ll update this page and email account owners about material changes. These terms are governed by{" "}
        {LEGAL.law}. Questions: <a className="text-accent underline underline-offset-2" href={`mailto:${LEGAL.contact}`}>{LEGAL.contact}</a>.
      </p>
    </LegalPage>
  );
}
