// Canonical string unions for every enum in SPEC §3.
// The Prisma enums in apps/api mirror these exactly; the web app imports them
// so UI and API can never disagree about states.

export const LOCALES = ['so', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const AGENCY_STATUSES = ['pending', 'active', 'suspended'] as const;
export type AgencyStatus = (typeof AGENCY_STATUSES)[number];

// v1.10: verification is a can_verify PERMISSION on agency_members, not a
// separate role (CLAUDE.md rule 9).
export const AGENCY_ROLES = ['admin', 'agent'] as const;
export type AgencyRole = (typeof AGENCY_ROLES)[number];

export const OWNER_INVITE_STATUSES = ['invited', 'claimed'] as const;
export type OwnerInviteStatus = (typeof OWNER_INVITE_STATUSES)[number];

export const LISTING_TYPES = ['apartment', 'house', 'room', 'villa'] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const LISTING_STATUSES = ['available', 'reserved', 'rented'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const OWNER_DOCUMENT_TYPES = [
  'title_deed',
  'municipal_doc',
  'agency_attestation',
  'other',
] as const;
export type OwnerDocumentType = (typeof OWNER_DOCUMENT_TYPES)[number];

// Strict on WHAT (rule 11): national ID or passport only.
export const CUSTOMER_DOCUMENT_TYPES = ['national_id', 'passport'] as const;
export type CustomerDocumentType = (typeof CUSTOMER_DOCUMENT_TYPES)[number];

// Lenient on HOW: direct camera capture, gallery as fallback.
export const CAPTURED_VIA = ['camera', 'gallery'] as const;
export type CapturedVia = (typeof CAPTURED_VIA)[number];

export const DOCUMENT_REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type DocumentReviewStatus = (typeof DOCUMENT_REVIEW_STATUSES)[number];

export const PAYMENT_TYPES = ['deposit', 'advance_rent', 'monthly_rent', 'commission'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const NOTIFICATION_CHANNELS = ['sms', 'wa_link', 'inapp'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
