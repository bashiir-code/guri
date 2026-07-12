'use client';

import type { ReactNode } from 'react';

// Responsive overlay: a bottom sheet on phones (sheetUp spring), a centered
// dialog on tablet/laptop (pop spring) — one component, per-device rendering.
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        aria-label="close"
        className="absolute inset-0 h-full w-full bg-forest/40 animate-fade-in"
        onClick={onClose}
      />
      <div className="relative max-h-[85dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[28px] border-t bg-card p-5 pb-8 shadow-xl animate-sheet-up md:max-w-md md:rounded-[24px] md:border md:pb-5 md:animate-pop">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted md:hidden" />
        {title && <h2 className="mb-4 font-display text-xl font-bold text-forest">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
