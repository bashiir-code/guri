'use client';

import { useState, type ReactNode } from 'react';
import { useClerk } from '@clerk/nextjs';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import {
  ChevronRight,
  Home,
  Inbox,
  KeyRound,
  LayoutGrid,
  LogOut,
  Menu,
  Users,
  UserRound,
  X,
} from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useMe } from '@/hooks/use-me';
import { Button } from '@/components/ui/button';
import { ConsoleRoleSwitch } from '@/components/console-role-switch';
import { NotificationBell } from '@/components/notification-bell';
import { LocaleToggle } from '@/components/public-header';
import { cn } from '@/lib/utils';

// The agency console (§5), in the Guri Agency Console design chrome: forest
// sidebar on desktop, collapsible icon rail on tablet, hamburger + drawer on
// the phone. Every read/write stays agency-scoped by the API guard (rule 3);
// this file is chrome only and moves no deal/lease state.
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('console');
  const { data: me, isLoading } = useMe();
  const pathname = usePathname();
  const locale = useLocale();
  const { signOut } = useClerk();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);

  const isStaff = (me?.roles.agencyMemberships.length ?? 0) > 0;
  // Leads badge = unanswered requests (§5). Only fetched for staff.
  const { data: dash } = useQuery<{ unansweredRequests: number }>({
    queryKey: ['dashboard'],
    queryFn: () => api('/agency/dashboard'),
    enabled: isStaff,
  });
  const leadBadge = dash?.unansweredRequests ?? 0;

  if (isLoading) return <p className="p-8 text-muted-foreground">{t('loading')}</p>;
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
    { href: '/console', label: t('nav.dashboard'), icon: LayoutGrid, exact: true, badge: 0 },
    { href: '/console/listings', label: t('nav.listings'), icon: Home, badge: 0 },
    { href: '/console/leads', label: t('nav.leads'), icon: Inbox, badge: leadBadge },
    { href: '/console/tenancies', label: t('nav.tenancies'), icon: KeyRound, badge: 0 },
    { href: '/console/owners', label: t('nav.owners'), icon: UserRound, badge: 0 },
    ...(isAdmin
      ? [{ href: '/console/staff', label: t('nav.staff'), icon: Users, badge: 0 }]
      : []),
  ];
  const current = nav.find((item) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href),
  );
  const initials =
    (me.name ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || 'G';
  const roleLabel = t(`roles.${membership.role}`);

  const navLink = (item: (typeof nav)[number], onClick?: () => void, big = false, showLabel = true) => {
    const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        title={item.label}
        onClick={onClick}
        className={cn(
          'flex items-center gap-3 rounded-xl font-semibold',
          big ? 'px-3 py-[13px] text-[15px]' : 'px-3 py-[11px] text-sm',
          active ? 'bg-lime/[0.18] text-lime' : 'text-mist/75 hover:bg-white/5 hover:text-mist',
        )}
      >
        <Icon className="h-5 w-5 flex-none" aria-hidden />
        <span className={cn('flex-1 whitespace-nowrap', showLabel ? 'block' : 'hidden lg:block')}>
          {item.label}
        </span>
        {item.badge > 0 && (
          <span
            className={cn(
              'grid h-5 min-w-[20px] flex-none place-items-center rounded-full bg-lime px-1.5 text-[11.5px] font-bold text-forest',
              showLabel ? 'flex' : 'hidden lg:grid',
            )}
          >
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

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
          {nav.map((item) => navLink(item, undefined, false, railExpanded))}
        </nav>
        <div className="flex-1" />
        <div className={cn(railExpanded ? 'block' : 'hidden lg:block')}>
          <ConsoleRoleSwitch me={me} current="agency" />
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
            <p className="mt-px text-[11.5px] text-mist/60">{roleLabel}</p>
          </div>
          <button
            onClick={() => void signOut()}
            aria-label={t('nav.signOut')}
            title={t('nav.signOut')}
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
              {nav.map((item) => navLink(item, () => setDrawerOpen(false), true, true))}
            </nav>
            <div className="flex-1" />
            <ConsoleRoleSwitch me={me} current="agency" onNavigate={() => setDrawerOpen(false)} />
            <div className="mt-3 flex justify-start">
              <LocaleToggle />
            </div>
            <div className="mt-3.5 flex items-center gap-2.5 border-t border-mist/10 px-1.5 pt-3.5">
              <div className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full bg-lime">
                <span className="font-display text-[13px] font-extrabold text-forest">{initials}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-mist">{me.name}</p>
                <p className="mt-px text-[11.5px] text-mist/60">{roleLabel}</p>
              </div>
              <button
                onClick={() => void signOut()}
                aria-label={t('nav.signOut')}
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
  t: ReturnType<typeof useTranslations<'console'>>;
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
        <p className="mt-px text-[11.5px] text-mist/60">{t('subtitle')}</p>
      </div>
    </div>
  );
}
