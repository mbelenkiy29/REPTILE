// Error tracking (Sentry), off unless SENTRY_DSN is set: local runs, CI and tests report nothing.
// The web app initialises it in src/instrumentation.ts, the worker in worker/index.ts.
import * as Sentry from "@sentry/node";

export const errorTrackingEnabled = () => !!process.env.SENTRY_DSN;

/** Options shared by the web server and the worker. No request bodies, cookies or IPs (sendDefaultPii false). */
export const sentryOptions = () => ({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? (process.env.VERCEL_ENV || process.env.NODE_ENV),
  sendDefaultPii: false,
  tracesSampleRate: 0,
});

/** Report an error that was handled (so it never reaches a global handler), with a few searchable tags. */
export function reportError(e: unknown, tags: Record<string, string> = {}) {
  if (!errorTrackingEnabled()) return;
  Sentry.captureException(e, { tags });
}
