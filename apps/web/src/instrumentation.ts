// Next.js server/edge instrumentation (§9). Sentry is fully DSN-gated: with no
// SENTRY_DSN set, nothing initialises and there is zero runtime cost, so dev and
// CI builds are untouched. In prod it captures server + edge errors and crashes.
const DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

export async function register(): Promise<void> {
  if (!DSN) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  });
}

// Report errors thrown while rendering React Server Components / route handlers.
export async function onRequestError(
  ...args: Parameters<typeof import('@sentry/nextjs').captureRequestError>
): Promise<void> {
  if (!DSN) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(...args);
}
