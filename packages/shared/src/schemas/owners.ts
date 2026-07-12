import { z } from 'zod';
import { emailSchema, phoneSchema } from './auth';

// Owners are invited by phone (WhatsApp/SMS via the adapter). Email is
// optional — when given, the Clerk webhook auto-links their sign-in to this
// pre-provisioned row.
export const createOwnerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  email: emailSchema.optional().or(z.literal('').transform(() => undefined)),
});
export type CreateOwnerInput = z.infer<typeof createOwnerSchema>;

// §17: an agency deactivates/reactivates an owner it created (never deletes —
// their leases and income history stay). Deactivation is blocked while the
// owner has a live lease, the same guard as leave-platform (§16).
export const patchOwnerSchema = z.object({
  active: z.boolean(),
});
export type PatchOwnerInput = z.infer<typeof patchOwnerSchema>;
