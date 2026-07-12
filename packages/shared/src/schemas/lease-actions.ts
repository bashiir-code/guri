import { z } from 'zod';

// §16 human end-of-lease actions — never done by a timer.

// Renew: a NEW lease (new term, optional new rent). The old lease is marked
// `renewed`; the listing stays `rented`.
export const renewLeaseSchema = z.object({
  termMonths: z.coerce.number().int().min(1).max(60),
  newRentUsd: z.coerce.number().positive().max(1_000_000).optional(),
});
export type RenewLeaseInput = z.infer<typeof renewLeaseSchema>;

// Move-out: the lease is `vacated`; the listing returns to `available`.
export const endLeaseSchema = z.object({
  result: z.literal('vacated'),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type EndLeaseInput = z.infer<typeof endLeaseSchema>;
