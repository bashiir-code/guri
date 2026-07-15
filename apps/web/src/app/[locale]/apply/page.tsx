'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { BadgeCheck, CheckCircle2 } from 'lucide-react';
import { agencyApplicationSchema, MOGADISHU_DISTRICTS, type AgencyApplicationInput } from '@guri/shared';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { PublicHeader } from '@/components/public-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// §2/§15 — public "become a verified agency" application. Submitting queues a
// lead in the platform-admin waiting list; it grants no access (rule 15). The
// team reviews it and, on approval, provisions the real agency + first admin.
export default function ApplyPage() {
  const t = useTranslations('intake.apply');
  const form = useForm<AgencyApplicationInput>({
    resolver: zodResolver(agencyApplicationSchema),
    defaultValues: { districts: [] },
  });

  const submit = useMutation({
    mutationFn: (input: AgencyApplicationInput) =>
      api<{ id: string }>('/agency-applications', { body: input }),
  });

  if (submit.isSuccess) {
    return (
      <>
        <PublicHeader />
        <main className="mx-auto w-full max-w-lg px-4 py-16">
          <div className="flex flex-col items-center gap-4 rounded-card border bg-card p-8 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-lime/30 text-forest">
              <CheckCircle2 className="h-7 w-7" aria-hidden />
            </span>
            <h1 className="font-display text-2xl font-bold text-forest">{t('successTitle')}</h1>
            <p className="text-sm text-slate_brand">{t('successBody')}</p>
            <Button asChild variant="outline" className="mt-2 rounded-full">
              <Link href="/agencies">{t('backToDirectory')}</Link>
            </Button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-lg space-y-6 px-4 py-6">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mist px-3 py-1 text-xs font-semibold text-forest">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
            {t('badge')}
          </span>
          <h1 className="mt-3 font-display text-3xl font-bold text-forest">{t('title')}</h1>
          <p className="mt-1.5 text-muted-foreground">{t('subtitle')}</p>
        </div>

        <form
          className="space-y-5 rounded-card border bg-card p-5 sm:p-6"
          onSubmit={form.handleSubmit((v) => submit.mutate(v))}
        >
          <div className="space-y-2">
            <Label htmlFor="agencyName">{t('agencyName')}</Label>
            <Input id="agencyName" {...form.register('agencyName')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">{t('phone')}</Label>
            <Input id="phone" type="tel" placeholder="+2526xxxxxxxx" {...form.register('phone')} />
            <p className="text-xs text-muted-foreground">{t('phoneHint')}</p>
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
            <Label htmlFor="contactName">{t('contactName')}</Label>
            <Input id="contactName" {...form.register('contactName')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactEmail">{t('contactEmail')}</Label>
            <Input
              id="contactEmail"
              type="email"
              placeholder="you@example.com"
              {...form.register('contactEmail')}
            />
            <p className="text-xs text-muted-foreground">{t('contactEmailHint')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">{t('note')}</Label>
            <Textarea id="note" rows={3} placeholder={t('notePlaceholder')} {...form.register('note')} />
          </div>

          {Object.keys(form.formState.errors).length > 0 && (
            <p className="text-sm text-destructive">{t('invalid')}</p>
          )}
          {submit.isError && <p className="text-sm text-destructive">{t('failed')}</p>}

          <Button type="submit" className="w-full" disabled={submit.isPending}>
            {submit.isPending ? t('submitting') : t('submit')}
          </Button>
        </form>
      </main>
    </>
  );
}
