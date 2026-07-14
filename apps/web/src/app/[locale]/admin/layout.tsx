'use client';

import { useState, type ReactNode } from 'react';
import { useClerk } from '@clerk/nextjs';
import { useLocale, useTranslations } from 'next-intl';
import {
  BarChart3,
  Building2,
  ChevronRight,
  FileSearch,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { useMe } from '@/hooks/use-me';
import { Button } from '@/components/ui/button';
import { ConsoleRoleSwitch } from '@/components/console-role-switch';
import { NotificationBell } from '@/components/notification-bell';
import { LocaleToggle } from '@/components/public-header';
import { cn } from '@/lib/utils';

// Platform-admin console (§5), in the Guri Platform Admin design chrome:
// forest sidebar on desktop, collapsible icon rail on tablet, hamburger +
// drawer on the phone. Allowlist-gated server-side; the client only mirrors
// the /me role for the shell. Admin reads and approves — never edits deals.
export default function AdminLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('admin');
  const { data: me, isLoading } = useMe();
  const pathname = usePathname();
  const locale = useLocale();
  const { signOut } = useClerk();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);

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
    { href: '/admin', label: t('nav.overview'), icon: BarChart3, exact: true },
    { href: '/admin/agencies', label: t('nav.agencies'), icon: Building2 },
    { href: '/admin/audit', label: t('nav.audit'), icon: FileSearch },
  ];
  const current = nav.find((item) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href),
  );
  const initials =
    me.name
      ?.split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || 'G';

  return (
    <div className="flex min-h-dvh bg-mist text-forest">
      {/* Desktop sidebar / tablet rail */}
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh flex-none flex-col bg-forest px-3.5 py-6 transition-[width] duration-200 md:flex',
          railExpanded ? 'w-[248px]' : 'w-[76px] lg:w-[248px]',
        )}
      >
        <SidebarBrand t={t} showLabels={railExpanded} />
        <nav className="flex flex-col gap-1">
          {nav.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-[11px] text-sm font-semibold',
                  active ? 'bg-lime/[0.18] text-lime' : 'text-mist/75 hover:bg-white/5 hover:text-mist',
                )}
              >
                <Icon className="h-5 w-5 flex-none" aria-hidden />
                <span
                  className={cn('flex-1 whitespace-nowrap', railExpanded ? 'block' : 'hidden lg:block')}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <div className={cn(railExpanded ? 'block' : 'hidden lg:block')}>
          <ConsoleRoleSwitch me={me} current="admin" />
        </div>
        <button
          onClick={() => setRailExpanded((v) => !v)}
          aria-label={t('nav.expand')}
          className="mt-2 flex items-center gap-3 rounded-xl bg-white/[0.08] px-3 py-[11px] text-[13px] font-semibold text-mist/80 hover:text-mist lg:hidden"
        >
          <span className="grid w-5 flex-none place-items-center">
            <ChevronRight
              className={cn('h-4 w-4 transition-transform', railExpanded && 'rotate-180')}
              aria-hidden
            />
          </span>
          <span className={cn(railExpanded ? 'block' : 'hidden')}>{t('nav.collapse')}</span>
        </button>
        <div className="mt-3.5 flex items-center gap-2.5 border-t border-mist/10 px-1.5 pt-3.5">
          <div className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full bg-lime">
            <span className="font-display text-[13px] font-extrabold text-forest">{initials}</span>
          </div>
          <div className={cn('min-w-0 flex-1', railExpanded ? 'block' : 'hidden lg:block')}>
            <p className="truncate text-[13px] font-semibold text-mist">{me.name}</p>
            <p className="mt-px text-[11.5px] text-mist/60">{t('portalRole')}</p>
          </div>
          <button
            onClick={() => void signOut()}
            aria-label={t('signOut')}
            title={t('signOut')}
            className={cn(
              'flex-none rounded-lg p-1.5 text-mist/60 hover:bg-white/10 hover:text-mist',
              railExpanded ? 'block' : 'hidden lg:block',
            )}
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            aria-label={t('nav.close')}
            onClick={() => setDrawerOpen(false)}
            className="animate-fade-in absolute inset-0 bg-forest/50"
          />
          <aside className="animate-drawer-in absolute inset-y-0 left-0 flex w-[290px] flex-col bg-forest px-4 py-6">
            <div className="flex items-start justify-between">
              <SidebarBrand t={t} showLabels />
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label={t('nav.close')}
                className="rounded-lg p-1.5 text-mist/60 hover:text-mist"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              {nav.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-[13px] text-[15px] font-semibold',
                      active ? 'bg-lime/[0.18] text-lime' : 'text-mist/75',
                    )}
                  >
                    <Icon className="h-5 w-5 flex-none" aria-hidden />
                    <span className="flex-1">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="flex-1" />
            <ConsoleRoleSwitch me={me} current="admin" onNavigate={() => setDrawerOpen(false)} />
            <div className="mt-3 flex justify-start">
              <LocaleToggle />
            </div>
            <div className="mt-3.5 flex items-center gap-2.5 border-t border-mist/10 px-1.5 pt-3.5">
              <div className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full bg-lime">
                <span className="font-display text-[13px] font-extrabold text-forest">
                  {initials}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-mist">{me.name}</p>
                <p className="mt-px text-[11.5px] text-mist/60">{t('portalRole')}</p>
              </div>
              <button
                onClick={() => void signOut()}
                aria-label={t('signOut')}
                className="flex-none rounded-lg p-1.5 text-mist/60 hover:text-mist"
              >
                <LogOut className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-40 flex items-center gap-3 bg-forest px-4 py-3.5 md:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label={t('nav.menu')}
            className="grid h-10 w-10 place-items-center rounded-xl bg-white/10"
          >
            <Menu className="h-[18px] w-[18px] text-mist" aria-hidden />
          </button>
          <p className="flex-1 truncate font-display text-lg font-extrabold text-mist">
            {current?.label ?? 'Guri'}
          </p>
          <NotificationBell locale={locale} />
          <div className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full bg-lime">
            <span className="font-display text-[13px] font-extrabold text-forest">{initials}</span>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-16 pt-5 md:px-6 md:pt-7 lg:px-10 lg:pt-9">
          <div className="mb-5 hidden items-center justify-end gap-2 md:flex">
            <NotificationBell locale={locale} />
            <LocaleToggle />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function SidebarBrand({
  t,
  showLabels,
}: {
  t: ReturnType<typeof useTranslations<'admin'>>;
  showLabels: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 px-2.5 pb-6">
      <div className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-lime">
        <span className="font-display text-[17px] font-extrabold text-forest">G</span>
      </div>
      <div className={cn('min-w-0', showLabels ? 'block' : 'hidden lg:block')}>
        <p className="font-display text-[17px] font-extrabold leading-tight text-mist">
          {t('brand')}
        </p>
        <p className="mt-px text-[11.5px] text-mist/60">{t('portal')}</p>
      </div>
    </div>
  );
}
