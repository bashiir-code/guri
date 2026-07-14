import { z } from 'zod';
import { LISTING_TYPES } from '../enums';

export const LISTING_SORTS = ['newest', 'price_asc', 'price_desc'] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

export const BROWSE_PAGE_SIZE = 12;

// Public browse filters (SPEC §5 customer screen 2 / §6 GET /listings).
export const browseQuerySchema = z.object({
  // Free-text search over district / neighborhood (SPEC §5 "Raadi guri ama degmo").
  q: z.string().trim().min(1).max(80).optional(),
  district: z.string().trim().min(1).max(60).optional(),
  minRent: z.coerce.number().min(0).optional(),
  maxRent: z.coerce.number().min(0).optional(),
  beds: z.coerce.number().int().min(0).optional(), // minimum bedrooms
  type: z.enum(LISTING_TYPES).optional(),
  sort: z.enum(LISTING_SORTS).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
});
export type BrowseQueryInput = z.infer<typeof browseQuerySchema>;
