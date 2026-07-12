import { z } from 'zod';
import { LISTING_TYPES } from '../enums';

// Owner-initiated intake (§15). Text fields arrive as multipart form values
// alongside the photo/doc files, so numbers are coerced from strings. This is a
// LEAD, not a listing — nothing here is ever public until an agency converts it.
// Empty multipart values are stripped by the controller before validation, so
// optionals here are plain — an absent field means "not provided".
export const intakeSubmitSchema = z.object({
  agencyId: z.string().uuid(),
  district: z.string().trim().min(2).max(60),
  neighborhood: z.string().trim().max(80).optional(),
  type: z.enum(LISTING_TYPES),
  bedrooms: z.coerce.number().int().min(0).max(30),
  bathrooms: z.coerce.number().int().min(0).max(30),
  // What the owner HOPES to get; the agency sets the real rent at listing time.
  expectedRentUsd: z.coerce.number().positive().max(1_000_000).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type IntakeSubmitInput = z.infer<typeof intakeSubmitSchema>;

// Agency declines or abandons a lead — a reason is always required (§15).
export const intakeDeclineSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type IntakeDeclineInput = z.infer<typeof intakeDeclineSchema>;

// Owner re-sends a declined/expired intake to a different agency (§15).
export const intakeReassignSchema = z.object({
  agencyId: z.string().uuid(),
});
export type IntakeReassignInput = z.infer<typeof intakeReassignSchema>;
