'use client';

import { useLocale } from 'next-intl';
import { LegalTitle, Prose, Summary } from '@/components/legal-ui';

export default function PrivacyPage() {
  const locale = useLocale();
  return locale === 'so' ? <PrivacySo /> : <PrivacyEn />;
}

function PrivacyEn() {
  return (
    <>
      <LegalTitle title="Privacy Policy" />
      <Summary>
        In short: Guri collects only what a rental needs. Your email is used to sign in; your phone
        is contact information, never a login. Your national ID or passport is requested only when a
        deal is closing, is encrypted, and is shown to the handling agency through short-lived links
        that are logged. We never sell your data.
      </Summary>
      <Prose>
        <h2>1. Who we are</h2>
        <p>
          Guri (&ldquo;Guri&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) operates a rental marketplace
          for Mogadishu where every home is represented by a verified agency. This policy explains
          what personal data we process and your rights over it. For data-protection questions,
          contact <a href="mailto:privacy@getguri.com">privacy@getguri.com</a>.
        </p>

        <h2>2. Information we collect</h2>
        <h3>Account</h3>
        <p>
          When you create an account, our authentication provider (Clerk) processes your name, email
          address, and — if you use it — your Google sign-in. We store a mirrored user record keyed
          to your account. Your phone number is optional contact data used for calls and WhatsApp; it
          is never used as a login and is never verified by SMS at sign-up.
        </p>
        <h3>Identity documents</h3>
        <p>
          A photo of your national ID or passport is requested <strong>only when a deal is being
          closed</strong>, so the agency can verify the tenant. These documents are encrypted at
          rest, are never public, and are shown to authorised agency staff only through links that
          expire in minutes. Every time a document link is issued it is recorded in an append-only
          audit log.
        </p>
        <h3>Property &amp; deal data</h3>
        <p>
          Listings, viewing requests, deal progress, leases, and agency-recorded payments. Guri does
          not process rent or deposits itself — payments are recorded by agencies off-platform.
        </p>
        <h3>Technical data</h3>
        <p>
          A sign-in session cookie (essential), and server logs that never contain passwords,
          document links, or full identity data.
        </p>

        <h2>3. How we use your data</h2>
        <ul>
          <li>To run the service: publish listings, route your requests to the right agency, track a
            deal, and record leases.</li>
          <li>To verify identity at deal-closing and keep an accountable record of who viewed what.</li>
          <li>To send you deal and viewing updates through in-app notifications and WhatsApp/SMS —
            never marketing, and never to your email.</li>
          <li>To keep the platform secure, prevent fraud, and meet legal obligations.</li>
        </ul>

        <h2>4. Legal bases (GDPR)</h2>
        <p>
          Where GDPR applies we rely on: performance of a contract (running your rental), our
          legitimate interests (security, fraud prevention, service improvement), your consent where
          required, and compliance with legal obligations.
        </p>

        <h2>5. Who we share data with</h2>
        <ul>
          <li><strong>The agency handling your deal</strong> — sees your contact details and, at
            closing, your identity document, so it can verify and represent the tenancy.</li>
          <li><strong>Service providers</strong> — Clerk (authentication), Cloudflare R2 (encrypted
            file storage), and our hosting provider, all acting on our instructions.</li>
          <li>Authorities where required by law.</li>
        </ul>
        <p>We do not sell your personal data or share it for advertising.</p>

        <h2>6. Cookies</h2>
        <p>
          Guri uses only essential cookies (your sign-in session). We do not use advertising or
          analytics cookies. See our <a href="/legal/cookies">Cookie Policy</a>.
        </p>

        <h2>7. Retention &amp; deletion</h2>
        <p>
          We keep personal data only as long as needed to provide the service and meet legal record
          requirements. You can close your account at any time from your profile (&ldquo;Leave
          Guri&rdquo;); this deactivates your profile and schedules your personal data for deletion,
          except records we must retain by law and the append-only audit log required for
          accountability. Closing an account is blocked only while you have a live tenancy.
        </p>

        <h2>8. Your rights</h2>
        <p>
          Subject to local law you may request access to, correction of, deletion of, or a copy of
          your data, and may object to or restrict certain processing. To exercise any right, email{' '}
          <a href="mailto:privacy@getguri.com">privacy@getguri.com</a> or use{' '}
          <a href="/legal/contact">Contact &amp; support</a>. You may also complain to your local
          data-protection authority.
        </p>

        <h2>9. Security</h2>
        <p>
          Identity and ownership documents are encrypted at rest and served only through short-lived,
          access-logged links after a role check. Sessions, password hashing, and lockout are handled
          by our authentication provider.
        </p>

        <h2>10. International transfers &amp; children</h2>
        <p>
          Some providers process data outside your country under appropriate safeguards. Guri is not
          directed to children under 18 and we do not knowingly collect their data.
        </p>

        <h2>11. Changes</h2>
        <p>
          We may update this policy; material changes will be signalled in the app. The date above
          shows the latest revision.
        </p>
      </Prose>
    </>
  );
}

function PrivacySo() {
  return (
    <>
      <LegalTitle title="Qaanuunka Asturnaanta" />
      <Summary>
        Kooban: Guri wuxuu ururiyaa wixii kiro loo baahan yahay oo keliya. Email-kaaga waxaa loo
        isticmaalaa gelitaanka; taleefankaagu waa xog xiriir, weligiis lama isticmaalo sida furaha
        gelitaanka. Aqoonsigaaga qaranka ama baasaboorka waxaa la weydiiyaa marka heshiisku dhamaanayo
        oo keliya, waa la sireeyaa, waxaana wakaaladda lagu tusaa xiriiro gaaban oo la diiwaangeliyo.
        Xogtaada weligeen ma iibinno.
      </Summary>
      <Prose>
        <h2>1. Yaan nahay</h2>
        <p>
          Guri wuxuu maamulaa suuq kiro oo Muqdisho ah oo guri kastaa uu matalo wakaalad la hubiyay.
          Qaanuunkani wuxuu sharraxayaa xogta shakhsiga ah ee aan habaynno iyo xuquuqda aad ku
          leedahay. Su&rsquo;aalaha ilaalinta xogta, la xiriir{' '}
          <a href="mailto:privacy@getguri.com">privacy@getguri.com</a>.
        </p>

        <h2>2. Xogta aan ururinno</h2>
        <h3>Akoonka</h3>
        <p>
          Markaad akoon sameyso, adeegga gelitaanka (Clerk) wuxuu habeeyaa magacaaga, email-kaaga, iyo
          — haddii aad isticmaasho — gelitaanka Google. Taleefankaagu waa xog xiriir ikhtiyaari ah oo
          loo isticmaalo wicitaan iyo WhatsApp; weligiis furaha gelitaanka lama aha, lag*na hubiyo SMS
          markaad is-diiwaangelinayso.
        </p>
        <h3>Dukumentiga aqoonsiga</h3>
        <p>
          Sawirka aqoonsigaaga qaranka ama baasaboorka waxaa la weydiiyaa <strong>marka heshiisku
          dhamaanayo oo keliya</strong>, si wakaaladdu u xaqiijiso kiraystaha. Dukumentiyadan waa la
          sireeyaa, weligood dad-weyne looma muujiyo, waxaana la tusaa shaqaalaha wakaaladda ee la
          oggolaaday oo keliya iyada oo loo marayo xiriiro daqiiqado gudahood dhaca. Mar kasta oo
          xiriir la sameeyo waxaa lagu diiwaangeliyaa diiwaan aan la beddeli karin.
        </p>
        <h3>Xogta guriga &amp; heshiiska</h3>
        <p>
          Liisas, codsiyo daawasho, socodka heshiiska, kirooyin, iyo lacago ay wakaaladuhu
          diiwaangeliyaan. Guri lacagta kirada ma maamulo — waxaa diiwaangeliya wakaaladuhu banaanka.
        </p>
        <h3>Xogta farsamada</h3>
        <p>Cookie gelitaan (muhiim), iyo diiwaanno server oo aan waligood xambaarin furayaal ama xog buuxda.</p>

        <h2>3. Sida aan xogtaada u isticmaalno</h2>
        <ul>
          <li>Si aan adeegga u wado: liis-gelinta guryaha, u gudbinta codsiyadaada wakaaladda saxda ah, iyo diiwaangelinta heshiisyada.</li>
          <li>Si loo xaqiijiyo aqoonsiga marka heshiisku dhamaanayo oo loo hayo diiwaan xisaabtan leh.</li>
          <li>Si laguugu soo diro warbixino heshiis iyo daawasho — kama aha xayeysiin, weligeedna email llooma diro.</li>
          <li>Si loo ilaaliyo amniga, looga hortago khiyaanada, loona buuxiyo waajibaadka sharciga.</li>
        </ul>

        <h2>4. Cidda aan xogta la wadaagno</h2>
        <ul>
          <li><strong>Wakaaladda heshiiskaaga qabata</strong> — waxay aragtaa xogtaada xiriir iyo, marka la xidhayo, aqoonsigaaga.</li>
          <li><strong>Bixiyeyaasha adeegga</strong> — Clerk (gelitaan), Cloudflare R2 (kayd file sireysan), iyo martigeliyaha, oo tilmaamahayaga ku shaqeeya.</li>
          <li>Maamullada marka sharcigu qaso.</li>
        </ul>
        <p>Xogtaada shakhsiga ah ma iibinno, xayeysiisna uma wadaagno.</p>

        <h2>5. Cookie-ga</h2>
        <p>
          Guri wuxuu isticmaalaa cookie muhiim ah oo keliya (fadhigaaga gelitaanka). Eeg{' '}
          <a href="/legal/cookies">Qaanuunka Cookie-ga</a>.
        </p>

        <h2>6. Hayntaa &amp; tirtiridda</h2>
        <p>
          Xogta waxaan hayناa inta loo baahdo oo keliya. Waqti kasta waad xidhi kartaa akoonkaaga
          (&ldquo;Ka bax Guri&rdquo;); tani way joojisaa profile-kaaga oo qorshaysaa in xogtaada la
          tirtiro, marka laga reebo diiwaannada sharcigu qaso iyo diiwaanka xisaabtanka. Xidhista
          akoonka waxaa la joojiyaa kaliya inta aad leedahay kiro firfircoon.
        </p>

        <h2>7. Xuquuqdaada</h2>
        <p>
          Sida sharciga deegaanka, waxaad codsan kartaa helitaan, saxid, tirtirid, ama nuqul xogtaada
          ah. Si aad u isticmaasho, email u dir{' '}
          <a href="mailto:privacy@getguri.com">privacy@getguri.com</a> ama isticmaal{' '}
          <a href="/legal/contact">Xiriir &amp; taageero</a>.
        </p>

        <h2>8. Amniga</h2>
        <p>
          Dukumentiga aqoonsiga waa la sireeyaa waxaana lagu bixiyaa xiriiro gaaban oo la
          diiwaangeliyo kadib hubinta doorka. Fadhiyada iyo furayaasha waxaa maamula adeegga gelitaanka.
        </p>

        <h2>9. Isbeddellada</h2>
        <p>
          Waxaan cusboonaysiin karnaa qaanuunkan; isbeddellada waaweyn waxaa lagu ogeysiin doonaa
          app-ka. Taariikhda kore waxay muujineysaa cusboonaysiinta ugu dambeysay.
        </p>
      </Prose>
    </>
  );
}
