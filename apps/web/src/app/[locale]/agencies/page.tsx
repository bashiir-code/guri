'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Building2, Mail, MessageCircle } from 'lucide-react';
import { MOGADISHU_DISTRICTS } from '@guri/shared';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { SUPPORT_EMAIL, whatsappHref } from '@/lib/contact';
import { PublicHeader } from '@/components/public-header';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

interface DirectoryAgency {
  id: string;
  name: string;
  phone: string;
  districts: string[];
  liveListings: number;
}

// §15 public agency directory — the front door for owners bringing a house.
// No login needed to look; nothing about intakes is exposed here.
export default function AgencyDirectoryPage() {
  const t = useTranslations('intake.directory');
  const [district, setDistrict] = useState('');

  const { data: agencies, isLoading } = useQuery<DirectoryAgency[]>({
    queryKey: ['agencies', district],
    queryFn: () => api(`/agencies${district ? `?district=${encodeURIComponent(district)}` : ''}`),
  });

  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-forest">{t('title')}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">{t('subtitle')}</p>
        </div>

        <div className="max-w-xs">
          <Select value={district} onChange={(e) => setDistrict(e.target.value)}>
            <option value="">{t('filterAll')}</option>
            {MOGADISHU_DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </div>

        {isLoading && <p className="text-muted-foreground">…</p>}
        {!isLoading && !agencies?.length && (
          <div className="rounded-card border bg-card p-10 text-center text-muted-foreground">
            {t('empty')}
          </div>
        )}

        <ul className="grid gap-4 sm:grid-cols-2">
          {agencies?.map((a, i) => (
            <li
              key={a.id}
              className="animate-rise-in flex flex-col rounded-card border bg-card p-5"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-xl font-bold text-forest">{a.name}</h2>
                <span className="whitespace-nowrap rounded-full bg-mist px-3 py-1 text-xs font-semibold text-forest">
                  {t('live', { count: a.liveListings })}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                <span className="font-medium text-slate_brand">{t('serves')}:</span> {a.districts.join(', ')}
              </p>
              <div className="mt-4 flex-1" />
              <Button asChild className="mt-3 w-full">
                <Link href={`/list-house?agency=${a.id}`}>{t('choose')}</Link>
              </Button>
            </li>
          ))}
        </ul>

        {/* §2/§15 — agencies are onboarded by the platform team, never
            self-provisioned (there is no "sign up as an agency"). The primary
            action submits an application to the admin waiting list; WhatsApp and
            email stay as direct channels. Approval (createAgency) stays a manual
            platform-admin step. */}
        <section className="rounded-card bg-forest p-6 text-mist sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-lg">
              <h2 className="font-display text-xl font-bold text-mist sm:text-2xl">
                {t('join.title')}
              </h2>
              <p className="mt-1.5 text-sm text-mist/75">{t('join.body')}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-none sm:items-stretch">
              <Link
                href="/apply"
                className="flex items-center justify-center gap-2 rounded-full bg-lime px-6 py-3 text-sm font-bold text-forest transition-transform hover:brightness-95 active:scale-[0.98] motion-reduce:transition-none"
              >
                <Building2 className="h-4 w-4" aria-hidden />
                {t('join.apply')}
              </Link>
              <div className="flex items-center gap-2.5">
                <a
                  href={whatsappHref(t('join.waText'))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded-full border border-mist/25 px-4 py-2.5 text-sm font-semibold text-mist transition-colors hover:border-mist/50"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden />
                  {t('join.whatsapp')}
                </a>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full border border-mist/25 px-4 py-2.5 text-sm font-semibold text-mist transition-colors hover:border-mist/50"
                >
                  <Mail className="h-4 w-4" aria-hidden />
                  {t('join.email')}
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
