import { SignIn } from '@clerk/nextjs';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { AuthShell } from '@/components/auth-shell';

// Clerk's prebuilt component (rule 12), wrapped in the Guri brand chrome:
// "Continue with Google" primary, email + password fallback, no phone/SMS.
export default function SignInPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return (
    <AuthShell>
      <SignIn
        routing="hash"
        signUpUrl={`/${locale}/sign-up`}
        fallbackRedirectUrl={`/${locale}/welcome`}
        appearance={{ elements: { rootBox: 'w-full', cardBox: 'w-full', card: '!w-full' } }}
      />
    </AuthShell>
  );
}
