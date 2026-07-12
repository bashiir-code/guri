import { z } from 'zod';
import { PAYMENT_TYPES } from '../enums';

export const paymentSchema = z.object({
  type: z.enum(PAYMENT_TYPES),
  amountUsd: z.coerce.number().positive().max(1_000_000),
  paidOn: z.coerce.date(),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

// §4 close: signed scan + deposit + first rent logged + lease term set — the
// deposit and first rent must arrive IN the close request so the close is
// atomic (no half-closed deals).
export const closeDealSchema = z
  .object({
    termMonths: z.coerce.number().int().min(1).max(60),
    startDate: z.coerce.date(),
    payments: z.array(paymentSchema).min(2),
  })
  .refine((v) => v.payments.some((p) => p.type === 'deposit'), {
    message: 'deposit_payment_required',
    path: ['payments'],
  })
  .refine((v) => v.payments.some((p) => p.type === 'monthly_rent'), {
    message: 'first_rent_payment_required',
    path: ['payments'],
  });
export type CloseDealInput = z.infer<typeof closeDealSchema>;

export const logPaymentSchema = paymentSchema;
export type LogPaymentInput = z.infer<typeof logPaymentSchema>;

// Term/start may be printed on the agreement before the close (§16: the paper
// and the app must agree), so generation accepts them optionally.
export const generateAgreementSchema = z.object({
  termMonths: z.coerce.number().int().min(1).max(60).optional(),
  startDate: z.coerce.date().optional(),
});
export type GenerateAgreementInput = z.infer<typeof generateAgreementSchema>;
