'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';

// The metrics view merged into the console landing page (/admin) when the
// Platform Admin design shipped; keep the old URL working.
export default function AdminMetricsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin');
  }, [router]);
  return null;
}
