import { defineRouting } from 'next-intl/routing';
import { LOCALES } from '@guri/shared';

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: 'so',
});
