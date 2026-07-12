import { z } from 'zod';
import { LOCALES } from '../enums';

// Authentication itself is Clerk's (SPEC §3 v1.9) — nothing here mints or
// checks credentials. Phone is contact data only (rule 14): loose E.164-ish,
// never verified.
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{7,15}$/, 'invalid_phone');

export const emailSchema = z.string().trim().toLowerCase().email('invalid_email').max(254);

export const localeSchema = z.enum(LOCALES);

// PATCH /me — post-signup profile completion (name + contact phone).
export const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: phoneSchema.optional().or(z.literal('').transform(() => undefined)),
    locale: localeSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'empty_patch' });
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
