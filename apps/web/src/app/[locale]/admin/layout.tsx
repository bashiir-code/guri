'use client';

import { type ReactNode } from 'react';
import { useClerk } from '@clerk/nextjs';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { useMe } from '@/hooks/use-me';
import { Button } from '@/components/ui/button';
import { RoleSwitcher } from '@/components/role-switcher';
import { NotificationBell } from '@/components/notification-bell';
import { LocaleToggle } from '@/components/public-header';
import { cn } from '@/lib/utils';

// Platform-admin console (§5). Allowlist-gated server-side; the client just
// mirrors the /me role for the shell. Utilitarian, table-driven.
export default function AdminLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('admin');
  const { data: me, isLoading } = useMe();
  const pathname = usePathname();
  const locale = useLocale();
  const { signOut } = useClerk();

  if (isLoading) return <p className="p-8 text-muted-foreground">…</p>;
  if (!me?.roles.platformAdmin) {
    return (
      <main className="mx-auto max-w-md p-8">
        <p className="mb-4">{t('notAdmin')}</p>
        <Button asChild variant="outline">
          <Link href="/">{t('backHome')}</Link>
        </Button>
      </main>
    );
  }

  const nav = [
    { href: '/admin', label: t('nav.agencies'), exact: true },
    { href: '/admin/audit', label: t('nav.audit') },
    { href: '/admin/metrics', label: t('nav.metrics') },
  ];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-4">
      {/* Dark segmented tab bar from the reference admin screens: the active
          tab sits in a darker pill with a lime tick at its left edge. */}
      <header className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="font-display text-xl font-extrabold text-forest">
            Guri{' '}
            <span className="text-sm font-normal text-muted-foreground">· {t('adminBadge')}</span>
          </Link>
          <div className="flex items-center gap-1.5">
            <NotificationBell locale={locale} />
            <RoleSwitcher />
            <LocaleToggle />
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              {t('signOut')}
            </Button>
          </div>
        </div>
        <nav className="rounded-card bg-forest p-2">
          <ul className="flex items-center justify-around gap-1 sm:justify-start sm:gap-2">
            {nav.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors',
                      active ? 'bg-white/10 text-mist' : 'text-mist/60 hover:text-mist',
                    )}
                  >
                    {active && <span className="h-4 w-1 rounded-full bg-lime" aria-hidden />}
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      {children}
    </div>
  );
}
