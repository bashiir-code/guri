'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { PAYMENT_TYPES } from '@guri/shared';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { BottomSheet } from '@/components/bottom-sheet';

interface Tenancy {
  id: string;
  status: string;
  startDate: string;
  termMonths: number;
  endDate: string;
  daysToEnd: number;
  rentUsd: number;
  depositUsd: number;
  tenant: { name: string | null; phone: string | null };
  listing: { id: string; district: string; neighborhood: string | null };
  payments: Array<{ id: string; type: string; amountUsd: number; paidOn: string; note: string | null }>;
}

// §5 agency screen 6 (phase-5 slice): live leases with term + days-to-end and
// off-platform payment logging. Renew / move-out land in phase 7 (§16).
export default function TenanciesPage() {
  const t = useTranslations('tenancies');
  const tp = useTranslations('paymentTypes');
  const qc = useQueryClient();

  const { data: tenancies, isLoading } = useQuery<Tenancy[]>({
    queryKey: ['tenancies'],
    queryFn: () => api('/agency/tenancies'),
  });

  const [payFor, setPayFor] = useState<Tenancy | null>(null);
  const [payType, setPayType] = useState<string>('monthly_rent');
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payNote, setPayNote] = useState('');

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['tenancies'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['listings'] });
  };

  const logPayment = useMutation({
    mutationFn: () =>
      api(`/leases/${payFor!.id}/payments`, {
        body: {
          type: payType,
          amountUsd: Number(payAmount),
          paidOn: new Date(payDate).toISOString(),
          ...(payNote.trim() ? { note: payNote.trim() } : {}),
        },
      }),
    onSuccess: () => {
      setPayFor(null);
      setPayAmount('');
      setPayNote('');
      invalidate();
    },
  });

  // §16 human end-of-lease actions.
  const [renewFor, setRenewFor] = useState<Tenancy | null>(null);
  const [renewTerm, setRenewTerm] = useState('12');
  const [renewRent, setRenewRent] = useState('');
  const [endFor, setEndFor] = useState<Tenancy | null>(null);

  const renew = useMutation({
    mutationFn: () =>
      api(`/leases/${renewFor!.id}/renew`, {
        body: { termMonths: Number(renewTerm), ...(renewRent ? { newRentUsd: Number(renewRent) } : {}) },
      }),
    onSuccess: () => {
      setRenewFor(null);
      setRenewRent('');
      invalidate();
    },
  });
  const endLease = useMutation({
    mutationFn: () => api(`/leases/${endFor!.id}/end`, { body: { result: 'vacated' } }),
    onSuccess: () => {
      setEndFor(null);
      invalidate();
    },
  });

  return (
    <main className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-forest lg:text-3xl">{t('title')}</h1>

      {isLoading && <p className="text-muted-foreground">…</p>}
      {!isLoading && !tenancies?.length && (
        <p className="py-8 text-muted-foreground">{t('empty')}</p>
      )}

      <ul className="grid gap-4 lg:grid-cols-2">
        {tenancies?.map((l, i) => (
          <li
            key={l.id}
            className="animate-rise-in rounded-card border bg-card p-5"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <p className="font-display text-lg font-bold text-forest">
                {l.tenant.name ?? l.tenant.phone}
              </p>
              <span
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold',
                  l.daysToEnd <= 30 ? 'bg-amber_reserved/25 text-forest' : 'bg-lime/40 text-forest',
                )}
              >
                {/* §16 — a lease past its term stays rented until a human
                    records the outcome; say that instead of "-N days left". */}
                {l.daysToEnd < 0
                  ? t('endedAgo', { days: -l.daysToEnd })
                  : t('daysToEnd', { days: l.daysToEnd })}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {l.listing.district}
              {l.listing.neighborhood ? ` · ${l.listing.neighborhood}` : ''} · $
              {Math.round(l.rentUsd)}
              {t('perMonth')}
            </p>
            <p className="mt-1 text-sm text-slate_brand">
              {t('term', { months: l.termMonths })} ·{' '}
              {new Date(l.startDate).toLocaleDateString()} →{' '}
              {new Date(l.endDate).toLocaleDateString()}
            </p>

            {l.payments.length > 0 && (
              <ul className="mt-3 space-y-1 border-t pt-3">
                {l.payments.slice(0, 4).map((p) => (
                  <li key={p.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {tp(p.type)} · {new Date(p.paidOn).toLocaleDateString()}
                    </span>
                    <span className="font-semibold text-forest">${Math.round(p.amountUsd)}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setPayAmount(String(Math.round(l.rentUsd)));
                  setPayFor(l);
                }}
              >
                {t('logPayment')}
              </Button>
              {/* Renew appears only on ending_soon leases (§16). */}
              {l.status === 'ending_soon' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRenewTerm('12');
                    setRenewRent('');
                    setRenewFor(l);
                  }}
                >
                  {t('renew')}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="border-destructive text-destructive hover:bg-destructive/5"
                onClick={() => setEndFor(l)}
              >
                {t('recordMoveOut')}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <BottomSheet
        open={renewFor !== null}
        onClose={() => setRenewFor(null)}
        title={t('renewTitle', { name: renewFor?.tenant.name ?? '' })}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate_brand">{t('renewBody')}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="renew-term">{t('renewTerm')}</Label>
              <Input id="renew-term" type="number" min={1} max={60} value={renewTerm} onChange={(e) => setRenewTerm(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="renew-rent">{t('renewRent')}</Label>
              <Input
                id="renew-rent"
                type="number"
                min={1}
                placeholder={String(Math.round(renewFor?.rentUsd ?? 0))}
                value={renewRent}
                onChange={(e) => setRenewRent(e.target.value)}
              />
            </div>
          </div>
          {renew.isError && <p className="text-sm text-destructive">{t('failed')}</p>}
          <Button className="w-full" disabled={!renewTerm || renew.isPending} onClick={() => renew.mutate()}>
            {t('confirmRenew')}
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={endFor !== null}
        onClose={() => setEndFor(null)}
        title={t('endTitle', { name: endFor?.tenant.name ?? '' })}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate_brand">{t('endBody')}</p>
          {endLease.isError && <p className="text-sm text-destructive">{t('failed')}</p>}
          <Button
            className="w-full border-destructive bg-transparent text-destructive hover:bg-destructive/5"
            variant="outline"
            disabled={endLease.isPending}
            onClick={() => endLease.mutate()}
          >
            {t('confirmMoveOut')}
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={payFor !== null}
        onClose={() => setPayFor(null)}
        title={t('sheetTitle', { name: payFor?.tenant.name ?? '' })}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pay-type">{t('type')}</Label>
            <Select id="pay-type" value={payType} onChange={(e) => setPayType(e.target.value)}>
              {PAYMENT_TYPES.map((pt) => (
                <option key={pt} value={pt}>
                  {tp(pt)}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pay-amount">{t('amount')}</Label>
              <Input
                id="pay-amount"
                type="number"
                min={1}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-date">{t('paidOn')}</Label>
              <Input
                id="pay-date"
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-note">{t('note')}</Label>
            <Input id="pay-note" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
          </div>
          {logPayment.isError && <p className="text-sm text-destructive">{t('failed')}</p>}
          <Button
            className="w-full"
            disabled={!payAmount || logPayment.isPending}
            onClick={() => logPayment.mutate()}
          >
            {t('confirm')}
          </Button>
        </div>
      </BottomSheet>
    </main>
  );
}
