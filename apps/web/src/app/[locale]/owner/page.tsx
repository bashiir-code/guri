'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useMe } from '@/hooks/use-me';
import { formatDateTime } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface OwnerDashboard {
  properties: number;
  occupied: number;
  incomeThisMonth: number;
  collectedThisYear: number;
  recentActivity: Array<{ template: string; payload: unknown; at: string }>;
}

const ACTIVITY_TEMPLATES = new Set(['deal_closed_owner', 'payment_logged']);

// §5 owner screen 2 — warm, calm, read-only.
export default function OwnerDashboardPage() {
  const t = useTranslations('owner');
  const { data: me } = useMe();
  const { data, isLoading } = useQuery<OwnerDashboard>({
    queryKey: ['owner-dashboard'],
    queryFn: () => api('/owner/dashboard'),
  });

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-card border bg-card" />
        ))}
      </div>
    );
  }
  const activity = data.recentActivity.filter((a) => ACTIVITY_TEMPLATES.has(a.template));

  return (
    <main className="space-y-6">
      {/* Forest hero from the reference owner screen: OWNER eyebrow in lime,
          big serif welcome, calm subtitle. */}
      <section className="animate-rise-in rounded-card bg-forest px-6 py-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">
          {t('heroEyebrow')}
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight text-mist lg:text-4xl">
          {me?.name ? t('greeting', { name: me.name.split(' ')[0] }) : t('greetingAnon')}
        </h1>
        <p className="mt-2 text-sm text-mist/80">{t('greetingSub')}</p>
      </section>

      {/* Income card first (the number that matters), then the stat trio. */}
      <Card className="animate-rise-in" style={{ animationDelay: '60ms' }}>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">{t('metrics.incomeThisMonth')}</p>
          <p className="mt-1 font-display text-5xl font-extrabold text-forest">
            ${data.incomeThisMonth}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3 md:gap-4">
        {[
          [data.properties, t('metrics.properties')],
          [data.occupied, t('metrics.occupied')],
          [`$${data.collectedThisYear}`, t('metrics.collectedThisYear')],
        ].map(([n, label], i) => (
          <Card key={i} className="animate-rise-in" style={{ animationDelay: `${120 + i * 60}ms` }}>
            <CardContent className="p-4 text-center md:p-5">
              <p className="font-display text-2xl font-extrabold text-forest md:text-3xl">{n}</p>
              <p className="mt-1 text-xs leading-tight text-muted-foreground md:text-sm">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="animate-rise-in" style={{ animationDelay: '240ms' }}>
        <CardHeader>
          <CardTitle className="text-lg">{t('activity.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('activity.empty')}</p>
          )}
          <ul className="divide-y">
            {activity.map((a, i) => (
              <li key={i} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-forest">{t(`activity.${a.template}`)}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(a.at)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
