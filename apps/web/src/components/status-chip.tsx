'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

// White pill + colored dot, per the Guri design (overlays photos cleanly).
// Amber = reserved, lime = available, forest = rented, slate = draft.
const dot: Record<string, string> = {
  draft: 'bg-slate_brand/60',
  available: 'bg-lime',
  reserved: 'bg-amber_reserved',
  rented: 'bg-forest',
};

export function StatusChip({
  status,
  publishedAt,
}: {
  status: 'available' | 'reserved' | 'rented';
  publishedAt: string | Date | null;
}) {
  const t = useTranslations('listings.status');
  const effective = publishedAt ? status : 'draft';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-black/5 bg-white/95 px-3 py-1 text-xs font-semibold text-forest shadow-sm">
      <span className={cn('h-2 w-2 rounded-full', dot[effective])} aria-hidden />
      {t(effective)}
    </span>
  );
}
