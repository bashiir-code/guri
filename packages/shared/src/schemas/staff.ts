import { z } from 'zod';
import { emailSchema, phoneSchema } from './auth';

// Agents sign in with Clerk (Google/email), so staff are added by email.
export const addStaffSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(2).max(120).optional(),
  phone: phoneSchema.optional().or(z.literal('').transform(() => undefined)),
});
export type AddStaffInput = z.infer<typeof addStaffSchema>;

export const patchStaffSchema = z
  .object({
    active: z.boolean().optional(),
    canVerify: z.boolean().optional(),
  })
  .refine((v) => v.active !== undefined || v.canVerify !== undefined, {
    message: 'empty_patch',
  });
export type PatchStaffInput = z.infer<typeof patchStaffSchema>;
