import { clerkMiddleware } from '@clerk/nextjs/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const handleI18n = createMiddleware(routing);

// Clerk wraps the i18n middleware: sessions available everywhere, locale
// routing unchanged. No route is force-protected here — guards live on the
// API; pages handle their own signed-out states.
//
// Until real Clerk keys are pasted into .env, the placeholder key would make
// Clerk's dev handshake redirect every page to an "Invalid host" error — so
// keyless dev runs i18n only (browse works; sign-in needs real keys).
const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
const clerkConfigured = key.startsWith('pk_') && !key.includes('cGxhY2Vob2xkZXI');

export default clerkConfigured
  ? clerkMiddleware((_auth, req) => handleI18n(req))
  : handleI18n;

export const config = {
  // /api is excluded so route handlers (e.g. the Railway healthcheck at
  // /api/health) aren't locale-redirected by the i18n middleware.
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
