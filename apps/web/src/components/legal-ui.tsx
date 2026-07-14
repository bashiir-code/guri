'use client';

import { type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatDate } from '@/lib/so-date';

// The date the legal texts were last revised. Bump when the wording changes.
export const LEGAL_UPDATED = new Date('2026-07-15');

// Page title + "last updated" line for a legal document.
export function LegalTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const t = useTranslations('legal');
  const locale = useLocale();
  return (
    <header className="mb-6">
      <h1 className="font-display text-3xl font-extrabold text-forest lg:text-4xl">{title}</h1>
      {subtitle && <p className="mt-2 text-slate_brand">{subtitle}</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        {t('lastUpdated', { date: formatDate(LEGAL_UPDATED, locale) })}
      </p>
    </header>
  );
}

// Styles plain <h2>/<h3>/<p>/<ul>/<a> children so each legal page can be written
// as simple markup and still read consistently (Guri type scale, lime markers).
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div
      className="max-w-none text-[15px] leading-relaxed text-foreground [&_a]:font-medium [&_a]:text-forest [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-forest first:[&_h2]:mt-0 [&_h3]:mb-1 [&_h3]:mt-5 [&_h3]:font-semibold [&_h3]:text-forest [&_li]:marker:text-lime [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5"
    >
      {children}
    </div>
  );
}

// A highlighted "in short" summary box (used at the top of Privacy/Terms).
export function Summary({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card border border-forest/10 bg-mist p-4 text-sm leading-relaxed text-forest">
      {children}
    </div>
  );
}
