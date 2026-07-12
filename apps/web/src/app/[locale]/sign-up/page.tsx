import { SignUp } from '@clerk/nextjs';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { PublicHeader } from '@/components/public-header';

export default function SignUpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[480px] px-4 py-4">
      <PublicHeader />
      <div className="flex justify-center py-6 animate-rise-in">
        <SignUp
          routing="hash"
          signInUrl={`/${locale}/sign-in`}
          fallbackRedirectUrl={`/${locale}/welcome`}
        />
      </div>
    </main>
  );
}
