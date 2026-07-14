'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { Link } from '@/i18n/navigation';

const STORAGE_KEY = 'guri-cookie-notice';

// Cookie notice (GDPR/ePrivacy). Guri sets only essential cookies (the Clerk
// sign-in session) and no advertising/analytics cookies, so this is an
// acknowledgement, not a tracking-consent gate — nothing is loaded on the back
// of a click. Dismissal is remembered in localStorage.
export function CookieConsent() {
  const t = useTranslations('cookies');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // localStorage unavailable (private mode) — just don't show it.
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // ignore
    }
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label={t('message')}
      className="animate-rise-in fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-xl rounded-card border border-forest/10 bg-card p-4 shadow-xl sm:inset-x-auto sm:right-4 sm:left-auto sm:w-[380px]"
    >
      <div className="flex items-start gap-3">
        <p className="flex-1 text-[13px] leading-relaxed text-slate_brand">
          {t('message')}{' '}
          <Link href="/legal/cookies" className="font-semibold text-forest underline underline-offset-2">
            {t('learnMore')}
          </Link>
        </p>
        <button
          onClick={dismiss}
          aria-label={t('accept')}
          className="flex-none rounded-lg p-1 text-muted-foreground hover:text-forest"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <button
        onClick={dismiss}
        className="mt-3 w-full rounded-full bg-lime py-2 text-sm font-bold text-forest transition-transform hover:brightness-95 active:scale-[0.98] motion-reduce:transition-none"
      >
        {t('accept')}
      </button>
    </div>
  );
}
