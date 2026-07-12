'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createOwnerSchema, type CreateOwnerInput } from '@guri/shared';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface OwnerRow {
  id: string;
  name: string | null;
  phone: string;
  inviteStatus: 'invited' | 'claimed';
  listings: number;
  active: boolean;
  liveLeases: number;
}

export default function OwnersPage() {
  const t = useTranslations('owners');
  const qc = useQueryClient();
  const { data: owners } = useQuery<OwnerRow[]>({
    queryKey: ['owners'],
    queryFn: () => api('/owners'),
  });

  const form = useForm<CreateOwnerInput>({ resolver: zodResolver(createOwnerSchema) });
  const create = useMutation({
    mutationFn: (input: CreateOwnerInput) => api('/owners', { body: input }),
    onSuccess: () => {
      form.reset({ name: '', phone: '' });
      void qc.invalidateQueries({ queryKey: ['owners'] });
    },
  });
  // §17: deactivate/reactivate an owner — a users.active flip, never a delete.
  // Blocked while the owner has a live lease (the API enforces it; we also
  // disable the control so it never even offers the impossible action).
  const setActive = useMutation({
    mutationFn: (v: { id: string; active: boolean }) =>
      api(`/owners/${v.id}`, { method: 'PATCH', body: { active: v.active } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['owners'] }),
  });
  const setActiveError =
    setActive.error instanceof ApiError && setActive.error.message === 'owner_has_live_lease'
      ? t('liveLeaseError')
      : setActive.isError
        ? t('patchFailed')
        : null;

  return (
    <main className="grid gap-6 md:grid-cols-[320px_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-lg">{t('create')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
            <div className="space-y-2">
              <Label htmlFor="owner-name">{t('name')}</Label>
              <Input id="owner-name" {...form.register('name')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner-phone">{t('phone')}</Label>
              <Input id="owner-phone" type="tel" placeholder="+2526xxxxxxxx" {...form.register('phone')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner-email">{t('email')}</Label>
              <Input id="owner-email" type="email" placeholder="owner@example.com" {...form.register('email')} />
              <p className="text-xs text-muted-foreground">{t('emailHint')}</p>
            </div>
            {(form.formState.errors.name || form.formState.errors.phone) && (
              <p className="text-sm text-destructive">{t('invalid')}</p>
            )}
            {create.isError && <p className="text-sm text-destructive">{create.error.message}</p>}
            <Button type="submit" className="w-full" disabled={create.isPending}>
              {t('createButton')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <section>
        <h1 className="mb-4 font-display text-2xl font-bold text-forest">{t('title')}</h1>
        {!owners?.length && <p className="text-muted-foreground">{t('empty')}</p>}
        <ul className="space-y-2">
          {owners?.map((o) => (
            <li
              key={o.id}
              className={cn(
                'flex flex-wrap items-center justify-between gap-3 rounded-card border bg-card px-4 py-3',
                !o.active && 'opacity-60',
              )}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium text-forest">
                  <span className="truncate">{o.name ?? o.phone}</span>
                  {!o.active && (
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-slate_brand">
                      {t('deactivated')}
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {o.phone} · {t('listingsCount', { count: o.listings })}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={
                    o.inviteStatus === 'claimed'
                      ? 'rounded-full bg-lime/40 px-3 py-1 text-xs font-semibold text-forest'
                      : 'rounded-full bg-amber_reserved/25 px-3 py-1 text-xs font-semibold text-forest'
                  }
                >
                  {t(o.inviteStatus)}
                </span>
                {/* §17: retain leases + income; only a users.active flip.
                    Disabled while a live lease exists (with a hint). */}
                <span title={o.active && o.liveLeases > 0 ? t('liveLeaseHint') : undefined}>
                  <Button
                    variant="outline"
                    size="sm"
                    className={o.active ? 'border-destructive text-destructive hover:bg-destructive/5' : ''}
                    disabled={setActive.isPending || (o.active && o.liveLeases > 0)}
                    onClick={() => setActive.mutate({ id: o.id, active: !o.active })}
                  >
                    {o.active ? t('deactivate') : t('reactivate')}
                  </Button>
                </span>
              </div>
            </li>
          ))}
        </ul>
        {setActiveError && <p className="mt-3 text-sm text-destructive">{setActiveError}</p>}
      </section>
    </main>
  );
}
