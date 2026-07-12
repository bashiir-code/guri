'use client';

import type { ReactNode } from 'react';
import { useAuthStatus } from '@/hooks/use-auth-status';

// @clerk/nextjs v7 dropped <SignedIn>/<SignedOut>; these are the same thing
// on top of useAuthStatus(), which also falls back to "signed out" if
// clerk-js can't load (e.g. keys not configured yet).
export function SignedIn({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuthStatus();
  return isLoaded && isSignedIn ? <>{children}</> : null;
}

export function SignedOut({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuthStatus();
  return isLoaded && !isSignedIn ? <>{children}</> : null;
}
