'use client';

import { useRef, useState } from 'react';
import { Home } from 'lucide-react';
import { cn } from '@/lib/utils';

// Full-bleed swipe gallery from the Guri design: photos fill the width edge
// to edge, one per page with snap, and dot indicators track the position
// (active dot stretches into a pill). Dots are tappable too.
export function PhotoGallery({ photos, className }: { photos: string[]; className?: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    setActive(Math.min(photos.length - 1, Math.round(el.scrollLeft / el.clientWidth)));
  }

  function goTo(i: number) {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  }

  if (photos.length === 0) {
    return (
      <div className={cn('flex aspect-[4/3] w-full items-center justify-center bg-muted', className)}>
        <Home className="h-14 w-14 text-slate_brand/40" strokeWidth={1.5} aria-hidden />
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      <div
        ref={scroller}
        onScroll={onScroll}
        className="hs flex snap-x snap-mandatory overflow-x-auto"
      >
        {photos.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={url}
            alt=""
            className="aspect-[4/3] w-full shrink-0 snap-center object-cover"
            loading={i === 0 ? 'eager' : 'lazy'}
          />
        ))}
      </div>
      {photos.length > 1 && (
        <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5">
          {photos.map((_, i) => (
            <button
              key={i}
              aria-label={`photo ${i + 1}`}
              onClick={() => goTo(i)}
              className={cn(
                'h-1.5 rounded-full shadow-sm transition-all duration-200 motion-reduce:transition-none',
                i === active ? 'w-5 bg-white' : 'w-1.5 bg-white/60 hover:bg-white/80',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
