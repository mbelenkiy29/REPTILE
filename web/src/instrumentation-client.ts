// Browser error tracking. NEXT_PUBLIC_SENTRY_DSN is inlined at build time: without it, this is dead code and the
// Sentry SDK isn't in the browser bundle at all.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import("@sentry/nextjs").then((Sentry) =>
    Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, tracesSampleRate: 0 }), // the browser SDK sends no PII by default
  );
}
