'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

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

// §5 owner screen 5 — the income ledger. Strictly read-only.
export default function OwnerIncomePage() {
  const t = useTranslations('owner');
  const tp = useTranslations('paymentTypes');
  const [listingId, setListingId] = useState('');
  const [month, setMonth] = useState('');

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

  return (
    <main className="space-y-5">
      <h1 className="font-display text-2xl font-bold text-forest lg:text-3xl">
        {t('income.title')}
      </h1>

      {data && data.monthlyTotals.length > 0 && (
        <div className="hs flex gap-3 overflow-x-auto pb-1">
          {data.monthlyTotals.map((m) => (
            <div
              key={m.month}
              className="animate-rise-in shrink-0 rounded-card border bg-card px-5 py-3"
            >
              <p className="font-display text-2xl font-extrabold text-forest">${m.totalUsd}</p>
              <p className="text-xs text-muted-foreground">{m.month}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid max-w-xl grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="filter-property">{t('income.property')}</Label>
          <Select
            id="filter-property"
            value={listingId}
            onChange={(e) => setListingId(e.target.value)}
          >
            <option value="">{t('income.allProperties')}</option>
            {properties?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.district}
                {p.neighborhood ? ` · ${p.neighborhood}` : ''}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="filter-month">{t('income.month')}</Label>
          <Input
            id="filter-month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground">…</p>}
      {!isLoading && !data?.items.length && (
        <div className="animate-rise-in rounded-card border bg-card p-10 text-center">
          <p className="font-display text-lg font-bold text-forest">{t('income.emptyTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('income.emptyBody')}</p>
        </div>
      )}

      {Boolean(data?.items.length) && (
        <div className="animate-rise-in overflow-x-auto rounded-card border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">{t('income.date')}</th>
                <th className="px-4 py-3">{t('income.propertyCol')}</th>
                <th className="px-4 py-3">{t('income.type')}</th>
                <th className="px-4 py-3 text-right">{t('income.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {data!.items.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(p.paidOn).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-forest">
                    {p.listing.district}
                    {p.listing.neighborhood ? ` · ${p.listing.neighborhood}` : ''}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{tp(p.type)}</td>
                  <td className="px-4 py-3 text-right font-display font-bold text-forest">
                    ${p.amountUsd}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
