'use client';

import type { ComponentType, ReactNode } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export interface BottomNavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** match this route exactly instead of by prefix */
  exact?: boolean;
}

// The phone bottom nav from the Guri design: dark forest bar, icon + label per
// item, the active tab in lime. Hidden from md up (top navs take over there).
// Purely presentational — every destination already exists.
export function BottomNav({
  items,
  trailing,
}: {
  items: BottomNavItem[];
  trailing?: ReactNode; // e.g. a "More" button opening a sheet (console)
}) {
  const pathname = usePathname();
  return (
    <>
      <nav
        data-bottom-nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-forest pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 md:hidden"
      >
        <ul className="mx-auto flex max-w-[480px] items-stretch justify-around">
          {items.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href} className="min-w-0 flex-1">
                <Link
                  href={item.href}
                  className={cn(
                    'flex flex-col items-center gap-1 px-1 py-1.5 text-[11px] font-medium transition-transform duration-150 active:scale-95 motion-reduce:transition-none',
                    active ? 'text-lime' : 'text-mist/70 hover:text-mist',
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
          {trailing}
        </ul>
      </nav>
    </>
  );
}
