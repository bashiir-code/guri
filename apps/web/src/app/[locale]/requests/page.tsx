'use client';

import { useState } from 'react';
import { useAuthStatus } from '@/hooks/use-auth-status';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { DEAL_OPEN_STATES } from '@guri/shared';
import { ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/bottom-sheet';
import { PublicHeader } from '@/components/public-header';
import { cn, formatDateTime } from '@/lib/utils';

interface RequestRow {
  id: string;
  state: string;
  viewingAt: string | null;
  createdAt: string;
  listing: {
    id: string;
    district: string;
    neighborhood: string | null;
    type: string;
    bedrooms: number;
    rentUsd: number;
    coverUrl: string | null;
  };
}

const OPEN = DEAL_OPEN_STATES as readonly string[];

// Chip palette from the reference tracker: a scheduled viewing is a forest
// chip (time inline), the queue is neutral, a closed deal is the lime win.
const chipStyle = (state: string) =>
  cn(
    'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
    state === 'requested' && 'bg-muted text-slate_brand',
    state === 'closed' && 'bg-lime text-forest',
    state === 'viewing_scheduled' && 'bg-forest text-mist',
    ['awaiting_docs', 'docs_in_review', 'approved'].includes(state) &&
      'bg-amber_reserved/25 text-forest',
    !OPEN.includes(state) && state !== 'closed' && 'bg-muted text-muted-foreground',
  );

export default function MyRequestsPage() {
  const t = useTranslations('requests');
  const ts = useTranslations('dealStates');
  const qc = useQueryClient();
  const { isLoaded, isSignedIn } = useAuthStatus();
  const signedIn = isLoaded && isSignedIn;
  const [withdrawId, setWithdrawId] = useState<string | null>(null);

  const { data: requests, isLoading } = useQuery<RequestRow[]>({
    queryKey: ['my-requests'],
    queryFn: () => api('/my/requests'),
    enabled: signedIn,
  });

  const withdraw = useMutation({
    mutationFn: (dealId: string) => api(`/deals/${dealId}/withdraw`, { method: 'POST', body: {} }),
    onSuccess: () => {
      setWithdrawId(null);
      void qc.invalidateQueries({ queryKey: ['my-requests'] });
    },
  });

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[480px] px-4 py-4 md:max-w-3xl lg:max-w-5xl lg:px-6">
      <PublicHeader />
      <h1 className="font-display text-3xl font-bold text-forest lg:text-4xl">{t('title')}</h1>
      <p className="mb-4 mt-1 text-sm text-slate_brand">{t('subtitle')}</p>

      {isLoaded && !signedIn && (
        <div className="space-y-4 py-8 text-center">
          <p className="text-muted-foreground">{t('signinPrompt')}</p>
          <Button asChild>
            <Link href="/sign-in">{t('signinButton')}</Link>
          </Button>
        </div>
      )}

      {signedIn && isLoading && <p className="text-muted-foreground">…</p>}
      {signedIn && !isLoading && !requests?.length && (
        <div className="space-y-4 py-8 text-center">
          <p className="text-muted-foreground">{t('empty')}</p>
          <Button asChild>
            <Link href="/browse">{t('goBrowse')}</Link>
          </Button>
        </div>
      )}

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {requests?.map((r, i) => (
          <li
            key={r.id}
            className="animate-rise-in overflow-hidden rounded-card border bg-card transition-shadow hover:shadow-md"
            style={{ animationDelay: `${(i % 9) * 40}ms` }}
          >
            <Link href={`/requests/${r.id}`} className="flex gap-3 p-3">
              <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-muted">
                {r.listing.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.listing.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-display text-xl font-extrabold text-forest">
                  ${Math.round(r.listing.rentUsd)}
                  <span className="text-xs font-normal text-muted-foreground">{t('perMonthShort')}</span>
                </span>
                <p className="truncate text-sm text-slate_brand">
                  {r.listing.district}
                  {r.listing.neighborhood ? ` · ${r.listing.neighborhood}` : ''} · {r.listing.bedrooms}{' '}
                  {t('bedsShort')}
                </p>
                <p className="mt-1.5">
                  <span className={chipStyle(r.state)}>
                    {ts(r.state)}
                    {r.state === 'viewing_scheduled' && r.viewingAt && (
                      <span className="ml-1 font-bold text-lime">
                        · {formatDateTime(r.viewingAt)}
                      </span>
                    )}
                  </span>
                </p>
              </div>
              <ChevronRight
                className="h-5 w-5 shrink-0 self-center text-muted-foreground"
                aria-hidden
              />
            </Link>
            {OPEN.includes(r.state) && (
              <div className="border-t px-3 py-2 text-right">
                <Button variant="ghost" size="sm" onClick={() => setWithdrawId(r.id)}>
                  {t('withdraw')}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <BottomSheet
        open={withdrawId !== null}
        onClose={() => setWithdrawId(null)}
        title={t('withdrawTitle')}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate_brand">{t('withdrawBody')}</p>
          {withdraw.isError && <p className="text-sm text-destructive">{withdraw.error.message}</p>}
          <Button
            className="w-full"
            disabled={withdraw.isPending}
            onClick={() => withdrawId && withdraw.mutate(withdrawId)}
          >
            {t('withdrawConfirm')}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setWithdrawId(null)}>
            {t('keep')}
          </Button>
        </div>
      </BottomSheet>
    </main>
  );
}
