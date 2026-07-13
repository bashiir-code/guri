'use client';

import { useLocale, useTranslations } from 'next-intl';
import { House, Home, ListChecks, CirclePlus, CircleUserRound } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
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

// Desktop nav link with an active state, so you always know where you are.
function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'hidden whitespace-nowrap border-b-2 px-1 pb-0.5 text-sm transition-colors md:inline-block',
        active
          ? 'border-lime font-bold text-forest'
          : 'border-transparent font-medium text-slate hover:border-forest/20 hover:text-forest',
      )}
    >
      {children}
    </Link>
  );
}

// One header for every public surface: the Guri mark on the left always goes
// home; the desktop nav mirrors the phone bottom tabs (browse / requests /
// list your house) so the two form factors stay consistent.
export function PublicHeader() {
  const t = useTranslations('common');
  const locale = useLocale();
  return (
    <>
      <header className="mb-4 flex items-center justify-between gap-3 rounded-card border bg-card px-4 py-3 lg:mb-6 lg:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label={t('appName')}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-forest">
            <House className="h-5 w-5 text-lime" aria-hidden />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block font-display text-base font-extrabold text-forest">
              {t('appName')}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">{t('city')}</span>
          </span>
        </Link>
        <nav className="flex items-center gap-3 lg:gap-4">
          <NavLink href="/browse">{t('browseCta')}</NavLink>
          <NavLink href="/requests">{t('myRequests')}</NavLink>
          <Button asChild variant="outline" size="sm" className="hidden text-forest md:inline-flex">
            <Link href="/agencies">{t('listYourHouse')}</Link>
          </Button>
          <RoleSwitcher />
          <NotificationBell locale={locale} />
          <LocaleToggle />
        </nav>
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
