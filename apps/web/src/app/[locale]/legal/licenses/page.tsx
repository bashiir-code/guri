'use client';

import { useLocale } from 'next-intl';
import { LegalTitle, Prose } from '@/components/legal-ui';

// Core open-source projects Guri is built on, with their licences. Package
// names/licences are language-neutral; only the intro is translated.
const CREDITS: Array<{ name: string; license: string; url: string }> = [
  { name: 'Next.js', license: 'MIT', url: 'https://github.com/vercel/next.js' },
  { name: 'React', license: 'MIT', url: 'https://github.com/facebook/react' },
  { name: 'NestJS', license: 'MIT', url: 'https://github.com/nestjs/nest' },
  { name: 'Prisma', license: 'Apache-2.0', url: 'https://github.com/prisma/prisma' },
  { name: 'Tailwind CSS', license: 'MIT', url: 'https://github.com/tailwindlabs/tailwindcss' },
  { name: 'TanStack Query', license: 'MIT', url: 'https://github.com/TanStack/query' },
  { name: 'next-intl', license: 'MIT', url: 'https://github.com/amannn/next-intl' },
  { name: 'Clerk (@clerk/nextjs)', license: 'MIT', url: 'https://github.com/clerk/javascript' },
  { name: 'lucide-react', license: 'ISC', url: 'https://github.com/lucide-icons/lucide' },
  { name: 'Zod', license: 'MIT', url: 'https://github.com/colinhacks/zod' },
  { name: 'react-hook-form', license: 'MIT', url: 'https://github.com/react-hook-form/react-hook-form' },
  { name: 'AWS SDK for JavaScript', license: 'Apache-2.0', url: 'https://github.com/aws/aws-sdk-js-v3' },
  { name: 'sharp', license: 'Apache-2.0', url: 'https://github.com/lovell/sharp' },
  { name: 'pg-boss', license: 'MIT', url: 'https://github.com/timgit/pg-boss' },
  { name: 'pino', license: 'MIT', url: 'https://github.com/pinojs/pino' },
  { name: '@react-pdf/renderer', license: 'MIT', url: 'https://github.com/diegomura/react-pdf' },
  { name: 'jose', license: 'MIT', url: 'https://github.com/panva/jose' },
  { name: 'Serwist', license: 'MIT', url: 'https://github.com/serwist/serwist' },
  { name: 'Bricolage Grotesque & Inter (fonts)', license: 'SIL OFL 1.1', url: 'https://fonts.google.com' },
];

export default function LicensesPage() {
  const locale = useLocale();
  const intro =
    locale === 'so'
      ? 'Guri waxaa lagu dhisay software open-source ah oo wanaagsan. Waxaan si daacad ah u aqoonsanaynaa mashruucyada waaweyn ee hoos ku xusan iyo liisankooda. Naxariista qaybaha kale waxaa lagu heli karaa faylasha liisanka ee mashruuc kasta.'
      : 'Guri is built on excellent open-source software. We gratefully acknowledge the major projects below and their licences. The full licence text for every dependency ships in each project’s own licence files.';

  return (
    <>
      <LegalTitle title={locale === 'so' ? 'Liisanka open-source' : 'Open-source licenses'} />
      <Prose>
        <p>{intro}</p>
      </Prose>
      <ul className="mt-6 divide-y divide-border overflow-hidden rounded-card border">
        {CREDITS.map((c) => (
          <li key={c.name} className="flex items-center justify-between gap-3 px-4 py-3">
            <a
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate text-sm font-medium text-forest hover:underline"
            >
              {c.name}
            </a>
            <span className="flex-none rounded-full bg-mist px-2.5 py-1 text-xs font-semibold text-slate_brand">
              {c.license}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
