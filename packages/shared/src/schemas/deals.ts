import { z } from 'zod';

// Agency-side deal actions (SPEC §4 / §6).
export const selectDealSchema = z.object({
  viewingAt: z.coerce.date(),
});
export type SelectDealInput = z.infer<typeof selectDealSchema>;

export const rescheduleDealSchema = selectDealSchema;

export const declineRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type DeclineRequestInput = z.infer<typeof declineRequestSchema>;

export const VIEWING_OUTCOMES = ['no_show', 'declined', 'proceed'] as const;
export type ViewingOutcome = (typeof VIEWING_OUTCOMES)[number];

export const viewingOutcomeSchema = z.object({
  result: z.enum(VIEWING_OUTCOMES),
  reason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type ViewingOutcomeInput = z.infer<typeof viewingOutcomeSchema>;
