/**
 * A `next=` value we can redirect to: a path on this site, nothing else. Browsers treat "//host", "/\host" and
 * paths with tabs or newlines in them as other sites, so those are refused along with absolute URLs.
 */
export function safeRedirectPath(next: unknown, fallback = "/repos"): string {
  if (typeof next !== "string" || !next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}
