'use client';

import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { House, SlidersHorizontal } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/bottom-sheet';
import { PublicHeader } from '@/components/public-header';
import { StatusChip } from '@/components/status-chip';
import {
  FilterControls,
  EMPTY_FILTERS,
  DEFAULT_BOUNDS,
  type BrowseBounds,
  type BrowseFilters,
} from '@/components/filter-controls';
import { cn } from '@/lib/utils';

interface BrowseItem {
  id: string;
  district: string;
  neighborhood: string | null;
  type: string;
  bedrooms: number;
  bathrooms: number;
  rentUsd: number;
  status: 'available' | 'reserved' | 'rented';
  coverUrl: string | null;
}
interface BrowsePage {
  items: BrowseItem[];
  page: number;
  hasMore: boolean;
  total: number;
  bounds: BrowseBounds;
}

function queryString(f: BrowseFilters, page: number) {
  const params = new URLSearchParams();
  if (f.district) params.set('district', f.district);
  if (f.minRent) params.set('minRent', f.minRent);
  if (f.maxRent) params.set('maxRent', f.maxRent);
  if (f.beds) params.set('beds', f.beds);
  if (f.type) params.set('type', f.type);
  params.set('sort', f.sort);
  params.set('page', String(page));
  return params.toString();
}

// Phone: chip row → bottom sheet, single column.
// Tablet: two-column card grid, sheet becomes a dialog.
// Laptop: persistent filter sidebar + three-column grid — no sheet needed.
export default function BrowsePage() {
  const t = useTranslations('browse');
  const tc = useTranslations('common');
  const tt = useTranslations('listings.types');
  const [filters, setFilters] = useState<BrowseFilters>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<BrowseFilters>(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  const query = useInfiniteQuery<BrowsePage>({
    queryKey: ['browse', filters],
    queryFn: ({ pageParam }) => api(`/listings?${queryString(filters, pageParam as number)}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.total;
  const bounds = query.data?.pages[0]?.bounds ?? DEFAULT_BOUNDS;

  const apply = () => {
    setFilters(draft);
    setSheetOpen(false);
  };
  const clear = () => {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setSheetOpen(false);
  };

  const chips: string[] = [
    filters.district || t('anyDistrict'),
    filters.minRent || filters.maxRent
      ? `$${filters.minRent || '0'}–${filters.maxRent ? `$${filters.maxRent}` : '∞'}`
      : t('anyPrice'),
    filters.beds ? `${filters.beds}+ ${t('bedsShort')}` : t('anyBeds'),
    filters.type ? tt(filters.type) : t('anyType'),
  ];

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[480px] px-4 py-4 md:max-w-3xl lg:max-w-6xl lg:px-6">
      <PublicHeader />

      <div className="lg:grid lg:grid-cols-[280px_1fr] lg:items-start lg:gap-8">
        {/* Laptop: filters live in a sticky sidebar, always visible. */}
        <aside className="hidden lg:sticky lg:top-6 lg:block">
          <div className="rounded-card border bg-card p-5 animate-rise-in">
            <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-forest">
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              {t('filters')}
            </h2>
            <FilterControls
              draft={draft}
              setDraft={setDraft}
              bounds={bounds}
              onApply={apply}
              onClear={clear}
            />
          </div>
        </aside>

        <section>
          <div className="mb-3 flex items-end justify-between">
            <h1 className="font-display text-2xl font-bold text-forest lg:text-3xl">{t('title')}</h1>
            {typeof total === 'number' && (
              <span className="text-sm text-muted-foreground">{t('count', { count: total })}</span>
            )}
          </div>

          {/* Phone/tablet: chip row opens the sheet. */}
          <div className="hs mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            <button
              onClick={() => {
                setDraft(filters);
                setSheetOpen(true);
              }}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-forest px-4 py-2 text-sm font-semibold text-mist transition-transform duration-150 active:scale-95 motion-reduce:transition-none"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-lime" aria-hidden />
              {t('filters')}
            </button>
            {chips.map((label, i) => (
              <button
                key={i}
                onClick={() => {
                  setDraft(filters);
                  setSheetOpen(true);
                }}
                className="shrink-0 rounded-full border bg-card px-4 py-2 text-sm font-medium text-forest transition-transform duration-150 active:scale-95 motion-reduce:transition-none"
              >
                {label}
              </button>
            ))}
          </div>

          {query.isLoading && (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <li key={i} className="animate-pulse overflow-hidden rounded-card border bg-card">
                  <div className="aspect-[4/3] bg-muted" />
                  <div className="space-y-2 p-4">
                    <div className="h-5 w-24 rounded bg-muted" />
                    <div className="h-4 w-36 rounded bg-muted" />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!query.isLoading && items.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-14 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-forest/[0.06]">
                <House className="h-7 w-7 text-forest/50" aria-hidden />
              </span>
              <p className="max-w-xs text-muted-foreground">{t('empty')}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS) && (
                  <Button variant="outline" size="sm" className="text-forest" onClick={clear}>
                    {t('clear')}
                  </Button>
                )}
                <Button asChild variant="outline" size="sm" className="text-forest">
                  <Link href="/agencies">{tc('listYourHouse')}</Link>
                </Button>
              </div>
            </div>
          )}

          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((l, i) => (
              <li
                key={l.id}
                className="animate-rise-in"
                style={{ animationDelay: `${(i % 12) * 40}ms` }}
              >
                <Link
                  href={`/listings/${l.id}`}
                  className={cn(
                    'block overflow-hidden rounded-card border bg-card transition-[transform,box-shadow] duration-200',
                    'hover:-translate-y-1 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                  )}
                >
                  <div className="relative aspect-[4/3] w-full bg-muted">
                    {l.coverUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    )}
                    <span className="absolute left-3 top-3">
                      <StatusChip status={l.status} publishedAt={new Date()} />
                    </span>
                  </div>
                  <div className="space-y-1 p-4">
                    <span className="font-display text-2xl font-extrabold text-forest">
                      ${Math.round(l.rentUsd)}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">{t('perMonth')}</span>
                    </span>
                    <p className="text-sm text-slate_brand">
                      {l.bedrooms} {t('bedsShort')} · {l.bathrooms} {t('bathsShort')} · {tt(l.type)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {l.district}
                      {l.neighborhood ? ` · ${l.neighborhood}` : ''}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {query.hasNextPage && (
            <div className="py-6 text-center">
              <Button
                variant="outline"
                disabled={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
              >
                {t('loadMore')}
              </Button>
            </div>
          )}
        </section>
      </div>

      <div className="lg:hidden">
        <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t('filters')}>
          <FilterControls
            draft={draft}
            setDraft={setDraft}
            bounds={bounds}
            onApply={apply}
            onClear={clear}
          />
        </BottomSheet>
      </div>
    </main>
  );
}
