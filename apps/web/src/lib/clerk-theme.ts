import type { ComponentProps } from 'react';
import type { ClerkProvider } from '@clerk/nextjs';

type ClerkProviderProps = ComponentProps<typeof ClerkProvider>;
type ClerkAppearance = NonNullable<ClerkProviderProps['appearance']>;
type ClerkLocalization = NonNullable<ClerkProviderProps['localization']>;

// Guri design language on Clerk's prebuilt components (SPEC §5): Forest
// text, the one Lime action, 20px card radius, pills. The !important
// variants are deliberate — they must beat Clerk's own CSS-in-JS styles.
export const clerkAppearance: ClerkAppearance = {
  variables: {
    colorPrimary: '#173A31',
    colorText: '#173A31',
    colorTextSecondary: '#5C6B64',
    colorBackground: '#FFFFFF',
    borderRadius: '0.875rem',
    fontFamily: 'var(--font-sans), system-ui, sans-serif',
  },
  elements: {
    card: '!rounded-[20px] !shadow-sm border',
    headerTitle: 'font-display !font-extrabold !text-forest',
    formButtonPrimary:
      '!rounded-full !bg-lime !text-forest !shadow-none font-semibold hover:!brightness-95',
    socialButtonsBlockButton: '!rounded-full',
    formFieldInput: '!rounded-xl',
    footerActionLink: '!text-forest font-semibold',
  },
};

// Somali strings for the auth surfaces. Clerk has no built-in Somali pack,
// so the visible sign-in/sign-up flow is translated here; anything not
// listed falls back to Clerk's English. Sentence case, no ALL CAPS.
const so: ClerkLocalization = {
  socialButtonsBlockButton: 'Kusii wad {{provider|titleize}}',
  dividerText: 'ama',
  formButtonPrimary: 'Sii wad',
  backButton: 'Dib u noqo',
  formFieldLabel__emailAddress: 'Email-ka',
  formFieldLabel__emailAddress_username: 'Email-ka ama username-ka',
  formFieldLabel__password: 'Password-ka',
  formFieldInputPlaceholder__emailAddress: 'Geli email-kaaga',
  formFieldInputPlaceholder__emailAddress_username: 'Geli email ama username',
  formFieldAction__forgotPassword: 'Password-ka ma ilowday?',
  signIn: {
    start: {
      title: 'Ku gal Guri',
      subtitle: 'Ku soo dhawoow — gal si aad u sii waddo',
      actionText: 'Akoon ma lihid?',
      actionLink: 'Samee akoon',
    },
    password: {
      title: 'Geli password-kaaga',
      subtitle: 'Ku gal akoonkaaga Guri',
      actionLink: 'Isticmaal hab kale',
    },
    emailCode: {
      title: 'Hubi email-kaaga',
      subtitle: 'si aad ugu gasho Guri',
      formTitle: 'Koodka xaqiijinta',
      resendButton: 'Dib u dir koodka',
    },
  },
  signUp: {
    start: {
      title: 'Samee akoonka Guri',
      subtitle: 'Google ayaa ugu fudud — ama email iyo password',
      actionText: 'Akoon ma leedahay?',
      actionLink: 'Gal',
    },
    emailCode: {
      title: 'Xaqiiji email-kaaga',
      subtitle: 'Geli koodka loo diray email-kaaga',
      formTitle: 'Koodka xaqiijinta',
      resendButton: 'Dib u dir koodka',
    },
  },
};

// English: only rebrand the titles — the dev instance says "My Application"
// until the production Clerk instance is named Guri, and this makes the
// copy right regardless of dashboard state.
const en: ClerkLocalization = {
  signIn: {
    start: {
      title: 'Sign in to Guri',
      subtitle: 'Welcome back — sign in to continue',
    },
  },
  signUp: {
    start: {
      title: 'Create your Guri account',
      subtitle: 'Google is fastest — or use email and password',
    },
  },
};

export function getClerkLocalization(locale: string): ClerkLocalization {
  return locale === 'so' ? so : en;
}
