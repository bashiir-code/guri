'use client';

import { useState } from 'react';
import { useAuthStatus } from '@/hooks/use-auth-status';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { BadgeCheck, ChevronLeft, MessageCircle, Phone } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/bottom-sheet';
import { PhotoGallery } from '@/components/photo-gallery';
import { PublicHeader, LocaleToggle } from '@/components/public-header';
import { StatusChip } from '@/components/status-chip';

interface PublicListing {
  id: string;
  district: string;
  neighborhood: string | null;
  type: string;
  bedrooms: number;
  bathrooms: number;
  areaSqm: number | null;
  rentUsd: number;
  depositUsd: number;
  descriptionSo: string;
  descriptionEn: string;
  status: 'available' | 'reserved' | 'rented';
  photos: string[];
  agency: { name: string; phone: string; waUrl: string; listingCount: number };
}

type RequestState = 'idle' | 'confirm' | 'success' | 'signin' | 'duplicate' | 'error';

// Phone: snap-scroll gallery, stacked facts + 4-up stat grid, agency card,
// sticky bottom CTA (SPEC §5 detail).
// Laptop: two columns — gallery + description left, sticky action rail right.
export default function PublicListingPage({ id }: { id: string }) {
  const t = useTranslations('listingDetail');
  const tt = useTranslations('listings.types');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const { isSignedIn } = useAuthStatus();
  const [sheet, setSheet] = useState<RequestState>('idle');
  // Laptop gallery: which photo fills the hero slot (thumbnails swap it in).
  const [heroIdx, setHeroIdx] = useState(0);

  const { data: listing, isLoading } = useQuery<PublicListing>({
    queryKey: ['public-listing', id],
    queryFn: () => api(`/listings/${id}`),
  });

  const request = useMutation({
    mutationFn: () => api(`/listings/${id}/requests`, { method: 'POST', body: {} }),
    onSuccess: () => setSheet('success'),
    onError: (e) => {
      if (e instanceof ApiError && e.status === 401) setSheet('signin');
      else if (e instanceof ApiError && e.status === 409) setSheet('duplicate');
      else setSheet('error');
    },
  });

  if (isLoading) return <p className="p-8 text-muted-foreground">…</p>;
  if (!listing) return <p className="p-8 text-muted-foreground">{t('notFound')}</p>;

  const description = locale === 'so' ? listing.descriptionSo : listing.descriptionEn;
  const openRequest = () => setSheet(isSignedIn ? 'confirm' : 'signin');
  const title = t('title', { type: tt(listing.type), beds: listing.bedrooms });
  const location = `${listing.neighborhood ? `${listing.neighborhood}, ` : ''}${listing.district}`;
  const agencyInitial = listing.agency.name.charAt(0).toUpperCase();

  const priceBlock = (
    <div className="flex items-start justify-between gap-3">
      <p className="font-display text-3xl font-extrabold text-forest">
        ${Math.round(listing.rentUsd)}
        <span className="text-base font-normal text-muted-foreground">{t('perMonth')}</span>
      </p>
      <StatusChip status={listing.status} publishedAt={new Date()} />
    </div>
  );

  const heading = (
    <div>
      <h1 className="font-display text-2xl font-extrabold text-forest">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{location}</p>
    </div>
  );

  // 4-up stat grid (Beds / Baths / m² / Type), bilingual stacked labels.
  const stats = [
    { value: listing.bedrooms, label: t('statBeds') },
    { value: listing.bathrooms, label: t('statBaths') },
    { value: listing.areaSqm != null ? `${listing.areaSqm} m²` : '—', label: t('statArea') },
    { value: tt(listing.type), label: t('statType') },
  ];
  const statGrid = (
    <div className="grid grid-cols-4 rounded-card border bg-card">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={`px-2 py-4 text-center ${i > 0 ? 'border-l border-border' : ''}`}
        >
          <p className="font-display text-lg font-extrabold text-forest">{s.value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </div>
  );

  const agencyCard = (
    <div className="rounded-card border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-forest font-display text-lg font-extrabold text-lime">
          {agencyInitial}
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold text-forest">
            <span className="truncate">{listing.agency.name}</span>
            <BadgeCheck className="h-4 w-4 flex-none text-forest" aria-hidden />
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {t('homesCount', { count: listing.agency.listingCount })} · {tc('verifiedAgency')}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Button asChild variant="outline" className="gap-2">
          <a href={`tel:${listing.agency.phone}`}>
            <Phone className="h-4 w-4" aria-hidden />
            {t('call')}
          </a>
        </Button>
        <Button asChild className="gap-2">
          <a href={listing.agency.waUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-4 w-4" aria-hidden />
            WhatsApp
          </a>
        </Button>
      </div>
    </div>
  );

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[480px] pb-28 md:max-w-3xl lg:max-w-6xl lg:px-6 lg:pb-10 lg:pt-4">
      {/* Phone/tablet: floating back bar over the full-bleed gallery. */}
      <div className="flex items-center justify-between px-4 py-3 lg:hidden">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 font-semibold text-forest"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full border bg-card shadow-sm">
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </span>
          {t('back')}
        </button>
        <LocaleToggle />
      </div>
      <div className="hidden px-0 lg:block">
        <PublicHeader />
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_380px] lg:items-start lg:gap-10">
        <div className="animate-rise-in">
          {/* Phone/tablet gallery: full-bleed, one photo per swipe, dots. */}
          <PhotoGallery photos={listing.photos} className="lg:hidden" />

          {/* Laptop gallery: hero photo + thumbnail grid; clicking a
              thumbnail swaps it into the hero so every photo can be seen big. */}
          <div className="hidden lg:block">
            {listing.photos.length === 0 && <div className="aspect-[16/9] rounded-card bg-muted" />}
            {listing.photos.length > 0 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={listing.photos[heroIdx] ?? listing.photos[0]}
                alt=""
                className="aspect-[16/9] w-full rounded-card object-cover"
              />
            )}
            {listing.photos.length > 1 && (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {listing.photos.map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setHeroIdx(i)}
                    aria-label={`${t('photoN', { n: i + 1 })}`}
                    aria-current={i === heroIdx}
                    className={cn(
                      'overflow-hidden rounded-xl transition-opacity',
                      i === heroIdx
                        ? 'ring-2 ring-forest ring-offset-2'
                        : 'opacity-80 hover:opacity-100',
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      className="aspect-[4/3] w-full object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Phone/tablet facts: price, title, stat grid (the rail repeats price). */}
          <div className="mt-4 space-y-4 px-4 lg:hidden">
            {priceBlock}
            {heading}
            {statGrid}
          </div>

          <div className="mt-6 px-4 lg:px-0">
            <h2 className="font-display text-lg font-bold text-forest">{t('aboutTitle')}</h2>
            <p className="mt-2 whitespace-pre-line leading-relaxed text-foreground lg:text-lg">
              {description}
            </p>
          </div>

          <section className="mt-6 px-4 lg:hidden">{agencyCard}</section>
        </div>

        {/* Laptop action rail — sticky, carries the one Lime action. */}
        <aside
          className="hidden animate-rise-in lg:sticky lg:top-6 lg:block"
          style={{ animationDelay: '100ms' }}
        >
          <div className="space-y-4 rounded-card border bg-card p-6">
            {priceBlock}
            {heading}
            {statGrid}
            <Button className="w-full" size="lg" onClick={openRequest}>
              {t('requestCta')}
            </Button>
          </div>
          <div className="mt-4">{agencyCard}</div>
        </aside>
      </div>

      {/* Sticky primary CTA — phone/tablet only (§5: one Lime action). */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-mist/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-[480px] items-center gap-4 px-4 py-3 md:max-w-3xl">
          <p className="flex-none font-display text-xl font-extrabold text-forest">
            ${Math.round(listing.rentUsd)}
            <span className="text-xs font-normal text-muted-foreground">{t('perMonth')}</span>
          </p>
          <Button className="flex-1" size="lg" onClick={openRequest}>
            {t('requestCta')}
          </Button>
        </div>
      </div>

      <BottomSheet
        open={sheet !== 'idle'}
        onClose={() => setSheet('idle')}
        title={
          sheet === 'success'
            ? t('successTitle')
            : sheet === 'signin'
              ? t('signinTitle')
              : sheet === 'duplicate'
                ? t('duplicateTitle')
                : t('confirmTitle')
        }
      >
        {sheet === 'confirm' && (
          <div className="space-y-4">
            <p className="text-sm text-slate_brand">
              {t('confirmBody', { district: listing.district, rent: Math.round(listing.rentUsd) })}
            </p>
            <Button className="w-full" disabled={request.isPending} onClick={() => request.mutate()}>
              {t('confirmButton')}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setSheet('idle')}>
              {t('cancel')}
            </Button>
          </div>
        )}
        {sheet === 'success' && (
          <div className="space-y-4">
            <div className="animate-pop mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-lime text-2xl text-forest">
              ✓
            </div>
            <p className="text-center text-sm text-slate_brand">
              {t('successBody', { agency: listing.agency.name })}
            </p>
            <Button asChild className="w-full">
              <Link href="/requests?sent=1">{t('goRequests')}</Link>
            </Button>
          </div>
        )}
        {sheet === 'signin' && (
          <div className="space-y-4">
            <p className="text-sm text-slate_brand">{t('signinBody')}</p>
            <Button asChild className="w-full">
              <Link href="/sign-in">{t('signinButton')}</Link>
            </Button>
          </div>
        )}
        {sheet === 'duplicate' && (
          <div className="space-y-4">
            <p className="text-sm text-slate_brand">{t('duplicateBody')}</p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/requests">{t('goRequests')}</Link>
            </Button>
          </div>
        )}
        {sheet === 'error' && <p className="text-sm text-destructive">{t('error')}</p>}
      </BottomSheet>
    </main>
  );
}
