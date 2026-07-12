'use client';

import { type ReactNode } from 'react';
import { useClerk } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { CircleDollarSign, HousePlus, Inbox, LayoutGrid, Home } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { useMe } from '@/hooks/use-me';
import { Button } from '@/components/ui/button';
import { RoleSwitcher } from '@/components/role-switcher';
import { NotificationBell } from '@/components/notification-bell';
import { LocaleToggle } from '@/components/public-header';
import { BottomNav } from '@/components/bottom-nav';
import { cn } from '@/lib/utils';

// The owner area: calm and read-only (§2/§5) — a place to look, not a
// control panel.
export default function OwnerLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('owner');
  const { data: me, isLoading } = useMe();
  const pathname = usePathname();
  const locale = useLocale();
  const { signOut } = useClerk();

  if (isLoading) {
    return <p className="p-8 text-muted-foreground">…</p>;
  }
  if (!me?.roles.owner) {
    return (
      <main className="mx-auto max-w-md p-8">
        <p className="mb-4 text-foreground">{t('notOwner')}</p>
        <Button asChild variant="outline">
          <Link href="/">{t('backHome')}</Link>
        </Button>
      </main>
    );
  }

  const nav = [
    { href: '/owner', label: t('nav.dashboard'), exact: true },
    { href: '/owner/properties', label: t('nav.properties') },
    { href: '/list-house', label: t('nav.listHouse') },
    { href: '/owner/intakes', label: t('nav.submissions') },
    { href: '/owner/income', label: t('nav.income') },
  ];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-4">
      {/* Phone: brand + utilities on top, tabs in the bottom nav.
          md and up: the pill nav joins the header row. */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="font-display text-xl font-extrabold text-forest">
          Guri
        </Link>
        <nav className="flex flex-wrap items-center gap-1.5">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'hidden whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium md:inline-flex',
                (item.exact ? pathname === item.href : pathname.startsWith(item.href))
                  ? 'bg-forest text-mist'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {item.label}
            </Link>
          ))}
          <NotificationBell locale={locale} />
          <RoleSwitcher />
          <LocaleToggle />
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            {t('nav.signOut')}
          </Button>
        </nav>
      </header>
      {children}
      <BottomNav
        items={[
          { href: '/owner', label: t('nav.dashboard'), icon: LayoutGrid, exact: true },
          { href: '/owner/properties', label: t('nav.properties'), icon: Home },
          { href: '/list-house', label: t('nav.listHouse'), icon: HousePlus },
          { href: '/owner/intakes', label: t('nav.submissions'), icon: Inbox },
          { href: '/owner/income', label: t('nav.income'), icon: CircleDollarSign },
        ]}
      />
    </div>
  );
}
