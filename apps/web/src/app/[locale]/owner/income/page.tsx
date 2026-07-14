'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

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
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// §5 owner screen 5 per the Guri Owner design — the income ledger. Strictly
// read-only: every row is a payment the agency recorded off-platform.
export default function OwnerIncomePage() {
  const t = useTranslations('owner');
  const tp = useTranslations('paymentTypes');
  const [listingId, setListingId] = useState('');
  const [month, setMonth] = useState('');
  const thisMonth = monthKey(new Date());

  const { data: properties } = useQuery<OwnerProperty[]>({
    queryKey: ['owner-properties'],
    queryFn: () => api('/owner/properties'),
  });
  const { data, isLoading } = useQuery<Ledger>({
    queryKey: ['owner-payments', listingId, month],
    queryFn: () => {
      const params = new URLSearchParams();
      if (listingId) params.set('listingId', listingId);
      if (month) params.set('month', month);
      const qs = params.toString();
      return api(`/owner/payments${qs ? `?${qs}` : ''}`);
    },
  });

  const total = data?.items.reduce((sum, p) => sum + p.amountUsd, 0) ?? 0;
  const pillCls = (active: boolean) =>
    cn(
      'flex-none rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors',
      active
        ? 'border-forest bg-forest text-mist'
        : 'border-forest/15 bg-card text-forest hover:border-forest/40',
    );

  return (
    <main className="flex flex-col gap-[18px] md:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="hidden animate-rise-in md:block">
          <h1 className="font-display text-[28px] font-extrabold">{t('income.title')}</h1>
          <p className="mt-[5px] text-sm text-slate_brand">{t('income.subtitle')}</p>
        </div>
        <div className="hs flex max-w-full items-center gap-2 overflow-x-auto">
          <button onClick={() => setMonth('')} className={pillCls(month === '')}>
            {t('income.filterAll')}
          </button>
          <button onClick={() => setMonth(thisMonth)} className={pillCls(month === thisMonth)}>
            {t('income.filterThisMonth')}
          </button>
          <select
            aria-label={t('income.property')}
            value={listingId}
            onChange={(e) => setListingId(e.target.value)}
            className="h-[38px] max-w-[180px] flex-none appearance-none rounded-full border border-forest/15 bg-card px-4 text-[13px] font-semibold text-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">{t('income.allProperties')}</option>
            {properties?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.district}
                {p.neighborhood ? ` · ${p.neighborhood}` : ''}
              </option>
            ))}
          </select>
          <input
            aria-label={t('income.month')}
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-[38px] flex-none rounded-full border border-forest/15 bg-card px-4 text-[13px] font-semibold text-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      {isLoading && (
        <div className="h-64 animate-pulse rounded-card bg-card" />
      )}
      {!isLoading && !data?.items.length && (
        <div className="animate-rise-in rounded-card bg-card p-10 text-center shadow-[0_1px_3px_rgba(23,58,49,0.06)]">
          <p className="font-display text-lg font-bold text-forest">{t('income.emptyTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('income.emptyBody')}</p>
        </div>
      )}

      {Boolean(data?.items.length) && (
        <>
          {/* md and up: the design's ledger table in one white card */}
          <div className="animate-rise-in hidden overflow-hidden rounded-card bg-card shadow-[0_1px_3px_rgba(23,58,49,0.06)] md:block">
            <div className="grid grid-cols-[1.1fr_1.7fr_1.1fr_0.8fr] gap-4 border-b border-forest/[0.08] bg-forest/[0.02] px-6 py-3.5">
              <p className="text-xs font-bold text-slate_brand">{t('income.date')}</p>
              <p className="text-xs font-bold text-slate_brand">{t('income.propertyCol')}</p>
              <p className="text-xs font-bold text-slate_brand">{t('income.type')}</p>
              <p className="text-right text-xs font-bold text-slate_brand">{t('income.amount')}</p>
            </div>
            {data!.items.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-[1.1fr_1.7fr_1.1fr_0.8fr] items-center gap-4 border-b border-forest/[0.05] px-6 py-3.5 last:border-0"
              >
                <p className="text-[13px] text-slate_brand">
                  {new Date(p.paidOn).toLocaleDateString()}
                </p>
                <p className="truncate text-sm font-semibold">
                  {p.listing.district}
                  {p.listing.neighborhood ? ` · ${p.listing.neighborhood}` : ''}
                </p>
                <div>
                  <span className="whitespace-nowrap rounded-full bg-lime/40 px-[11px] py-[5px] text-[11.5px] font-semibold text-forest">
                    {tp(p.type)}
                  </span>
                </div>
                <p className="text-right font-display text-base font-extrabold">
                  ${p.amountUsd.toLocaleString('en-US')}
                </p>
              </div>
            ))}
            <div className="flex items-center justify-between bg-forest/[0.02] px-6 py-4">
              <p className="text-[13px] font-semibold text-slate_brand">
                {t('income.totalReceived')}
              </p>
              <p className="font-display text-[19px] font-extrabold">
                ${total.toLocaleString('en-US')}
              </p>
            </div>
          </div>

          {/* Phone: forest total banner + payment cards */}
          <div className="flex flex-col gap-3 md:hidden">
            <div className="animate-rise-in flex items-center justify-between rounded-card bg-forest px-5 py-[18px]">
              <p className="text-[13px] font-semibold text-mist/70">{t('income.totalReceived')}</p>
              <p className="font-display text-xl font-extrabold text-lime">
                ${total.toLocaleString('en-US')}
              </p>
            </div>
            {data!.items.map((p, i) => (
              <div
                key={p.id}
                className="animate-rise-in flex items-center gap-3.5 rounded-card bg-card px-[18px] py-4 shadow-[0_1px_3px_rgba(23,58,49,0.06)]"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-bold">
                    {p.listing.district}
                    {p.listing.neighborhood ? ` · ${p.listing.neighborhood}` : ''}
                  </p>
                  <p className="mt-[3px] text-[12.5px] text-slate_brand">
                    {new Date(p.paidOn).toLocaleDateString()} · {tp(p.type)}
                  </p>
                  <span className="mt-[7px] inline-block rounded-full bg-lime/40 px-2.5 py-1 text-[11px] font-semibold text-forest">
                    {t('income.received')}
                  </span>
                </div>
                <p className="flex-none font-display text-lg font-extrabold">
                  ${p.amountUsd.toLocaleString('en-US')}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
