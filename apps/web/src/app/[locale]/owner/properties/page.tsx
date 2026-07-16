'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Home } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { SolidStatusChip } from '@/components/status-chip';

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

// §5 owner screen 3, per the Guri Owner design — white cards, read-only;
// the ONLY forward action is bringing another house to an agency.
export default function OwnerPropertiesPage() {
  const t = useTranslations('owner');
  const tt = useTranslations('listings.types');
  const ts = useTranslations('listings.status');
  const { data: properties, isLoading } = useQuery<OwnerProperty[]>({
    queryKey: ['owner-properties'],
    queryFn: () => api('/owner/properties'),
  });

  return (
    <main className="flex flex-col gap-[18px] md:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="hidden animate-rise-in md:block">
          <h1 className="font-display text-[28px] font-extrabold">{t('properties.title')}</h1>
          <p className="mt-[5px] text-sm text-slate_brand">{t('properties.subtitle')}</p>
        </div>
        <div className="text-right">
          <Button asChild>
            <Link href="/list-house">{t('properties.listAnother')}</Link>
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">{t('properties.comingSoon')}</p>
        </div>
      </div>

      {isLoading && (
        <div className="grid gap-3.5 md:grid-cols-2 md:gap-5 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-72 animate-pulse rounded-card bg-card" />
          ))}
        </div>
      )}
      {!isLoading && !properties?.length && (
        <div className="animate-rise-in rounded-card bg-card p-10 text-center shadow-[0_1px_3px_rgba(23,58,49,0.06)]">
          <p className="font-display text-lg font-bold text-forest">{t('properties.emptyTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('properties.emptyBody')}</p>
        </div>
      )}

      <ul className="grid gap-3.5 md:grid-cols-2 md:gap-5 lg:grid-cols-3">
        {properties?.map((p, i) => (
          <li key={p.id} className="animate-rise-in" style={{ animationDelay: `${i * 50}ms` }}>
            <Link
              href={`/owner/properties/${p.id}`}
              className="flex h-full flex-col overflow-hidden rounded-card bg-card shadow-[0_1px_3px_rgba(23,58,49,0.06)] transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <div className="relative grid aspect-video w-full place-items-center bg-forest/[0.08]">
                {p.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.coverUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <Home className="h-9 w-9 text-forest/25" aria-hidden />
                )}
                <SolidStatusChip
                  status={p.status}
                  publishedAt={p.publishedAt}
                  className="absolute left-3 top-3 px-[11px] py-[5px] text-[11.5px]"
                />
              </div>
              <div className="flex flex-1 flex-col gap-3 p-[18px]">
                <div>
                  <p className="text-[15.5px] font-bold">
                    {p.district}
                    {p.neighborhood ? ` · ${p.neighborhood}` : ''}
                  </p>
                  <p className="mt-[3px] text-[13px] text-slate_brand">
                    {tt(p.type)} · {p.bedrooms} {t('properties.bedsShort')}
                  </p>
                </div>
                <div className="mt-auto flex items-center justify-between gap-3 border-t border-forest/[0.07] pt-3">
                  <div className="min-w-0">
                    <p className="text-[11.5px] text-slate_brand">
                      {p.currentLease ? t('properties.tenant') : t('properties.statusLabel')}
                    </p>
                    <p className="mt-0.5 truncate text-[13px] font-semibold">
                      {p.currentLease ? (p.currentLease.tenantName ?? '—') : ts(p.publishedAt ? p.status : 'draft')}
                    </p>
                    {p.currentLease && (
                      <p className="mt-0.5 text-[11.5px] text-slate_brand">
                        {p.currentLease.daysToEnd < 0
                          ? t('properties.endedAgo', { days: -p.currentLease.daysToEnd })
                          : t('properties.daysToEnd', { days: p.currentLease.daysToEnd })}
                      </p>
                    )}
                  </div>
                  <p className="flex-none font-display text-xl font-extrabold">
                    ${Math.round(p.rentUsd)}
                    <span className="font-sans text-[11.5px] font-medium text-slate_brand">
                      {t('properties.perMonth')}
                    </span>
                  </p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
