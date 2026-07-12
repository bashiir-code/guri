'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';

const CLERK_LOAD_GRACE_MS = 3000;

// useAuth() with a safety net: if clerk-js never finishes loading (no keys
// yet, network down), treat the visitor as signed out after a short grace
// period instead of leaving the UI in a permanent loading state.
export function useAuthStatus(): { isLoaded: boolean; isSignedIn: boolean } {
  const { isLoaded, isSignedIn } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (isLoaded) return;
    const t = setTimeout(() => setTimedOut(true), CLERK_LOAD_GRACE_MS);
    return () => clearTimeout(t);
  }, [isLoaded]);

  return {
    isLoaded: isLoaded || timedOut,
    isSignedIn: isLoaded ? Boolean(isSignedIn) : false,
  };
}
