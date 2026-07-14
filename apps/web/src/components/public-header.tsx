'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Home, ListChecks, CirclePlus, CircleUserRound } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
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

// Desktop nav pill mirroring the phone bottom tabs, with an active state so you
// always know where you are (design: Guri Customer.dc.html top nav).
function NavPill({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'hidden whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors md:inline-block',
        active
          ? 'bg-forest font-semibold text-mist'
          : 'font-medium text-slate hover:bg-forest/5 hover:text-forest',
      )}
    >
      {children}
    </Link>
  );
}

// One clean header for every customer surface (SPEC §5): the Guri wordmark on
// the left always goes home; the desktop nav mirrors the phone bottom tabs.
// Role switching lives in Profile (ProfileCard), never the header (rule 15).
export function PublicHeader() {
  const t = useTranslations('common');
  const locale = useLocale();
  return (
    <>
      <header className="mb-4 flex items-center gap-1.5 lg:mb-6">
        <Link href="/" className="mr-1 flex items-center" aria-label={t('appName')}>
          <span className="font-display text-2xl font-extrabold tracking-tight text-forest lg:text-[26px]">
            {t('appName')}
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          <NavPill href="/browse">{t('navBrowse')}</NavPill>
          <NavPill href="/agencies">{t('navList')}</NavPill>
          <NavPill href="/requests">{t('myRequests')}</NavPill>
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
          <NotificationBell locale={locale} />
          <LocaleToggle />
          <Link
            href="/"
            aria-label={t('navProfile')}
            className="hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-forest text-lime transition-colors hover:bg-forest/90 md:grid"
          >
            <CircleUserRound className="h-5 w-5" aria-hidden />
          </Link>
        </div>
      </header>
      <CustomerBottomNav />
    </>
  );
}

// Browse · List home · My requests · Profile — same destinations as the
// desktop nav so the phone app is never missing a way in.
function CustomerBottomNav() {
  const t = useTranslations('common');
  return (
    <BottomNav
      items={[
        { href: '/browse', label: t('navBrowse'), icon: Home },
        { href: '/agencies', label: t('navList'), icon: CirclePlus },
        { href: '/requests', label: t('myRequests'), icon: ListChecks },
        // '/' is the profile surface when signed in (ProfileCard) and the
        // sign-in prompt when not — exactly what a Profile tab should open.
        { href: '/', label: t('navProfile'), icon: CircleUserRound, exact: true },
      ]}
    />
  );
}
