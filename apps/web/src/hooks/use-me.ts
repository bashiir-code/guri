'use client';

import { useQuery } from '@tanstack/react-query';
import { api, type Me } from '@/lib/api';
import { useAuthStatus } from '@/hooks/use-auth-status';

export function useMe() {
  const { isLoaded, isSignedIn } = useAuthStatus();
  const query = useQuery<Me | null>({
    queryKey: ['me'],
    queryFn: () => api<Me>('/me'),
    enabled: isLoaded && isSignedIn,
  });
  return {
    ...query,
    data: isSignedIn ? query.data : null,
    isLoading: !isLoaded || (isSignedIn && query.isLoading),
    isSignedIn,
  };
}
