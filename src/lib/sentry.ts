import * as Sentry from "@sentry/nextjs";

// Server only: pages, route handlers and server actions reach Sentry through
// onRequestError (src/instrumentation.ts); tRPC errors through the route's
// onError. Without SENTRY_DSN nothing is sent.
export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    release: process.env.npm_package_version,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
  return true;
}
