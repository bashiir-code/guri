'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { StatusChip } from '@/components/status-chip';

interface ListingRow {
  id: string;
  district: string;
  neighborhood: string | null;
  type: string;
  bedrooms: number;
  rentUsd: number;
  status: 'available' | 'reserved' | 'rented';
  publishedAt: string | null;
  ownerName: string | null;
  coverUrl: string | null;
}

export default function ListingsPage() {
  const t = useTranslations('listings');
  const { data: listings } = useQuery<ListingRow[]>({
    queryKey: ['listings'],
    queryFn: () => api('/agency/listings'),
  });

  return (
    <main>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-forest">{t('title')}</h1>
        <Button asChild>
          <Link href="/console/listings/new">{t('new')}</Link>
        </Button>
      </div>
      {!listings?.length && <p className="text-muted-foreground">{t('empty')}</p>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {listings?.map((l) => (
          <li key={l.id}>
            <Link
              href={`/console/listings/${l.id}`}
              className="block overflow-hidden rounded-card border bg-card transition-shadow hover:shadow-md"
            >
              <div className="h-36 w-full bg-muted">
                {l.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.coverUrl} alt="" className="h-36 w-full object-cover" loading="lazy" />
                )}
              </div>
              <div className="space-y-1 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-display text-lg font-bold text-forest">
                    ${Math.round(l.rentUsd)}
                    <span className="text-xs font-normal text-muted-foreground"> {t('perMonth')}</span>
                  </span>
                  <StatusChip status={l.status} publishedAt={l.publishedAt} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {l.district}
                  {l.neighborhood ? ` · ${l.neighborhood}` : ''} · {l.bedrooms} {t('bedsShort')}
                </p>
                <p className="text-xs text-muted-foreground">{l.ownerName}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
