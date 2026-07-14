'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { Me } from '@/lib/api';
import { cn } from '@/lib/utils';

// §2 v1.10: one account, several roles — the design's sidebar switch block,
// built from the server-resolved roles (never claimed by the client). Renders
// nothing for single-role users, exactly like the profile role list. Shared by
// every console sidebar (owner, admin, agency); `current` marks the console
// this block is rendered inside.
export function ConsoleRoleSwitch({
  me,
  current,
  onNavigate,
}: {
  me: Me;
  current: 'customer' | 'owner' | 'agency' | 'admin';
  onNavigate?: () => void;
}) {
  const t = useTranslations('roles');
  const isStaff = me.roles.agencyMemberships.length > 0;
  const surfaces = [
    { key: 'customer', label: t('customer'), href: '/browse' },
    ...(me.roles.owner ? [{ key: 'owner', label: t('owner'), href: '/owner' }] : []),
    ...(isStaff ? [{ key: 'agency', label: t('agency'), href: '/console' }] : []),
    ...(me.roles.platformAdmin ? [{ key: 'admin', label: t('admin'), href: '/admin' }] : []),
  ];
  if (surfaces.length < 2) return null;

  return (
    <div className="flex flex-col gap-[3px] rounded-[14px] bg-white/[0.06] p-2.5">
      <p className="mb-[3px] px-1.5 text-[10.5px] font-bold text-mist/50">{t('switch')}</p>
      {surfaces.map((s) => (
        <Link
          key={s.key}
          href={s.href}
          onClick={onNavigate}
          className={cn(
            'flex items-center rounded-[9px] px-2 py-[7px] text-[12.5px] font-semibold',
            s.key === current ? 'bg-lime/[0.18] text-lime' : 'text-mist/75 hover:text-mist',
          )}
        >
          {s.label}
        </Link>
      ))}
    </div>
  );
}
