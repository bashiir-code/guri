'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { formatLongDate, formatMonthShort } from '@/lib/so-date';
import { cn } from '@/lib/utils';

interface Overview {
  activeAgencies: number;
  pendingAgencies: number;
  suspendedAgencies: number;
  activeListings: number;
  listingsThisMonth: number;
  activeTenancies: number;
  rentThisMonthUsd: number;
  tenanciesPerMonth: Array<{ month: string; count: number }>;
  listingsByDistrict: Array<{ district: string; count: number }>;
}
interface Metrics {
  overview: Overview;
  agencies: Array<{
    agencyId: string;
    name: string;
    status: string;
    listingsByStatus: { draft: number; available: number; reserved: number; rented: number };
    funnel: { requested: number; viewed: number; closed: number };
    medianDaysToRent: number | null;
  }>;
}

// §5/§13 Metrics overview — the console landing screen from the Platform
// Admin design: KPI cards, new-tenancies bar chart (forest hero, lime last
// bar), listings by district, pending approvals. Per-agency funnels follow.
export default function AdminOverviewPage() {
  const t = useTranslations('admin');
  const locale = useLocale();

  const { data, isLoading } = useQuery<Metrics>({
    queryKey: ['admin-metrics'],
    queryFn: () => api('/admin/metrics'),
  });

  if (isLoading || !data) return <p className="text-muted-foreground">…</p>;
  const o = data.overview;

  const today = formatLongDate(new Date(), locale);

  const kpis = [
    {
      label: t('overview.kpiAgencies'),
      value: String(o.activeAgencies),
      delta: t('overview.kpiAgenciesDelta', { count: o.pendingAgencies }),
      deltaClass: o.pendingAgencies > 0 ? 'text-[#8A5A10]' : 'text-slate_brand',
    },
    {
      label: t('overview.kpiListings'),
      value: String(o.activeListings),
      delta: t('overview.deltaThisMonth', { count: o.listingsThisMonth }),
      deltaClass: 'text-forest',
    },
    {
      label: t('overview.kpiTenancies'),
      value: String(o.activeTenancies),
      delta: t('overview.deltaThisMonth', {
        count: o.tenanciesPerMonth[o.tenanciesPerMonth.length - 1]?.count ?? 0,
      }),
      deltaClass: 'text-forest',
    },
    {
      label: t('overview.kpiRent'),
      value: `$${o.rentThisMonthUsd.toLocaleString('en-US')}`,
      delta: t('overview.thisMonth'),
      deltaClass: 'text-slate_brand',
    },
  ];

  const maxBar = Math.max(1, ...o.tenanciesPerMonth.map((m) => m.count));
  const monthLabel = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    return formatMonthShort(new Date(y, m - 1, 1), locale);
  };

  // Top 5 districts + everything else rolled into one row, like the design.
  const top = o.listingsByDistrict.slice(0, 5);
  const otherCount = o.listingsByDistrict.slice(5).reduce((sum, d) => sum + d.count, 0);
  const districts = [
    ...top.map((d) => ({ name: d.district, count: d.count })),
    ...(otherCount > 0 ? [{ name: t('overview.otherDistricts'), count: otherCount }] : []),
  ];
  const maxDistrict = Math.max(1, ...districts.map((d) => d.count));

  return (
    <main className="flex flex-col gap-5 md:gap-6">
      <div className="animate-rise-in hidden md:block">
        <h1 className="font-display text-[28px] font-extrabold text-forest">
          {t('overview.title')}
        </h1>
        <p className="mt-1 text-sm text-slate_brand">
          {t('overview.subtitle')} · {today}
        </p>
      </div>

      {/* KPI cards — 2-up on the phone, 4-up on tablet/desktop. */}
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4 md:gap-5">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="animate-rise-in flex flex-col gap-1.5 rounded-card bg-card p-5 shadow-sm"
          >
            <p className="text-[13px] font-semibold text-slate_brand">{k.label}</p>
            <p className="font-display text-3xl font-extrabold text-forest">{k.value}</p>
            <p className={cn('text-[12.5px]', k.deltaClass)}>{k.delta}</p>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-3.5 md:gap-5 lg:grid-cols-[1.5fr_1fr]">
        {/* Forest hero — new tenancies per month, last bar lime. */}
        <div className="animate-rise-in flex flex-col gap-4 rounded-[24px] bg-forest p-5 md:p-7">
          <h2 className="font-display text-[17px] font-bold text-mist">
            {t('overview.chartTitle')}
          </h2>
          <div className="flex h-[150px] items-end gap-1.5 md:gap-3">
            {o.tenanciesPerMonth.map((m, i) => {
              const last = i === o.tenanciesPerMonth.length - 1;
              return (
                <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <span
                    className={cn(
                      'text-[11.5px] font-bold',
                      last ? 'text-lime' : 'text-mist/60',
                    )}
                  >
                    {m.count}
                  </span>
                  <div
                    className={cn(
                      'w-full max-w-12 rounded-t-lg rounded-b-[3px]',
                      last ? 'bg-lime' : 'bg-mist/[0.22]',
                    )}
                    style={{ height: `${Math.max(4, Math.round((m.count / maxBar) * 100))}%` }}
                  />
                  <span className="text-[11px] text-mist/55">{monthLabel(m.month)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3.5 md:gap-5">
          {/* Listings by district */}
          <div className="animate-rise-in flex flex-col gap-3.5 rounded-card bg-card p-6 shadow-sm">
            <h2 className="font-display text-base font-bold text-forest">
              {t('overview.districtsTitle')}
            </h2>
            {districts.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('overview.noDistricts')}</p>
            )}
            {districts.map((d) => (
              <div key={d.name} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="font-semibold text-forest">{d.name}</span>
                  <span className="text-slate_brand">{d.count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-forest/[0.07]">
                  <div
                    className="h-full rounded-full bg-forest transition-[width] duration-500 motion-reduce:transition-none"
                    style={{ width: `${Math.round((d.count / maxDistrict) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Pending approvals — the screen's one Lime action. */}
          <div className="animate-rise-in flex flex-col gap-3 rounded-card bg-card p-6 shadow-sm">
            <h2 className="font-display text-base font-bold text-forest">
              {t('overview.pendingTitle')}
            </h2>
            <div className="flex items-center gap-3 rounded-[14px] bg-amber_reserved/[0.18] px-3.5 py-3">
              <p className="font-display text-2xl font-extrabold text-forest">
                {o.pendingAgencies}
              </p>
              <p className="text-[13px] leading-snug text-slate_brand">
                {t('overview.pendingBody', { count: o.pendingAgencies })}
              </p>
            </div>
            <Link
              href="/admin/agencies"
              className="grid h-11 place-items-center rounded-full bg-lime text-sm font-bold text-forest transition-transform duration-150 hover:brightness-95 active:scale-[0.98] motion-reduce:transition-none"
            >
              {t('overview.pendingCta')}
            </Link>
          </div>
        </div>
      </div>

      {/* Per-agency §13 detail: funnel + median days-to-rent. */}
      <section className="mt-1">
        <h2 className="mb-3 font-display text-lg font-bold text-forest">
          {t('overview.funnelsTitle')}
        </h2>
        {!data.agencies.length && (
          <p className="text-muted-foreground">{t('metricsView.empty')}</p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {data.agencies.map((a) => (
            <AgencyFunnelCard key={a.agencyId} agency={a} />
          ))}
        </div>
      </section>
    </main>
  );
}

function AgencyFunnelCard({ agency: a }: { agency: Metrics['agencies'][number] }) {
  const t = useTranslations('admin.metricsView');
  const max = a.funnel.requested || 1;
  const steps = [
    { key: 'requested', value: a.funnel.requested },
    { key: 'viewed', value: a.funnel.viewed },
    { key: 'closed', value: a.funnel.closed },
  ] as const;
  return (
    <div className="animate-rise-in space-y-4 rounded-card bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-bold text-forest">{a.name}</p>
        <span className="text-xs text-muted-foreground">{t(`status.${a.status}`)}</span>
      </div>
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
                style={{ width: `${max > 0 ? Math.round((s.value / max) * 100) : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
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
    </div>
  );
}
