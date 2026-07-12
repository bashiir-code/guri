'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface AgencyIntake {
  id: string;
  status: 'submitted' | 'accepted';
  district: string;
  neighborhood: string | null;
  type: string;
  bedrooms: number;
  bathrooms: number;
  expectedRentUsd: number | null;
  notes: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  ageDays: number;
  photos: string[];
  docCount: number;
}

// §15 agency leads inbox. Owners' submissions to THIS agency (rule 3). Convert
// opens the §5 listing editor prefilled from the intake — the same publish
// path; nothing here is public until that listing is published.
export default function LeadsPage() {
  const t = useTranslations('intake.leads');
  const { data: leads, isLoading } = useQuery<AgencyIntake[]>({
    queryKey: ['agency-intakes'],
    queryFn: () => api('/agency/intakes'),
  });

  return (
    <main className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-forest lg:text-3xl">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {isLoading && <p className="text-muted-foreground">…</p>}
      {!isLoading && !leads?.length && (
        <div className="rounded-card border bg-card p-10 text-center text-muted-foreground">{t('empty')}</div>
      )}

      <ul className="grid gap-4 lg:grid-cols-2">
        {leads?.map((lead) => <LeadCard key={lead.id} lead={lead} />)}
      </ul>
    </main>
  );
}

function LeadCard({ lead }: { lead: AgencyIntake }) {
  const t = useTranslations('intake.leads');
  const qc = useQueryClient();
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['agency-intakes'] });

  const accept = useMutation({
    mutationFn: () => api(`/intakes/${lead.id}/accept`, { method: 'POST' }),
    onSuccess: invalidate,
  });
  const decline = useMutation({
    mutationFn: () => api(`/intakes/${lead.id}/decline`, { body: { reason } }),
    onSuccess: () => { setDeclining(false); invalidate(); },
  });
  const convert = useMutation({
    mutationFn: () => api<{ listing: { id: string } }>(`/intakes/${lead.id}/convert`, { method: 'POST' }),
    onSuccess: (res) => {
      invalidate();
      // Straight into the §5 editor, prefilled — agency adds docs, ticks
      // originals, and publishes through the normal path.
      router.push(`/console/listings/${res.listing.id}`);
    },
  });

  return (
    <li className="animate-rise-in overflow-hidden rounded-card border bg-card">
      <div className="flex gap-3 p-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted">
          {lead.photos[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lead.photos[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-display font-bold text-forest">
              {lead.district}
              {lead.neighborhood ? ` · ${lead.neighborhood}` : ''}
            </p>
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                lead.status === 'submitted' ? 'bg-lime text-forest' : 'bg-mist text-forest',
              )}
            >
              {lead.status === 'submitted' ? t('new') : t('accepted')} · {t('ageDays', { days: lead.ageDays })}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-slate_brand">
            {lead.bedrooms}bd · {lead.bathrooms}ba
            {lead.expectedRentUsd ? ` · ${t('expectedRent', { rent: Math.round(lead.expectedRentUsd) })}` : ''}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('owner')}: {lead.ownerName ?? '—'}
            {lead.ownerPhone ? ` · ${lead.ownerPhone}` : ''} · {t('docs', { count: lead.docCount })}
          </p>
          {lead.notes && <p className="mt-1 text-sm text-slate_brand">“{lead.notes}”</p>}
        </div>
      </div>

      <div className="border-t p-3">
        {!declining ? (
          <div className="flex flex-wrap gap-2">
            {lead.status === 'submitted' && (
              <Button size="sm" disabled={accept.isPending} onClick={() => accept.mutate()}>
                {t('accept')}
              </Button>
            )}
            {lead.status === 'accepted' && (
              <Button size="sm" disabled={convert.isPending} onClick={() => convert.mutate()}>
                {t('convert')}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setDeclining(true)}>
              {t('decline')}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Textarea rows={2} placeholder={t('declinePrompt')} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={!reason.trim() || decline.isPending} onClick={() => decline.mutate()}>
                {t('declineConfirm')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDeclining(false)}>
                {t('cancel')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
