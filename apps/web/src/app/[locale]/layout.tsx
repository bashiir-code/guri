import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { ClerkProvider } from '@clerk/nextjs';
import { Bricolage_Grotesque, Inter } from 'next/font/google';
import { routing } from '@/i18n/routing';
import { clerkAppearance, getClerkLocalization } from '@/lib/clerk-theme';
import { Providers } from '@/components/providers';
import { CookieConsent } from '@/components/cookie-consent';
import '../globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  // Absolute base for canonical/OG URLs (per-listing metadata relies on it).
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://getguri.com'),
  title: { default: 'Guri', template: '%s | Guri' },
  description: 'Find a home in Mogadishu through verified agencies',
};

// Browser chrome matches the Forest header when installed as a PWA.
export const viewport: Viewport = {
  themeColor: '#173A31',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }
  const messages = await getMessages();
  const t = await getTranslations({ locale, namespace: 'common' });

  return (
    <ClerkProvider
      afterSignOutUrl={`/${locale}`}
      appearance={clerkAppearance}
      localization={getClerkLocalization(locale)}
    >
      <html lang={locale}>
        <body className={`${inter.variable} ${bricolage.variable} min-h-dvh font-sans`}>
          <NextIntlClientProvider messages={messages}>
            <Providers>
              <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-forest focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-mist"
              >
                {t('skipToContent')}
              </a>
              <div id="main-content">{children}</div>
              <CookieConsent />
            </Providers>
          </NextIntlClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
