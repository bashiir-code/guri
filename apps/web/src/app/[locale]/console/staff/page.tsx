'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { addStaffSchema, type AddStaffInput } from '@guri/shared';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface StaffRow {
  userId: string;
  name: string | null;
  phone: string | null;
  roles: string[];
  isAdmin: boolean;
  canVerify: boolean;
  active: boolean;
}

export default function StaffPage() {
  const t = useTranslations('staff');
  const qc = useQueryClient();
  const { data: staff } = useQuery<StaffRow[]>({
    queryKey: ['staff'],
    queryFn: () => api('/agency/staff'),
  });

  const form = useForm<AddStaffInput>({ resolver: zodResolver(addStaffSchema) });
  const add = useMutation({
    mutationFn: (input: AddStaffInput) => api('/agency/staff', { body: input }),
    onSuccess: () => {
      form.reset({ phone: '', name: '' });
      void qc.invalidateQueries({ queryKey: ['staff'] });
    },
  });
  const patch = useMutation({
    mutationFn: (v: { userId: string; active?: boolean; canVerify?: boolean }) =>
      api(`/agency/staff/${v.userId}`, {
        method: 'PATCH',
        body: { active: v.active, canVerify: v.canVerify },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['staff'] }),
  });

  // §17: an agency must keep at least one active admin — the last one's Remove
  // control is disabled with a hint (the API enforces it too).
  const activeAdmins = staff?.filter((s) => s.isAdmin && s.active).length ?? 0;
  const patchError =
    patch.error instanceof ApiError && patch.error.message === 'last_active_admin'
      ? t('lastAdminError')
      : patch.isError
        ? t('patchFailed')
        : null;

  return (
    <main className="grid gap-6 md:grid-cols-[320px_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-lg">{t('addAgent')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={form.handleSubmit((v) => add.mutate(v))}>
            <div className="space-y-2">
              <Label htmlFor="staff-email">{t('email')}</Label>
              <Input id="staff-email" type="email" placeholder="agent@example.com" {...form.register('email')} />
              <p className="text-xs text-muted-foreground">{t('emailHint')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-name">{t('name')}</Label>
              <Input id="staff-name" {...form.register('name')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-phone">{t('phone')}</Label>
              <Input id="staff-phone" type="tel" placeholder="+2526xxxxxxxx" {...form.register('phone')} />
            </div>
            {add.isError && <p className="text-sm text-destructive">{add.error.message}</p>}
            <Button type="submit" className="w-full" disabled={add.isPending}>
              {t('addButton')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <section>
        <h1 className="mb-4 font-display text-2xl font-bold text-forest">{t('title')}</h1>
        <ul className="space-y-2">
          {staff?.map((s) => (
            // Staff row from the reference: avatar initials, name, a role chip
            // (Verifier = forest, Agent = muted), and an active/away dot.
            <li
              key={s.userId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border bg-card px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted font-display text-sm font-bold text-forest">
                  {(s.name ?? '?')
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase())
                    .join('') || '?'}
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-forest">
                    <span className="truncate">{s.name ?? s.phone}</span>
                    {s.isAdmin ? (
                      <span className="rounded-full bg-forest px-2.5 py-0.5 text-xs font-semibold text-mist">
                        {t('adminBadge')}
                      </span>
                    ) : s.canVerify ? (
                      <span className="rounded-full bg-forest px-2.5 py-0.5 text-xs font-semibold text-mist">
                        {t('canVerify')}
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-slate_brand">
                        {t('agentBadge')}
                      </span>
                    )}
                  </p>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span
                      className={s.active ? 'h-2 w-2 rounded-full bg-emerald-500' : 'h-2 w-2 rounded-full bg-muted-foreground/40'}
                      aria-hidden
                    />
                    {s.active ? t('activeDot') : t('inactive')}
                    {s.phone ? ` · ${s.phone}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-forest"
                    checked={s.canVerify}
                    disabled={patch.isPending || s.isAdmin}
                    onChange={(e) => patch.mutate({ userId: s.userId, canVerify: e.target.checked })}
                  />
                  {t('canVerify')}
                </label>
                {/* §17 remove/reactivate. Deactivating the last active admin is
                    blocked — the control is disabled with a hint. */}
                {(() => {
                  const isLastAdmin = s.isAdmin && s.active && activeAdmins <= 1;
                  return (
                    <span title={isLastAdmin ? t('lastAdminHint') : undefined}>
                      <Button
                        variant="outline"
                        size="sm"
                        className={s.active ? 'border-destructive text-destructive hover:bg-destructive/5' : ''}
                        disabled={patch.isPending || isLastAdmin}
                        onClick={() => patch.mutate({ userId: s.userId, active: !s.active })}
                      >
                        {s.active ? t('remove') : t('reactivate')}
                      </Button>
                    </span>
                  );
                })()}
              </div>
            </li>
          ))}
        </ul>
        {patchError && <p className="mt-3 text-sm text-destructive">{patchError}</p>}
      </section>
    </main>
  );
}
