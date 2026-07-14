'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { BadgeCheck, Ban, Plus, RotateCcw } from 'lucide-react';
import { createAgencySchema, MOGADISHU_DISTRICTS, type CreateAgencyInput } from '@guri/shared';
import { api } from '@/lib/api';
import { formatMonthYear } from '@/lib/so-date';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BottomSheet } from '@/components/bottom-sheet';
import { cn } from '@/lib/utils';

interface AgencyRow {
  id: string;
  name: string;
  phone: string;
  districts: string[];
  status: 'pending' | 'active' | 'suspended';
  createdAt: string;
  _count: { members: number; listings: number };
  activeTenancies: number;
  rentThisMonthUsd: number;
}

type StatusFilter = 'all' | 'active' | 'pending' | 'suspended';

// Status chips per the Platform Admin design: lime = verified (active),
// amber = pending, slate = suspended.
const chipClass: Record<AgencyRow['status'], string> = {
  active: 'bg-lime/40 text-forest',
  pending: 'bg-amber_reserved/25 text-[#8A5A10]',
  suspended: 'bg-slate_brand/[0.18] text-slate_brand',
};

// §5 Agencies console: search, filter, verify pending agencies, suspend or
// reactivate (§17 — reversible), and onboard a new agency + its first admin.
// All through the existing endpoints; the admin never edits listings/deals.
export default function AdminAgenciesPage() {
  const t = useTranslations('admin');
  const locale = useLocale();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const { data: agencies } = useQuery<AgencyRow[]>({
    queryKey: ['agencies'],
    queryFn: () => api('/admin/agencies'),
  });

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: 'active' | 'suspended' }) =>
      api(`/admin/agencies/${v.id}`, { method: 'PATCH', body: { status: v.status } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['agencies'] });
      void qc.invalidateQueries({ queryKey: ['admin-metrics'] });
    },
  });

  const needle = q.trim().toLowerCase();
  const rows = (agencies ?? [])
    .filter((a) => filter === 'all' || a.status === filter)
    .filter(
      (a) =>
        !needle || `${a.name} ${a.districts.join(' ')}`.toLowerCase().includes(needle),
    );

  const joined = (iso: string) => formatMonthYear(new Date(iso), locale);

  const filters: Array<{ key: StatusFilter; label: string }> = [
    { key: 'all', label: t('filterAll') },
    { key: 'active', label: t('status.active') },
    { key: 'pending', label: t('status.pending') },
    { key: 'suspended', label: t('status.suspended') },
  ];

  return (
    <main className="flex flex-col gap-5 md:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="animate-rise-in hidden md:block">
          <h1 className="font-display text-[28px] font-extrabold text-forest">{t('agencies')}</h1>
          <p className="mt-1 text-sm text-slate_brand">{t('agenciesSubtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="w-[200px] md:w-[240px]">
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('searchAgencies')}
              aria-label={t('searchAgencies')}
              className="h-11 rounded-full"
            />
          </div>
          <div className="hs flex gap-2 overflow-x-auto">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'shrink-0 rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors',
                  filter === f.key
                    ? 'border-forest bg-forest text-mist'
                    : 'border-forest/15 bg-card text-forest hover:border-forest/30',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Button size="sm" className="rounded-full" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            {t('createAgency')}
          </Button>
        </div>
      </div>

      {!rows.length && <p className="text-muted-foreground">{t('noAgencies')}</p>}

      {/* Tablet/desktop: the design's table card. Rent + joined join at lg. */}
      {rows.length > 0 && (
        <div className="hidden overflow-hidden rounded-card bg-card shadow-sm md:block">
          <div className="grid grid-cols-[1.8fr_1.2fr_0.5fr_0.7fr_90px] items-center gap-4 border-b border-forest/[0.08] bg-forest/[0.02] px-6 py-3.5 lg:grid-cols-[1.8fr_1.1fr_0.5fr_0.6fr_0.8fr_0.7fr_90px]">
            <HeadCell>{t('colAgency')}</HeadCell>
            <HeadCell>{t('colStatus')}</HeadCell>
            <HeadCell right>{t('colListings')}</HeadCell>
            <HeadCell right>{t('colTenancies')}</HeadCell>
            <HeadCell right className="hidden lg:block">
              {t('colRent')}
            </HeadCell>
            <HeadCell className="hidden lg:block">{t('colJoined')}</HeadCell>
            <span />
          </div>
          {rows.map((a) => (
            <div
              key={a.id}
              className="grid grid-cols-[1.8fr_1.2fr_0.5fr_0.7fr_90px] items-center gap-4 border-b border-forest/5 px-6 py-3.5 transition-colors last:border-0 hover:bg-forest/[0.025] lg:grid-cols-[1.8fr_1.1fr_0.5fr_0.6fr_0.8fr_0.7fr_90px]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-forest">
                  <span className="font-display text-sm font-extrabold text-lime">
                    {a.name.charAt(0)}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-forest">{a.name}</p>
                  <p className="mt-px truncate text-xs text-slate_brand">
                    {a.districts.join(', ')}
                  </p>
                </div>
              </div>
              <div>
                <span
                  className={cn(
                    'whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold',
                    chipClass[a.status],
                  )}
                >
                  {t(`status.${a.status}`)}
                </span>
              </div>
              <p className="text-right text-sm font-semibold text-forest">{a._count.listings}</p>
              <p className="text-right text-sm font-semibold text-forest">{a.activeTenancies}</p>
              <p className="hidden text-right font-display text-[15px] font-extrabold text-forest lg:block">
                ${a.rentThisMonthUsd.toLocaleString('en-US')}
              </p>
              <p className="hidden text-[13px] text-slate_brand lg:block">{joined(a.createdAt)}</p>
              <RowActions agency={a} setStatus={setStatus} />
            </div>
          ))}
        </div>
      )}

      {/* Phone: the design's stacked cards with a 3-stat grid. */}
      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((a) => (
          <div
            key={a.id}
            className="animate-rise-in flex flex-col gap-3 rounded-card bg-card p-[18px] shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl bg-forest">
                <span className="font-display text-base font-extrabold text-lime">
                  {a.name.charAt(0)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold text-forest">{a.name}</p>
                <p className="mt-0.5 truncate text-[12.5px] text-slate_brand">
                  {a.districts.join(', ')} · {joined(a.createdAt)}
                </p>
              </div>
              <span
                className={cn(
                  'flex-none rounded-full px-2.5 py-1 text-[11px] font-semibold',
                  chipClass[a.status],
                )}
              >
                {t(`status.${a.status}`)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-forest/[0.07] pt-3">
              <MobileStat label={t('colListings')} value={String(a._count.listings)} />
              <MobileStat label={t('colTenancies')} value={String(a.activeTenancies)} />
              <MobileStat
                label={t('colRent')}
                value={`$${a.rentThisMonthUsd.toLocaleString('en-US')}`}
              />
            </div>
            {a.status === 'pending' && (
              <Button
                variant="outline"
                className="h-[46px] w-full rounded-full border-[1.5px] border-forest/30 font-bold text-forest"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: a.id, status: 'active' })}
              >
                {t('verifyLong')}
              </Button>
            )}
            {a.status === 'suspended' && (
              <Button
                variant="outline"
                className="h-[46px] w-full rounded-full border-[1.5px] border-forest/30 font-bold text-forest"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: a.id, status: 'active' })}
              >
                {t('reactivate')}
              </Button>
            )}
            {a.status === 'active' && (
              <button
                className="self-start text-xs font-semibold text-slate_brand underline-offset-4 hover:underline"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: a.id, status: 'suspended' })}
              >
                {t('suspend')}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Onboarding a new agency (§5) — same form + endpoint, now in a sheet. */}
      <CreateAgencySheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </main>
  );
}

function HeadCell({
  children,
  right,
  className,
}: {
  children?: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <p className={cn('text-xs font-bold text-slate_brand', right && 'text-right', className)}>
      {children}
    </p>
  );
}

function MobileStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-slate_brand">{label}</p>
      <p className="mt-0.5 font-display text-[17px] font-extrabold text-forest">{value}</p>
    </div>
  );
}

// Desktop action cell: verify for pending, check + suspend for active,
// reactivate for suspended (§17 — suspension is reversible).
function RowActions({
  agency: a,
  setStatus,
}: {
  agency: AgencyRow;
  setStatus: { isPending: boolean; mutate: (v: { id: string; status: 'active' | 'suspended' }) => void };
}) {
  const t = useTranslations('admin');
  if (a.status === 'pending') {
    return (
      <button
        disabled={setStatus.isPending}
        onClick={() => setStatus.mutate({ id: a.id, status: 'active' })}
        className="justify-self-end whitespace-nowrap rounded-full border-[1.5px] border-forest/30 bg-card px-4 py-2 text-[12.5px] font-bold text-forest hover:border-forest/50"
      >
        {t('verify')}
      </button>
    );
  }
  if (a.status === 'suspended') {
    return (
      <button
        disabled={setStatus.isPending}
        title={t('reactivate')}
        aria-label={t('reactivate')}
        onClick={() => setStatus.mutate({ id: a.id, status: 'active' })}
        className="justify-self-end rounded-full p-2 text-slate_brand hover:bg-forest/5 hover:text-forest"
      >
        <RotateCcw className="h-4 w-4" aria-hidden />
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1 justify-self-end">
      <BadgeCheck className="h-[18px] w-[18px] text-forest" aria-label={t('status.active')} />
      <button
        disabled={setStatus.isPending}
        title={t('suspend')}
        aria-label={t('suspend')}
        onClick={() => setStatus.mutate({ id: a.id, status: 'suspended' })}
        className="rounded-full p-1.5 text-slate_brand/60 hover:bg-forest/5 hover:text-destructive"
      >
        <Ban className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

function CreateAgencySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('admin');
  const qc = useQueryClient();
  const form = useForm<CreateAgencyInput>({
    resolver: zodResolver(createAgencySchema),
    defaultValues: { districts: [] },
  });
  const create = useMutation({
    mutationFn: (input: CreateAgencyInput) => api('/admin/agencies', { body: input }),
    onSuccess: () => {
      form.reset({ name: '', phone: '', districts: [], adminEmail: '', adminName: '', adminPhone: '' });
      void qc.invalidateQueries({ queryKey: ['agencies'] });
      void qc.invalidateQueries({ queryKey: ['admin-metrics'] });
    },
  });

  return (
    <BottomSheet open={open} onClose={onClose} title={t('createAgency')}>
      <form className="space-y-4" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
        <div className="space-y-2">
          <Label htmlFor="agency-name">{t('name')}</Label>
          <Input id="agency-name" {...form.register('name')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="agency-phone">{t('phone')}</Label>
          <Input id="agency-phone" type="tel" {...form.register('phone')} />
        </div>
        <div className="space-y-2">
          <Label>{t('districts')}</Label>
          <div className="grid max-h-44 grid-cols-2 gap-1 overflow-y-auto rounded-xl border p-3">
            {MOGADISHU_DISTRICTS.map((d) => (
              <label key={d} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  value={d}
                  className="h-4 w-4 accent-forest"
                  {...form.register('districts')}
                />
                {d}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-email">{t('adminEmail')}</Label>
          <Input id="admin-email" type="email" placeholder="admin@example.com" {...form.register('adminEmail')} />
          <p className="text-xs text-muted-foreground">{t('adminEmailHint')}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-name">{t('adminName')}</Label>
          <Input id="admin-name" {...form.register('adminName')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-phone">{t('adminPhone')}</Label>
          <Input id="admin-phone" type="tel" placeholder="+2526xxxxxxxx" {...form.register('adminPhone')} />
        </div>
        {Object.keys(form.formState.errors).length > 0 && (
          <p className="text-sm text-destructive">{t('invalid')}</p>
        )}
        {create.isError && <p className="text-sm text-destructive">{create.error.message}</p>}
        {create.isSuccess && <p className="text-sm text-forest">{t('created')}</p>}
        <Button type="submit" className="w-full" disabled={create.isPending}>
          {t('createButton')}
        </Button>
      </form>
    </BottomSheet>
  );
}
