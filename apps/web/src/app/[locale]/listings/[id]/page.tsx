import type { Metadata } from 'next';
import PublicListingPage from './listing-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface PublicListing {
  id: string;
  district: string;
  neighborhood: string | null;
  type: string;
  bedrooms: number;
  bathrooms: number;
  rentUsd: number;
  descriptionSo: string;
  descriptionEn: string;
  status: string;
  photos: string[];
  agency: { name: string };
}

// Server-side fetch for metadata + structured data only; the interactive page
// itself stays the client component (react-query owns loading/error states).
// Next dedupes this fetch between generateMetadata and the page render.
// Fail-soft: if the API is unreachable the page still renders client-side.
async function fetchListing(id: string): Promise<PublicListing | null> {
  try {
    const res = await fetch(`${API_URL}/listings/${id}`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicListing;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const l = await fetchListing(id);
  if (!l) return { title: 'Guri' };
  const so = locale === 'so';
  const place = l.neighborhood ? `${l.neighborhood}, ${l.district}` : l.district;
  const title = so
    ? `${l.bedrooms} qol — ${place} — $${l.rentUsd}/bishii`
    : `${l.bedrooms} bed ${l.type} in ${place} — $${l.rentUsd}/mo`;
  const description = (so ? l.descriptionSo : l.descriptionEn) || title;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: l.photos[0] ? [l.photos[0]] : undefined,
    },
    alternates: {
      canonical: `/${locale}/listings/${l.id}`,
      languages: { so: `/so/listings/${l.id}`, en: `/en/listings/${l.id}` },
    },
  };
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const l = await fetchListing(id);
  const jsonLd = l && {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: `${l.bedrooms} bed ${l.type} in ${l.district}`,
    description: (locale === 'so' ? l.descriptionSo : l.descriptionEn) || undefined,
    url: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://getguri.com'}/${locale}/listings/${l.id}`,
    image: l.photos[0] || undefined,
    offers: {
      '@type': 'Offer',
      price: l.rentUsd,
      priceCurrency: 'USD',
      availability:
        l.status === 'available' ? 'https://schema.org/InStock' : 'https://schema.org/LimitedAvailability',
      offeredBy: { '@type': 'RealEstateAgent', name: l.agency.name },
    },
  };

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <PublicListingPage id={id} />
    </>
  );
}
