// Browser-side Sentry init (§9), DSN-gated. Auto-loaded by Next.js 15.3+.
import * as Sentry from '@sentry/nextjs';

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // No session replay in the pilot — data-frugal by default (§10).
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

// Capture client-side navigation errors (App Router).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
