import type { Params } from 'nestjs-pino';

// Structured logging with defence-in-depth redaction (§9). Guri logs must never
// carry credentials, PINs, tokens, or a *live* presigned document URL — the
// whole point of §9 is that document access is audited in the DB and gated by
// short-lived signed URLs; a signed URL sitting in a log line is a bypass.
//
// Two layers:
//  1. key-based — any field whose name looks secret is replaced.
//  2. value-based — any string that looks like a signed URL (S3/R2 presigned,
//     Clerk/JWT bearer) is stripped down to its path, dropping the signature.
// Both are exported so a test can prove them directly.

const SECRET_KEY_RE =
  /(pass(word)?|secret|token|pepper|cookie|authorization|auth|api[-_]?key|apikey|pin|otp|jwt|signature|sig|credential|private[-_]?key)/i;

// Markers that make a string a live signed URL / bearer we must not persist.
const SIGNED_URL_RE = /(X-Amz-Signature|X-Amz-Credential|[?&](sig|se|token|signature)=)/i;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._-]+/gi;
const JWT_RE = /\beyJ[A-Za-z0-9._-]{20,}/g;

export const REDACTED = '[REDACTED]';

export function scrubString(value: string): string {
  let out = value;
  if (SIGNED_URL_RE.test(out)) {
    // keep host+path for debugging, drop the entire query string (the signature)
    out = out.replace(/(https?:\/\/[^\s?]+)\?[^\s]*/gi, `$1?${REDACTED}`);
  }
  out = out.replace(BEARER_RE, `Bearer ${REDACTED}`);
  out = out.replace(JWT_RE, REDACTED);
  return out;
}

// Deep-copy a log payload with secrets removed. Cycle-safe, depth-bounded.
export function scrub(input: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 8) return '[TRUNCATED]';
  if (typeof input === 'string') return scrubString(input);
  if (!input || typeof input !== 'object') return input;
  if (seen.has(input as object)) return '[CIRCULAR]';
  seen.add(input as object);

  if (Array.isArray(input)) return input.map((v) => scrub(v, depth + 1, seen));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(k)) out[k] = REDACTED;
    else out[k] = scrub(v, depth + 1, seen);
  }
  return out;
}

// nestjs-pino config: routes ALL Nest framework + app logs through pino with
// redaction applied to every emitted object.
export function pinoParams(): Params {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    pinoHttp: {
      level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
      // Belt-and-braces key redaction at pino level (fast path).
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'password',
          'token',
          '*.token',
          '*.secret',
          '*.password',
        ],
        censor: REDACTED,
      },
      // Value-based scrub for signed URLs / bearers that key redaction misses.
      formatters: {
        log: (obj: Record<string, unknown>) => scrub(obj) as Record<string, unknown>,
      },
      // Don't dump full request/response bodies; keep a minimal, safe shape.
      serializers: {
        req: (req: { method: string; url: string; id?: string }) => ({
          method: req.method,
          // strip any query string from the logged path (may carry tokens)
          url: typeof req.url === 'string' ? req.url.split('?')[0] : req.url,
          id: req.id,
        }),
      },
      autoLogging: true,
      ...(isProd ? {} : { transport: undefined }),
    },
  };
}
