// Platform contact channels (SPEC §7/§9). Phone powers wa.me deep links;
// email is support only, never a deal/notification channel (rule 14). Single
// source of truth so the number never drifts between the contact page and the
// agency-join CTA. Keep in sync with LAUNCH.md domains.
export const SUPPORT_EMAIL = 'support@getguri.com';
export const PRIVACY_EMAIL = 'privacy@getguri.com';
export const WHATSAPP = '+358 44 988 6596';

// wa.me needs a digits-only number; optional prefilled text.
export const whatsappHref = (text?: string) =>
  `https://wa.me/${WHATSAPP.replace(/[^0-9]/g, '')}${
    text ? `?text=${encodeURIComponent(text)}` : ''
  }`;
