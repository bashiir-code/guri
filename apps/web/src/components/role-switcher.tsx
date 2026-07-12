'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useMe } from '@/hooks/use-me';

// §2 v1.10: one account, several roles — a header switcher, never a second
// account. Renders nothing for single-role users.
export function RoleSwitcher() {
  const t = useTranslations('roles');
  const router = useRouter();
  const pathname = usePathname();
  const { data: me } = useMe();

  if (!me) return null;
  const isStaff = me.roles.agencyMemberships.length > 0;

  const surfaces = [
    { value: 'customer', label: t('customer'), href: '/browse' },
    ...(me.roles.owner ? [{ value: 'owner', label: t('owner'), href: '/owner' }] : []),
    ...(isStaff ? [{ value: 'agency', label: t('agency'), href: '/console' }] : []),
    ...(me.roles.platformAdmin ? [{ value: 'admin', label: t('admin'), href: '/admin' }] : []),
  ];
  if (surfaces.length < 2) return null;

  const current = pathname.startsWith('/console')
    ? 'agency'
    : pathname.startsWith('/admin')
      ? 'admin'
      : pathname.startsWith('/owner')
        ? 'owner'
        : 'customer';

  return (
    <select
      aria-label={t('switch')}
      value={current}
      onChange={(e) => {
        const target = surfaces.find((s) => s.value === e.target.value);
        if (target) router.push(target.href);
      }}
      className="h-8 appearance-none rounded-full border bg-card px-3 pr-6 text-xs font-semibold text-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {surfaces.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
