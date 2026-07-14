import { z } from 'zod';
import { LISTING_TYPES } from '../enums';

export const listingFieldsSchema = z.object({
  ownerId: z.string().uuid(),
  district: z.string().trim().min(2).max(60),
  neighborhood: z.string().trim().max(80).optional().or(z.literal('').transform(() => undefined)),
  type: z.enum(LISTING_TYPES),
  bedrooms: z.coerce.number().int().min(0).max(30),
  bathrooms: z.coerce.number().int().min(0).max(30),
  areaSqm: z.coerce.number().int().positive().max(100_000).optional(),
  rentUsd: z.coerce.number().positive().max(1_000_000),
  depositUsd: z.coerce.number().min(0).max(1_000_000),
  descriptionSo: z.string().trim().min(1).max(4000),
  descriptionEn: z.string().trim().min(1).max(4000),
});
export type ListingFieldsInput = z.infer<typeof listingFieldsSchema>;

export const updateListingSchema = listingFieldsSchema.partial().extend({
  originalsVerified: z.boolean().optional(),
});
export type UpdateListingInput = z.infer<typeof updateListingSchema>;

// The publish gate: the agency must attest it inspected the original papers.
export const publishListingSchema = z.object({
  originalsVerified: z.literal(true),
});
export type PublishListingInput = z.infer<typeof publishListingSchema>;

export const ownerDocMetaSchema = z.object({
  label: z.string().trim().min(1).max(120),
  note: z.string().trim().max(1000).optional().or(z.literal('').transform(() => undefined)),
});
export type OwnerDocMetaInput = z.infer<typeof ownerDocMetaSchema>;
