'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { StatusChip } from '@/components/status-chip';

interface OwnerProperty {
  id: string;
  district: string;
  neighborhood: string | null;
  type: string;
  bedrooms: number;
  rentUsd: number;
  status: 'available' | 'reserved' | 'rented';
  publishedAt: string | null;
  coverUrl: string | null;
  currentLease: {
    tenantName: string | null;
    startDate: string;
    endDate: string;
    daysToEnd: number;
  } | null;
}

// §5 owner screen 3 — cards, read-only; the ONLY forward action is disabled
// (owner intake is phase 10).
export default function OwnerPropertiesPage() {
  const t = useTranslations('owner');
  const { data: properties, isLoading } = useQuery<OwnerProperty[]>({
    queryKey: ['owner-properties'],
    queryFn: () => api('/owner/properties'),
  });

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-forest lg:text-3xl">
          {t('properties.title')}
        </h1>
        <div className="text-right">
          <Button asChild>
            <Link href="/list-house">{t('properties.listAnother')}</Link>
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">{t('properties.comingSoon')}</p>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground">…</p>}
      {!isLoading && !properties?.length && (
        <div className="animate-rise-in rounded-card border bg-card p-10 text-center">
          <p className="font-display text-lg font-bold text-forest">{t('properties.emptyTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('properties.emptyBody')}</p>
        </div>
      )}

      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {properties?.map((p, i) => (
          <li key={p.id} className="animate-rise-in" style={{ animationDelay: `${i * 50}ms` }}>
            <Link
              href={`/owner/properties/${p.id}`}
              className="block overflow-hidden rounded-card border bg-card transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <div className="relative aspect-[4/3] w-full bg-muted">
                {p.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                )}
                <span className="absolute left-3 top-3">
                  <StatusChip status={p.status} publishedAt={p.publishedAt} />
                </span>
              </div>
              <div className="space-y-1 p-4">
                <p className="font-display text-lg font-bold text-forest">
                  ${Math.round(p.rentUsd)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {t('properties.perMonth')}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {p.district}
                  {p.neighborhood ? ` · ${p.neighborhood}` : ''} · {p.bedrooms}{' '}
                  {t('properties.bedsShort')}
                </p>
                {p.currentLease && (
                  <div className="mt-2 rounded-xl bg-mist px-3 py-2 text-xs text-forest">
                    <p className="font-semibold">{p.currentLease.tenantName ?? '—'}</p>
                    <p className="text-muted-foreground">
                      {new Date(p.currentLease.startDate).toLocaleDateString()} →{' '}
                      {new Date(p.currentLease.endDate).toLocaleDateString()} ·{' '}
                      {t('properties.daysToEnd', { days: p.currentLease.daysToEnd })}
                    </p>
                  </div>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
