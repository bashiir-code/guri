// SMS/WhatsApp templates for the §7 matrix, Somali + English, chosen by the
// RECIPIENT's locale (never email — rule 14). The in-app bell renders its own
// copy from the web message catalogs using template + payload; this registry
// is only for the text pushed through the SMS adapter.

export type NotificationLocale = 'so' | 'en';
export type TemplateParams = Record<string, string | number | undefined>;

type Renderer = (p: TemplateParams) => string;
interface Template {
  so: Renderer;
  en: Renderer;
}

const wa = (phone?: string | number) =>
  phone ? `wa.me/${String(phone).replace(/[^0-9]/g, '')}` : '';

export const SMS_TEMPLATES: Record<string, Template> = {
  // ---- deal timers (§4) ----
  deal_expired: {
    so: () => 'Guri: codsigaagii wuu dhacay maxaa yeelay 14 maalmood lama qabanin. Guryo kale ka raadso.',
    en: () => 'Guri: your request expired after 14 days with no action. Please browse other homes.',
  },
  deal_expired_stuck: {
    so: () => 'Guri: daawashadaadii way dhacday, codsigiina waa la xiray. Guri kale ayaad codsan kartaa.',
    en: () => 'Guri: your viewing lapsed and the request was closed. You can request another home.',
  },
  viewing_outcome_nudge: {
    so: (p) => `Guri: daawasho ayaad qabsatay lakiinse natiijadeedii weli lama diiwaangelin. Fadlan diiwaangeli. ${wa(p.agencyPhone)}`,
    en: (p) => `Guri: a viewing you scheduled still has no recorded outcome. Please record it. ${wa(p.agencyPhone)}`,
  },
  docs_review_reminder: {
    so: () => 'Guri: aqoonsi macmiil ah ayaa sugaya hubintaada. Fadlan dib u eeg.',
    en: () => "Guri: a customer's ID is waiting for your review. Please take a look.",
  },
  // ---- lease timers (§16) ----
  lease_ending_soon: {
    so: (p) => `Guri: kiradu waxay dhammaanaysaa ${p.endDate}. Fadlan go'aamiya cusboonaysii ama baxitaan.`,
    en: (p) => `Guri: the lease ends on ${p.endDate}. Please decide on a renewal or a move-out.`,
  },
  lease_grace_nudge: {
    so: (p) => `Guri: kiradii way dhammaatay (${p.endDate}) laakiin go'aan lama qaadan. Fadlan diiwaangeli cusboonaysii ama bax.`,
    en: (p) => `Guri: the lease term ended (${p.endDate}) with no decision recorded. Please record a renewal or move-out.`,
  },
  // ---- human end-of-lease (§16, phase 8) ----
  lease_renewed: {
    so: () => 'Guri: kiradaadii waa la cusboonaysiiyay. Faahfaahinta ka eeg app-ka.',
    en: () => 'Guri: your lease has been renewed. See the details in the app.',
  },
  move_out_recorded: {
    so: () => 'Guri: baxitaan ayaa la diiwaangeliyay, gurigiina wuu bannaan yahay.',
    en: () => 'Guri: a move-out was recorded and your property is now available.',
  },
  // ---- signing side-effect (§4) ----
  auto_withdrawn_signed: {
    so: () => 'Guri: waxaad heshay guri kale, sidaas darteed codsiyadaadii kale waa la joojiyay.',
    en: () => 'Guri: since you signed for another home, your other open requests were withdrawn.',
  },
  // ---- owner-initiated intake (§15, phase 10) ----
  intake_new_lead: {
    so: (p) => `Guri: hordhac cusub — guri ku yaal ${p.district} ayaa lagu soo gudbiyay. Fadlan ka eeg sanduuqa hordhacyada.`,
    en: (p) => `Guri: a new lead — a house in ${p.district} was submitted to you. Please check your leads inbox.`,
  },
  intake_accepted: {
    so: (p) => `Guri: ${p.agencyName} ayaa aqbashay gurigaaga. La xiriir si aad u ballansataan: ${wa(p.agencyPhone)}`,
    en: (p) => `Guri: ${p.agencyName} accepted your house. Contact them to arrange the meetup: ${wa(p.agencyPhone)}`,
  },
  intake_declined: {
    so: (p) => `Guri: codsigaagii guri lama aqbalin — ${p.reason}. Waxaad dooran kartaa hay'ad kale.`,
    en: (p) => `Guri: your house submission was not accepted — ${p.reason}. You can choose another agency.`,
  },
  intake_expired: {
    so: () => "Guri: codsigaagii guri jawaab lama helin 5 maalmood gudahood. Fadlan dooro hay'ad kale.",
    en: () => 'Guri: your house submission got no response within 5 days. Please choose another agency.',
  },
  intake_published: {
    so: () => 'Guri: gurigaagii waa la daabacay oo hadda wuu ka muuqdaa raadinta. Waad ku mahadsan tahay!',
    en: () => 'Guri: your house is now listed and visible in search. Thank you!',
  },
};

export function renderSms(
  template: string,
  locale: NotificationLocale,
  params: TemplateParams,
): string | null {
  const t = SMS_TEMPLATES[template];
  if (!t) return null; // no SMS body → in-app only
  return `${t[locale](params)}`;
}
