// Sends transactional email through Resend from your own domain (EMAIL_FROM).
// Without RESEND_API_KEY outside production, emails are logged and kept in memory (dev and tests).
import { Resend } from "resend";
import { render } from "./templates";

export interface SentEmail { to: string; subject: string; text: string }
const g = globalThis as unknown as { __countersignOutbox?: SentEmail[] };
export const outbox = () => (g.__countersignOutbox ??= []);

let resend: Resend | null = null;

export async function sendEmail(to: string, template: string, vars: Record<string, string>) {
  const msg = render(template, vars);
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production" && !process.env.AUTH_DEV_LOGIN) throw new Error("Email isn't set up on this server yet (RESEND_API_KEY is missing).");
    outbox().push({ to, subject: msg.subject, text: msg.text });
    console.log(`[email] to=${to.replace(/^(.).*(@.*)$/, "$1***$2")} subject="${msg.subject}" (not sent: RESEND_API_KEY missing)`);
    // Local only: print the body so sign-in and invite links can be followed without an email provider.
    if (process.env.AUTH_DEV_LOGIN === "1") console.log(`[email:body]\n${msg.text}`);
    return;
  }
  resend ??= new Resend(key);
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is missing");
  const { error } = await resend.emails.send({ from, to, subject: msg.subject, text: msg.text, html: msg.html });
  if (error) throw new Error(`Resend refused the email: ${error.message}`);
}
