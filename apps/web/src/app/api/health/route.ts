// Railway healthcheck target for the web service (the API has /health).
// Kept trivial on purpose: it answers "is the Next server up", nothing more.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok' });
}
