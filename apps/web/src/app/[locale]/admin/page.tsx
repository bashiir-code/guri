'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createAgencySchema, MOGADISHU_DISTRICTS, type CreateAgencyInput } from '@guri/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface AgencyRow {
  id: string;
  name: string;
  phone: string;
  districts: string[];
  status: 'pending' | 'active' | 'suspended';
  _count: { members: number; listings: number };
}

// Status chips from the reference table: neutral pill + colored dot.
const statusChip: Record<string, string> = {
  active: 'bg-muted text-forest',
  pending: 'bg-amber_reserved/25 text-forest',
  suspended: 'bg-destructive/10 text-destructive',
};
const statusDot: Record<string, string> = {
  active: 'bg-emerald-500',
  pending: 'bg-amber_reserved',
  suspended: 'bg-destructive',
};

// §5 Agencies: create + approve/suspend. Admin never edits listings or deals.
export default function AdminAgenciesPage() {
  const t = useTranslations('admin');
  const qc = useQueryClient();

  const { data: agencies } = useQuery<AgencyRow[]>({
    queryKey: ['agencies'],
    queryFn: () => api('/admin/agencies'),
  });

  const form = useForm<CreateAgencyInput>({
    resolver: zodResolver(createAgencySchema),
    defaultValues: { districts: [] },
  });
  const create = useMutation({
    mutationFn: (input: CreateAgencyInput) => api('/admin/agencies', { body: input }),
    onSuccess: () => {
      form.reset({ name: '', phone: '', districts: [], adminEmail: '', adminName: '', adminPhone: '' });
      void qc.invalidateQueries({ queryKey: ['agencies'] });
    },
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: 'active' | 'suspended' }) =>
      api(`/admin/agencies/${v.id}`, { method: 'PATCH', body: { status: v.status } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['agencies'] }),
  });

  return (
    <main className="grid w-full gap-6 md:grid-cols-[380px_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-lg">{t('createAgency')}</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <section>
        <h1 className="mb-4 font-display text-2xl font-bold text-forest">{t('agencies')}</h1>
        {!agencies?.length && <p className="text-muted-foreground">{t('noAgencies')}</p>}
        <ul className="space-y-2">
          {agencies?.map((a) => (
            <li key={a.id} className="rounded-card border bg-card px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-display font-bold text-forest">{a.name}</p>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
                    statusChip[a.status],
                  )}
                >
                  <span className={cn('h-2 w-2 rounded-full', statusDot[a.status])} aria-hidden />
                  {t(`status.${a.status}`)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {a.phone} · {a.districts.join(', ')}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {t('members', { count: a._count.members })} ·{' '}
                  {t('listings', { count: a._count.listings })}
                </p>
                <div className="flex gap-2">
                  {a.status !== 'active' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: a.id, status: 'active' })}
                    >
                      {/* §17: pending → Approve; suspended → Reactivate. Both
                          set status:active; suspension is reversible by design. */}
                      {a.status === 'suspended' ? t('reactivate') : t('approve')}
                    </Button>
                  )}
                  {a.status !== 'suspended' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-destructive text-destructive hover:bg-destructive/5"
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: a.id, status: 'suspended' })}
                    >
                      {t('suspend')}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
