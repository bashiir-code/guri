# Guri — project brief for Claude Code

You are building **Guri**, a rental marketplace for Mogadishu where every home is
represented by a verified agency. The full specification is in `SPEC.md` — read it
before starting any task, and treat it as the source of truth. When something here
and `SPEC.md` seem to differ, ask rather than guess.

## What we're building

A mobile-first web app (PWA) with four roles — customer, owner, agency staff
(agent/admin, with a `can_verify` permission), and platform admin. Identity is
verified only at
deal-closing time; every listing is permanently tied to one accountable agency.
The MVP moves no money — payments are recorded by agencies off-platform.

## The stack is decided — do not substitute (see SPEC §11)

- TypeScript everywhere, one pnpm monorepo: `apps/web`, `apps/api`, `packages/shared`.
- Frontend: Next.js (App Router) + Tailwind + shadcn/ui + next-intl (so/en) + Serwist PWA.
- API: NestJS, one long-running container. Prisma + PostgreSQL.
- Jobs: pg-boss + @nestjs/schedule. Files: S3-compatible (Cloudflare R2) + sharp.
- Auth: Clerk (Google sign-in primary, email + password fallback). A Clerk webhook
  mirrors users into the local Postgres `users` table. PDF: @react-pdf/renderer.

Do not introduce: MongoDB, microservices, Kubernetes, GraphQL, serverless-only APIs,
or any third-party auth SaaS. If you think a deviation is warranted, propose it and
wait for a decision.

## Non-negotiable rules (these define the product — never break them)

1. **Listing status is derived, never written directly.** It is computed from the
   listing's active deal and lease exactly as in SPEC §3 and §4. No endpoint sets
   `listings.status` by hand.
2. **All deal and lease transitions go through one state-machine service.** Every
   transition validates against the tables in SPEC §4 and §16, writes a
   `deal_events` row, recomputes listing status, and enqueues notifications. No
   controller mutates `deals.state` or `leases.status` directly.
3. **Agency scoping on every object.** Agency staff can only ever read or write
   objects belonging to their own agency. Enforce with a NestJS guard, not ad-hoc
   checks. Customers see only their own deals; owners only their own properties.
4. **`audit_log` is append-only** and records every document view plus every
   verification decision. No update or delete path exists for it in the app. The
   verify decision is always logged as its own distinct action, even when the same
   person ran and verified the deal — never fold it into the close event.
5. **Documents are served only via short-lived presigned URLs** after a role check,
   and every URL issued writes to `audit_log`. IDs and ownership papers are
   encrypted at rest.
6. **Nothing from an owner intake is publicly visible** until an agency converts it
   into a listing (SPEC §15). Publication requires a real agency.
7. **A lease only leaves `rented` when a human records the outcome** (SPEC §16) —
   renew, or move-out. Timers nudge; they never auto-terminate a tenancy.
8. **Leave-platform is blocked while a lease is live** (SPEC §16).
9. **Verification is a `can_verify` permission on `agency_members`, not a separate
   account or role.** The `/deals/{id}/verify` endpoint checks `can_verify` and
   agency scope. Do not create a standalone verifier role. (SPEC §2, §3, §4)
10. **Owner documents are a flexible area, not a fixed type menu.** Free-text label
    + optional note + a required `originals_verified` attestation the agent must
    tick before a listing can publish. No hard-coded document-type enum. (SPEC §3, §5)
11. **Customer ID capture is a direct camera component** (gallery fallback),
    constrained to national ID or passport, with no OCR/auto-crop/vision in the MVP.
    The human `can_verify` member judges quality and can reject for a re-capture.
    (SPEC §3, §5)
12. **Auth is Clerk — never hand-roll it.** Google sign-in is primary, email +
    password is the fallback, and there is NO phone/SMS auth anywhere (that's the
    one thing IDaaS bills per message). Clerk owns sessions, hashing, lockout, and
    password reset. Use Clerk's prebuilt components on the web and a JWT-verifying
    guard on the API. (SPEC §3, §6, §9, §11)
13. **The local `users` table mirrors Clerk via webhook** (`/webhooks/clerk`, signing
    secret verified), keyed by `clerk_user_id`. Never rely on Clerk as the only
    store of identity: `deals.customer_id`, `leases.customer_id`, `agency_members
    .user_id`, and `audit_log.actor_id` are real foreign keys and the audit trail
    depends on them. (SPEC §3)
14. **Phone is contact data, never a credential, and is never verified at signup.**
    It powers call and `wa.me` deep links, and it self-verifies when the agency
    schedules a viewing. Email is an auth channel ONLY — never send deal updates,
    viewing reminders, or lease notices to email. (SPEC §3, §7)
15. **One sign-in for all five roles — never separate logins or portals.** Roles are
    resolved server-side after Clerk auth, from `agency_members`, `owners`, and an
    env allowlist for platform admin. The client NEVER claims a role; there is no
    "sign up as an agency" button. Signing up makes you a customer. A user with
    multiple roles gets a role switcher, never a second account. Agency head and
    agent share ONE console — admin sections are permission-gated, not a separate
    app. (SPEC §2)

## How to work

- Follow the build order in SPEC §12. Work one phase at a time — a phase is a
  checkpoint you clear when it works, not a time box, so move as fast as review
  allows. Do not jump ahead to UI polish before the underlying state machine and
  endpoints exist.
- Put shared zod schemas and the §4/§16 transition tables in `packages/shared` and
  import them in both `apps/web` and `apps/api` — the UI and API must never disagree
  about states.
- Keep secrets in `.env` (never commit). Provide a `.env.example`.
- Auth needs no dev workaround: use Clerk's development instance. No SMS, no codes.
- Every displayed money value is USD; round for display.
- All user-facing copy is bilingual (Somali + English), sentence case, no ALL CAPS.
- Write a short test for each state-machine transition and one Playwright happy path
  (request → close deal) as those features land.
- After each task: show what changed, how to run it, and what's next per §12.
## Design language (for when we build screens, SPEC §5)

Bold fintech style: Bricolage Grotesque (700/800) for headings and prices, Inter for
body. Colors: Forest #173A31, Lime #B7F35D (primary CTA only — Forest text on Lime,
never white), Mist #F4F7F2 background, Slate #5C6B64 secondary, Amber #F2A93B for the
reserved status. Pill buttons, 20px card radius, hairline borders, no gradients. The
customer app is photo-first; the four role consoles are denser work tools with one
Lime action each.

## First task (phase 0)

Build the phase-0 skeleton only (monorepo, Prisma schema for all SPEC §3 tables,
Docker Compose Postgres, Clerk auth with Google + email sign-in and the
`/webhooks/clerk` user-sync into the local `users` table, `pnpm dev` running).
No screens or business logic yet. Then stop and show the folder tree.