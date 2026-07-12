'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CalendarClock } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Dashboard {
  todaysViewings: Array<{
    dealId: string;
    viewingAt: string;
    customer: { name: string | null; phone: string | null };
    listing: { id: string; district: string; neighborhood: string | null };
  }>;
  unansweredRequests: number;
  awaitingDocs: number;
  listingsByStatus: { draft: number; available: number; reserved: number; rented: number };
}

const statusDot: Record<string, string> = {
  draft: 'bg-slate_brand/60',
  available: 'bg-lime',
  reserved: 'bg-amber_reserved',
  rented: 'bg-forest',
};

// §5 agency screen 1: today's viewings, unanswered requests, deals awaiting
// documents, listings by status.
export default function ConsoleDashboard() {
  const t = useTranslations('dashboard');
  const ts = useTranslations('listings.status');
  const { data, isLoading } = useQuery<Dashboard>({
    queryKey: ['dashboard'],
    queryFn: () => api('/agency/dashboard'),
  });

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-card border bg-card" />
        ))}
      </div>
    );
  }

  return (
    <main className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-forest lg:text-3xl">{t('title')}</h1>

      {/* Dark stats bar from the reference console: three figures side by
          side, numbers in lime serif, hairline dividers between columns. */}
      <div className="animate-rise-in grid grid-cols-3 divide-x divide-mist/15 rounded-card bg-forest px-2 py-5">
        {[
          [data.todaysViewings.length, t('todaysViewings')],
          [data.unansweredRequests, t('unanswered')],
          [data.awaitingDocs, t('awaitingDocs')],
        ].map(([n, label], i) => (
          <div key={i} className="px-3 text-center">
            <p className="font-display text-3xl font-extrabold text-lime">{n}</p>
            <p className="mt-1 text-xs leading-tight text-mist/80">{label}</p>
          </div>
        ))}
      </div>

      <Card className="animate-rise-in" style={{ animationDelay: '60ms' }}>
        <CardContent className="p-5">
          <p className="mb-2 text-sm text-muted-foreground">{t('listings')}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {(Object.keys(data.listingsByStatus) as Array<keyof Dashboard['listingsByStatus']>).map(
              (k) => (
                <span key={k} className="inline-flex items-center gap-1.5 text-sm text-forest">
                  <span className={`h-2 w-2 rounded-full ${statusDot[k]}`} aria-hidden />
                  <strong className="font-display">{data.listingsByStatus[k]}</strong> {ts(k)}
                </span>
              ),
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="animate-rise-in" style={{ animationDelay: '180ms' }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarClock className="h-5 w-5" aria-hidden />
            {t('todaysViewings')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.todaysViewings.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('noViewings')}</p>
          )}
          <ul className="divide-y">
            {data.todaysViewings.map((v) => (
              <li key={v.dealId}>
                <Link
                  href={`/console/deals/${v.dealId}`}
                  className="flex items-center justify-between gap-3 py-3 hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium text-forest">{v.customer.name ?? v.customer.phone}</p>
                    <p className="text-sm text-muted-foreground">
                      {v.listing.district}
                      {v.listing.neighborhood ? ` · ${v.listing.neighborhood}` : ''}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-forest">
                    {formatDateTime(v.viewingAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
