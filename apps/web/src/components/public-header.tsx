'use client';

import { useLocale, useTranslations } from 'next-intl';
import { MapPin, Home, ListChecks, CircleUserRound } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { RoleSwitcher } from '@/components/role-switcher';
import { NotificationBell } from '@/components/notification-bell';
import { BottomNav } from '@/components/bottom-nav';
import { cn } from '@/lib/utils';

export function LocaleToggle() {
  const locale = useLocale();
  const pathname = usePathname();
  const seg = (l: 'en' | 'so') =>
    cn(
      'rounded-full px-2.5 py-1 transition-colors',
      locale === l ? 'bg-lime font-bold text-forest' : 'text-mist/70 hover:text-mist',
    );
  return (
    <div className="flex items-center rounded-full bg-forest p-1 text-xs font-semibold uppercase">
      <Link href={pathname} locale="en" className={seg('en')}>
        En
      </Link>
      <Link href={pathname} locale="so" className={seg('so')}>
        So
      </Link>
    </div>
  );
}

// Location header from the Guri design: pin + city on the left, the EN/SO pill
// on the right. On phone the customer tabs live in the bottom nav (per the
// reference screens); the inline links only show from sm up.
export function PublicHeader() {
  const t = useTranslations('common');
  const locale = useLocale();
  return (
    <>
      <header className="mb-4 flex items-center justify-between gap-3 rounded-card border bg-card px-4 py-3 lg:mb-6 lg:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <MapPin className="h-5 w-5 text-forest" aria-hidden />
          <span className="leading-tight">
            <span className="block text-[11px] text-muted-foreground">{t('location')}</span>
            <span className="block font-display text-base font-bold text-forest">{t('city')}</span>
          </span>
        </Link>
        <nav className="flex items-center gap-2.5">
          <RoleSwitcher />
          <Link
            href="/agencies"
            className="hidden whitespace-nowrap text-sm font-medium text-forest underline-offset-4 hover:underline md:inline"
          >
            {t('listYourHouse')}
          </Link>
          <Link
            href="/requests"
            className="hidden whitespace-nowrap text-sm font-medium text-forest underline-offset-4 hover:underline md:inline"
          >
            {t('myRequests')}
          </Link>
          <NotificationBell locale={locale} />
          <LocaleToggle />
        </nav>
      </header>
      <CustomerBottomNav />
    </>
  );
}

// Browse · My requests · Profile — the customer tab bar from the reference.
function CustomerBottomNav() {
  const t = useTranslations('common');
  return (
    <BottomNav
      items={[
        { href: '/browse', label: t('navBrowse'), icon: Home },
        { href: '/requests', label: t('myRequests'), icon: ListChecks },
        // '/' is the profile surface when signed in (ProfileCard) and the
        // sign-in prompt when not — exactly what a Profile tab should open.
        { href: '/', label: t('navProfile'), icon: CircleUserRound, exact: true },
      ]}
    />
  );
}
