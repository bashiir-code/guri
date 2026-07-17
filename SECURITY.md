# Guri — security posture (SPEC §9)

Phase-9 hardening audit. Every claim below is enforced by a test in
`apps/api/test/security-pass.spec.ts` (10 tests) unless noted, so a regression
breaks the build rather than shipping silently.

## 1. Document access — presigned-only, role-gated, audited

ID documents, ownership papers, and agreements are **never** served as static
URLs. Access always goes through an explicit issuance:

- `DocumentsService.issueUrl` / `AgreementsService.issueUrls` / `issueOwnerDocUrl`
  presign a GET with a **short TTL** — `DOCUMENT_URL_TTL_SECONDS = 300` (5 min).
- Issuance is **role-gated**: the customer on the deal, a `can_verify` member of
  the **owning** agency, or a platform admin. Everyone else → `403`.
- **Every issuance writes an `audit_log` row** (`document.url_issued`) with the
  viewer role and TTL. The admin audit view (`GET /admin/deals/:id/audit`)
  surfaces exactly who viewed a customer's ID and when.
- Objects are encrypted at rest at the bucket (MinIO SSE locally, R2 default
  encryption in prod). The presigned URL is the only read path for end users;
  `StorageService.getObject` exists for trusted server paths only (backups).

## 2. `audit_log` is append-only

- The **only** write is a single `auditLog.create` in `AuditService`. No
  `update` / `delete` / `upsert` / `updateMany` / `deleteMany` exists anywhere,
  and no raw SQL touches the table.
- `deal_events` is likewise write-once via `DealStateService`.

## 3. Authentication is Clerk; authorization is ours

- The app **never mints a session or signs a JWT**. `jose` appears in exactly
  one file (`clerk-verifier.service.ts`) and is used only to **verify** Clerk
  tokens against the Clerk JWKS (`jwtVerify` + `createRemoteJWKSet`).
- The Clerk webhook verifies the **Svix signature** against the raw body before
  trusting any payload; a bad signature → `400 invalid_signature`.

## 4. Object-level authorization on every route

Every controller is guarded by `ClerkAuthGuard` plus the appropriate scoping
guard, **except** five intentional public surfaces (asserted by an allowlist in
the test — anything new that skips auth fails the build):

| Controller | Base path | Guards | Scope |
|---|---|---|---|
| `me.controller` | `/me` | ClerkAuthGuard | self (`req.user.sub`) |
| `account.controller` | `/me/leave` | ClerkAuthGuard | self |
| `notifications.controller` | `/me/notifications` | ClerkAuthGuard | self |
| `deals.controller` | `/deals`, `/listings/:id/requests`, `/my/*` | ClerkAuthGuard | customer owns the deal (service-checked) |
| `agency-deals.controller` | `/deals/:id/*` (agency actions) | ClerkAuthGuard + **AgencyGuard** + `@AgencyRoles('agent')` | own agency |
| `listings.controller` | `/listings` (write), `/agency/listings`, `/owner-docs` | ClerkAuthGuard + **AgencyGuard** + `@AgencyRoles('agent')` | own agency |
| `leases.controller` | `/leases/:id/*` | ClerkAuthGuard + **AgencyGuard** + `@AgencyRoles('agent')` | own agency |
| `owners.controller` | `/owners` | ClerkAuthGuard + **AgencyGuard** + `@AgencyRoles('agent')` | own agency |
| `staff.controller` | `/agency/staff` | ClerkAuthGuard + **AgencyGuard** + `@AgencyRoles('admin')` | own agency, admin only |
| `owner.controller` | `/owner` | ClerkAuthGuard + **OwnerGuard** | own properties |
| `owner-intakes.controller` | `/intakes`, `/my/intakes` | ClerkAuthGuard | self (submitter) |
| `agency-intakes.controller` | `/agency/intakes`, `/intakes/:id/*` (agency actions) | ClerkAuthGuard + **AgencyGuard** | own agency |
| `admin.controller` | `/admin/*` | ClerkAuthGuard + **PlatformAdminGuard** | env allowlist |
| `admin-agency-applications.controller` | `/admin/agency-applications` | ClerkAuthGuard + **PlatformAdminGuard** | env allowlist |
| `health.controller` | `/health` | — (public) | no data; monitoring only |
| `public-listings.controller` | `GET /listings`, `/listings/:id` | — (public) | published available/reserved only |
| `public-agencies.controller` | `GET /agencies` | — (public) | active agencies only (§15 directory) |
| `public-agency-applications.controller` | `POST /agency-applications` | — (public, throttled) | write-only lead; grants no access, exposes no data |
| `webhooks/clerk` | `/webhooks/clerk` | — (Svix-signed) | signature-verified machine traffic |

Verification is a `can_verify` permission on `agency_members`, checked by the
`/deals/:id/verify` handler against agency scope — **not** a separate role
(rule 9).

## 5. Rate limiting (§9)

Global default 300 req/min. Tightened per-endpoint via `RATE_LIMITS`
(`apps/api/src/common/throttle.ts`), tracked **per authenticated user** (bearer
`sub`) and **per IP** for anonymous browse:

| Endpoint(s) | Limit / min | Why |
|---|---|---|
| doc-URL issuance, agreement, owner-doc URL, intake-doc URL | 20 | presign + audit write each call |
| uploads (photos, ID, owner docs, intake photos) | 30 | sharp re-encode is CPU-heavy |
| request creation, intake submission, agency applications | 15 | queue-spam guard |
| `/me/leave` | 5 | rare + destructive |
| public browse, `GET /agencies` directory | 120 (per IP) | human scroll ok, scraper slowed |

The Clerk webhook and `/health` are `@SkipThrottle()` (machine traffic).

## 6. Retention (§9)

The daily job purges `customer_documents` from deals that never closed
(`expired`, `withdrawn`, `declined_by_agency`, `no_show`, `declined`,
`docs_rejected`) after **90 days**, deleting the encrypted object too.
**Closed-deal documents are kept** (lease term + 1 year). Proven by test:
old dead-deal docs are removed; closed-deal and recent docs are untouched.

## 7. Transport & data

HTTPS only in prod (Railway terminates TLS; Cloudflare proxies in **Full**
SSL mode in front — see `LAUNCH.md` §3). No third-party analytics
that ship PII. Structured `pino` logs redact credentials, PINs, tokens, and live
presigned URLs before anything is written (`apps/api/src/common/logger.ts`,
proven in `logging-redaction.spec.ts`).

## Reporting

Pilot: email the platform admin (`PLATFORM_ADMIN_EMAILS`). Post-pilot: stand up
a dedicated security contact + disclosure policy before public launch.
