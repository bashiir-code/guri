import type { ListingStatus } from '../enums';

// SPEC §3 design rule: listing status is derived, never written directly.
// `rented`  — the listing has a live lease (active | ending_soon)
// `reserved` — any deal is in viewing_scheduled | awaiting_docs | docs_in_review | approved
// `available` — otherwise
// The API's state-machine service recomputes this on every deal/lease
// transition and persists the result; no endpoint sets it by hand.
export function deriveListingStatus(input: {
  hasLiveLease: boolean;
  hasReservingDeal: boolean;
}): ListingStatus {
  if (input.hasLiveLease) return 'rented';
  if (input.hasReservingDeal) return 'reserved';
  return 'available';
}
