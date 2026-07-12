'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PhotoGallery } from '@/components/photo-gallery';
import { StatusChip } from '@/components/status-chip';

interface OwnerPropertyDetail {
  id: string;
  district: string;
  neighborhood: string | null;
  type: string;
  bedrooms: number;
  bathrooms: number;
  rentUsd: number;
  depositUsd: number;
  status: 'available' | 'reserved' | 'rented';
  publishedAt: string | null;
  agency: { name: string; phone: string };
  photos: string[];
  currentLease: {
    tenantName: string | null;
    startDate: string;
    endDate: string;
    termMonths: number;
    renewalCount: number;
    daysToEnd: number;
  } | null;
  payments: Array<{
    id: string;
    type: string;
    amountUsd: number;
    paidOn: string;
    note: string | null;
  }>;
}

// §5 owner screen 4 — gallery, rent, current lease, payment history. Reads only.
export default function OwnerPropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations('owner');
  const tp = useTranslations('paymentTypes');

  const { data: p, isLoading } = useQuery<OwnerPropertyDetail>({
    queryKey: ['owner-property', id],
    queryFn: () => api(`/owner/properties/${id}`),
  });

  if (isLoading || !p) return <p className="text-muted-foreground">…</p>;

  return (
    <main className="space-y-5 lg:grid lg:grid-cols-[1fr_380px] lg:items-start lg:gap-8 lg:space-y-0">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-forest">
              {p.district}
              {p.neighborhood ? ` · ${p.neighborhood}` : ''}
            </h1>
            <Link
              href="/owner/properties"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              {t('detail.back')}
            </Link>
          </div>
          <StatusChip status={p.status} publishedAt={p.publishedAt} />
        </div>

        <PhotoGallery photos={p.photos} className="overflow-hidden rounded-card" />

        <p className="text-slate_brand">
          {p.bedrooms} {t('properties.bedsShort')} · {p.bathrooms} {t('detail.baths')} ·{' '}
          <span className="font-display font-bold text-forest">${Math.round(p.rentUsd)}</span>
          {t('properties.perMonth')} · {t('detail.deposit')}: ${Math.round(p.depositUsd)}
        </p>

        <Card className="animate-rise-in">
          <CardHeader>
            <CardTitle className="text-lg">{t('detail.payments')}</CardTitle>
          </CardHeader>
          <CardContent>
            {p.payments.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('detail.noPayments')}</p>
            )}
            <ul className="divide-y">
              {p.payments.map((pay) => (
                <li key={pay.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-muted-foreground">
                    {new Date(pay.paidOn).toLocaleDateString()} · {tp(pay.type)}
                    {pay.note ? ` · ${pay.note}` : ''}
                  </span>
                  <span className="font-display font-bold text-forest">${pay.amountUsd}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6">
        <Card className="animate-rise-in" style={{ animationDelay: '80ms' }}>
          <CardHeader>
            <CardTitle className="text-lg">{t('detail.lease')}</CardTitle>
          </CardHeader>
          <CardContent>
            {p.currentLease ? (
              <div className="space-y-1 text-sm">
                <p className="font-display text-lg font-bold text-forest">
                  {p.currentLease.tenantName ?? '—'}
                </p>
                <p className="text-muted-foreground">
                  {new Date(p.currentLease.startDate).toLocaleDateString()} →{' '}
                  {new Date(p.currentLease.endDate).toLocaleDateString()}
                </p>
                <p className="text-muted-foreground">
                  {t('detail.term', { months: p.currentLease.termMonths })} ·{' '}
                  {t('properties.daysToEnd', { days: p.currentLease.daysToEnd })}
                </p>
                <p className="text-muted-foreground">
                  {t('detail.renewals', { count: p.currentLease.renewalCount })}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('detail.noLease')}</p>
            )}
          </CardContent>
        </Card>

        <Card className="animate-rise-in" style={{ animationDelay: '140ms' }}>
          <CardContent className="p-5 text-sm">
            <p className="text-muted-foreground">{t('detail.managedBy')}</p>
            <p className="font-semibold text-forest">{p.agency.name}</p>
            <p className="text-muted-foreground">{p.agency.phone}</p>
          </CardContent>
        </Card>
      </aside>
    </main>
  );
}
