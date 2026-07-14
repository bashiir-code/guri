import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://getguri.com';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
// Public browse serves 20/page; 5 pages comfortably covers the pilot's
// 30–50 live listings while keeping the crawl cheap.
const MAX_BROWSE_PAGES = 5;

// Generated per request (not at build) so newly published listings appear
// without a redeploy; search engines fetch sitemaps rarely enough that the
// extra API calls are negligible.
export const dynamic = 'force-dynamic';

async function liveListingIds(): Promise<string[]> {
  const ids: string[] = [];
  try {
    for (let page = 1; page <= MAX_BROWSE_PAGES; page++) {
      const res = await fetch(`${API_URL}/listings?page=${page}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) break;
      const data = (await res.json()) as { items: { id: string }[]; hasMore: boolean };
      ids.push(...data.items.map((i) => i.id));
      if (!data.hasMore) break;
    }
  } catch {
    // API unreachable — fall back to the static pages only.
  }
  return ids;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPaths: Array<{ path: string; priority: number }> = [
    { path: '', priority: 1 },
    { path: '/browse', priority: 0.9 },
    { path: '/agencies', priority: 0.7 },
    { path: '/list-house', priority: 0.6 },
    { path: '/legal/terms', priority: 0.2 },
    { path: '/legal/privacy', priority: 0.2 },
    { path: '/legal/cookies', priority: 0.2 },
    { path: '/legal/contact', priority: 0.3 },
    { path: '/legal/accessibility', priority: 0.2 },
    { path: '/legal/licenses', priority: 0.1 },
  ];
  const listingIds = await liveListingIds();
  const now = new Date();

  return routing.locales.flatMap((locale) => [
    ...staticPaths.map(({ path, priority }) => ({
      url: `${SITE_URL}/${locale}${path}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority,
    })),
    ...listingIds.map((id) => ({
      url: `${SITE_URL}/${locale}/listings/${id}`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ]);
}
