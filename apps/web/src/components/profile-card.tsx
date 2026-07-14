'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useClerk } from '@clerk/nextjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Briefcase, ChevronRight, Home, Search, ShieldCheck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { api, ApiError, type Me } from '@/lib/api';
import { useMe } from '@/hooks/use-me';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BottomSheet } from '@/components/bottom-sheet';

// Post-signup onboarding (§5): Clerk handled the credentials; here we collect
// name + phone. Phone is contact data for calls/WhatsApp — never verified,
// never a credential (rule 14).
export function ProfileCard() {
  const t = useTranslations('profile');
  const tf = useTranslations('footer');
  const tl = useTranslations('legal');
  const qc = useQueryClient();
  const { signOut } = useClerk();
  const { data: me, isLoading, isFetching, refetch } = useMe();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  useEffect(() => {
    if (me) {
      setName(me.name ?? '');
      setPhone(me.phone ?? '');
    }
  }, [me]);

  const save = useMutation({
    mutationFn: () =>
      api<Me>('/me', {
        method: 'PATCH',
        body: { name: name.trim() || undefined, phone: phone.trim() || undefined },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['me'] }),
  });

  // §16 leave-platform — blocked while a live lease exists; on success the
  // account is deactivated and we sign out.
  const [leaveOpen, setLeaveOpen] = useState(false);
  const leave = useMutation({
    mutationFn: () => api('/me/leave', { method: 'POST', body: {} }),
    onSuccess: () => void signOut(),
  });
  const leaveBlocked =
    leave.error instanceof ApiError && leave.error.status === 409 ? leave.error.message : null;

  if (isLoading) {
    return <Card className="animate-pulse"><CardContent className="h-48 p-6" /></Card>;
  }
  // The /me call resolved without data — the API is unreachable or erroring
  // (e.g. a cold container or a CORS/env misconfig). Show a retry instead of an
  // endless skeleton so the state is visible and self-healing.
  if (!me) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6 text-center">
          <p className="text-sm text-slate_brand">{t('loadError')}</p>
          <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
            {isFetching ? t('loadRetrying') : t('loadRetry')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isStaff = me.roles.agencyMemberships.length > 0;
  const needsProfile = !me.name || !me.phone;

  // Avatar initials, per the reference profile screen (forest circle, lime).
  const initials =
    (me.name ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '☺';

  return (
    <div className="animate-rise-in">
      {/* profile header — avatar circle + name + contact phone */}
      <div className="mb-5 flex items-center gap-4 px-1">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-forest font-display text-xl font-extrabold text-lime">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-2xl font-bold text-forest">
            {me.name ?? t('title')}
          </p>
          <p className="truncate text-sm text-slate_brand">
            {me.phone ?? (needsProfile ? t('completeHint') : t('subtitle'))}
          </p>
        </div>
      </div>

      {/* personal details — same form, presented as its own card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{t('personalDetails')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">{t('name')}</Label>
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-phone">{t('phone')}</Label>
            <Input
              id="profile-phone"
              type="tel"
              placeholder="+2526xxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('phoneHint')}</p>
          </div>
          {save.isError && <p className="text-sm text-destructive">{t('saveFailed')}</p>}
          <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isSuccess ? t('saved') : t('save')}
          </Button>
        </CardContent>
      </Card>

      {/* shortcut list — chevron rows, like the reference card list */}
      <Card className="mt-4">
        <CardContent className="divide-y p-0">
          <ProfileRow href="/requests" label={t('myRequests')} />
          <ProfileRow href="/legal" label={tl('indexTitle')} />
          <ProfileRow href="/legal/contact" label={tf('contact')} />
        </CardContent>
      </Card>

      {/* Switch role (§2, rule 15): one account, several surfaces. Roles are
          resolved server-side by /me — this only presents the surfaces this
          person already has; nobody can grant themselves anything here. */}
      <Card className="mt-4">
        <CardHeader className="pb-1">
          <CardTitle className="text-lg">{t('switchRole')}</CardTitle>
          <CardDescription>{t('switchRoleHint')}</CardDescription>
        </CardHeader>
        <CardContent className="divide-y p-0 pt-1">
          <RoleRow
            href="/browse"
            icon={<Search className="h-5 w-5" aria-hidden />}
            label={t('roleCustomer')}
            description={t('roleCustomerDesc')}
          />
          {me.roles.owner && (
            <RoleRow
              href="/owner"
              icon={<Home className="h-5 w-5" aria-hidden />}
              label={t('roleOwner')}
              description={t('roleOwnerDesc')}
            />
          )}
          {isStaff && (
            <RoleRow
              href="/console"
              icon={<Briefcase className="h-5 w-5" aria-hidden />}
              label={t('goConsole')}
              description={t('roleAgencyDesc')}
            />
          )}
          {me.roles.platformAdmin && (
            <RoleRow
              href="/admin"
              icon={<ShieldCheck className="h-5 w-5" aria-hidden />}
              label={t('goAdmin')}
              description={t('roleAdminDesc')}
            />
          )}
        </CardContent>
      </Card>

      <div className="mt-4 space-y-2">
        <Button variant="ghost" className="w-full" onClick={() => void signOut()}>
          {t('signOut')}
        </Button>
        <button
          className="w-full pt-1 text-center text-xs text-muted-foreground underline underline-offset-4 hover:text-destructive"
          onClick={() => {
            leave.reset();
            setLeaveOpen(true);
          }}
        >
          {t('leave.link')}
        </button>
      </div>

      <BottomSheet open={leaveOpen} onClose={() => setLeaveOpen(false)} title={t('leave.title')}>
        <div className="space-y-4">
          <p className="text-sm text-slate_brand">{t('leave.body')}</p>
          {leaveBlocked && (
            <p className="rounded-xl bg-amber_reserved/20 px-4 py-3 text-sm text-forest">
              {t(`leave.blocked.${leaveBlocked}`)}
            </p>
          )}
          {leave.isError && !leaveBlocked && (
            <p className="text-sm text-destructive">{t('leave.failed')}</p>
          )}
          <Button
            variant="outline"
            className="w-full border-destructive text-destructive hover:bg-destructive/5"
            disabled={leave.isPending}
            onClick={() => leave.mutate()}
          >
            {t('leave.confirm')}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setLeaveOpen(false)}>
            {t('leave.cancel')}
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

// One tappable row in the profile shortcut list (reference: label + chevron,
// hairline separators).
function ProfileRow({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-5 py-4 text-sm font-medium text-forest transition-colors hover:bg-muted/50"
    >
      {label}
      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}

// A role surface this account already has: icon, name, what it's for.
function RoleRow({
  href,
  icon,
  label,
  description,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-muted/50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mist text-forest">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-forest">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
