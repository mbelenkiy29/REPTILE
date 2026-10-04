// Server-side error tracking for the web app (Next.js instrumentation hook). Off unless SENTRY_DSN is set.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (!process.env.SENTRY_DSN) return;
  const { sentryOptions } = await import("@/lib/observability");
  Sentry.init(sentryOptions());
}

// Errors in server components, route handlers and server actions. A no-op when Sentry isn't initialised.
export const onRequestError = Sentry.captureRequestError;
