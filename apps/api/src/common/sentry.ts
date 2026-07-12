import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/node';

// Sentry error/crash reporting (§9, "Sentry — already in the stack"). Entirely
// DSN-gated: with no SENTRY_DSN the SDK is never initialised and every hook is a
// no-op, so local dev and tests run untouched. In prod, unhandled errors and
// 5xx failures are reported; expected 4xx validation/permission errors are NOT
// (they're normal traffic, not incidents).

let enabled = false;

export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  });
  enabled = true;
  return true;
}

export function isSentryEnabled(): boolean {
  return enabled;
}

// Report server faults; skip anything that's an expected client error (<500).
export function shouldReportToSentry(exception: unknown): boolean {
  if (exception instanceof HttpException) return exception.getStatus() >= 500;
  return true; // non-HTTP throw = unexpected = report
}

// Wraps Nest's default filter: capture qualifying errors, then fall through to
// the normal response so behaviour is unchanged whether or not Sentry is on.
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (enabled && shouldReportToSentry(exception)) {
      Sentry.captureException(exception);
    }
    super.catch(exception, host);
  }
}
