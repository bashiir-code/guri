'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';

interface Metrics {
  agencies: Array<{
    agencyId: string;
    name: string;
    status: string;
    listingsByStatus: { draft: number; available: number; reserved: number; rented: number };
    funnel: { requested: number; viewed: number; closed: number };
    medianDaysToRent: number | null;
  }>;
}

// §5/§13 Metrics — funnel bars + median days-to-rent, per agency.
export default function AdminMetricsPage() {
  const t = useTranslations('admin.metricsView');

  const { data, isLoading } = useQuery<Metrics>({
    queryKey: ['admin-metrics'],
    queryFn: () => api('/admin/metrics'),
  });

  if (isLoading || !data) return <p className="text-muted-foreground">…</p>;

  const bar = (value: number, max: number) => (max > 0 ? Math.round((value / max) * 100) : 0);

  return (
    <main className="space-y-5">
      <h1 className="font-display text-2xl font-bold text-forest">{t('title')}</h1>
      {!data.agencies.length && <p className="text-muted-foreground">{t('empty')}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {data.agencies.map((a) => {
          const max = a.funnel.requested || 1;
          const steps = [
            { key: 'requested', value: a.funnel.requested },
            { key: 'viewed', value: a.funnel.viewed },
            { key: 'closed', value: a.funnel.closed },
          ];
          return (
            <Card key={a.agencyId} className="animate-rise-in">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <p className="font-display text-lg font-bold text-forest">{a.name}</p>
                  <span className="text-xs text-muted-foreground">{t(`status.${a.status}`)}</span>
                </div>

                {/* Conversion funnel per the reference: label + serif count,
                    thick rounded forest bars on a mist track. */}
                <div className="space-y-3">
                  {steps.map((s) => (
                    <div key={s.key}>
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="text-sm text-slate_brand">{t(`funnel.${s.key}`)}</span>
                        <span className="font-display text-lg font-bold text-forest">{s.value}</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-forest transition-[width] duration-500 motion-reduce:transition-none"
                          style={{ width: `${bar(s.value, max)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Median days-to-rent as the dark hero figure (lime serif). */}
                <div className="rounded-2xl bg-forest px-5 py-4">
                  <p className="text-xs text-mist/80">{t('medianDaysToRent')}</p>
                  <p className="font-display text-4xl font-extrabold text-lime">
                    {a.medianDaysToRent === null ? '—' : a.medianDaysToRent}
                  </p>
                  {a.medianDaysToRent !== null && (
                    <p className="text-xs text-mist/70">{t('days', { days: a.medianDaysToRent })}</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {(['available', 'reserved', 'rented', 'draft'] as const).map((k) => (
                    <span key={k}>
                      <strong className="text-forest">{a.listingsByStatus[k]}</strong> {t(`listing.${k}`)}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
