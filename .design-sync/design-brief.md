# Guri — screens and logic brief for Claude Design

Paste the relevant sections into claude.ai/design chats so generated designs
respect the app's real business logic. Derived from SPEC §2–§5, §15–§16 and
`packages/shared` (states are verbatim from the transition tables).

## Global rules (every screen)

- Roles: customer, owner, agency staff (admin/agent — agents may hold a
  `can_verify` permission), platform admin. One sign-in for all — no separate
  portals; multi-role users get a role switcher. Signing up makes you a customer.
- Listing status is derived, never edited: live lease → `rented` (slate); open
  deal in awaiting_docs/docs_in_review/approved → `reserved` (amber); else
  `available` (forest). Never design a "set status" control.
- No money moves in the app. Agencies record off-platform payments (deposit,
  advance_rent, monthly_rent, commission). Never design pay/checkout/wallet UI.
  All amounts USD.
- Phone is contact data, never a login. Actions use call + wa.me links. Email is
  auth-only — never a notification channel. In-app notifications (bell) are the
  channel.
- Bilingual so/en, Somali first, sentence case, no ALL CAPS. Mobile: bottom tabs
  (Daawo · Liis-geli · Codsiyadayda · Akoonka). Customer desktop: top header +
  brand mark. Console/admin desktop: sidebar OK.
- ID/ownership documents open via short-lived audited links — a deliberate
  button, never inline auto-preview.

## Deal state machine (buttons depend on state AND role)

States: requested → viewing_scheduled → awaiting_docs → docs_in_review →
approved → closed. Exits: expired (system), withdrawn (customer, any open
state), declined_by_agency (from requested), no_show / declined (post-viewing),
docs_rejected (back to customer).

| State | Customer | Agent |
|---|---|---|
| requested | status + withdraw | schedule viewing (confirms customer phone) or decline request |
| viewing_scheduled | viewing time + withdraw | reschedule; record outcome: proceeding / no-show / declined |
| awaiting_docs | capture ID (camera-first, gallery fallback; national ID or passport only, no OCR) + withdraw | waiting |
| docs_in_review | waiting + withdraw | can_verify members only: view ID → approve / reject |
| approved | waiting + withdraw | close deal → records agreement, creates lease |
| closed | tenancy starts | agreement PDF |

Verify is its own named action even when the same person closes — never fold it
into "close".

## Leases

active → ending_soon (timer nudges) → agent records renew or move-out
(vacated); move-out also allowed from active. Nothing auto-terminates a
tenancy. Agents log payments against a lease. A customer with a live lease
cannot leave the platform.

## Owner intakes

Owner submits home via /list-house choosing ONE agency → submitted. Agency
accepts or declines; accepted → agent converts into a listing;
declined/expired → owner may reassign to another agency. Nothing is public
until an agency converts + publishes. Publish requires owner documents
(free-text label + optional note — NO fixed type menu) and a ticked
"originals verified" attestation.

## Screens

Customer: `/` (hero + profile card), `/browse` (filters: fixed Mogadishu
district list, rent range USD/month, bedrooms, type apartment/house/room/villa,
sort; cards: photo, district, beds/baths, $X/month, status chip; no sign-in
needed), `/listings/[id]` (gallery, facts, agency + call/WhatsApp, one lime
Request viewing — sign-in required, disabled when reserved/rented),
`/requests(/[id])` (deal timeline per table), `/agencies` + `/list-house`
(directory → intake form, pick one agency), `/welcome` (role router),
`/sign-in|/sign-up` (Clerk).

Agency console: `/console` (KPIs: live listings, open deals, viewings today,
action queue), `/console/leads` (intakes: accept/decline/convert),
`/console/listings(/new,/[id])` (photos, facts, owner-docs area with free-text
labels + attestation, publish gate, per-listing requests),
`/console/deals/[id]` (timeline, contact links, scheduling, outcomes, ID
review approve/reject behind can_verify, close, agreement PDF),
`/console/tenancies` (payments, renew, move-out), `/console/owners`,
`/console/staff` (agency-admin only: add agent, toggle can_verify/admin).

Owner: `/owner` (dashboard), `/owner/properties(/[id])` (read-only),
`/owner/intakes` (+ reassign), `/owner/income` (read-only payments).

Platform admin: `/admin` (agencies table, create agency + first admin email,
suspend), `/admin/metrics`, `/admin/audit` (append-only trail incl. document
views).

## Never design

Payment/checkout flows · phone/SMS login or OTP · a "verifier" login or
separate agency-admin portal · manual listing-status togglers · document-type
dropdowns for owner papers · auto-ending tenancies · email notification
settings · "sign up as agency".
