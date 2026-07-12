// Deal state machine — the SPEC §4 transition table, verbatim.
// The API's state-machine service validates every transition against this
// table; the web app uses the same table to render what actions exist.

export const DEAL_STATES = [
  'requested',
  'viewing_scheduled',
  'awaiting_docs',
  'docs_in_review',
  'approved',
  'closed',
  'expired',
  'withdrawn',
  'declined_by_agency',
  'no_show',
  'declined',
  'docs_rejected',
] as const;
export type DealState = (typeof DEAL_STATES)[number];

// States where the deal is still in play (the customer can withdraw from any of these).
export const DEAL_OPEN_STATES = [
  'requested',
  'viewing_scheduled',
  'awaiting_docs',
  'docs_in_review',
  'approved',
] as const;

// A deal in any of these states makes its listing derive to `reserved` (§3).
// Note: `requested` does NOT reserve — the queue keeps accepting requests.
export const DEAL_RESERVING_STATES = [
  'viewing_scheduled',
  'awaiting_docs',
  'docs_in_review',
  'approved',
] as const;

export const DEAL_TERMINAL_STATES = [
  'closed',
  'expired',
  'withdrawn',
  'declined_by_agency',
  'no_show',
  'declined',
  'docs_rejected',
] as const;

export type DealActor = 'customer' | 'agent' | 'verifier' | 'system';

export type DealAction =
  | 'request' // customer requests a listing (creates the deal)
  | 'schedule_viewing' // agency selects + sets viewing time
  | 'decline_request'
  | 'withdraw'
  | 'expire' // system timers (§4)
  | 'reschedule_viewing'
  | 'record_no_show'
  | 'record_declined'
  | 'record_proceeding'
  | 'submit_documents' // customer uploads ID photo
  | 'resubmit_documents' // customer re-captures after a rejection (§4: "may re-upload a clearer photo")
  | 'approve_documents' // a can_verify member
  | 'reject_documents' // a can_verify member, note required
  | 'close'; // signed scan + deposit + first rent + lease term set

export interface DealTransition {
  /** null = deal creation */
  from: DealState | null;
  action: DealAction;
  to: DealState;
  actor: DealActor;
}

export const DEAL_TRANSITIONS: readonly DealTransition[] = [
  { from: null, action: 'request', to: 'requested', actor: 'customer' },

  { from: 'requested', action: 'schedule_viewing', to: 'viewing_scheduled', actor: 'agent' },
  { from: 'requested', action: 'decline_request', to: 'declined_by_agency', actor: 'agent' },
  { from: 'requested', action: 'expire', to: 'expired', actor: 'system' }, // 14 days untouched

  { from: 'viewing_scheduled', action: 'reschedule_viewing', to: 'viewing_scheduled', actor: 'agent' },
  { from: 'viewing_scheduled', action: 'record_no_show', to: 'no_show', actor: 'agent' },
  { from: 'viewing_scheduled', action: 'record_declined', to: 'declined', actor: 'agent' },
  { from: 'viewing_scheduled', action: 'record_proceeding', to: 'awaiting_docs', actor: 'agent' },
  { from: 'viewing_scheduled', action: 'expire', to: 'expired', actor: 'system' }, // 7 days past viewing

  { from: 'awaiting_docs', action: 'submit_documents', to: 'docs_in_review', actor: 'customer' },
  // Rejection released the listing, so a re-capture must win the active slot
  // back (the API enforces the same one-slot rule as select).
  { from: 'docs_rejected', action: 'resubmit_documents', to: 'docs_in_review', actor: 'customer' },

  { from: 'docs_in_review', action: 'approve_documents', to: 'approved', actor: 'verifier' },
  { from: 'docs_in_review', action: 'reject_documents', to: 'docs_rejected', actor: 'verifier' },

  { from: 'approved', action: 'close', to: 'closed', actor: 'agent' },

  // "any active | Customer withdraws | withdrawn" (§4)
  { from: 'requested', action: 'withdraw', to: 'withdrawn', actor: 'customer' },
  { from: 'viewing_scheduled', action: 'withdraw', to: 'withdrawn', actor: 'customer' },
  { from: 'awaiting_docs', action: 'withdraw', to: 'withdrawn', actor: 'customer' },
  { from: 'docs_in_review', action: 'withdraw', to: 'withdrawn', actor: 'customer' },
  { from: 'approved', action: 'withdraw', to: 'withdrawn', actor: 'customer' },
];

// §4 timers, expressed in hours so the phase-7 job runner and any UI copy agree.
export const DEAL_TIMERS = {
  requestedExpiresAfterHours: 14 * 24,
  viewingOutcomeNudgeAfterHours: 72,
  viewingStuckExpiresAfterHours: 7 * 24,
  docsInReviewReminderAfterHours: 48,
  leaseEndingSoonBeforeDays: 30,
} as const;

export function findDealTransition(
  from: DealState | null,
  action: DealAction,
): DealTransition | undefined {
  return DEAL_TRANSITIONS.find((t) => t.from === from && t.action === action);
}

export function canDealTransition(from: DealState | null, action: DealAction): boolean {
  return findDealTransition(from, action) !== undefined;
}

export function isDealTerminal(state: DealState): boolean {
  return (DEAL_TERMINAL_STATES as readonly DealState[]).includes(state);
}
