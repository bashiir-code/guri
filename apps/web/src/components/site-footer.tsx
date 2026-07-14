'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

// Site footer with the legal + support links (SPEC §9 compliance surface).
// Bilingual; sits at the bottom of public content pages and every legal page.
export function SiteFooter() {
  const t = useTranslations('footer');
  const year = new Date().getFullYear();
  const links = [
    { href: '/legal/privacy', label: t('privacy') },
    { href: '/legal/terms', label: t('terms') },
    { href: '/legal/cookies', label: t('cookies') },
    { href: '/legal/accessibility', label: t('accessibility') },
    { href: '/legal/licenses', label: t('licenses') },
    { href: '/legal/contact', label: t('contact') },
  ];

  return (
    <footer className="mt-10 rounded-card bg-forest px-6 py-8 text-mist lg:px-10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-xs">
          <Link href="/" className="font-display text-xl font-extrabold text-mist">
            Guri
          </Link>
          <p className="mt-2 text-sm text-mist/70">{t('tagline')}</p>
        </div>
        <nav aria-label={t('legalHeading')}>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-lime">
            {t('legalHeading')}
          </p>
          <ul className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-mist/80 transition-colors hover:text-lime">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <p className="mt-8 border-t border-mist/10 pt-6 text-xs text-mist/60">{t('rights', { year })}</p>
    </footer>
  );
}
