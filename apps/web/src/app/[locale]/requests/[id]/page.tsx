'use client';

import { use } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PublicHeader } from '@/components/public-header';
import { IdCapture } from '@/components/id-capture';

interface TrackerDeal {
  id: string;
  state: string;
  viewingAt: string | null;
  createdAt: string;
  listing: { id: string; district: string; neighborhood: string | null; rentUsd: number };
  document: {
    id: string;
    idType: string;
    capturedVia: string;
    status: string;
    reviewNote: string | null;
    uploadedAt: string;
  } | null;
  timeline: Array<{ fromState: string | null; toState: string; at: string }>;
  viewerRole: 'customer' | 'agency';
}

// §5 customer screen 5 — the deal tracker: timeline + the ID step, which is
// an active camera-capture card at awaiting_docs / after a rejection.
export default function DealTrackerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('tracker');
  const ts = useTranslations('dealStates');

  const { data: deal, isLoading } = useQuery<TrackerDeal>({
    queryKey: ['deal', id],
    queryFn: () => api(`/deals/${id}`),
  });

  const viewOwnDoc = useMutation({
    mutationFn: () => api<{ url: string }>(`/deals/${id}/documents/url`, { method: 'POST', body: {} }),
    onSuccess: (r) => window.open(r.url, '_blank', 'noopener'),
  });
  const downloadAgreement = useMutation({
    mutationFn: () => api<{ pdfUrl: string; signedUrl: string | null }>(`/deals/${id}/agreement`),
    onSuccess: (r) => window.open(r.signedUrl ?? r.pdfUrl, '_blank', 'noopener'),
  });

  if (isLoading) return <p className="p-8 text-muted-foreground">…</p>;
  if (!deal) return <p className="p-8 text-muted-foreground">{t('notFound')}</p>;

  const idStep = () => {
    switch (deal.state) {
      case 'awaiting_docs':
        return (
          <Card className="animate-rise-in border-2 border-lime">
            <CardHeader>
              <CardTitle className="text-lg">{t('uploadTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <IdCapture dealId={deal.id} />
            </CardContent>
          </Card>
        );
      case 'docs_in_review':
        return (
          <Card className="animate-rise-in">
            <CardHeader>
              <CardTitle className="text-lg">{t('inReviewTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate_brand">{t('inReviewBody')}</p>
              <Button variant="ghost" size="sm" onClick={() => viewOwnDoc.mutate()}>
                {t('viewMyPhoto')}
              </Button>
            </CardContent>
          </Card>
        );
      case 'docs_rejected':
        return (
          <Card className="animate-rise-in border-2 border-destructive/40">
            <CardHeader>
              <CardTitle className="text-lg">{t('rejectedTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {deal.document?.reviewNote && (
                <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  “{deal.document.reviewNote}”
                </p>
              )}
              <p className="text-sm text-slate_brand">{t('rejectedBody')}</p>
              <IdCapture dealId={deal.id} />
            </CardContent>
          </Card>
        );
      case 'approved':
        return (
          <Card className="animate-rise-in border-2 border-lime">
            <CardContent className="flex items-center gap-4 p-5">
              <span className="animate-pop flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-lime text-xl text-forest">
                ✓
              </span>
              <div>
                <p className="font-display font-bold text-forest">{t('approvedTitle')}</p>
                <p className="text-sm text-slate_brand">{t('approvedBody')}</p>
              </div>
            </CardContent>
          </Card>
        );
      case 'closed':
        return (
          <Card className="animate-rise-in border-2 border-lime">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-4">
                <span className="animate-pop flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-lime text-xl">
                  🔑
                </span>
                <div>
                  <p className="font-display font-bold text-forest">{t('closedTitle')}</p>
                  <p className="text-sm text-slate_brand">{t('closedBody')}</p>
                </div>
              </div>
              <Button className="w-full" onClick={() => downloadAgreement.mutate()}>
                {t('downloadAgreement')}
              </Button>
            </CardContent>
          </Card>
        );
      case 'viewing_scheduled':
        return (
          <Card className="animate-rise-in">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{t('viewingTitle')}</p>
              <p className="font-display text-lg font-bold text-forest">
                {deal.viewingAt ? formatDateTime(deal.viewingAt) : '—'}
              </p>
            </CardContent>
          </Card>
        );
      default:
        return null;
    }
  };

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[480px] space-y-5 px-4 py-4 md:max-w-2xl">
      <PublicHeader />

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-forest">{t('title')}</h1>
          <Link
            href={`/listings/${deal.listing.id}`}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {deal.listing.district}
            {deal.listing.neighborhood ? ` · ${deal.listing.neighborhood}` : ''} · $
            {Math.round(deal.listing.rentUsd)}
          </Link>
        </div>
        <span className="inline-flex rounded-full bg-amber_reserved/25 px-3 py-1 text-xs font-semibold text-forest">
          {ts(deal.state)}
        </span>
      </div>

      {idStep()}

      <Card className="animate-rise-in" style={{ animationDelay: '80ms' }}>
        <CardHeader>
          <CardTitle className="text-lg">{t('timeline')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="relative ml-2 space-y-4 border-l pl-5">
            {deal.timeline.map((e, i) => (
              <li key={i} className="relative">
                <span
                  className={cn(
                    'absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-card',
                    i === deal.timeline.length - 1 ? 'bg-lime' : 'bg-slate_brand/50',
                  )}
                  aria-hidden
                />
                <p className="text-sm font-medium text-forest">
                  {e.fromState === null
                    ? t('created')
                    : e.fromState === e.toState
                      ? t('rescheduled')
                      : ts(e.toState)}
                </p>
                <p className="text-xs text-muted-foreground">{formatDateTime(e.at)}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </main>
  );
}
