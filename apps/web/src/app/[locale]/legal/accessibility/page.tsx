'use client';

import { useLocale } from 'next-intl';
import { LegalTitle, Prose } from '@/components/legal-ui';

export default function AccessibilityPage() {
  const locale = useLocale();
  return locale === 'so' ? <A11ySo /> : <A11yEn />;
}

function A11yEn() {
  return (
    <>
      <LegalTitle title="Accessibility" subtitle="We want Guri to work for everyone." />
      <Prose>
        <h2>Our commitment</h2>
        <p>
          Guri aims to meet the <strong>Web Content Accessibility Guidelines (WCAG) 2.1 Level AA</strong>.
          Accessibility is an ongoing effort and we improve the app continuously.
        </p>

        <h2>What we support</h2>
        <ul>
          <li>Keyboard navigation with a &ldquo;skip to content&rdquo; link and visible focus.</li>
          <li>Screen-reader labels on icons, buttons, and interactive controls.</li>
          <li>Semantic headings and landmarks so assistive tech can navigate structure.</li>
          <li>A correct page language (Somali or English) for screen-reader pronunciation.</li>
          <li>Colour contrast that meets AA for text, and layouts that reflow on phone, tablet, and desktop.</li>
          <li>Respect for &ldquo;reduce motion&rdquo; system settings.</li>
        </ul>

        <h2>Known limitations</h2>
        <p>
          Some third-party components (for example the sign-in widget and PDF documents) are outside
          our direct control; we choose accessible providers and report issues upstream.
        </p>

        <h2>Report a problem</h2>
        <p>
          If you hit an accessibility barrier, tell us at{' '}
          <a href="mailto:support@getguri.com">support@getguri.com</a> and we&rsquo;ll work to fix it.
          See also <a href="/legal/contact">Contact &amp; support</a>.
        </p>
      </Prose>
    </>
  );
}

function A11ySo() {
  return (
    <>
      <LegalTitle title="Helitaanka" subtitle="Waxaan rabnaa Guri inuu qof walba u shaqeeyo." />
      <Prose>
        <h2>Ballanqaadkeenna</h2>
        <p>
          Guri wuxuu ku dadaalayaa inuu buuxiyo <strong>Tilmaamaha Helitaanka Content-ka Webka (WCAG)
          2.1 Heerka AA</strong>. Helitaanku waa dadaal socda oo aan si joogto ah u hagaajinno.
        </p>

        <h2>Waxa aan taageerno</h2>
        <ul>
          <li>Navigation furaha keeliya oo leh xiriir &ldquo;u bood content-ka&rdquo; iyo diirad muuqata.</li>
          <li>Sumado screen-reader oo saaran astaamaha, badhamada, iyo qalabka.</li>
          <li>Cinwaanno iyo qaabab semantic ah si tignoolajiyada caawinta u socoto.</li>
          <li>Luqad bog sax ah (Soomaali ama Ingiriisi) si loo saxo ku-dhawaaqidda.</li>
          <li>Kala-duwanaanshaha midabka oo buuxiya AA, iyo qaabab ku habboon taleefan, tablet, iyo desktop.</li>
          <li>Ixtiraamka dejinta &ldquo;dhaqdhaqaaq yaree&rdquo;.</li>
        </ul>

        <h2>Xaddidaadaha la og yahay</h2>
        <p>
          Qaar ka mid ah qaybaha dhinac saddexaad (tusaale widget-ka gelitaanka iyo dukumentiga PDF)
          gacantayada tooska ah kama baxaan; waxaan dooranaa bixiyeyaal la heli karo.
        </p>

        <h2>Soo sheeg dhibaato</h2>
        <p>
          Haddii aad la kulanto caqabad helitaan, nagu soo sheeg{' '}
          <a href="mailto:support@getguri.com">support@getguri.com</a>. Eeg sidoo kale{' '}
          <a href="/legal/contact">Xiriir &amp; taageero</a>.
        </p>
      </Prose>
    </>
  );
}
