'use client';

import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { LegalTitle } from '@/components/legal-ui';

export default function LegalIndexPage() {
  const t = useTranslations('footer');
  const tl = useTranslations('legal');
  const items = [
    { href: '/legal/privacy', label: t('privacy') },
    { href: '/legal/terms', label: t('terms') },
    { href: '/legal/cookies', label: t('cookies') },
    { href: '/legal/accessibility', label: t('accessibility') },
    { href: '/legal/licenses', label: t('licenses') },
    { href: '/legal/contact', label: t('contact') },
  ];
  return (
    <>
      <LegalTitle title={tl('indexTitle')} subtitle={tl('indexSubtitle')} />
      <ul className="divide-y divide-border overflow-hidden rounded-card border">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              className="flex items-center justify-between px-5 py-4 text-sm font-medium text-forest transition-colors hover:bg-muted/50"
            >
              {i.label}
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
