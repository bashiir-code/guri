import { z } from 'zod';
import { AGENCY_STATUSES } from '../enums';
import { emailSchema, phoneSchema } from './auth';

// Staff identity keys off email (the Clerk credential); phone is contact data.
export const createAgencySchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  districts: z.array(z.string().trim().min(2)).min(1),
  adminEmail: emailSchema,
  adminName: z.string().trim().min(2).max(120).optional(),
  adminPhone: phoneSchema.optional().or(z.literal('').transform(() => undefined)),
});
export type CreateAgencyInput = z.infer<typeof createAgencySchema>;

export const patchAgencySchema = z.object({
  status: z.enum(AGENCY_STATUSES),
});
export type PatchAgencyInput = z.infer<typeof patchAgencySchema>;
