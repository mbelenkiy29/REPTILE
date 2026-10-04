// Transactional email templates, written for REPTILE. Plain, short, one action each.
type Rendered = { subject: string; text: string; html: string };
type Vars = Record<string, string>;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, lines: string[], action?: { label: string; url: string }, footer = "") {
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f7f8fa;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#12161c">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e3e6ea;border-radius:10px"><tr><td style="padding:28px">
<p style="margin:0 0 20px;font-weight:600;font-size:15px">REPTILE</p>
<h1 style="margin:0 0 12px;font-size:20px;line-height:28px">${esc(title)}</h1>
${lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:22px;color:#3a424d">${esc(l)}</p>`).join("\n")}
${action ? `<p style="margin:20px 0"><a href="${esc(action.url)}" style="display:inline-block;background:#3a50c8;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;font-size:14px">${esc(action.label)}</a></p>
<p style="margin:0;font-size:13px;color:#59626f;word-break:break-all">Or paste this link into your browser: ${esc(action.url)}</p>` : ""}
${footer ? `<p style="margin:20px 0 0;font-size:13px;color:#59626f">${esc(footer)}</p>` : ""}
</td></tr></table></body></html>`;
  const text = [title, "", ...lines, ...(action ? ["", `${action.label}: ${action.url}`] : []), ...(footer ? ["", footer] : [])].join("\n");
  return { html, text };
}

export const TEMPLATES: Record<string, (v: Vars) => Rendered> = {
  signin: (v) => ({
    subject: "Your REPTILE sign-in link",
    ...layout("Sign in to REPTILE", ["Use the button below to sign in. The link works once and expires in 15 minutes."],
      { label: "Sign in", url: v.url }, "If you didn't ask for this, you can ignore this email; nobody can sign in without the link."),
  }),
  invite: (v) => ({
    subject: `${v.inviter} invited you to ${v.org} on REPTILE`,
    ...layout(`Join ${v.org} on REPTILE`, [
      `${v.inviter} invited you to join ${v.org} as ${v.role === "admin" ? "an admin" : "a member"}.`,
      "REPTILE reviews your team's pull requests with the whole codebase as context.",
    ], { label: "Accept the invite", url: v.url }, "The invite expires in 7 days. Sign in with this email address to accept it."),
  }),
  "payment-failed": (v) => ({
    subject: `Payment failed for ${v.org}`,
    ...layout("We couldn't take the last payment", [
      `The card on file for ${v.org} was declined. Reviews keep running for now; update the card to avoid an interruption.`,
    ], { label: "Update billing", url: v.url }),
  }),
  "trial-ending": (v) => ({
    subject: `Your REPTILE trial ends in ${v.days} days`,
    ...layout(`${v.org}'s trial ends in ${v.days} days`, [
      "When it ends, reviews pause. Your settings, rules and history stay, and pick up where they left off when you choose a plan.",
    ], { label: "Choose a plan", url: v.url }),
  }),
};

export function render(template: string, vars: Vars): Rendered {
  const t = TEMPLATES[template];
  if (!t) throw new Error(`Unknown email template: ${template}`);
  return t(vars);
}
