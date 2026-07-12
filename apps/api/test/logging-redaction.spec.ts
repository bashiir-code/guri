import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { HttpException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { scrub, scrubString, REDACTED } from '../src/common/logger';
import { pinoParams } from '../src/common/logger';
import { shouldReportToSentry, initSentry } from '../src/common/sentry';

// §9: logs must never carry credentials, PINs, tokens, or a live presigned
// document URL. These prove the redaction that the app-wide logger applies.

describe('scrub — key-based redaction', () => {
  it('redacts fields whose names look secret, at any depth', () => {
    const out = scrub({
      email: 'a@b.com',
      password: 'hunter2',
      clerkSecret: 'sk_live_abc',
      nested: { apiKey: 'key_123', otp: '445566', pin: '1234', pepper: 'xyz' },
      authorization: 'Bearer abc.def.ghi',
    }) as Record<string, any>;

    expect(out.email).toBe('a@b.com'); // non-secret preserved
    expect(out.password).toBe(REDACTED);
    expect(out.clerkSecret).toBe(REDACTED);
    expect(out.nested.apiKey).toBe(REDACTED);
    expect(out.nested.otp).toBe(REDACTED);
    expect(out.nested.pin).toBe(REDACTED);
    expect(out.nested.pepper).toBe(REDACTED);
    expect(out.authorization).toBe(REDACTED);
  });
});

describe('scrubString — value-based redaction of signed URLs and tokens', () => {
  it('strips the signature query from a presigned S3/R2 document URL', () => {
    const presigned =
      'http://localhost:9000/guri/customer-docs/abc/id.webp?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
      '&X-Amz-Credential=guri%2F20260711&X-Amz-Signature=deadbeefcafe&X-Amz-Expires=300';
    const out = scrubString(presigned);
    expect(out).toContain('/customer-docs/abc/id.webp'); // path kept for debugging
    expect(out).not.toContain('deadbeefcafe'); // signature gone
    expect(out).not.toContain('X-Amz-Signature');
    expect(out).toContain(REDACTED);
  });

  it('redacts a Bearer token and a raw JWT', () => {
    expect(scrubString('auth header: Bearer eyJhbGciOi.payloadpayloadpayload.sig')).not.toContain(
      'payloadpayload',
    );
    expect(scrubString('token=eyJraWQiOiJ4eHh4eHh4eHh4eHh4eHh4eHh4eCJ9')).toContain(REDACTED);
  });
});

describe('pino logger end-to-end — nothing sensitive reaches the sink', () => {
  it('a real pino instance with our formatter redacts before writing', () => {
    const lines: string[] = [];
    const params = pinoParams();
    const logger = pino(
      { formatters: params.pinoHttp?.formatters, redact: params.pinoHttp?.redact as any },
      { write: (s: string) => lines.push(s) },
    );

    logger.info(
      {
        dealId: 'deal-1',
        password: 'hunter2',
        otp: '998877',
        docUrl:
          'https://cdn.guri.so/customer-docs/x/id.webp?X-Amz-Signature=SECRETSIG123&X-Amz-Expires=300',
      },
      'issued document url',
    );

    const raw = lines.join('\n');
    expect(raw).toContain('deal-1'); // safe context survives
    expect(raw).not.toContain('hunter2');
    expect(raw).not.toContain('998877');
    expect(raw).not.toContain('SECRETSIG123');
  });
});

describe('Sentry filter — reports faults, ignores expected client errors', () => {
  it('reports 5xx and non-HTTP throws, not 4xx', () => {
    expect(shouldReportToSentry(new BadRequestException('bad'))).toBe(false);
    expect(shouldReportToSentry(new ForbiddenException('nope'))).toBe(false);
    expect(shouldReportToSentry(new HttpException('boom', 500))).toBe(true);
    expect(shouldReportToSentry(new Error('unexpected'))).toBe(true);
  });

  it('initSentry is a clean no-op without a DSN', () => {
    const saved = process.env.SENTRY_DSN;
    delete process.env.SENTRY_DSN;
    expect(initSentry()).toBe(false);
    if (saved) process.env.SENTRY_DSN = saved;
  });
});
