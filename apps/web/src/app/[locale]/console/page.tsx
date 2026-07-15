'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { formatLongDate } from '@/lib/so-date';
import { cn } from '@/lib/utils';

type Stage = 'requested' | 'viewing_scheduled' | 'awaiting_docs' | 'docs_in_review' | 'approved';

interface Dashboard {
  todaysViewings: Array<{
    dealId: string;
    viewingAt: string;
    customer: { name: string | null; phone: string | null };
    listing: { id: string; district: string; neighborhood: string | null };
  }>;
  listingsByStatus: { draft: number; available: number; reserved: number; rented: number };
  stats: {
    activeListings: number;
    newLeads: number;
    viewingsThisWeek: number;
    rentThisMonthUsd: number;
  };
  newLeads: Array<{
    dealId: string;
    state: Stage;
    name: string;
    listing: { id: string; district: string; neighborhood: string | null };
    when: string;
  }>;
}

// Stage chip colours per the design: lime for new, amber mid-pipeline, forest
// once approved.
const stageChip: Record<Stage, string> = {
  requested: 'bg-lime/40 text-forest',
  viewing_scheduled: 'bg-amber_reserved/25 text-[#8A5A10]',
  awaiting_docs: 'bg-amber_reserved/25 text-[#8A5A10]',
  docs_in_review: 'bg-amber_reserved/25 text-[#8A5A10]',
  approved: 'bg-forest/10 text-forest',
};

// §5 agency dashboard, Agency Console design: stat cards, new-leads list,
// today's viewings (forest card), and the portfolio status breakdown.
export default function ConsoleDashboard() {
  const t = useTranslations('dashboard');
  const tc = useTranslations('console');
  const ts = useTranslations('listings.status');
  const locale = useLocale();
  const { data, isLoading } = useQuery<Dashboard>({
    queryKey: ['dashboard'],
    queryFn: () => api('/agency/dashboard'),
  });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-card border bg-card" />
        ))}
      </div>
    );
  }

  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '·';

  const stats = [
    { label: t('statActiveListings'), value: String(data.stats.activeListings) },
    { label: t('statNewLeads'), value: String(data.stats.newLeads) },
    { label: t('statViewingsWeek'), value: String(data.stats.viewingsThisWeek) },
    { label: t('statRentMonth'), value: `$${data.stats.rentThisMonthUsd.toLocaleString('en-US')}` },
  ];

  const portfolio = [
    { key: 'available', value: data.listingsByStatus.available, bar: 'bg-forest', dot: 'bg-forest' },
    { key: 'reserved', value: data.listingsByStatus.reserved, bar: 'bg-amber_reserved', dot: 'bg-amber_reserved' },
    { key: 'rented', value: data.listingsByStatus.rented, bar: 'bg-slate_brand', dot: 'bg-slate_brand' },
  ] as const;
  const portfolioTotal = portfolio.reduce((sum, p) => sum + p.value, 0) || 1;

  return (
    <main className="flex flex-col gap-5 md:gap-6">
      {/* Header (wide only) — greeting + the one lime action. */}
      <div className="hidden items-end justify-between gap-5 md:flex">
        <div className="animate-rise-in">
          <h1 className="font-display text-[28px] font-extrabold text-forest">
            {t('greeting', { name: (data.newLeads[0]?.name ?? 'Guri').split(' ')[0] })}
          </h1>
          <p className="mt-1 text-sm text-slate_brand">
            {formatLongDate(new Date(), locale)} · {tc('subtitle')}
          </p>
        </div>
        <Link
          href="/console/listings/new"
          className="flex h-[46px] flex-none items-center gap-2 rounded-full bg-lime px-5 text-sm font-bold text-forest transition-transform hover:brightness-95 active:scale-[0.98] motion-reduce:transition-none"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t('newListing')}
        </Link>
      </div>

      {/* Stat cards — 2-up phone, 4-up tablet/desktop. */}
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4 md:gap-5">
        {stats.map((s) => (
          <div key={s.label} className="animate-rise-in flex flex-col gap-1.5 rounded-card bg-card p-5 shadow-sm">
            <p className="text-[13px] font-semibold text-slate_brand">{s.label}</p>
            <p className="font-display text-3xl font-extrabold text-forest">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-3.5 md:gap-5 lg:grid-cols-[1.5fr_1fr]">
        {/* New leads. min-w-0: as a grid child this defaults to min-width:auto,
            so without it the card refuses to shrink below its content and the
            lead rows overflow the viewport on the phone instead of truncating. */}
        <div className="animate-rise-in flex min-w-0 flex-col gap-4 rounded-card bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[17px] font-bold text-forest">{t('newLeadsTitle')}</h2>
            <Link href="/console/leads" className="text-[13px] font-semibold text-slate_brand hover:text-forest">
              {t('viewAll')} →
            </Link>
          </div>
          {data.newLeads.length === 0 && <p className="text-sm text-muted-foreground">{t('noLeads')}</p>}
          <div className="flex flex-col">
            {data.newLeads.map((ld) => (
              <Link
                key={ld.dealId}
                href={`/console/deals/${ld.dealId}`}
                className="flex items-center gap-3.5 border-b border-forest/[0.06] py-3 last:border-0 hover:bg-muted/40"
              >
                <span className="grid h-[38px] w-[38px] flex-none place-items-center rounded-full bg-forest/[0.08] text-[13px] font-bold text-forest">
                  {initials(ld.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-forest">
                    {ld.name}{' '}
                    <span className="font-normal text-slate_brand">
                      · {ld.listing.district}
                      {ld.listing.neighborhood ? ` · ${ld.listing.neighborhood}` : ''}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-slate_brand">{formatDateTime(ld.when)}</p>
                </div>
                <span
                  className={cn(
                    'flex-none rounded-full px-2.5 py-1 text-[11.5px] font-semibold',
                    stageChip[ld.state],
                  )}
                >
                  {t(`stage.${ld.state}`)}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3.5 md:gap-5">
          {/* Today's viewings — forest card */}
          <div className="animate-rise-in flex flex-col gap-3.5 rounded-card bg-forest p-6">
            <h2 className="font-display text-[17px] font-bold text-mist">{t('todaysViewings')}</h2>
            {data.todaysViewings.length === 0 && (
              <p className="text-sm text-mist/70">{t('noViewings')}</p>
            )}
            {data.todaysViewings.map((v) => (
              <Link
                key={v.dealId}
                href={`/console/deals/${v.dealId}`}
                className="flex items-center gap-3.5 rounded-[14px] bg-white/[0.07] px-3.5 py-3 hover:bg-white/[0.12]"
              >
                <span className="w-12 flex-none font-display text-base font-extrabold text-lime">
                  {formatDateTime(v.viewingAt).split(',').pop()?.trim() ?? formatDateTime(v.viewingAt)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-mist">
                    {v.listing.district}
                    {v.listing.neighborhood ? ` · ${v.listing.neighborhood}` : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-mist/65">{v.customer.name ?? v.customer.phone}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* Portfolio breakdown */}
          <div className="animate-rise-in flex flex-col gap-3 rounded-card bg-card p-6 shadow-sm">
            <h2 className="font-display text-[17px] font-bold text-forest">{t('portfolioTitle')}</h2>
            <div className="flex h-2.5 overflow-hidden rounded-full">
              {portfolio.map((p) => (
                <div
                  key={p.key}
                  className={p.bar}
                  style={{ width: `${(p.value / portfolioTotal) * 100}%` }}
                />
              ))}
            </div>
            <div className="flex flex-col gap-2">
              {portfolio.map((p) => (
                <div key={p.key} className="flex items-center gap-2 text-[13px]">
                  <span className={cn('h-2.5 w-2.5 flex-none rounded-sm', p.dot)} aria-hidden />
                  <span className="flex-1 text-slate_brand">{ts(p.key)}</span>
                  <strong className="text-forest">{p.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
