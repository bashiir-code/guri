'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface RecentDeal {
  id: string;
  state: string;
  updatedAt: string;
  agency: string;
  district: string;
  neighborhood: string | null;
  customer: string | null;
}

interface AuditView {
  deal: {
    id: string;
    state: string;
    listing: { district: string; neighborhood: string | null; agency: string };
    customer: { name: string | null; phone: string | null; email: string | null };
  };
  timeline: Array<{ fromState: string | null; toState: string; actor: string; note: string | null; at: string }>;
  documents: Array<{ id: string; idType: string; capturedVia: string; status: string; uploadedAt: string }>;
  accessLog: Array<{ action: string; actor: string; objectType: string; meta: unknown; at: string }>;
}

// §5/§9 Audit — the fraud-oversight surface: search a deal, read its full
// timeline, its documents, and who accessed which ID, when.
export default function AdminAuditPage() {
  const t = useTranslations('admin.auditView');
  const ts = useTranslations('dealStates');
  const [input, setInput] = useState('');
  const [dealId, setDealId] = useState('');

  const { data, isLoading, error } = useQuery<AuditView>({
    queryKey: ['admin-audit', dealId],
    queryFn: () => api(`/admin/deals/${dealId}/audit`),
    enabled: dealId.length > 10,
    retry: false,
  });

  // Entry list: the newest deals platform-wide, so a trail (e.g. the rented
  // house) is one tap away — the ID search is only a shortcut.
  const { data: recent } = useQuery<RecentDeal[]>({
    queryKey: ['admin-recent-deals'],
    queryFn: () => api('/admin/deals/recent'),
  });

  return (
    <main className="space-y-5">
      <h1 className="font-display text-2xl font-bold text-forest">{t('title')}</h1>
      {/* Search card from the reference: white card, forest pill with lime
          label as the action. */}
      <form
        className="flex max-w-xl items-center gap-2 rounded-card border bg-card p-3"
        onSubmit={(e) => {
          e.preventDefault();
          setDealId(input.trim());
        }}
      >
        <Input
          className="border-0 shadow-none focus-visible:ring-0"
          placeholder={t('searchPlaceholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-lime transition-transform duration-150 active:scale-95 motion-reduce:transition-none"
        >
          {t('search')}
        </button>
      </form>

      {isLoading && <p className="text-muted-foreground">…</p>}
      {error && (
        <p className="text-sm text-destructive">
          {error instanceof ApiError && error.status === 404 ? t('notFound') : t('failed')}
        </p>
      )}

      {!data && !isLoading && recent && (
        <Card className="max-w-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{t('recentTitle')}</CardTitle>
            <CardDescription>{t('recentHint')}</CardDescription>
          </CardHeader>
          <CardContent className="divide-y p-0 pt-1">
            {recent.length === 0 && (
              <p className="px-6 pb-4 text-sm text-muted-foreground">{t('recentEmpty')}</p>
            )}
            {recent.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setInput(d.id);
                  setDealId(d.id);
                }}
                className="flex w-full items-center justify-between gap-3 px-6 py-3 text-left text-sm transition-colors hover:bg-muted/50"
              >
                <span className="min-w-0">
                  <span className="font-semibold text-forest">{ts(d.state)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {d.agency} · {d.district}
                    {d.neighborhood ? ` · ${d.neighborhood}` : ''}
                    {d.customer ? ` · ${d.customer}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(d.updatedAt)}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('deal')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-semibold text-forest">{ts(data.deal.state)}</p>
              <p className="text-muted-foreground">
                {data.deal.listing.agency} · {data.deal.listing.district}
                {data.deal.listing.neighborhood ? ` · ${data.deal.listing.neighborhood}` : ''}
              </p>
              <p className="text-muted-foreground">
                {data.deal.customer.name ?? '—'} · {data.deal.customer.phone ?? '—'}
                {data.deal.customer.email ? ` · ${data.deal.customer.email}` : ''}
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('timeline')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2 text-sm">
                  {data.timeline.map((e, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0">
                      <span className="text-forest">
                        {e.fromState ? `${ts(e.fromState)} → ` : ''}
                        {ts(e.toState)}
                        <span className="block text-xs text-muted-foreground">{t('by', { actor: e.actor })}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(e.at)}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('access')}</CardTitle>
              </CardHeader>
              <CardContent>
                {!data.accessLog.length && (
                  <p className="text-sm text-muted-foreground">{t('noAccess')}</p>
                )}
                <ul className="space-y-2 text-sm">
                  {data.accessLog.map((a, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0">
                      <span className="text-forest">
                        {t.has(`actions.${a.action}`) ? t(`actions.${a.action}`) : a.action}
                        <span className="block text-xs text-muted-foreground">{t('by', { actor: a.actor })}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(a.at)}</span>
                    </li>
                  ))}
                </ul>
                {Boolean(data.documents.length) && (
                  <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                    {data.documents.map((d) => (
                      <p key={d.id}>
                        {t(`idType.${d.idType}`)} · {t(`capturedVia.${d.capturedVia}`)} · {t(`docStatus.${d.status}`)}
                      </p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </main>
  );
}
