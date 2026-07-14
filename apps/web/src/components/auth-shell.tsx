'use client';

import { type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { LocaleToggle } from '@/components/public-header';

// Branded chrome for the auth surfaces (SPEC §5). Clerk's prebuilt widget
// (rule 12 — never hand-rolled) sits on the right; the left is a Forest brand
// panel with the trust promise. Photo-first, bold-fintech, bilingual.
export function AuthShell({ children }: { children: ReactNode }) {
  const t = useTranslations('auth');
  const points = [t('point1'), t('point2'), t('point3')];

  return (
    <div className="flex min-h-dvh bg-mist text-forest">
      {/* Brand panel — desktop only */}
      <aside className="relative hidden w-[45%] max-w-[560px] flex-col justify-between overflow-hidden bg-forest p-10 lg:flex xl:p-14">
        <Link href="/" className="relative z-10 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-lime">
            <span className="font-display text-[17px] font-extrabold text-forest">G</span>
          </span>
          <span className="font-display text-[17px] font-extrabold text-mist">Guri</span>
        </Link>

        <div className="relative z-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">{t('tagline')}</p>
          <h1 className="mt-3 font-display text-[40px] font-extrabold leading-[1.05] text-mist xl:text-5xl">
            {t('brandTitle')}
          </h1>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-mist/75">
            {t('brandSubtitle')}
          </p>
          <ul className="mt-8 flex flex-col gap-3">
            {points.map((p) => (
              <li key={p} className="flex items-center gap-3 text-[14px] font-medium text-mist/90">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-lime/20">
                  <Check className="h-3.5 w-3.5 text-lime" aria-hidden />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>

        {/* soft brand glow, no gradients on content — pure decoration */}
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-lime/10 blur-3xl"
        />
      </aside>

      {/* Form side */}
      <main className="flex flex-1 flex-col">
        <div className="flex items-center justify-between px-5 py-5 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-forest">
              <span className="font-display text-[17px] font-extrabold text-lime">G</span>
            </span>
            <span className="font-display text-[17px] font-extrabold text-forest">Guri</span>
          </Link>
          <div className="ml-auto">
            <LocaleToggle />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-12 lg:px-8">
          <div className="animate-rise-in flex w-full max-w-[400px] flex-col items-center">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
