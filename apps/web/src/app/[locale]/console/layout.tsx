'use client';

import { useState, type ReactNode } from 'react';
import { useClerk } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import {
  Ellipsis,
  Home,
  Inbox,
  KeyRound,
  LayoutGrid,
  LogOut,
  Users,
  UserRound,
} from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { useLocale } from 'next-intl';
import { useMe } from '@/hooks/use-me';
import { Button } from '@/components/ui/button';
import { RoleSwitcher } from '@/components/role-switcher';
import { NotificationBell } from '@/components/notification-bell';
import { BottomNav } from '@/components/bottom-nav';
import { BottomSheet } from '@/components/bottom-sheet';
import { cn } from '@/lib/utils';

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('console');
  const { data: me, isLoading } = useMe();
  const pathname = usePathname();
  const locale = useLocale();
  const { signOut } = useClerk();
  const [moreOpen, setMoreOpen] = useState(false);

  if (isLoading) {
    return <p className="p-8 text-muted-foreground">{t('loading')}</p>;
  }
  const isStaff = (me?.roles.agencyMemberships.length ?? 0) > 0;
  if (!me || !isStaff) {
    return (
      <main className="mx-auto max-w-md p-8">
        <p className="mb-4 text-foreground">{t('notStaff')}</p>
        <Button asChild variant="outline">
          <Link href="/">{t('backHome')}</Link>
        </Button>
      </main>
    );
  }
  const isAdmin = me.roles.agencyMemberships.some((m) => m.role === 'admin');
  const membership = me.roles.agencyMemberships[0];

  const nav = [
    { href: '/console', label: t('nav.dashboard'), exact: true },
    { href: '/console/listings', label: t('nav.listings') },
    { href: '/console/leads', label: t('nav.leads') },
    { href: '/console/tenancies', label: t('nav.tenancies') },
    { href: '/console/owners', label: t('nav.owners') },
    ...(isAdmin ? [{ href: '/console/staff', label: t('nav.staff') }] : []),
  ];
  // Phone bottom nav (reference: Queue · Listings · Tenancies · More): the
  // first four surfaces get tabs, the rest live in a "More" sheet.
  const moreItems = [
    { href: '/console/tenancies', label: t('nav.tenancies'), icon: KeyRound },
    { href: '/console/owners', label: t('nav.owners'), icon: UserRound },
    ...(isAdmin ? [{ href: '/console/staff', label: t('nav.staff'), icon: Users }] : []),
  ];

  const initials =
    (me.name ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || 'G';

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-4">
      {/* Console header per the reference: squircle avatar, bold serif name,
          role subtitle. The pill nav appears from md up; phone uses the bar. */}
      <header className="mb-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-forest font-display text-sm font-extrabold text-lime">
              {initials}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate font-display text-lg font-bold text-forest">
                {me.name ?? 'Guri'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {t('subtitle')} · {t(`roles.${membership.role}`)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <NotificationBell locale={locale} />
            <RoleSwitcher />
            <Button
              variant="ghost"
              size="sm"
              className="hidden md:inline-flex"
              onClick={() => void signOut()}
            >
              {t('nav.signOut')}
            </Button>
          </div>
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium',
                ('exact' in item && item.exact ? pathname === item.href : pathname.startsWith(item.href))
                  ? 'bg-forest text-mist'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      {children}

      <BottomNav
        items={[
          { href: '/console', label: t('nav.dashboard'), icon: LayoutGrid, exact: true },
          { href: '/console/listings', label: t('nav.listings'), icon: Home },
          { href: '/console/leads', label: t('nav.leads'), icon: Inbox },
        ]}
        trailing={
          <li className="min-w-0 flex-1">
            <button
              onClick={() => setMoreOpen(true)}
              className="flex w-full flex-col items-center gap-1 px-1 py-1.5 text-[11px] font-medium text-mist/70 hover:text-mist"
            >
              <Ellipsis className="h-5 w-5" aria-hidden />
              <span>{t('nav.more')}</span>
            </button>
          </li>
        }
      />

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t('nav.more')}>
        <ul className="divide-y">
          {moreItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-3 py-3.5 text-sm font-medium text-forest"
                >
                  <Icon className="h-5 w-5 text-slate_brand" aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              onClick={() => void signOut()}
              className="flex w-full items-center gap-3 py-3.5 text-sm font-medium text-destructive"
            >
              <LogOut className="h-5 w-5" aria-hidden />
              {t('nav.signOut')}
            </button>
          </li>
        </ul>
      </BottomSheet>
    </div>
  );
}
