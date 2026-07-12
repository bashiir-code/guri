import { createHmac, timingSafeEqual } from 'node:crypto';

const TOLERANCE_SECONDS = 5 * 60;

// Clerk signs webhooks with the Svix scheme: HMAC-SHA256 over
// "<svix-id>.<svix-timestamp>.<raw body>" using the base64 secret after
// "whsec_", compared against the space-separated "v1,<sig>" list.
export function verifySvixSignature(input: {
  secret: string;
  id: string;
  timestamp: string;
  payload: Buffer | string;
  signatureHeader: string;
}): void {
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) {
    throw new Error('timestamp_out_of_tolerance');
  }

  const secretBytes = Buffer.from(input.secret.replace(/^whsec_/, ''), 'base64');
  const signedContent = `${input.id}.${input.timestamp}.${input.payload.toString()}`;
  const expected = createHmac('sha256', secretBytes).update(signedContent).digest();

  const candidates = input.signatureHeader
    .split(' ')
    .map((part) => part.split(',')[1])
    .filter((sig): sig is string => Boolean(sig));

  const valid = candidates.some((sig) => {
    const candidate = Buffer.from(sig, 'base64');
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
  if (!valid) throw new Error('invalid_signature');
}
