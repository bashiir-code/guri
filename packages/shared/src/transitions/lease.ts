// Lease lifecycle — the SPEC §16 transition table, verbatim.
// Note: there is no automatic termination. A lease only leaves `rented` when a
// human records renew or move-out; past end_date it stays `ending_soon` in a
// grace window. `ended` exists in the §3 status enum but §16 defines no
// transition into it yet — it is reserved for future use.

export const LEASE_STATUSES = ['active', 'ending_soon', 'renewed', 'ended', 'vacated'] as const;
export type LeaseStatus = (typeof LEASE_STATUSES)[number];

// A listing with a lease in one of these statuses derives to `rented` (§3).
export const LEASE_LIVE_STATUSES = ['active', 'ending_soon'] as const;

export type LeaseActor = 'agent' | 'system';

export type LeaseAction =
  | 'mark_ending_soon' // system, 30 days before end_date
  | 'renew' // agency records renewal → NEW lease created, old one → renewed
  | 'record_move_out'; // agency records move-out → vacated, listing → available

export interface LeaseTransition {
  from: LeaseStatus;
  action: LeaseAction;
  to: LeaseStatus;
  actor: LeaseActor;
}

export const LEASE_TRANSITIONS: readonly LeaseTransition[] = [
  { from: 'active', action: 'mark_ending_soon', to: 'ending_soon', actor: 'system' },
  { from: 'ending_soon', action: 'renew', to: 'renewed', actor: 'agent' },
  // §16 allows move-out from ending_soon OR active
  { from: 'ending_soon', action: 'record_move_out', to: 'vacated', actor: 'agent' },
  { from: 'active', action: 'record_move_out', to: 'vacated', actor: 'agent' },
];

export function findLeaseTransition(
  from: LeaseStatus,
  action: LeaseAction,
): LeaseTransition | undefined {
  return LEASE_TRANSITIONS.find((t) => t.from === from && t.action === action);
}

export function canLeaseTransition(from: LeaseStatus, action: LeaseAction): boolean {
  return findLeaseTransition(from, action) !== undefined;
}

export function isLeaseLive(status: LeaseStatus): boolean {
  return (LEASE_LIVE_STATUSES as readonly LeaseStatus[]).includes(status);
}

// §16: end_date is DERIVED — start_date + term_months. One implementation,
// used by the API, the UI and the agreement PDF so paper and app agree.
export function leaseEndDate(startDate: Date, termMonths: number): Date {
  const end = new Date(startDate);
  end.setMonth(end.getMonth() + termMonths);
  return end;
}
