'use client';

import { use, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { ApiError, api } from '@/lib/api';
import { Link } from '@/i18n/navigation';
import { cn, formatDateTime, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BottomSheet } from '@/components/bottom-sheet';
import { StatusChip } from '@/components/status-chip';

interface QueueDeal {
  id: string;
  state: string;
  viewingAt: string | null;
  requestedAt: string;
  customer: { name: string | null; phone: string | null };
}
interface Queue {
  listing: {
    id: string;
    district: string;
    neighborhood: string | null;
    rentUsd: number;
    status: 'available' | 'reserved' | 'rented';
    coverUrl: string | null;
  };
  active: QueueDeal | null;
  queue: QueueDeal[];
}

// §5 agency screen 4: the queue — customer mini-profile, request age,
// schedule viewing or decline. Only one deal holds the active slot.
export default function QueuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('queue');
  const ts = useTranslations('dealStates');
  const locale = useLocale();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<Queue>({
    queryKey: ['queue', id],
    queryFn: () => api(`/listings/${id}/requests`),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['queue', id] });
    void qc.invalidateQueries({ queryKey: ['listings'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const [scheduleFor, setScheduleFor] = useState<QueueDeal | null>(null);
  const [declineFor, setDeclineFor] = useState<QueueDeal | null>(null);
  const [viewingAt, setViewingAt] = useState('');
  const [reason, setReason] = useState('');

  const schedule = useMutation({
    mutationFn: (dealId: string) =>
      api(`/deals/${dealId}/select`, { body: { viewingAt: new Date(viewingAt).toISOString() } }),
    onSuccess: () => {
      setScheduleFor(null);
      setViewingAt('');
      invalidate();
    },
  });
  const decline = useMutation({
    mutationFn: (dealId: string) =>
      api(`/deals/${dealId}/decline-request`, { body: reason.trim() ? { reason: reason.trim() } : {} }),
    onSuccess: () => {
      setDeclineFor(null);
      setReason('');
      invalidate();
    },
  });

  if (isLoading || !data) return <p className="text-muted-foreground">…</p>;
  const reserved = data.active !== null;

  return (
    <main className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-forest">{t('title')}</h1>
          <Link
            href={`/console/listings/${data.listing.id}`}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {data.listing.district}
            {data.listing.neighborhood ? ` · ${data.listing.neighborhood}` : ''} · $
            {Math.round(data.listing.rentUsd)} — {t('backToListing')}
          </Link>
        </div>
        <StatusChip status={data.listing.status} publishedAt={new Date()} />
      </div>

      {data.active && (
        <div className="animate-rise-in rounded-card border-2 border-amber_reserved/50 bg-card p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate_brand">
            {t('activeSlot')}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-forest">
                {data.active.customer.name ?? data.active.customer.phone}
              </p>
              <p className="text-sm text-muted-foreground">
                {ts(data.active.state)}
                {data.active.viewingAt ? ` · ${formatDateTime(data.active.viewingAt)}` : ''}
              </p>
            </div>
            <Button asChild size="sm">
              <Link href={`/console/deals/${data.active.id}`}>{t('openDeal')}</Link>
            </Button>
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-2 font-display text-lg font-bold text-forest">
          {t('queueHeading', { count: data.queue.length })}
        </h2>
        {reserved && data.queue.length > 0 && (
          <p className="mb-3 text-sm text-muted-foreground">{t('reservedHint')}</p>
        )}
        {data.queue.length === 0 && <p className="text-sm text-muted-foreground">{t('empty')}</p>}
        <ul className="space-y-2">
          {data.queue.map((d, i) => (
            // Request card from the reference queue: identity row on top,
            // then a full-width action row — lime schedule pill growing,
            // white outline decline beside it.
            <li
              key={d.id}
              className="animate-rise-in space-y-3 rounded-card border bg-card p-4"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted font-display font-bold text-forest">
                  {(d.customer.name ?? '?')
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase())
                    .join('') || '?'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-forest">
                    {d.customer.name ?? d.customer.phone}
                  </p>
                  <p className="truncate text-sm text-slate_brand">
                    ${Math.round(data.listing.rentUsd)}
                    {data.listing.neighborhood ? ` · ${data.listing.neighborhood}` : ` · ${data.listing.district}`}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {timeAgo(d.requestedAt, locale)}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  disabled={reserved}
                  onClick={() => {
                    setViewingAt('');
                    schedule.reset();
                    setScheduleFor(d);
                  }}
                >
                  {t('schedule')}
                </Button>
                <Button variant="outline" onClick={() => setDeclineFor(d)}>
                  {t('decline')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <BottomSheet
        open={scheduleFor !== null}
        onClose={() => setScheduleFor(null)}
        title={t('scheduleTitle', { name: scheduleFor?.customer.name ?? '' })}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="viewing-at">{t('viewingTime')}</Label>
            <Input
              id="viewing-at"
              type="datetime-local"
              value={viewingAt}
              onChange={(e) => setViewingAt(e.target.value)}
            />
          </div>
          {schedule.isError && (
            <p className="text-sm text-destructive">
              {schedule.error instanceof ApiError && schedule.error.status === 409
                ? t('alreadyReserved')
                : t('failed')}
            </p>
          )}
          <Button
            className="w-full"
            disabled={!viewingAt || schedule.isPending}
            onClick={() => scheduleFor && schedule.mutate(scheduleFor.id)}
          >
            {t('confirmSchedule')}
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={declineFor !== null}
        onClose={() => setDeclineFor(null)}
        title={t('declineTitle', { name: declineFor?.customer.name ?? '' })}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="decline-reason">{t('reason')}</Label>
            <Input id="decline-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {decline.isError && <p className="text-sm text-destructive">{t('failed')}</p>}
          <Button
            variant="outline"
            className={cn('w-full border-destructive text-destructive hover:bg-destructive/5')}
            disabled={decline.isPending}
            onClick={() => declineFor && decline.mutate(declineFor.id)}
          >
            {t('confirmDecline')}
          </Button>
        </div>
      </BottomSheet>
    </main>
  );
}
