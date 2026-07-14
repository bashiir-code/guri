import { SignUp } from '@clerk/nextjs';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { AuthShell } from '@/components/auth-shell';

// Signing up always makes you a customer (rule 15) — Clerk's prebuilt widget
// in the Guri brand chrome. No "sign up as an agency" path exists.
export default function SignUpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return (
    <AuthShell>
      <SignUp
        routing="hash"
        signInUrl={`/${locale}/sign-in`}
        fallbackRedirectUrl={`/${locale}/welcome`}
        appearance={{ elements: { rootBox: 'w-full', cardBox: 'w-full', card: '!w-full' } }}
      />
    </AuthShell>
  );
}
