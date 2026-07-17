# Rental platform MVP — build spec (Mogadishu pilot)

**Version 1.12 · July 2026** (v1.1 owner intake §15 · v1.2 verifier separation → phase 2 · v1.3 pinned stack §11 · v1.4 deployment checklist · v1.5 lease lifecycle §16 · v1.6 build order reframed as phases · v1.7 strict ID capture, flexible owner-document area, verify as a `can_verify` permission · v1.8 → superseded · v1.9 auth is Clerk with Google-first login; phone is unverified contact data; no SMS on any auth path · v1.10 one sign-in for all roles, roles resolved server-side §2 · v1.11 deactivation & access revocation §17 · v1.12 agency onboarding via public application §18)
Mobile-first web app (PWA) · Somali + English UI · All amounts in USD · Launch market: Mogadishu (Banaadir)

---

## 1. What this is

A rental marketplace where every listing is created and managed by a licensed agency on behalf of a property owner. Customers browse with a lightweight profile and identity is verified only at deal-closing time. Trust comes from three mechanisms: every house is permanently tied to one accountable agency, every document and verification decision is stored in an immutable audit log, and the platform admin can inspect any deal end to end.

Houses enter the system two ways: an agency lists a property for an owner it already manages, or an owner submits their house through the app and picks an agency to represent it (§15). Either way nothing is publicly visible until the agency has met the owner and verified the property — every live listing has exactly one source of truth: its agency.

The MVP moves no money. Payments happen off-platform and are recorded by the agency, which powers the owner's income dashboard. Mobile-money integration (EVC Plus / Zaad) is a phase-2 upgrade.

---

## 2. Roles and permissions

| Role | Can do | Cannot do |
|---|---|---|
| **Customer** | Sign up with Google (or email + password), add name and phone, browse and filter listings, request a house, track deal status, upload ID when asked, download the signed agreement | Edit listings, see other customers, see owner details |
| **Owner** | Sign up directly or via agency invite, submit a property and choose an agency to represent it (§15), view own properties, current tenants, and payment history | Create or edit live listings, act on deals |
| **Agency admin** | Everything an agent can do, plus manage staff (including granting `can_verify`) and edit agency profile | Act on another agency's listings or deals |
| **Agent** (agency staff) | Create owners and listings, manage the request queue, schedule viewings, record outcomes, generate agreements, log payments, manage leases; **if granted `can_verify`, also approve/reject customer documents** | Approve/reject documents without the `can_verify` permission |
| **Platform admin** | Approve/suspend agencies, create first agency admin, open any deal's audit view, see platform metrics | Edit listing content or deal states on behalf of agencies |

One user account can hold several roles (common in small agencies). A one-person agency runs deals and verifies documents from a single account with `can_verify` enabled — the audit log still records the verification as its own distinct action. Every permission check is scoped: agency staff can only ever touch objects belonging to their own agency.

**There is exactly one sign-in for all five roles.** Roles are never self-declared — the client cannot claim one, and there is no "sign up as an agency" button. After Clerk authenticates the user, the API resolves their roles from the database and the app routes accordingly:

| Role | How you get it | Where you land |
|---|---|---|
| Customer | Default for anyone who signs up | Browse |
| Owner | An agency created you (`owners` row) and sent an invite link | Owner dashboard |
| Agent | An agency head added your email (`agency_members`, `role: agent`) | Agency console |
| Agency head | An `agency_members` row with `role: admin` | Agency console + staff, leads, KPIs |
| Platform admin | Seeded from an environment allowlist — never self-serve | Admin tool |

A user with two or more roles (e.g. a landlord who also rents, or an agency head who browses) gets a **role switcher** in the header — never a second account, which would fracture `audit_log.actor_id` across two identities for the same human. Note that head and agent share one console: admin-only sections are permission-gated, not a separate app.

How an agency gets onto the platform in the first place — a public application reviewed by the platform admin, never self-provisioning — is specified in §18.

---

## 3. Data model

All tables have `id`, `created_at`, `updated_at`. Types shown loosely; use UUIDs for ids.

```
users             clerk_user_id (unique), email, phone (contact only — NOT verified, NOT a credential),
                  name, photo_key?, locale (so|en), active
                  ← mirrored from Clerk via webhook so deals/leases/audit_log keep real foreign keys
agencies          name, phone, districts[], status (pending|active|suspended)
agency_members    user_id, agency_id, role (admin|agent), can_verify (bool), active
owners            user_id, agency_id, created_by (agency user), invite_status
listings          agency_id, owner_id, district, neighborhood?, type (apartment|house|room|villa),
                  bedrooms, bathrooms, rent_usd, deposit_usd, description_so, description_en,
                  photos[] (keys), status (derived: available|reserved|rented)
owner_documents   owner_id, listing_id?, label (free text, e.g. "title deed", "guarantee letter"),
                  file_key, originals_verified (bool, required true), note?, uploaded_by
deals             listing_id, customer_id, agent_id?, state (see §4), viewing_at?, outcome_reason?
deal_events       deal_id, from_state, to_state, actor_id, note        ← full state history
customer_documents deal_id, customer_id, id_type (national_id|passport), file_key, captured_via (camera|gallery),
                  status (pending|approved|rejected), reviewed_by?, reviewed_at?, review_note?
agreements        deal_id, pdf_key, signed_scan_key?, generated_at, signed_at?
leases            listing_id, customer_id, deal_id, start_date, term_months, end_date (derived),
                  rent_usd, deposit_usd, renewed_from_lease_id?,
                  status (active|ending_soon|renewed|ended|vacated)
payments          lease_id, type (deposit|advance_rent|monthly_rent|commission), amount_usd,
                  paid_on, recorded_by, note?
audit_log         actor_id, action, object_type, object_id, meta (json)   ← append-only
notifications     user_id, channel (sms|wa_link|inapp), template, payload, sent_at?
intakes           owner_user_id, agency_id, district, neighborhood?, type, bedrooms, bathrooms,
                  expected_rent_usd?, photos[], docs[]?, notes?, listing_id?,
                  status (submitted|accepted|converted|declined|expired), decline_reason?
```

Design rules:

- **Listing status is derived, never written directly.** `rented` while the listing has a live lease (`active` or `ending_soon`); `reserved` if any deal is in `viewing_scheduled`, `awaiting_docs`, `docs_in_review`, or `approved`; otherwise `available`. A lease reaching `ended` or `vacated` returns the listing to `available`. Recompute on every deal/lease transition.
- **`deal_events` is written on every transition** by the state-machine layer, not by hand. It doubles as the funnel-analytics source.
- **`audit_log` additionally records every document *view*** (who opened which file when), plus every verification decision. Append-only: no update or delete path exists in the application.
- **`advance_rent` exists as a payment type** so agencies can log multi-month advance payments (a common local practice) without any schema change.
- **Owner documents attach to the owner (and optionally a listing) at listing time** and are reused across every future deal on that property. Customer documents attach per deal but hang off the customer, enabling a "verified renter" shortcut in phase 2.
- **Auth is Clerk, with "Continue with Google" as the primary path and email + password as fallback.** No SMS anywhere, so no gateway blocks launch and nothing is billed per message (phone/SMS auth is the one thing IDaaS free tiers charge for; email and social logins are free). Nearly every Android user in this market already has a Google account, so the best login is the one with no password to forget — and password reset becomes Clerk's self-service problem, not a manual database edit. Clerk owns sessions, hashing, lockout, and reset; the app owns authorization (agency scoping, roles) and the audit trail.
- **The `users` table mirrors Clerk, it does not replace it.** A Clerk webhook creates/updates the local `users` row keyed by `clerk_user_id`. This is non-negotiable: `deals.customer_id`, `leases.customer_id`, `audit_log.actor_id`, and `agency_members.user_id` are all foreign keys, and the audit trail (§9) is worthless if identity lives only in a vendor's cloud. API requests carry a Clerk JWT, which a guard resolves to the local user row.
- **Phone is contact data, not a credential — and it is never verified at signup.** It's how the agency calls or WhatsApps the customer, and it self-verifies exactly where it matters: a fake number dies when the agency tries to schedule the viewing (§4). This keeps signup lightweight, which is the whole premise of §1 — identity is checked deeply at deal-closing, not at the door.
- **Email is an auth channel, not a notification channel.** Many people here created an email address for the Play Store and never open it. Status updates go in-app and over WhatsApp deep links (§7); do not route viewing reminders or deal updates to email.
- **Owner documents are a flexible area, not a fixed menu.** Ownership proof in this market varies too much for a rigid type dropdown, so the agent uploads whatever papers exist with a free-text `label` and optional `note`. The one required guardrail is `originals_verified`: the agent must attest they physically inspected the original documents before the listing can publish. That named attestation — not the document type — is what makes the flexible pile defensible in a dispute, and it aligns with the in-person check that is already authoritative in §15.
- **Customer ID capture is strict on *what*, lenient on *how*.** The customer submits a clear photo of a national ID or passport (`id_type`), captured directly via the camera or, as a fallback, chosen from the gallery (`captured_via`). No OCR, auto-crop, or in-browser document detection in the MVP — the human verifier judges quality and uses `docs_rejected` (§4) to request a better photo. This gives the verifier a real face and name while avoiding brittle client-side vision.
- **Verification is a permission (`can_verify`), not a separate account.** Any agency member with `can_verify` may approve/reject documents on their agency's deals, so a one-person agency needs only one login. Even when the same person runs and verifies a deal, the verify decision is written to `audit_log` as its own distinct action — never folded into the close event — so the four-eyes story stays recoverable. Enforced separation (blocking self-verification once an agency has ≥2 `can_verify` members) is the phase-2 upgrade (§14) and needs no rework, just a rule flip.

---

## 4. Deal state machine

Active states: `requested → viewing_scheduled → awaiting_docs → docs_in_review → approved → closed`
Terminal states: `expired`, `withdrawn`, `declined_by_agency`, `no_show`, `declined`, `docs_rejected`

| From | Action (actor) | To | Side effects |
|---|---|---|---|
| — | Customer requests a listing | `requested` | Deal created, joins queue; agency notified |
| `requested` | Agency selects + sets viewing time (agent) | `viewing_scheduled` | Listing → reserved; customer notified with time + agency contact |
| `requested` | Agency declines request (agent) | `declined_by_agency` | Customer notified |
| `requested` | Customer withdraws | `withdrawn` | — |
| `requested` | 14 days with no agency action (system) | `expired` | Customer notified |
| `viewing_scheduled` | Reschedule (agent) | `viewing_scheduled` | New time; customer notified |
| `viewing_scheduled` | Record outcome: no-show (agent) | `no_show` | Listing released*; customer notified |
| `viewing_scheduled` | Record outcome: declined (agent) | `declined` | Listing released*; queue reopens for picking |
| `viewing_scheduled` | Record outcome: proceeding (agent) | `awaiting_docs` | Customer prompted to upload ID |
| `awaiting_docs` | Customer uploads ID photo | `docs_in_review` | Members with `can_verify` notified |
| `docs_in_review` | A `can_verify` member approves | `approved` | Agreement generation unlocked; agent + customer notified |
| `docs_in_review` | A `can_verify` member rejects (with note) | `docs_rejected` | Listing released*; customer notified, may re-upload a clearer photo |
| `approved` | Agent closes: signed scan uploaded + deposit and first rent logged + **lease term set** | `closed` | Lease created (term drives `end_date`); listing → rented; owner notified; **all other queued deals on this listing auto-close** with a courteous notice |
| any active | Customer withdraws | `withdrawn` | Listing released* if it was the active deal |

\* "Listing released" = status recomputes; if other `requested` deals exist, the agency picks the next from the queue, otherwise the listing shows `available`. The queue keeps accepting new requests even while a listing is reserved.

**Timers (background jobs):**

| Condition | Delay | Action |
|---|---|---|
| Deal in `requested`, untouched | 14 days | → `expired`, notify customer |
| Viewing time passed, no outcome recorded | 72 hours | Nudge the assigned agent |
| Deal stuck in `viewing_scheduled` | 7 days past viewing time | Auto-release listing, deal → `expired`, notify both |
| Deal in `docs_in_review` | 48 hours | Remind `can_verify` members |
| Customer signs any lease | immediate | Auto-withdraw their other open requests |
| Lease `end_date` approaching | 30 days before | Lease → `ending_soon`; notify tenant, agency, owner to decide (see §16) |
| Lease `end_date` reached, no decision recorded | on the day | Enter grace window (§16); nudge agency daily |

**Verification:** any agency member with the `can_verify` permission may decide on any of their agency's deals, including deals they run themselves. The append-only audit trail (§3, §9) — which logs the verify decision as its own action — plus platform-admin spot checks are the safeguard; enforced separation of duties is deferred to phase 2 (§14).

---

## 5. Screens per role

Mobile-first throughout (≈380 px design width). The agency console must also be comfortable on desktop.

### Customer (6 screens)

1. **Onboarding** — *Continue with Google* (primary) or email + password, via Clerk's prebuilt component → then name + phone (phone is contact info, unverified). Photo optional. No documents at signup.
2. **Browse** — card list (cover photo, rent USD/month, beds, district, status chip). Filters: district, price range, bedrooms, type. Sort: newest, price. Infinite scroll, lazy-loaded compressed images.
3. **Listing detail** — photo gallery, facts, bilingual description, agency card with call and WhatsApp buttons, one primary action: *Request this house*.
4. **My requests** — list with status chips (in queue, viewing on {date}, upload your ID, in verification, approved — signing, rented, closed/declined/expired).
5. **Deal tracker** — vertical timeline of the deal's states, viewing appointment details, and the ID step: a direct **camera-capture** component prompting a clear photo of a national ID or passport (gallery fallback for a separately-taken photo), preview-and-retake before submit, plus a re-capture prompt if the verifier rejects. Agreement download after closing.
6. **Profile** — edit name/photo/email, language toggle (so/en), current tenancy card (property, rent, lease end date, "renewing / moving out" once the agency records it), and a *leave platform* option (§16).

### Agency console (7 screens)

1. **Dashboard** — today's viewings, unanswered requests count, deals awaiting verification, listings by status.
2. **Owners** — create owner (name + phone → sends SMS invite), owner list with claim status.
3. **Listing editor** — owner select, district + free-text neighborhood, type, beds/baths, rent, deposit, bilingual description, multi-photo upload (client-side compression), and a flexible **owner-document area**: upload any papers that exist, each with a free-text label and optional note, plus a required *"I have physically verified the original documents"* checkbox (`originals_verified`) that must be ticked to publish. Publish.
4. **Queue** — per listing: requests with customer mini-profile and request age. Actions: *select & schedule viewing* (date/time), *decline*.
5. **Deal detail** — full timeline, record viewing outcome (no-show / declined / proceeding), document review pane (`can_verify` members only: view the ID photo, approve or reject with a note), *generate agreement* (prefilled PDF), upload signed scan, log payments (deposit, advance rent, first rent, commission), *close deal*.
6. **Tenancies** — active leases with term and days-to-end; log monthly rent received; when a lease is `ending_soon`, a decision control: *renew* (set new term and optional new rent → follow-on lease, listing stays rented) or *record move-out* (→ listing returns to available). See §16.
7. **Staff** (admin only) — add agents by email, toggle each one's *can verify documents* permission, and *remove* (deactivate) a worker — revoking access instantly while keeping their past actions in the audit log. Cannot remove the last active admin. See §17.

### Owner (4 screens)

1. **Claim & login** — opens from the agency's invite link (sent over WhatsApp/SMS), signs in with Google or email + password via Clerk, confirms name/photo. Owners skew older and may lack email — Google sign-in on their Android phone is the fast path.
2. **Dashboard** — property count, occupied vs available, income this month, total collected.
3. **Property detail** — photos, rent, current lease (tenant name, start/end), payment history table.
4. **Income** — payment ledger filterable by property and month, simple monthly totals. Strictly read-only.

### Platform admin (3 screens)

1. **Agencies** — the §18 application waiting list (approve & set up / decline) at the top; approve/create agency and its first admin user; suspend/reactivate.
2. **Audit** — a recent-deals entry list plus search any deal by id → full timeline, documents, decisions, and the access log.
3. **Metrics** — listings by status, deal funnel (requested → viewed → closed), median days-to-rent, per agency; pending §18 applications counted in the overview.

---

## 6. API surface

REST, JSON, bearer token = Clerk session JWT. A guard verifies the JWT and resolves it to the local `users` row. Every agency-scoped endpoint enforces `agency_id` ownership. ~45 endpoints total across this section, §15, and §18.

**Auth & profile**
```
(sign-in / sign-up / password reset are handled entirely by Clerk's hosted components)
POST /webhooks/clerk         Clerk → upsert/deactivate the local users row (verify signing secret)
GET  /me · PATCH /me         name, phone (contact only), photo, locale
```

**Public / customer**
```
GET  /listings                ?district=&min_rent=&max_rent=&beds=&type=&page=
GET  /listings/{id}
POST /listings/{id}/requests  → creates deal (requested); 409 if customer already has an open deal here
GET  /my/requests
GET  /deals/{id}              party-scoped view (customer sees own; agency sees own)
POST /deals/{id}/documents    customer ID upload (multipart) → state awaiting_docs → docs_in_review
POST /deals/{id}/withdraw
GET  /deals/{id}/agreement    signed PDF download (parties only, after closing)
```

**Agency**
```
POST /owners                        {name, phone} → invite link (SMS/WhatsApp via adapter)
GET  /owners
POST /listings · PATCH /listings/{id}
POST /listings/{id}/photos          multipart, server re-compresses
POST /listings/{id}/owner-docs      {type} + files
GET  /listings/{id}/requests        the queue, oldest first
POST /deals/{id}/select             {viewing_at} → viewing_scheduled (reserves listing)
POST /deals/{id}/decline-request
POST /deals/{id}/viewing-outcome    {result: no_show|declined|proceed, reason?}
POST /deals/{id}/verify             {decision: approve|reject, note} — requires `can_verify`
POST /deals/{id}/agreement          generates prefilled bilingual PDF
POST /deals/{id}/agreement/signed   upload scan
POST /deals/{id}/close              validates: signed scan present + deposit + first rent logged → creates lease
POST /leases/{id}/payments          {type, amount_usd, paid_on, note?}
POST /leases/{id}/renew             {term_months, new_rent_usd?} → new lease, listing stays rented
POST /leases/{id}/end               {result: vacated} → listing returns to available
POST /me/leave                      customer deactivates their own account (§16)
POST /agency/staff                  {email, role, can_verify} · PATCH /agency/staff/{userId}  (toggle can_verify / deactivate — never delete; last-admin protected, §17)
```

**Owner**
```
GET /owner/dashboard · GET /owner/properties · GET /owner/properties/{id} · GET /owner/payments
```

**Platform admin**
```
POST /admin/agencies · PATCH /admin/agencies/{id}     approve, suspend, reactivate (never delete — §17)
GET  /admin/deals/recent                              audit entry list (20 newest deals platform-wide)
GET  /admin/deals/{id}/audit                          timeline + docs + access log
GET  /admin/metrics
```

Agency-application endpoints (public submit + admin review) live in §18.

Implementation notes: all deal transitions go through one state-machine module that validates the transition table in §4, writes `deal_events`, recomputes listing status, and enqueues notifications — no endpoint mutates `deals.state` directly. Document files are served only through short-lived signed URLs issued after a role check, and every issue of a URL writes to `audit_log`.

---

## 7. Notification matrix

Channel strategy: login involves no messaging at all (Clerk/Google). The notification adapter carries deal transitions and the owner invite link (SMS where a gateway exists, WhatsApp otherwise); WhatsApp deep links (`wa.me/{phone}`) wherever a human conversation should happen — free, and how Mogadishu actually communicates; in-app list for everything. Email is for auth only — never route deal updates there. All templates in Somali and English.

| Event | Recipients | Channel |
|---|---|---|
| New request in queue | Agency (assigned staff) | in-app + SMS digest if unread 24 h |
| Viewing scheduled / rescheduled | Customer | SMS with time + agency WhatsApp link |
| Viewing reminder | Customer + agent | SMS, morning of |
| Outcome recorded (declined / no-show) | Customer | SMS |
| ID upload requested | Customer | SMS with link |
| Verification approved / rejected | Customer + agent | in-app + SMS |
| Deal closed | Customer, owner | SMS |
| Queue auto-closed (house rented) | Remaining requesters | SMS, courteous |
| Payment logged | Owner | in-app |
| Lease ends in 30 days | Tenant, agency, owner | in-app + SMS |
| Lease renewed | Tenant, owner | SMS |
| Move-out recorded (listing available) | Owner | in-app |

---

## 8. Background jobs

A single scheduled runner (every 15 min) executes the timer table in §4 and the intake timeout in §15, plus: daily lease-end scan, nightly database backup to offsite storage, weekly orphan-file cleanup, and deletion of customer documents from failed/expired deals after 90 days (retention policy).

---

## 9. Security and data protection

- ID documents and ownership papers encrypted at rest; access only via short-lived signed URLs, gated by role, every access logged.
- Authentication (sessions, password hashing, lockout, reset) is delegated to Clerk; the app never stores passwords. The `/webhooks/clerk` endpoint verifies the signing secret. Authorization stays ours: object-level scoping enforced by guards.
- Strict object-level authorization: agency staff scoped to their agency, customers to their own deals, owners to their own properties.
- `audit_log` and `deal_events` are append-only at the application layer; this is the fraud-protection backbone given verification is done by agency staff (`can_verify` members), and it records each verify decision as its own action.
- Daily automated backups, HTTPS only, no third-party analytics that ship PII.
- Retention: documents from deals that never closed are purged after 90 days; closed-deal documents kept for the lease term + 1 year.

---

## 10. Mogadishu seed data and market notes

**District filter (seed list — confirm the final set with pilot agencies before launch):**
Abdiaziz, Bondhere, Daynile, Dharkenley, Hamar Jajab, Hamar Weyne, Heliwa, Hodan, Howl Wadag, Karan, Kaxda, Garasbaley, Shangani, Shibis, Waberi, Wadajir, Warta Nabada, Yaqshid. (Kaxda and Garasbaley are newer subdivisions; some lists also include Gubadley.)

Renters search by neighborhood (xaafad) at least as much as by district — Taleex, KM4, KM5, Siinaay, Zoobe, Bakaaro — so the listing form carries a free-text `neighborhood` field shown on cards and searchable, without forcing a canonical taxonomy in the MVP.

Other local realities baked into this spec: rent is quoted in USD per month; multi-month advance payments are common, hence the `advance_rent` payment type; ownership paperwork is inconsistent, hence owner documents are a flexible upload area with a free-text label and a required "originals verified" attestation rather than a fixed type menu; WhatsApp and calls dominate communication, hence deep links instead of in-app chat; data is expensive, hence aggressive client-side image compression (resize to ≤1280 px, WebP) and lazy loading everywhere.

---

## 11. Stack (pinned in v1.3)

TypeScript end to end, in one monorepo (pnpm workspaces): `apps/web` (Next.js), `apps/api` (NestJS), `packages/shared` (zod schemas + the §4 and §15 transition tables, imported by both sides so the UI and the API can never disagree about states).

- **Frontend:** Next.js (App Router) + Tailwind CSS + shadcn/ui · `next-intl` (so/en) · `@serwist/next` PWA (add-to-home-screen) · React Hook Form + zod · TanStack Query for the agency console · `browser-image-compression` before every photo upload.
- **API:** NestJS as one long-running Docker container (not serverless — jobs, webhooks, PDF rendering). Guards enforce role + agency scoping on every object; a single state-machine service owns all §4/§15 transitions.
- **Database:** PostgreSQL (managed: Neon or Railway) via Prisma migrations; JSONB for `audit_log.meta`.
- **Jobs:** pg-boss (Postgres-backed queue with retries — no Redis) + `@nestjs/schedule` driving the 15-minute tick in §8.
- **Files:** Cloudflare R2 (S3 API, zero egress fees) with server-side encryption · `sharp` resizes to ≤1280px WebP · short-lived presigned URLs per §9.
- **Auth:** Clerk (free tier) — "Continue with Google" primary, email + password fallback, prebuilt `<SignIn/>` components. No phone/SMS auth (the one thing IDaaS bills per message). A Clerk webhook mirrors users into the local `users` table so foreign keys and the audit trail stay intact. `@clerk/nextjs` on the web, JWT verification guard on the API.
- **PDF:** `@react-pdf/renderer` for the bilingual agreement (no headless Chrome in production).
- **Notifications:** provider-adapter interface; pilot with a local SMS aggregator (e.g. Hormuud enterprise SMS) · `wa.me` deep links cost nothing.
- **Quality/ops:** Sentry · `pino` logs · Vitest + a few Playwright happy paths · GitHub Actions CI · Docker everywhere.
- **Hosting:** web + API + Postgres + worker all on Railway (EU region — lowest practical latency to Mogadishu; one project, three services); Cloudflare CDN in front of R2. Standard containers + Postgres + S3 API means migrating to a VPS with Docker Compose later is trivial.

Deliberately not used: MongoDB (the domain is relational), microservices, Kubernetes, GraphQL, serverless-only APIs.

---

## 12. Build phases

No calendar deadlines — each phase is a checkpoint you clear when it works, then move on. Go as fast as you can review. Build in this order: each phase depends on the one before it, so resist jumping ahead to UI polish before the underlying state machine exists.

| Phase | Build | Cleared when |
|---|---|---|
| 0 · Skeleton | Repo, CI, Postgres schema for all §3 tables, Clerk auth (Google + email) with the user-sync webhook, roles, i18n scaffold, base UI kit | `pnpm dev` runs; a user signs in with Google and a mirrored `users` row appears in Postgres |
| 1 · Agency console | Owners (create + SMS invite), listing editor with photos + owner docs; admin creates agencies | An agency publishes a real listing |
| 2 · Browse & request | Public browse/search/filters, listing detail, request → queue, customer "my requests" | A customer requests a house end to end |
| 3 · Deal engine | Deal state machine + `deal_events`, queue management, select & schedule, viewing outcomes, listing-status derivation | Reserve/release works across the full §4 transition table |
| 4 · Verification | Customer ID upload, verifier review pane, `audit_log` on views + decisions, signed-URL document serving | A deal reaches `approved` with a complete audit trail |
| 5 · Close & lease | Agreement PDF (bilingual), signed-scan upload, close deal → lease with term, payment logging (§16) | A deal closes and the listing shows `rented` |
| 6 · Owner dashboard | Owner claim flow + dashboard (properties, tenancy, income ledger) | An owner sees real income data |
| 7 · Notifications & jobs | Notification service + all templates, background runner with every §4 timer and the §16 lease timers | Stale requests expire on their own; SMS actually arrives |
| 8 · Admin & polish | Platform admin (approve agencies, audit view, metrics), leave-platform flow (§16), empty/error states, Somali translation review | An outsider can complete every flow unassisted |
| 9 · Hardening | Rate limits, backups verified by restore test, monitoring/alerts, load-test photo uploads, launch checklist | Go/no-go review passes → pilot launches |
| 10 · Owner intake | Self-signup path, submission wizard, agency directory, leads inbox, convert-to-listing, timeout (§15) | An owner submits a house, an agency accepts, meets, converts, and publishes |

Phases 0–9 are the pilot MVP. Phase 10 (owner intake) deliberately follows launch — the agency directory only becomes meaningful once real agencies are live (§15) — but if agencies are ready sooner, pull it forward. A team can run independent phases in parallel (e.g. owner dashboard alongside verification) since they touch different surfaces.

---

## 13. Pilot plan and success metrics

Recruit 2–3 agencies with genuine inventory; target 30–50 live listings concentrated in two or three districts (e.g. Hodan, Wadajir) so supply feels dense to early users. Run 6–8 weeks with a weekly funnel review.

Measure from `deal_events` — no extra instrumentation needed:

- Median days from listed → rented (the headline number).
- Funnel conversion: requested → viewing held → proceeding → verified → closed.
- Viewing no-show rate and agency response time to new requests.
- % of closed deals with a complete document set and signed-scan on file (target: 100%).
- Disputes per closed deal (fraud proxy), repeat customers, owner dashboard weekly logins.

The MVP has succeeded if agencies keep listing without being chased, and closing a deal through the platform is faster than closing one off it.

---

## 14. Explicitly out of scope (phase-2 backlog)

Mobile-money integration (EVC Plus / Zaad) for verified payments and in-app deposits · platform-issued verified-renter badge from reusable customer docs · owner approval/veto toggle on tenants · in-app chat · e-signature · agency ratings and reviews · renewal automation and rent-due reminders to tenants · maintenance requests · map-based search · Arabic UI · multi-city expansion · dispute-resolution center · Android/iOS store wrappers · broadcasting an owner intake to several agencies at once · verifier separation of duties (once an agency has ≥2 `can_verify` members, block a member from verifying a deal they ran themselves).

None of these require schema changes: deals, leases, payments, and documents are already modeled to absorb them.

---

## 15. Owner-initiated intake (added in v1.1)

The second way a house enters the system: an owner signs up on their own, submits their property, and chooses an agency to represent it. This is deliberately a lead-and-handoff flow, not self-listing — the submission is never publicly visible. The agency meets the owner in person, checks the property and the original documents, and only then creates the live listing through the normal console flow (§5). From the moment of conversion, the permanent owner–agency tie and every other rule in this spec apply unchanged.

Why it earns a place in phase 1: it reverses the supply problem. Instead of agencies having to source every house, owners bring houses to agencies — and a stream of free, pre-qualified leads is the strongest reason for agencies to join the platform and stay active.

The `intakes` object lives in §3.

**Intake state machine**

| From | Action (actor) | To | Side effects |
|---|---|---|---|
| — | Owner submits basics + photos, picks one agency | `submitted` | Agency notified; photos and any attached docs visible to that agency only |
| `submitted` | Agency accepts | `accepted` | Owner notified with the agency's call/WhatsApp contact; they arrange the meetup themselves |
| `submitted` | Agency declines (reason required) | `declined` | Owner can re-send the same submission to a different agency |
| `submitted` | No agency response in 5 days (system) | `expired` | Owner prompted to choose another agency |
| `accepted` | Agency converts after the meetup | `converted` | Owner linked to the agency (if new); listing created prefilled from the intake; agency completes owner docs and publishes; tie now permanent |
| `accepted` | Agency abandons (reason required) | `declined` | Owner can reassign |

**Rules**

- One agency at a time; broadcasting to several agencies at once stays in the phase-2 backlog (§14).
- The permanent owner–agency tie starts at conversion, not at submission — until then the owner is free to try another agency.
- Documents attached by the owner are optional, exist to help the agency pre-screen, and are visible only to the chosen agency and the platform admin. The authoritative document capture still happens at the meetup, where the agency inspects the originals — photos of papers alone don't prove ownership in this market.
- Nothing from an intake ever appears in public search. This is what stops someone from "listing" a house they don't own: publication requires an agency to have physically stood in it.

**Screens** — Owner: a *List my house* wizard (basics → photos → pick an agency from the directory, filterable by district) and an intake status tracker. Public: agency directory as a card list (name, districts served, live-listing count). Agency: a leads inbox with accept/decline, and a *convert to listing* action that opens the §5 listing editor prefilled from the intake.

**Endpoints**
```
GET  /agencies?district=                  public directory
POST /intakes                             owner submission (grants owner role on first use)
GET  /my/intakes
POST /intakes/{id}/reassign {agency_id}   owner, after declined/expired
GET  /agency/intakes                      leads inbox
POST /intakes/{id}/accept
POST /intakes/{id}/decline {reason}
POST /intakes/{id}/convert                creates owner link + prefilled listing
```

**Notifications:** new lead → agency (in-app + SMS digest if unread 24 h); accepted / declined / expired → owner (SMS); listing published from intake → owner (SMS).

**Timer:** intake in `submitted` for 5 days → `expired`, owner prompted to reassign.

**Build impact:** a self-contained phase (phase 10 in §12), shipped once real agencies are live.

---

## 16. Lease lifecycle and end-of-lease (added in v1.5)

Closing a deal doesn't create an open-ended tenancy — it creates a lease with a **defined term**, and the end of that term is an explicit decision point, not a silent expiry. This is what keeps the `rented` pool honest and the owner dashboard truthful over time.

### Lease term

At the close step (§4) the agent sets `term_months` alongside the signed scan and first payment. `end_date = start_date + term_months`. Common Mogadishu terms are 6 or 12 months; the field is free so the agency enters whatever the paper contract says. The generated agreement (§6) prints start date, term, and end date so the app and the paper always agree.

### Lease states

`active → ending_soon → (renewed | ended | vacated)`

| From | Trigger | To | Effect |
|---|---|---|---|
| `active` | 30 days before `end_date` (system) | `ending_soon` | Tenant, agency, owner notified to decide |
| `ending_soon` | Agency records **renew** (new term, optional new rent) | `renewed` | New `active` lease created, `renewed_from_lease_id` set; **listing stays `rented`**, no gap, no relisting |
| `ending_soon` / `active` | Agency records **move-out** | `vacated` | Listing returns to `available`; deposit-return can be logged as a payment note |
| `ending_soon` | `end_date` passes with no decision | stays `ending_soon` in a **grace window** | Listing stays `rented`; agency nudged daily until they record renew or move-out |

There is no automatic termination: a lease only leaves `rented` when a human records the outcome. This deliberately favors the tenant — nobody is silently evicted by a cron job — and matches reality, where a tenant often stays past the paper end date while renewal is discussed. The grace window simply keeps prompting until someone confirms what actually happened.

### The three end-of-lease paths — plainly

Your question was: when a lease ends, does the house go back, can the person continue, or can they leave entirely? All three are first-class:

1. **Continue (renew).** The tenant stays. The agency records a renewal with a new term and, if it changed, a new rent. A fresh lease is created and linked to the old one for history; the listing never leaves `rented`, so it never re-enters public search and no queue forms. This is the happy path and should be one tap in the tenancies screen.

2. **Move out, stay a user (vacate).** The tenant leaves this property but keeps their account. The lease goes `vacated`, the listing flips back to `available` (and the agency can immediately pick from any waiting queue or take fresh requests). The former tenant keeps their profile and — importantly — their already-verified ID on file (§3), so requesting their next home skips the document step. This is the common case and the reason customer documents hang off the customer, not the deal.

3. **Leave the whole platform.** A user who wants out entirely uses *leave platform* in their profile (`POST /me/leave`). This is only allowed when they have no `active` or `ending_soon` lease — you can't walk away from a live tenancy with one tap; the agency must record the move-out first. On leave, the account is deactivated: the profile is hidden, any open requests withdraw, and personal data is scheduled for deletion per the §9 retention policy, while closed-deal and lease records are retained (anonymized reference) because the owner's historical income and the audit trail must stay intact. Reactivation just means signing in again with the same Google/email account.

### Rules

- Renewal is a **new lease**, never an edit of the old one — this preserves a clean rent history and lets the owner dashboard show "renewed 2×" and rent changes over time.
- A listing can only ever have **one live lease** (`active` or `ending_soon`); the close and renew endpoints reject a second.
- Deposit return isn't a money movement the MVP makes — it's recorded as a `payment` note at move-out so the ledger reflects it.
- `leave platform` is blocked while a lease is live; the UI explains why and points to contacting the agency.

### Screens touched

Agency tenancies screen gains term, days-to-end, and the renew / move-out control. Customer profile gains a tenancy card and the leave-platform option. Owner property detail already shows the current lease; it now also shows term and renewal count. No new screens — this is logic layered onto existing ones.

### Build impact

Folds into phase 5 (close → lease) and phase 7 (the `ending_soon` timer and grace-window nudges); the leave-platform path is a small addition to phase 8's admin/profile work. No schema migration beyond the lease fields already added in §3.

---

## 17. Deactivation and access revocation (added in v1.11)

One principle governs every "delete", "remove", or "stop" action in the system: **deactivate, never destroy.** Access is revocable instantly; history is permanent. Nothing that an `audit_log` row, a `deal_events` row, a lease, or a payment points at is ever hard-deleted, because the audit trail (§9) and the owner's historical income depend on those foreign keys staying intact. Every removal is a status or `active` flag flip, enforced at the API guard so it takes effect on the very next request — not merely hidden in the UI.

This section closes a real MVP gap: the system could create and suspend, but several necessary revocation paths were missing or UI-only.

### The four relationships

**Platform admin → agency: suspend only, never delete.**
`PATCH /admin/agencies/{id}` sets `status: suspended`. There is no delete-agency endpoint and there must never be one — every deal that agency ever ran points at it. Suspension must *fully* take effect, not just set a flag:
- the agency's listings drop out of public browse and search (the visibility/derivation path must exclude `suspended` agencies);
- its staff are blocked at the guard (a member of a suspended agency gets 403 on agency routes);
- in-flight deals freeze — no new agency actions — while existing leases stay readable so owners and tenants aren't stranded mid-tenancy;
- reactivation (`status: active`) restores everything. Suspension is reversible by design.

**Agency head → worker: remove = deactivate the membership.**
This was the missing action. `PATCH /agency/staff/{userId}` with `active: false` revokes a worker's access immediately — the guard rejects any request from an inactive membership on the next call, so a departed employee cannot open the console or view customers' IDs. The person's `users` row and their past actions stay intact and attributable. Guard-rails:
- a head cannot deactivate the last active admin of an agency (an agency must never become headless — return a clear error);
- deactivating a worker who is the assigned agent on live deals must reassign those deals (or flag them for the head), never orphan them;
- `can_verify` is revoked the same way — flip the flag; past verifications remain logged.

**Agency → owner it created: deactivate only, and only when clear.**
No hard delete (the owner's leases and the owner's income history point at them). An owner may be deactivated only when they have no `active` or `ending_soon` lease — the same guard as leave-platform. Their historical leases and payments are retained.

**Owner / customer → themselves: leave-platform (already built, §16).**
Self-deactivation via `POST /me/leave`, blocked while any live lease exists, personal data scheduled for deletion per §9 while closed-deal and lease records are retained as anonymized references. This is the self-service instance of the same principle.

### Rules

- No endpoint anywhere performs a hard `DELETE` on users, agencies, memberships, owners, listings, deals, leases, or payments. The only deletions in the system are the §8 retention purges (documents from failed/expired deals after 90 days, orphan files) — never records that carry history.
- Every revocation is enforced at the guard, verified by a test that the deactivated actor is rejected *at the API*, not just absent from the UI.
- Every revocation is itself written to `audit_log` (who deactivated whom, when).
- Reactivation is always possible for suspend (admin) and membership (head); leave-platform reactivates by signing in again.

### Screens touched

Admin agencies screen: the suspend action already exists — confirm it fully takes effect and add a reactivate control. Agency staff screen: add a *remove* (deactivate) control per worker alongside the existing `can_verify` toggle, with the last-admin guard-rail surfaced as a disabled state + hint. No new screens.

---

## 18. Agency onboarding — public application (added in v1.12)

How an agency joins the platform. §2's rule stands unchanged — **there is no "sign up as an agency"**; roles are never self-declared. What exists instead is a lead-and-review flow, the agency-side mirror of §15's owner intake: a prospective agency applies publicly, and the platform admin reviews a waiting list and provisions the real agency manually.

**Why:** agencies were previously created only by the platform admin (created straight to `active`), so the admin's pending queue had no inflow and a prospective agency had no route in besides word of mouth. The public directory (§15) now carries a *"Run an agency? Get verified on Guri"* card with three channels: an **Apply** form, WhatsApp, and email.

**Flow**

| Step | Actor | What happens |
|---|---|---|
| Apply | Anyone (public, no login) | `POST /agency-applications` — agency name, phone, districts served, contact name + email, optional note. Creates an `agency_applications` row in `pending`. Grants **nothing**: no account, no role, no visibility. Throttled like other public submissions. |
| Review | Platform admin | The waiting list on the admin agencies screen (and a count on the metrics overview). |
| Approve | Platform admin | Runs the same `createAgency` path as manual onboarding: real `agencies` row (`active`) + first admin member (`can_verify`), keyed by the applicant's contact email so their Clerk sign-in links to it (§2 role resolution). Application stamped `approved` with the created agency id. |
| Decline | Platform admin | Application stamped `declined`. Nothing else changes. |

**Rules**

- An application is a lead, not an identity: the `agency_applications` table is deliberately separate from `agencies`, so unreviewed public input never touches the trusted set (directory, metrics, counts).
- Both decisions are written to `audit_log` (`agency_application.approved` / `.declined`) with the acting admin.
- Approval reuses the one tested provisioning path — no forked agency-creation logic.
- An application can be reviewed once: approve/decline on an already-reviewed row is rejected.

**Endpoints**

```
POST /agency-applications                       public, throttled (15/min per IP)
GET  /admin/agency-applications                 pending waiting list (platform admin)
POST /admin/agency-applications/{id}/approve    → creates the agency; returns its id
POST /admin/agency-applications/{id}/decline
```

**Screens** — Public: `/apply` form + the directory CTA card (§15). Admin: waiting list embedded at the top of the agencies screen; pending count on the metrics overview.

A small cross-cutting phase (call it phase 8.5, before phase 11): mostly verifying suspend's full effect and adding the worker-deactivate action + guard-rails. Schema already supports it (`agencies.status`, `agency_members.active`, `users.active`) — no migration. It touches guard/endpoint logic, so it is not a pure-visual pass.