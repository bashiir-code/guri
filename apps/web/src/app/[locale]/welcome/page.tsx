'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useMe } from '@/hooks/use-me';

// Post-sign-in router (SPEC §2 v1.10): roles come from the API, never the
// client, and each role lands on its home surface. Priority: platform admin →
// admin tool; agency staff → console; owner → profile (dashboard is phase 6);
// customer → browse.
export default function WelcomePage() {
  const t = useTranslations('welcome');
  const router = useRouter();
  const { data: me, isLoading, isSignedIn } = useMe();

  useEffect(() => {
    if (isLoading) return;
    if (!isSignedIn) {
      router.replace('/');
      return;
    }
    if (me?.roles.platformAdmin) router.replace('/admin');
    else if ((me?.roles.agencyMemberships.length ?? 0) > 0) router.replace('/console');
    else if (me?.roles.owner) router.replace('/owner');
    else router.replace('/browse');
  }, [me, isLoading, isSignedIn, router]);

  return (
    <main className="flex min-h-dvh items-center justify-center">
      <p className="animate-pulse text-muted-foreground">{t('loading')}</p>
    </main>
  );
}
