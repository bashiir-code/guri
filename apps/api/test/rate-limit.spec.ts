import { describe, expect, it } from 'vitest';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerStorageService,
  ThrottlerException,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler';
import type { ExecutionContext } from '@nestjs/common';
import { GuriThrottlerGuard, RATE_LIMITS } from '../src/common/throttle';

// These tests drive the REAL @nestjs/throttler guard + its real in-memory
// storage — not a mock — so a green run proves the actual counting/429 logic
// that runs in production, against the exact RATE_LIMITS the app ships.

// A minimal Express-shaped request/response the guard understands.
function makeReq(opts: { sub?: string; ip?: string }): Record<string, unknown> {
  const headers: Record<string, string> = {};
  if (opts.sub) {
    // header.payload.sig — only the payload (middle) is read, unverified.
    const payload = Buffer.from(JSON.stringify({ sub: opts.sub })).toString('base64url');
    headers.authorization = `Bearer x.${payload}.y`;
  }
  return {
    headers,
    ip: opts.ip ?? '10.0.0.1',
    socket: { remoteAddress: opts.ip ?? '10.0.0.1' },
  };
}

function makeRes(): Record<string, unknown> {
  const res: Record<string, unknown> = {};
  res.header = () => res; // setHeaders() writes X-RateLimit-* here
  res.setHeader = () => res;
  return res;
}

// One shared handler/class pair so the throttler key stays stable per-tracker.
function handler() {}
class FakeController {}

function makeCtx(req: Record<string, unknown>): ExecutionContext {
  const res = makeRes();
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res, getNext: () => ({}) }),
    getHandler: () => handler,
    getClass: () => FakeController,
    getType: () => 'http',
  } as unknown as ExecutionContext;
}

async function makeGuard(limit: number, ttl: number): Promise<GuriThrottlerGuard> {
  const options: ThrottlerModuleOptions = { throttlers: [{ name: 'default', limit, ttl }] };
  const guard = new GuriThrottlerGuard(options, new ThrottlerStorageService(), new Reflector());
  await guard.onModuleInit(); // populates guard.throttlers from options
  return guard;
}

describe('GuriThrottlerGuard tracker', () => {
  it('buckets an authenticated user by their token sub, not their IP', async () => {
    const guard = new GuriThrottlerGuard(
      { throttlers: [] },
      new ThrottlerStorageService(),
      new Reflector(),
    );
    const tracker = (
      guard as unknown as { getTracker: (r: Record<string, unknown>) => Promise<string> }
    ).getTracker.bind(guard);
    expect(await tracker(makeReq({ sub: 'user-abc', ip: '1.1.1.1' }))).toBe('user:user-abc');
    // same user, different IP → SAME bucket (roaming networks don't reset it)
    expect(await tracker(makeReq({ sub: 'user-abc', ip: '2.2.2.2' }))).toBe('user:user-abc');
    // anonymous → per IP
    expect(await tracker(makeReq({ ip: '3.3.3.3' }))).toBe('ip:3.3.3.3');
  });
});

describe('request-creation limit (POST /listings/:id/requests)', () => {
  const { limit, ttl } = RATE_LIMITS.request; // 15 / 60s

  it('allows a normal burst then returns 429 on the one that exceeds it', async () => {
    const guard = await makeGuard(limit, ttl);
    const ctx = makeCtx(makeReq({ sub: 'requester-1' }));

    // A normal user firing up to the limit never sees a 429.
    for (let i = 0; i < limit; i++) {
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    }
    // The request that exceeds the limit is rejected with a 429.
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ThrottlerException);
  });

  it('isolates users: one user hitting the wall does not throttle another', async () => {
    const guard = await makeGuard(limit, ttl);
    const heavy = makeCtx(makeReq({ sub: 'heavy-user' }));
    for (let i = 0; i < limit; i++) await guard.canActivate(heavy);
    await expect(guard.canActivate(heavy)).rejects.toBeInstanceOf(ThrottlerException);

    // A different user, fresh bucket, still sails through.
    const fresh = makeCtx(makeReq({ sub: 'other-user' }));
    await expect(guard.canActivate(fresh)).resolves.toBe(true);
  });
});

describe('per-endpoint limits are distinct and ordered by abuse risk', () => {
  it('doc-URL issuance and /me/leave are tighter than uploads and browse', () => {
    expect(RATE_LIMITS.leave.limit).toBeLessThan(RATE_LIMITS.request.limit);
    expect(RATE_LIMITS.request.limit).toBeLessThan(RATE_LIMITS.documentUrl.limit);
    expect(RATE_LIMITS.documentUrl.limit).toBeLessThan(RATE_LIMITS.upload.limit);
    expect(RATE_LIMITS.upload.limit).toBeLessThan(RATE_LIMITS.browse.limit);
  });
});
