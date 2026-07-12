import { z } from 'zod';
import { CAPTURED_VIA, CUSTOMER_DOCUMENT_TYPES } from '../enums';

// Customer ID upload metadata (SPEC §3 v1.10: id_type + captured_via).
export const uploadDocumentSchema = z.object({
  idType: z.enum(CUSTOMER_DOCUMENT_TYPES),
  capturedVia: z.enum(CAPTURED_VIA),
});
export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;

// Verify decision — note is REQUIRED on reject so the customer knows what to
// fix on re-capture (§4/§5).
export const verifyDealSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    note: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .or(z.literal('').transform(() => undefined)),
  })
  .refine((v) => v.decision === 'approve' || (v.note !== undefined && v.note.length >= 2), {
    message: 'note_required_on_reject',
    path: ['note'],
  });
export type VerifyDealInput = z.infer<typeof verifyDealSchema>;
