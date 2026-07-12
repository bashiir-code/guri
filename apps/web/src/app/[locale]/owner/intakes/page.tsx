'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { MOGADISHU_DISTRICTS } from '@guri/shared';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type IntakeStatus = 'submitted' | 'accepted' | 'converted' | 'declined' | 'expired';
interface OwnerIntake {
  id: string;
  status: IntakeStatus;
  district: string;
  neighborhood: string | null;
  type: string;
  bedrooms: number;
  declineReason: string | null;
  listingId: string | null;
  photos: string[];
  agency: { name: string; phone: string | null; waUrl: string | null } | null;
  createdAt: string;
}
interface DirectoryAgency { id: string; name: string; districts: string[]; liveListings: number }

const STATUS_STYLE: Record<IntakeStatus, string> = {
  submitted: 'bg-muted text-slate_brand',
  accepted: 'bg-lime text-forest',
  converted: 'bg-forest text-mist',
  declined: 'bg-amber_reserved/20 text-forest',
  expired: 'bg-amber_reserved/20 text-forest',
};

// §15 owner intake status tracker. Reassignment is offered only after a
// decline or an expiry — before conversion the owner is free to try another
// agency; after conversion the tie is permanent (handled by the API).
export default function OwnerIntakesPage() {
  const t = useTranslations('intake.tracker');
  const qc = useQueryClient();
  const { data: intakes, isLoading } = useQuery<OwnerIntake[]>({
    queryKey: ['my-intakes'],
    queryFn: () => api('/my/intakes'),
  });

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-forest lg:text-3xl">{t('title')}</h1>
        <Button asChild variant="outline">
          <Link href="/list-house">{t('listHouse')}</Link>
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">…</p>}
      {!isLoading && !intakes?.length && (
        <div className="rounded-card border bg-card p-10 text-center text-muted-foreground">{t('empty')}</div>
      )}

      <ul className="space-y-4">
        {intakes?.map((intake) => (
          <IntakeCard key={intake.id} intake={intake} onChanged={() => qc.invalidateQueries({ queryKey: ['my-intakes'] })} />
        ))}
      </ul>
    </main>
  );
}

function IntakeCard({ intake, onChanged }: { intake: OwnerIntake; onChanged: () => void }) {
  const t = useTranslations('intake.tracker');
  const [reassigning, setReassigning] = useState(false);
  const [newAgency, setNewAgency] = useState('');

  const { data: agencies } = useQuery<DirectoryAgency[]>({
    queryKey: ['agencies', intake.district],
    queryFn: () => api(`/agencies?district=${encodeURIComponent(intake.district)}`),
    enabled: reassigning,
  });

  const reassign = useMutation({
    mutationFn: () => api(`/intakes/${intake.id}/reassign`, { body: { agencyId: newAgency } }),
    onSuccess: () => { setReassigning(false); onChanged(); },
  });

  const canReassign = intake.status === 'declined' || intake.status === 'expired';

  return (
    <li className="animate-rise-in overflow-hidden rounded-card border bg-card">
      <div className="flex gap-4 p-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
          {intake.photos[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={intake.photos[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-display font-bold text-forest">
              {intake.district}
              {intake.neighborhood ? ` · ${intake.neighborhood}` : ''}
            </p>
            <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', STATUS_STYLE[intake.status])}>
              {t(intake.status)}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('submittedOn', { date: new Date(intake.createdAt).toLocaleDateString() })}
          </p>

          {/* accepted → the owner arranges the meetup with the agency */}
          {intake.status === 'accepted' && intake.agency?.phone && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="sm">
                <a href={`tel:${intake.agency.phone}`}>{t('contact', { name: intake.agency.name })}</a>
              </Button>
              {intake.agency.waUrl && (
                <Button asChild size="sm" variant="outline">
                  <a href={`https://${intake.agency.waUrl.replace(/^https?:\/\//, '')}`} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                </Button>
              )}
            </div>
          )}

          {/* converted → the house is (or is becoming) a real listing */}
          {intake.status === 'converted' && intake.listingId && (
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link href={`/listings/${intake.listingId}`}>{t('viewListing')}</Link>
            </Button>
          )}

          {/* declined / expired → reason + reassign to another agency */}
          {canReassign && (
            <div className="mt-3 space-y-2">
              {intake.declineReason && (
                <p className="text-sm text-slate_brand">{t('reason', { reason: intake.declineReason })}</p>
              )}
              {!reassigning ? (
                <Button size="sm" onClick={() => setReassigning(true)}>{t('reassign')}</Button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-[12rem]">
                    <Select value={newAgency} onChange={(e) => setNewAgency(e.target.value)}>
                      <option value="">{t('chooseAgency')}</option>
                      {agencies?.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </Select>
                  </div>
                  <Button size="sm" disabled={!newAgency || reassign.isPending} onClick={() => reassign.mutate()}>
                    {t('reassign')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
