import { SignIn } from '@clerk/nextjs';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { PublicHeader } from '@/components/public-header';

// Clerk's prebuilt component: "Continue with Google" primary, email +
// password fallback (configured in the Clerk dashboard — no phone/SMS).
export default function SignInPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[480px] px-4 py-4">
      <PublicHeader />
      <div className="flex justify-center py-6 animate-rise-in">
        <SignIn
          routing="hash"
          signUpUrl={`/${locale}/sign-up`}
          fallbackRedirectUrl={`/${locale}/welcome`}
        />
      </div>
    </main>
  );
}
