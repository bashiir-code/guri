'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStatus } from '@/hooks/use-auth-status';
import { timeAgo } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface BellData {
  unread: number;
  items: Array<{
    id: string;
    template: string;
    payload: Record<string, unknown>;
    readAt: string | null;
    createdAt: string;
  }>;
}

// The in-app notifications bell (§7). Renders the notifications table
// bilingually from template + payload; marks everything read on open.
export function NotificationBell({ locale }: { locale: string }) {
  const t = useTranslations('notifications');
  const { isSignedIn } = useAuthStatus();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery<BellData>({
    queryKey: ['notifications'],
    queryFn: () => api('/me/notifications'),
    enabled: isSignedIn,
    refetchInterval: 60_000,
  });

  // Optimistic badge clear: on 3G the two round-trips (mutate, then refetch)
  // left the unread count visibly stale after opening the panel. Zero it in
  // the cache immediately and roll back to the snapshot if the server says
  // no — mark-read is cosmetic state, not deal/audit state, so a brief
  // optimistic value is safe (unlike state-machine transitions, which must
  // never render before the server confirms). Items keep their unread
  // highlight until the settled refetch returns server truth.
  const markRead = useMutation({
    mutationFn: () => api('/me/notifications/read', { method: 'POST', body: {} }),
    onMutate: async () => {
      // Stop the 60s poll (or any in-flight refetch) from clobbering the
      // optimistic write with a stale response.
      await qc.cancelQueries({ queryKey: ['notifications'] });
      const previous = qc.getQueryData<BellData>(['notifications']);
      qc.setQueryData<BellData>(['notifications'], (old) => (old ? { ...old, unread: 0 } : old));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(['notifications'], context.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  if (!isSignedIn) return null;
  const unread = data?.unread ?? 0;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) markRead.mutate();
  }

  // Each template renders its own bilingual copy; unknown params are ignored.
  function label(template: string, payload: Record<string, unknown>) {
    return t.has(`items.${template}`)
      ? t(`items.${template}`, payload as Record<string, string | number>)
      : t('items.generic');
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        aria-label={t('title')}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border bg-card text-forest transition-colors hover:bg-muted"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unread > 0 && (
          <span className="animate-pop absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-forest px-1 text-[10px] font-bold text-mist">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button aria-label="close" className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Mobile: pinned to the viewport with side margins so it can never
              overflow the screen. Tablet/desktop: anchored under the bell. */}
          <div className="animate-rise-in fixed inset-x-3 top-16 z-50 max-h-[70dvh] overflow-y-auto rounded-card border bg-card p-2 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">
            <p className="px-3 py-2 font-display text-sm font-bold text-forest">{t('title')}</p>
            {!data?.items.length && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('empty')}</p>
            )}
            <ul className="space-y-1">
              {data?.items.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    'rounded-xl px-3 py-2 text-sm',
                    n.readAt ? 'text-muted-foreground' : 'bg-mist text-forest',
                  )}
                >
                  <p>{label(n.template, n.payload)}</p>
                  <p className="text-xs text-muted-foreground">{timeAgo(n.createdAt, locale)}</p>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
