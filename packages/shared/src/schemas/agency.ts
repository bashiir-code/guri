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

// Public "become a verified agency" application (§2/§15). Submitting NEVER
// grants agency access — it only queues a lead for the platform admin, who
// approves it into a real agency (createAgency) or declines it. Rule 15 holds:
// there is no self-service agency signup. Contact keys off email so the same
// person's Clerk sign-in links to the admin member the approval creates.
export const agencyApplicationSchema = z.object({
  agencyName: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  districts: z.array(z.string().trim().min(2)).min(1),
  contactName: z.string().trim().min(2).max(120),
  contactEmail: emailSchema,
  note: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type AgencyApplicationInput = z.infer<typeof agencyApplicationSchema>;
