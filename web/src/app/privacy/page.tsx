import type { Metadata } from "next";
import { LEGAL, LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy policy" };

// Written from what the code does (replica/deploy.md, "Processors"). Keep it true when the code changes.
const PROCESSORS = [
  ["GitHub", "Access to the repositories you choose, through our GitHub App; your GitHub identity when you sign in with GitHub", "The product itself"],
  ["Anthropic (Claude API)", "The changed files and related code for each review", "Writing the review"],
  ["Voyage AI", "Code chunks from your repositories", "Search over your codebase (embeddings)"],
  ["Neon", "Everything we store (listed below)", "Database hosting"],
  ["Vercel", "Web requests and logs", "Hosting the web app"],
  ["Fly.io", "Temporary repository clones and logs", "Running background jobs"],
  ["Stripe", "Billing contact and card details (Stripe holds the card; we never see the number)", "Payments"],
  ["Resend", "Email addresses and email content", "Sign-in links, invites and billing emails"],
  ["Sentry", "Error reports: the error, the page or job it happened in, and technical details; no request bodies, cookies or IP addresses", "Finding and fixing errors"],
  ["Google (only if you sign in with Google)", "Your name and email from Google", "Sign-in"],
];

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        {LEGAL.company} (&quot;we&quot;) runs Countersign, a service that reviews pull requests on GitHub. This policy
        says what we collect, why, who processes it for us, how long we keep it, and what you can do about it. Contact:{" "}
        <a className="text-accent underline underline-offset-2" href={`mailto:${LEGAL.contact}`}>{LEGAL.contact}</a>, {LEGAL.address}.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> your name, email address, avatar and GitHub or Google identity when you sign in.</li>
        <li><strong>Organization:</strong> its name, members and their roles, invites, settings, rules and billing status.</li>
        <li>
          <strong>Code:</strong> from the repositories you choose, we store chunks of source code and their embeddings
          (to find related code during a review), pull request details (title, author, branches, changed files), and the
          reviews and findings we post.
        </li>
        <li><strong>Feedback:</strong> reactions on our comments and your team&apos;s review comments, used to suggest rules.</li>
        <li><strong>Usage:</strong> one record per review, for the monthly allowance.</li>
        <li><strong>Technical:</strong> server logs (IP address, browser, pages requested) kept by our hosts.</li>
      </ul>

      <h2>Why</h2>
      <p>
        To provide the service you signed up for (the contract with you), to bill for it, to keep it secure, and to
        improve reviews for your organization. We don&apos;t sell personal data, we don&apos;t use your code to train
        models, and we don&apos;t show ads.
      </p>

      <h2>Who processes it for us</h2>
      <table className="w-full text-sm">
        <thead><tr><th>Processor</th><th>What it gets</th><th>Why</th></tr></thead>
        <tbody>
          {PROCESSORS.map(([who, what, why]) => <tr key={who}><td className="font-medium">{who}</td><td>{what}</td><td>{why}</td></tr>)}
        </tbody>
      </table>
      <p>
        Each processes data only to provide its service to us, under its own terms and data processing agreement. Some
        are in the United States; where the law requires it, transfers rely on standard contractual clauses or an
        equivalent safeguard.
      </p>

      <h2>Cookies</h2>
      <p>
        We use only the cookies the service needs: your sign-in session and the organization you&apos;re working in. Your
        theme choice is kept in your browser&apos;s local storage. No advertising or tracking cookies.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Code chunks of a repository you remove from the app are deleted 7 days after removal.</li>
        <li>Expired sessions and sign-in links are deleted daily; expired invites after 7 days.</li>
        <li>Deleting your account deletes your user record and memberships; an organization you are the only member of is deleted with everything in it, after its subscription is cancelled.</li>
        <li>Invoices and billing records are kept as long as tax law requires.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can see and change your data in the app, and delete your account from Settings. Depending on where you live,
        you may also have the right to access, correct, export or erase your data, and to object to or restrict how we
        use it. Email {LEGAL.contact}. You can also complain to your data protection authority.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit (HTTPS) and stored with our database host, which encrypts it at rest. Access is
        limited to what running the service needs.
      </p>

      <h2>Changes</h2>
      <p>We&apos;ll update this page and the date above when this policy changes, and email account owners about material changes.</p>
    </LegalPage>
  );
}
