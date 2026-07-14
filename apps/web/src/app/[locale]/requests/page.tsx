'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthStatus } from '@/hooks/use-auth-status';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, Camera, House, X } from 'lucide-react';
import { DEAL_OPEN_STATES } from '@guri/shared';
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
  agency: { name: string; phone: string | null };
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

// The six-step tenancy pipeline the tracker visualises (§4/§16).
const PIPELINE = [
  'requested',
  'viewing_scheduled',
  'awaiting_docs',
  'docs_in_review',
  'approved',
  'closed',
] as const;
const OPEN = DEAL_OPEN_STATES as readonly string[];

export default function MyRequestsPage() {
  return (
    <Suspense fallback={<PublicHeader />}>
      <MyRequests />
    </Suspense>
  );
}

function MyRequests() {
  const t = useTranslations('requests');
  const ts = useTranslations('dealStates');
  const tt = useTranslations('listings.types');
  const qc = useQueryClient();
  const params = useSearchParams();
  const { isLoaded, isSignedIn } = useAuthStatus();
  const signedIn = isLoaded && isSignedIn;

  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [bannerOpen, setBannerOpen] = useState(params.get('sent') === '1');

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

  // Auto-expand the first request so the timeline is visible on arrival.
  const firstId = requests?.[0]?.id;
  const openId = expanded ?? firstId ?? null;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[560px] px-4 py-4 lg:max-w-2xl lg:px-6">
      <PublicHeader />
      <h1 className="font-display text-2xl font-extrabold text-forest lg:text-3xl">{t('title')}</h1>
      <p className="mb-4 mt-1 text-sm text-slate_brand">{t('subtitle')}</p>

      {bannerOpen && (
        <div className="animate-rise-in mb-5 flex items-center gap-3 rounded-card bg-forest px-4 py-4">
          <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-lime">
            <Check className="h-4 w-4 text-forest" strokeWidth={3} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-mist">{t('bannerTitle')}</p>
            <p className="mt-0.5 text-xs text-mist/75">{t('bannerBody')}</p>
          </div>
          <button
            onClick={() => setBannerOpen(false)}
            aria-label={t('keep')}
            className="flex-none rounded-lg p-1 text-mist/70 hover:text-mist"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

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

      <div className="flex flex-col gap-4">
        {requests?.map((r) => {
          const idx = PIPELINE.indexOf(r.state as (typeof PIPELINE)[number]);
          const inPipeline = idx >= 0;
          const isOpen = openId === r.id;
          const title = `${tt(r.listing.type)} · ${r.listing.bedrooms} ${t('bedsShort')}`;
          return (
            <div
              key={r.id}
              className="animate-rise-in overflow-hidden rounded-card border bg-card"
            >
              <button
                onClick={() => setExpanded(isOpen ? '' : r.id)}
                className="flex w-full items-center gap-3.5 p-4 text-left"
              >
                <span className="grid h-[52px] w-[52px] flex-none place-items-center overflow-hidden rounded-xl bg-muted">
                  {r.listing.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.listing.coverUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <House className="h-6 w-6 text-forest/40" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[15px] font-bold text-forest">{title}</p>
                  <p className="mt-0.5 truncate text-[13px] text-slate_brand">
                    {r.agency.name} · ${Math.round(r.listing.rentUsd)}
                    {t('perMonthShort')}
                  </p>
                  <span className="mt-2 inline-block rounded-full bg-lime/[0.35] px-2.5 py-1 text-[11.5px] font-semibold text-forest">
                    {inPipeline
                      ? `${t('stepOf', { n: idx + 1, total: PIPELINE.length })} · ${t(`steps.${r.state}.label`)}`
                      : ts(r.state)}
                  </span>
                </div>
                <ChevronDown
                  className={cn(
                    'h-5 w-5 flex-none text-muted-foreground transition-transform',
                    isOpen && 'rotate-180',
                  )}
                  aria-hidden
                />
              </button>

              {isOpen && (
                <div className="animate-fade-in border-t px-4 pb-5 pt-4">
                  <ol>
                    {PIPELINE.map((step, i) => {
                      const done = inPipeline && i < idx;
                      const current = inPipeline && i === idx;
                      const last = i === PIPELINE.length - 1;
                      return (
                        <li key={step} className="flex gap-4">
                          <div className="flex w-5 flex-none flex-col items-center">
                            <span
                              className={cn(
                                'grid h-5 w-5 place-items-center rounded-full border-2 box-border',
                                done && 'border-forest bg-forest',
                                current && 'border-forest bg-lime/30',
                                !done && !current && 'border-border bg-card',
                              )}
                            >
                              {done && <Check className="h-2.5 w-2.5 text-lime" strokeWidth={3.5} aria-hidden />}
                              {current && <span className="h-1.5 w-1.5 rounded-full bg-forest" />}
                            </span>
                            {!last && (
                              <span
                                className={cn('min-h-4 w-0.5 flex-1', done ? 'bg-forest' : 'bg-border')}
                              />
                            )}
                          </div>
                          <div className={cn('min-w-0 flex-1', last ? 'pb-0' : 'pb-5')}>
                            <p
                              className={cn(
                                'text-[15px] font-bold',
                                done || current ? 'text-forest' : 'text-muted-foreground',
                              )}
                            >
                              {t(`steps.${step}.label`)}
                            </p>
                            <p className="mt-0.5 text-[13px] leading-snug text-slate_brand">
                              {t(`steps.${step}.sub`)}
                            </p>
                            {step === 'viewing_scheduled' && current && r.viewingAt && (
                              <p className="mt-1 text-[13px] font-semibold text-forest">
                                {formatDateTime(r.viewingAt)} · {r.agency.name}
                                {r.agency.phone ? ` · ${r.agency.phone}` : ''}
                              </p>
                            )}
                            {step === 'awaiting_docs' && current && (
                              <Button asChild size="sm" className="mt-3 gap-2">
                                <Link href={`/requests/${r.id}`}>
                                  <Camera className="h-4 w-4" aria-hidden />
                                  {t('captureId')}
                                </Link>
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>

                  {OPEN.includes(r.state) && (
                    <button
                      onClick={() => setWithdrawId(r.id)}
                      className="mt-2 rounded-full border border-border px-4 py-2 text-[13px] font-semibold text-slate_brand hover:text-forest"
                    >
                      {t('withdraw')}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

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
