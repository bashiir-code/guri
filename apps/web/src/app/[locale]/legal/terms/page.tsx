'use client';

import { useLocale } from 'next-intl';
import { LegalTitle, Prose, Summary } from '@/components/legal-ui';

export default function TermsPage() {
  const locale = useLocale();
  return locale === 'so' ? <TermsSo /> : <TermsEn />;
}

function TermsEn() {
  return (
    <>
      <LegalTitle title="Terms of Service" />
      <Summary>
        In short: Guri connects renters with verified agencies. Guri is not the landlord or the
        agent and moves no money — agencies handle viewings, verification, and payments off-platform.
        Use Guri honestly: real listings, real identity, no fraud.
      </Summary>
      <Prose>
        <h2>1. Acceptance</h2>
        <p>
          By using Guri you agree to these Terms and to our <a href="/legal/privacy">Privacy
          Policy</a>. If you do not agree, do not use the service.
        </p>

        <h2>2. What Guri is</h2>
        <p>
          Guri is a marketplace where every home is represented by a verified agency. Guri is not a
          landlord, broker, or party to any lease, and does not process rent or deposits. Agencies
          are responsible for viewings, tenant verification, agreements, and any payments, which are
          recorded off-platform.
        </p>

        <h2>3. Eligibility &amp; accounts</h2>
        <p>
          You must be at least 18. You sign up with one account; your roles (customer, owner, agency
          staff, admin) are determined by us server-side — you cannot assign yourself a role.
          Authentication is handled by Clerk; keep your credentials secure and tell us of any
          unauthorised use. Your phone number is contact data, not a login.
        </p>

        <h2>4. Acceptable use</h2>
        <ul>
          <li>Provide accurate information and, at deal-closing, genuine identity documents.</li>
          <li>Do not post false, misleading, or unauthorised listings.</li>
          <li>Do not impersonate others, harvest data, disrupt the service, or attempt unauthorised access.</li>
          <li>Do not use Guri for anything unlawful.</li>
        </ul>

        <h2>5. Listings &amp; your content</h2>
        <p>
          Owners and agencies are responsible for the accuracy and legality of listings and for
          holding the rights to any content and photos they submit. By submitting content you grant
          Guri a non-exclusive licence to host and display it for operating the service. Nothing from
          an owner intake is public until an agency converts it into a listing.
        </p>

        <h2>6. Deals, viewings &amp; verification</h2>
        <p>
          When you request a home, the agency may schedule a viewing and, at closing, verify your
          national ID or passport. A verified agency member makes the verification decision; Guri
          records the deal history and document access for accountability but does not itself approve
          or reject tenancies.
        </p>

        <h2>7. Payments</h2>
        <p>
          Guri does not collect or process money. Rent, deposits, and commissions are arranged and
          recorded by agencies outside the platform. Any payment dispute is between you and the
          agency or owner.
        </p>

        <h2>8. Intellectual property</h2>
        <p>
          The Guri platform, name, and design are owned by Guri and protected by law. These Terms
          grant you no rights in them beyond using the service. Open-source components are used under
          their own licences — see <a href="/legal/licenses">Open-source licenses</a>.
        </p>

        <h2>9. Disclaimers</h2>
        <p>
          The service is provided &ldquo;as is&rdquo;. While every listing is tied to a verified
          agency, Guri does not guarantee the accuracy of listings, the conduct of any agency or
          user, or the outcome of any tenancy, and is not a party to agreements made through it.
        </p>

        <h2>10. Limitation of liability</h2>
        <p>
          To the fullest extent permitted by law, Guri is not liable for indirect or consequential
          losses, or for losses arising from dealings between users and agencies or owners.
        </p>

        <h2>11. Suspension &amp; termination</h2>
        <p>
          We may suspend or end access that breaches these Terms or harms users or the platform. You
          may close your account at any time from your profile (see the <a href="/legal/privacy">Privacy
          Policy</a> on deletion).
        </p>

        <h2>12. Governing law &amp; changes</h2>
        <p>
          These Terms are governed by the laws of the Federal Republic of Somalia. We may update them;
          continued use after changes means you accept the updated Terms. Questions?{' '}
          <a href="/legal/contact">Contact us</a>.
        </p>
      </Prose>
    </>
  );
}

function TermsSo() {
  return (
    <>
      <LegalTitle title="Shuruudaha Adeegga" />
      <Summary>
        Kooban: Guri wuxuu isku xiraa kiraystayaasha iyo wakaalado la hubiyay. Guri ma aha mulkiilaha
        ama wakiilka, lacagna ma dhaqaajiyo — wakaaladuhu waxay maamulaan daawasho, xaqiijin, iyo
        lacago banaanka lagu diiwaangeliyo. Si daacad ah u isticmaal: liisas dhab ah, aqoonsi dhab ah,
        khiyaano la&rsquo;aan.
      </Summary>
      <Prose>
        <h2>1. Aqbalaadda</h2>
        <p>
          Adigoo isticmaalaya Guri waxaad ogolaatay Shuruudahan iyo{' '}
          <a href="/legal/privacy">Qaanuunka Asturnaanta</a>. Haddaadan ogolayn, ha isticmaalin adeegga.
        </p>

        <h2>2. Waxa Guri yahay</h2>
        <p>
          Guri waa suuq guri kastaa uu matalo wakaalad la hubiyay. Guri ma aha mulkiile, dilaal, ama
          qayb ka mid ah heshiis kasta, lacagna ma habeeyo. Wakaaladuhu waxay mas&rsquo;uul ka yihiin
          daawashada, xaqiijinta kiraystaha, heshiisyada, iyo lacagaha, oo banaanka lagu diiwaangeliyo.
        </p>

        <h2>3. U-qalmitaanka &amp; akoonnada</h2>
        <p>
          Waa inaad ugu yaraan 18 jir tahay. Waxaad ku diiwaangashataa hal akoon; doorarkaaga waxaa
          go&rsquo;aamiya annaga dhinaca server-ka — nafsaddaada doorka ma siin kartid. Gelitaanka waxaa
          maamula Clerk; ilaali furayaashaada. Taleefankaagu waa xog xiriir, ma aha furaha gelitaanka.
        </p>

        <h2>4. Isticmaalka la oggol yahay</h2>
        <ul>
          <li>Bixi macluumaad sax ah, marka la xidhayana aqoonsi dhab ah.</li>
          <li>Ha soo dhigin liisas been ah ama aan la oggolayn.</li>
          <li>Ha is-moodsiin qof kale, xog ha xadin, adeeggana ha carqaladayn.</li>
          <li>Guri ha u isticmaalin wax sharci-darro ah.</li>
        </ul>

        <h2>5. Liisaska &amp; waxyaabahaaga</h2>
        <p>
          Mulkiilayaasha iyo wakaaladuhu ayaa mas&rsquo;uul ka ah saxnaanta liisaska iyo xaqa waxyaabaha
          ay soo gudbiyaan. Adigoo soo gudbinaya waxyaabo waxaad Guri siisaa oggolaansho aan gaar
          ahayn oo uu ku hayo kuna soo bandhigo adeegga. Wax intake mulkiile ah dad-weyne looma muujiyo
          ilaa wakaaladi liis ka dhigto.
        </p>

        <h2>6. Heshiisyada, daawashada &amp; xaqiijinta</h2>
        <p>
          Markaad guri codsato, wakaaladdu waxay qorsheyn kartaa daawasho, marka la xidhayana waxay
          xaqiijin kartaa aqoonsigaaga. Xubin wakaalad oo la hubiyay ayaa go&rsquo;aanka xaqiijinta
          gaadha; Guri wuxuu diiwaangeliyaa taariikhda heshiiska laakiin isagu ma ansixiyo kirooyinka.
        </p>

        <h2>7. Lacagaha</h2>
        <p>
          Guri lacag ma qaado. Kirada, dammaanadaha, iyo komishanka waxaa maamula wakaaladuhu banaanka
          platform-ka. Muran kasta oo lacageed waa kaaga iyo wakaaladda ama mulkiilaha.
        </p>

        <h2>8. Hantida garaadka</h2>
        <p>
          Platform-ka Guri, magaca, iyo naqshadda waxaa iska leh Guri, sharcigana wuu ilaaliyaa.
          Qaybaha open-source waxaa loo isticmaalaa liisankooda — eeg{' '}
          <a href="/legal/licenses">Liisanka open-source</a>.
        </p>

        <h2>9. Ka-fogaanshaha mas&rsquo;uuliyadda</h2>
        <p>
          Adeegga waxaa la bixiyaa &ldquo;sida uu yahay&rdquo;. In kasta oo liis kastaa uu ku xiran
          yahay wakaalad la hubiyay, Guri ma dammaanad qaado saxnaanta liisaska, hab-dhaqanka
          isticmaale kasta, ama natiijada kiro kasta.
        </p>

        <h2>10. Xaddidaadda mas&rsquo;uuliyadda</h2>
        <p>
          Ilaa xadka sharcigu oggol yahay, Guri ma mas&rsquo;uul ka aha khasaare dadban ama mid ka
          dhasha macaamil dhex mara isticmaalayaasha iyo wakaaladaha ama mulkiilayaasha.
        </p>

        <h2>11. Hakinta &amp; joojinta</h2>
        <p>
          Waxaan hakin ama joojin karnaa gelitaan jebiya Shuruudahan. Waqti kasta waad xidhi kartaa
          akoonkaaga profile-kaaga (eeg <a href="/legal/privacy">Qaanuunka Asturnaanta</a>).
        </p>

        <h2>12. Sharciga &amp; isbeddellada</h2>
        <p>
          Shuruudahan waxaa maamula sharciyada Jamhuuriyadda Federaalka Soomaaliya. Waan cusboonaysiin
          karnaa; sii-wadista isticmaalka waxay muujineysaa aqbalaadda. Su&rsquo;aalo?{' '}
          <a href="/legal/contact">Nala soo xiriir</a>.
        </p>
      </Prose>
    </>
  );
}
