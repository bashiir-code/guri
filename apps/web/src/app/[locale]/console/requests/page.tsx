'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { cn, formatDateTime, timeAgo } from '@/lib/utils';

type Stage = 'requested' | 'viewing_scheduled' | 'awaiting_docs' | 'docs_in_review' | 'approved';

interface AgencyRequest {
  dealId: string;
  state: Stage;
  name: string;
  phone: string | null;
  requestedAt: string;
  viewingAt: string | null;
  listing: { id: string; district: string; neighborhood: string | null; rentUsd: number };
}

// Stage chip colours, matching the dashboard: lime for new, amber mid-pipeline,
// forest once approved.
const stageChip: Record<Stage, string> = {
  requested: 'bg-lime/40 text-forest',
  viewing_scheduled: 'bg-amber_reserved/25 text-[#8A5A10]',
  awaiting_docs: 'bg-amber_reserved/25 text-[#8A5A10]',
  docs_in_review: 'bg-amber_reserved/25 text-[#8A5A10]',
  approved: 'bg-forest/10 text-forest',
};

// §5 the customer viewing-request inbox for the whole agency (rule 3). These are
// customers who asked to see a home — DEALS in the pre-close pipeline (§4).
// Distinct from the owner-intake leads inbox at /console/leads (§15). Each row
// opens the deal, where scheduling and declining already live.
export default function RequestsPage() {
  const t = useTranslations('consoleRequests');
  const ts = useTranslations('dashboard.stage');
  const locale = useLocale();
  const { data: requests, isLoading } = useQuery<AgencyRequest[]>({
    queryKey: ['agency-requests'],
    queryFn: () => api('/agency/requests'),
  });

  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '·';

  return (
    <main className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-forest lg:text-3xl">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {isLoading && <p className="text-muted-foreground">…</p>}
      {!isLoading && !requests?.length && (
        <div className="rounded-card border bg-card p-10 text-center text-muted-foreground">
          {t('empty')}
        </div>
      )}

      <ul className="flex flex-col gap-2.5">
        {requests?.map((r, i) => (
          <li key={r.dealId} className="animate-rise-in" style={{ animationDelay: `${i * 30}ms` }}>
            <Link
              href={`/console/deals/${r.dealId}`}
              className="flex items-center gap-3.5 rounded-card border bg-card p-4 hover:bg-muted/40"
            >
              <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-forest/[0.08] text-sm font-bold text-forest">
                {initials(r.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-forest">
                  {r.name}
                  <span className="font-normal text-slate_brand">
                    {' · '}
                    {r.listing.district}
                    {r.listing.neighborhood ? ` · ${r.listing.neighborhood}` : ''} · $
                    {Math.round(r.listing.rentUsd)}
                  </span>
                </p>
                <p className="mt-0.5 text-[12.5px] text-slate_brand">
                  {r.state === 'viewing_scheduled' && r.viewingAt
                    ? t('viewingAt', { when: formatDateTime(r.viewingAt) })
                    : t('requestedAgo', { ago: timeAgo(r.requestedAt, locale) })}
                </p>
              </div>
              <span
                className={cn(
                  'flex-none rounded-full px-2.5 py-1 text-[11.5px] font-semibold',
                  stageChip[r.state],
                )}
              >
                {ts(r.state)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
