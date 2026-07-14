import { type ReactNode } from 'react';
import { PublicHeader } from '@/components/public-header';
import { SiteFooter } from '@/components/site-footer';

// Shared chrome for every legal / compliance page: the public header, a
// readable single column, and the footer with the full legal link set.
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-4 lg:px-6 lg:pb-12">
      <PublicHeader />
      <article className="animate-rise-in rounded-card border bg-card p-6 lg:p-10">
        {children}
      </article>
      <SiteFooter />
    </div>
  );
}
