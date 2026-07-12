// Owner-intake state machine — the SPEC §15 transition table, verbatim.
// Built in phase 10, but the table lives here from day one so the schema,
// API and UI share one source of truth.

export const INTAKE_STATUSES = ['submitted', 'accepted', 'converted', 'declined', 'expired'] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export type IntakeActor = 'owner' | 'agent' | 'system';

export type IntakeAction =
  | 'submit' // owner submits basics + photos, picks one agency
  | 'accept'
  | 'decline' // reason required
  | 'expire' // no agency response in 5 days
  | 'convert' // after the meetup → owner link + prefilled listing
  | 'abandon' // agency abandons after accepting (reason required) → declined
  | 'reassign'; // owner re-sends a declined/expired intake to another agency

export interface IntakeTransition {
  /** null = intake creation */
  from: IntakeStatus | null;
  action: IntakeAction;
  to: IntakeStatus;
  actor: IntakeActor;
}

export const INTAKE_TRANSITIONS: readonly IntakeTransition[] = [
  { from: null, action: 'submit', to: 'submitted', actor: 'owner' },
  { from: 'submitted', action: 'accept', to: 'accepted', actor: 'agent' },
  { from: 'submitted', action: 'decline', to: 'declined', actor: 'agent' },
  { from: 'submitted', action: 'expire', to: 'expired', actor: 'system' },
  { from: 'accepted', action: 'convert', to: 'converted', actor: 'agent' },
  { from: 'accepted', action: 'abandon', to: 'declined', actor: 'agent' },
  // The owner–agency tie only becomes permanent at conversion (§15), so before
  // that a declined or expired intake can be re-sent to a different agency.
  // Same intake row, new agency, back to `submitted`.
  { from: 'declined', action: 'reassign', to: 'submitted', actor: 'owner' },
  { from: 'expired', action: 'reassign', to: 'submitted', actor: 'owner' },
];

export const INTAKE_TIMERS = {
  submittedExpiresAfterDays: 5,
} as const;

export function findIntakeTransition(
  from: IntakeStatus | null,
  action: IntakeAction,
): IntakeTransition | undefined {
  return INTAKE_TRANSITIONS.find((t) => t.from === from && t.action === action);
}

export function canIntakeTransition(from: IntakeStatus | null, action: IntakeAction): boolean {
  return findIntakeTransition(from, action) !== undefined;
}
