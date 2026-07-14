'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowDown, ArrowRight, Home } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useMe } from '@/hooks/use-me';
import { SolidStatusChip } from '@/components/status-chip';

interface OwnerDashboard {
  properties: number;
  occupied: number;
  incomeThisMonth: number;
  collectedThisYear: number;
  recentActivity: Array<{ template: string; payload: unknown; at: string }>;
}
interface Ledger {
  items: Array<{
    id: string;
    paidOn: string;
    type: string;
    amountUsd: number;
    note: string | null;
    listing: { id: string; district: string; neighborhood: string | null };
  }>;
  monthlyTotals: Array<{ month: string; totalUsd: number }>;
}
interface OwnerProperty {
  id: string;
  district: string;
  neighborhood: string | null;
  type: string;
  bedrooms: number;
  rentUsd: number;
  status: 'available' | 'reserved' | 'rented';
  publishedAt: string | null;
  currentLease: { tenantName: string | null } | null;
}

const placeName = (p: { district: string; neighborhood: string | null }) =>
  `${p.district}${p.neighborhood ? ` · ${p.neighborhood}` : ''}`;

// §5 owner screen 2, per the Guri Owner design: forest income hero with the
// monthly bar chart, recent payments, and a property shortlist. Read-only.
export default function OwnerDashboardPage() {
  const t = useTranslations('owner');
  const tp = useTranslations('paymentTypes');
  const locale = useLocale();
  const { data: me } = useMe();
  const { data, isLoading } = useQuery<OwnerDashboard>({
    queryKey: ['owner-dashboard'],
    queryFn: () => api('/owner/dashboard'),
  });
  const { data: ledger } = useQuery<Ledger>({
    queryKey: ['owner-payments', '', ''],
    queryFn: () => api('/owner/payments'),
  });
  const { data: properties } = useQuery<OwnerProperty[]>({
    queryKey: ['owner-properties'],
    queryFn: () => api('/owner/properties'),
  });

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-5">
        <div className="h-56 animate-pulse rounded-[24px] bg-forest/10" />
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="h-64 animate-pulse rounded-card bg-card" />
          <div className="h-64 animate-pulse rounded-card bg-card" />
        </div>
      </div>
    );
  }

  // Last 7 months of income for the hero bars, current month in lime.
  const now = new Date();
  const totals = new Map((ledger?.monthlyTotals ?? []).map((m) => [m.month, m.totalUsd]));
  const months = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (6 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { key, label: new Intl.DateTimeFormat(locale, { month: 'short' }).format(d), v: totals.get(key) ?? 0 };
  });
  const maxV = Math.max(...months.map((m) => m.v), 1);

  const thisMonthKey = months[months.length - 1].key;
  const paidThisMonth = (ledger?.items ?? []).filter((p) =>
    p.paidOn.startsWith(thisMonthKey),
  ).length;
  const recent = (ledger?.items ?? []).slice(0, 3);
  const shortlist = (properties ?? []).slice(0, 4);
  const today = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);

  return (
    <main className="flex flex-col gap-[18px] md:gap-6">
      <div className="hidden animate-rise-in md:block">
        <h1 className="font-display text-[28px] font-extrabold">
          {me?.name ? t('greeting', { name: me.name.split(' ')[0] }) : t('greetingAnon')}
        </h1>
        <p className="mt-[5px] text-sm text-slate_brand">
          {today} · {t('dashboard.subtitle', { count: data.properties })}
        </p>
      </div>

      {/* Income hero: the number that matters, then the year at a glance. */}
      <section
        className="animate-rise-in flex flex-col gap-5 rounded-[24px] bg-forest p-6 md:p-8"
        style={{ animationDelay: '40ms' }}
      >
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-[13.5px] font-semibold text-mist/65">
              {t('metrics.incomeThisMonth')}
            </p>
            <p className="mt-1.5 font-display text-4xl font-extrabold text-mist md:text-[44px]">
              ${data.incomeThisMonth.toLocaleString('en-US')}
            </p>
            <p className="mt-1 text-[13px] text-lime">
              {t('dashboard.paymentsReceived', { count: paidThisMonth })}
            </p>
          </div>
          <div className="flex gap-3.5 md:gap-5">
            <div className="text-right">
              <p className="text-[12.5px] text-mist/60">{t('metrics.collectedThisYear')}</p>
              <p className="mt-1 font-display text-[22px] font-extrabold text-mist">
                ${data.collectedThisYear.toLocaleString('en-US')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[12.5px] text-mist/60">{t('metrics.occupied')}</p>
              <p className="mt-1 font-display text-[22px] font-extrabold text-mist">
                {data.occupied}/{data.properties}
              </p>
            </div>
          </div>
        </div>
        <div className="flex h-[90px] items-end gap-1.5 md:gap-3">
          {months.map((m, i) => (
            <div
              key={m.key}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
            >
              <div
                className={`w-full max-w-[44px] rounded-t-lg rounded-b-[3px] ${
                  i === months.length - 1 ? 'bg-lime' : 'bg-mist/20'
                }`}
                style={{ height: `${Math.max(Math.round((m.v / maxV) * 100), 3)}%` }}
              />
              <span className="text-[11px] text-mist/55">{m.label}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid items-start gap-3.5 md:gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Recent payments */}
        <section
          className="animate-rise-in flex flex-col gap-3.5 rounded-card bg-card p-5 shadow-[0_1px_3px_rgba(23,58,49,0.06)] md:p-6"
          style={{ animationDelay: '80ms' }}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[17px] font-bold">{t('dashboard.recentPayments')}</h2>
            <Link
              href="/owner/income"
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-slate_brand hover:text-forest"
            >
              {t('dashboard.viewAll')}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
          {recent.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">{t('income.emptyBody')}</p>
          )}
          <div className="flex flex-col">
            {recent.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3.5 border-b border-forest/[0.06] px-0.5 py-3 last:border-0"
              >
                <div className="grid h-[38px] w-[38px] flex-none place-items-center rounded-xl bg-lime/30">
                  <ArrowDown className="h-4 w-4 text-forest" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{placeName(p.listing)}</p>
                  <p className="mt-0.5 text-[12.5px] text-slate_brand">
                    {new Date(p.paidOn).toLocaleDateString()} · {tp(p.type)}
                  </p>
                </div>
                <p className="flex-none font-display text-[17px] font-extrabold">
                  ${p.amountUsd.toLocaleString('en-US')}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Property shortlist */}
        <section
          className="animate-rise-in flex flex-col gap-3.5 rounded-card bg-card p-5 shadow-[0_1px_3px_rgba(23,58,49,0.06)] md:p-6"
          style={{ animationDelay: '120ms' }}
        >
          <h2 className="font-display text-[17px] font-bold">{t('properties.title')}</h2>
          {shortlist.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">{t('properties.emptyBody')}</p>
          )}
          {shortlist.map((pr) => (
            <Link
              key={pr.id}
              href={`/owner/properties/${pr.id}`}
              className="flex items-center gap-3 rounded-[14px] bg-mist p-3 transition-colors hover:bg-forest/[0.08]"
            >
              <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-forest/10">
                <Home className="h-[17px] w-[17px] text-forest/50" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold">{placeName(pr)}</p>
                <p className="mt-0.5 text-xs text-slate_brand">
                  ${Math.round(pr.rentUsd)}
                  {t('properties.perMonth')}
                </p>
              </div>
              <SolidStatusChip status={pr.status} publishedAt={pr.publishedAt} />
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
