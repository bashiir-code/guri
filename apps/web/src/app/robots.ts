import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://getguri.com';

// Public marketplace pages are indexable; the role consoles and auth flows
// are work tools, not landing pages, so crawlers are kept out of them.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/*/agency',
          '/*/admin',
          '/*/owner',
          '/*/requests',
          '/*/sign-in',
          '/*/sign-up',
          '/*/welcome',
          '/*/offline',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
