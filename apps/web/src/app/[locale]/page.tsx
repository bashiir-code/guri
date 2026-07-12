import { SignedIn, SignedOut } from '@/components/auth-visibility';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { Link } from '@/i18n/navigation';
import { ProfileCard } from '@/components/profile-card';
import { PublicHeader } from '@/components/public-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <Home />;
}

function Home() {
  const t = useTranslations('home');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-4 py-4 md:max-w-3xl lg:max-w-6xl lg:px-6">
      <PublicHeader />

      <div className="lg:grid lg:flex-1 lg:grid-cols-2 lg:items-center lg:gap-10">
        {/* Hero — forest block with the lime headline, per the Guri design. */}
        <section className="animate-rise-in rounded-card bg-forest px-6 py-8 lg:px-10 lg:py-14">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-lime">{t('eyebrow')}</p>
          <h1 className="mt-3 font-display text-4xl font-extrabold leading-[1.05] text-mist lg:text-5xl">
            {t('hero1')}
            <br />
            <span className="text-lime">{t('hero2')}</span>
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-mist/80 lg:text-base">
            {t('sub')}
          </p>
          <Link
            href="/browse"
            className="mt-6 inline-flex h-12 items-center rounded-full bg-lime px-8 font-semibold text-forest transition-transform duration-150 hover:brightness-95 active:scale-[0.97] motion-reduce:transition-none"
          >
            {t('browseCta')}
          </Link>
        </section>

        <section
          className="mt-6 animate-rise-in lg:mt-0"
          style={{ animationDelay: '120ms' }}
        >
          <SignedIn>
            <ProfileCard />
          </SignedIn>
          <SignedOut>
            <AuthPrompt />
          </SignedOut>
        </section>
      </div>
    </main>
  );
}

// Signed-out card: Clerk's hosted flow does the heavy lifting — Google first,
// email + password as fallback. No SMS anywhere (rule 12).
function AuthPrompt() {
  const t = useTranslations('signin');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button asChild className="w-full" size="lg">
          <Link href="/sign-in">{t('signInCta')}</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href="/sign-up">{t('signUpCta')}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
