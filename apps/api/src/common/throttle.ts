import { ThrottlerGuard } from '@nestjs/throttler';

// Per-endpoint limits (§9 hardening). All windows are 60s. These are exported
// so the 429 integration test asserts against the SAME numbers the app runs —
// the test and the config can never drift.
export const RATE_LIMITS: Record<string, { limit: number; ttl: number }> = {
  // Expensive + sensitive: each issuance presigns a URL AND writes an audit
  // row (rule 5). Abuse here would flood audit_log and the object store.
  documentUrl: { limit: 20, ttl: 60_000 },
  // sharp re-encodes every upload (CPU-heavy); cap the burst per user.
  upload: { limit: 30, ttl: 60_000 },
  // Request spam would pollute agency queues; one house a few times is plenty.
  request: { limit: 15, ttl: 60_000 },
  // Rare + destructive (deactivates the account, §16).
  leave: { limit: 5, ttl: 60_000 },
  // Public browse is unauthenticated → tracked per IP. Generous enough for a
  // human scrolling, tight enough to slow a scraper.
  browse: { limit: 120, ttl: 60_000 },
};

// Decode a JWT payload WITHOUT verifying it — used only to derive a throttle
// bucket key, never to trust identity (ClerkAuthGuard does the real check just
// after). Forging a `sub` can't bypass anything: an unsigned/invalid token is
// still rejected downstream; a valid token already belongs to that real user.
function subFromBearer(header: unknown): string | null {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const parts = header.slice(7).split('.');
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === 'string' && sub.length > 0 ? sub : null;
  } catch {
    return null;
  }
}

// Rate-limit per authenticated user when a token is present, else per IP.
// ThrottlerGuard (APP_GUARD) runs before the route-level ClerkAuthGuard, so
// req.user isn't set yet — we read the bearer `sub` directly for the key.
export class GuriThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const sub = subFromBearer((req.headers as Record<string, unknown> | undefined)?.authorization);
    if (sub) return `user:${sub}`;
    const ip =
      (req.ip as string | undefined) ??
      ((req.socket as { remoteAddress?: string } | undefined)?.remoteAddress) ??
      'unknown';
    return `ip:${ip}`;
  }
}
