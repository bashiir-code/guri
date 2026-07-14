'use client';

import { useLocale } from 'next-intl';
import { LegalTitle, Prose } from '@/components/legal-ui';

export default function CookiePage() {
  const locale = useLocale();
  return locale === 'so' ? <CookieSo /> : <CookieEn />;
}

function CookieEn() {
  return (
    <>
      <LegalTitle title="Cookie Policy" subtitle="Guri uses only essential cookies." />
      <Prose>
        <h2>Essential cookies</h2>
        <p>
          Guri sets a single category of cookie: the <strong>sign-in session</strong>, managed by our
          authentication provider (Clerk). It keeps you logged in as you move between pages. Without
          it, signing in would not work, so it does not require consent.
        </p>

        <h2>No tracking or advertising</h2>
        <p>
          We do <strong>not</strong> use advertising, marketing, or third-party analytics cookies, and
          we do not build advertising profiles. That is why the cookie notice is an acknowledgement,
          not a tracking opt-in — nothing is loaded when you dismiss it.
        </p>

        <h2>Local storage</h2>
        <p>
          We use your browser&rsquo;s local storage for small preferences only — for example,
          remembering that you dismissed the cookie notice and your language choice. This never leaves
          your device.
        </p>

        <h2>Managing cookies</h2>
        <p>
          You can clear or block cookies in your browser settings, but blocking the essential session
          cookie will prevent you from signing in. See our <a href="/legal/privacy">Privacy Policy</a>{' '}
          for how we handle personal data.
        </p>
      </Prose>
    </>
  );
}

function CookieSo() {
  return (
    <>
      <LegalTitle title="Qaanuunka Cookie-ga" subtitle="Guri wuxuu isticmaalaa cookie muhiim ah oo keliya." />
      <Prose>
        <h2>Cookie-yada muhiimka ah</h2>
        <p>
          Guri wuxuu dhigaa hal nooc oo cookie ah: <strong>fadhiga gelitaanka</strong>, oo uu maamulo
          adeegga gelitaanka (Clerk). Wuxuu ku sii haystaa gelitaanka intaad boggaga dhex socoto. La
          &rsquo;aantiis gelitaanku shaqayn maayo, sidaas darteed oggolaansho uma baahna.
        </p>

        <h2>Dabagal ama xayeysiis ma jiro</h2>
        <p>
          Ma isticmaalno cookie xayeysiis, suuq-geyn, ama falanqayn dhinac saddexaad ah, mana dhisno
          xog xayeysiis. Sidaas darteed ogeysiiska cookie-gu waa qiro, ma aha oggolaansho dabagal.
        </p>

        <h2>Kaydka maxalliga ah</h2>
        <p>
          Waxaan u isticmaalnaa kaydka browser-kaaga doorbidyo yaryar oo keliya — sida xusuusashada
          inaad xidhay ogeysiiska iyo luqadda aad dooratay. Tani weligeed kama baxdo qalabkaaga.
        </p>

        <h2>Maaraynta cookie-yada</h2>
        <p>
          Waad ka nadiifin ama xannibi kartaa cookie-yada dejinta browser-ka, laakiin xannibaadda
          cookie-ga muhiimka ah waxay kaa hor istaagaysaa gelitaanka. Eeg{' '}
          <a href="/legal/privacy">Qaanuunka Asturnaanta</a>.
        </p>
      </Prose>
    </>
  );
}
