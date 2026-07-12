'use client';

import { use, useState } from 'react';
import { useAuthStatus } from '@/hooks/use-auth-status';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';
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
  rentUsd: number;
  depositUsd: number;
  descriptionSo: string;
  descriptionEn: string;
  status: 'available' | 'reserved' | 'rented';
  photos: string[];
  agency: { name: string; phone: string; waUrl: string };
}

type RequestState = 'idle' | 'confirm' | 'success' | 'signin' | 'duplicate' | 'error';

// Phone: snap-scroll gallery + sticky bottom CTA bar.
// Laptop: two columns — gallery + description left, sticky action rail right
// (price, facts, agency, request button); the bottom bar disappears.
export default function PublicListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('listingDetail');
  const tt = useTranslations('listings.types');
  const locale = useLocale();
  const router = useRouter();
  const { isSignedIn } = useAuthStatus();
  const [sheet, setSheet] = useState<RequestState>('idle');

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

  const agencyCard = (
    <div className="rounded-card border bg-card p-4">
      <p className="text-sm text-muted-foreground">{t('managedBy')}</p>
      <p className="mb-3 font-semibold text-forest">{listing.agency.name}</p>
      <div className="flex gap-3">
        <Button asChild variant="outline" className="flex-1">
          <a href={`tel:${listing.agency.phone}`}>{t('call')}</a>
        </Button>
        <Button asChild variant="outline" className="flex-1">
          <a href={listing.agency.waUrl} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
        </Button>
      </div>
    </div>
  );

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[480px] pb-28 md:max-w-3xl lg:max-w-6xl lg:px-6 lg:pb-10 lg:pt-4">
      {/* Phone/tablet: floating back bar over the full-bleed gallery (design). */}
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

          {/* Laptop gallery: hero photo + thumbnail grid. */}
          <div className="hidden lg:block">
            {listing.photos.length === 0 && <div className="aspect-[16/9] rounded-card bg-muted" />}
            {listing.photos[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={listing.photos[0]}
                alt=""
                className="aspect-[16/9] w-full rounded-card object-cover"
              />
            )}
            {listing.photos.length > 1 && (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {listing.photos.slice(1, 5).map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={url}
                    alt=""
                    className="aspect-[4/3] w-full rounded-xl object-cover"
                    loading="lazy"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Phone/tablet facts (the laptop rail repeats these). */}
          <div className="mt-4 px-4 lg:hidden">
            <div className="flex items-center justify-between">
              <p className="font-display text-3xl font-extrabold text-forest">
                ${Math.round(listing.rentUsd)}
                <span className="text-base font-normal text-muted-foreground">{t('perMonth')}</span>
              </p>
              <StatusChip status={listing.status} publishedAt={new Date()} />
            </div>
            <p className="mt-1 text-slate_brand">
              {listing.bedrooms} {t('beds')} · {listing.bathrooms} {t('baths')} · {tt(listing.type)}
            </p>
            <p className="text-muted-foreground">
              {listing.district}
              {listing.neighborhood ? ` · ${listing.neighborhood}` : ''}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('deposit')}: ${Math.round(listing.depositUsd)}
            </p>
          </div>

          <p className="mt-4 whitespace-pre-line px-4 leading-relaxed text-foreground lg:mt-6 lg:px-0 lg:text-lg">
            {description}
          </p>

          <section className="mt-6 px-4 lg:hidden">{agencyCard}</section>
        </div>

        {/* Laptop action rail — sticky, carries the one Lime action. */}
        <aside
          className="hidden animate-rise-in lg:sticky lg:top-6 lg:block"
          style={{ animationDelay: '100ms' }}
        >
          <div className="space-y-4 rounded-card border bg-card p-6">
            <div className="flex items-center justify-between">
              <p className="font-display text-3xl font-extrabold text-forest">
                ${Math.round(listing.rentUsd)}
                <span className="text-base font-normal text-muted-foreground">{t('perMonth')}</span>
              </p>
              <StatusChip status={listing.status} publishedAt={new Date()} />
            </div>
            <div className="text-sm text-slate_brand">
              <p>
                {listing.bedrooms} {t('beds')} · {listing.bathrooms} {t('baths')} · {tt(listing.type)}
              </p>
              <p className="text-muted-foreground">
                {listing.district}
                {listing.neighborhood ? ` · ${listing.neighborhood}` : ''}
              </p>
              <p className="mt-1 text-muted-foreground">
                {t('deposit')}: ${Math.round(listing.depositUsd)}
              </p>
            </div>
            <Button className="w-full" size="lg" onClick={openRequest}>
              {t('requestCta')}
            </Button>
          </div>
          <div className="mt-4">{agencyCard}</div>
        </aside>
      </div>

      {/* Sticky primary CTA — phone/tablet only (§5: one Lime action). */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-mist/95 backdrop-blur lg:hidden">
        <div className="mx-auto max-w-[480px] px-4 py-3 md:max-w-3xl">
          <Button className="w-full" size="lg" onClick={openRequest}>
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
              <Link href="/requests">{t('goRequests')}</Link>
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
