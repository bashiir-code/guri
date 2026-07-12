# Guri — pilot launch runbook (SPEC §13)

Deploy target: **web → Vercel**, **API + worker + Postgres → Railway (EU
region)**, **files → Cloudflare R2 + CDN**. EU region is the lowest practical
latency to Mogadishu (SPEC §11). One long-running API container also runs the
pg-boss worker and `@nestjs/schedule` tick — do **not** split it into
serverless functions (jobs, webhooks, and PDF rendering need a live process).

The pilot targets 2–3 agencies, 30–50 live listings concentrated in 2–3
districts (e.g. Hodan, Wadajir), run 6–8 weeks with a weekly funnel review.

---

## 1. Production environment variables

Set these in each host's dashboard (never commit real values). Names match
`.env.example`.

### API + worker (Railway service)
| Var | Value / source | Notes |
|---|---|---|
| `DATABASE_URL` | Railway Postgres internal URL | append `?sslmode=require` in prod |
| `API_PORT` | `4000` (or Railway `$PORT`) | |
| `WEB_ORIGIN` | `https://guri.so` | CORS allowlist |
| `CLERK_SECRET_KEY` | Clerk **live** secret (`sk_live_…`) | |
| `CLERK_PUBLISHABLE_KEY` | Clerk **live** publishable | used by API for issuer resolution |
| `CLERK_WEBHOOK_SECRET` | Clerk **live** webhook signing secret (`whsec_…`) | from the prod webhook endpoint |
| `PLATFORM_ADMIN_EMAILS` | comma-separated admin emails | role allowlist (SPEC §2) |
| `S3_ENDPOINT` | `https://<accountid>.r2.cloudflarestorage.com` | R2 S3 API |
| `S3_REGION` | `auto` | |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | R2 API token | scoped to the bucket |
| `S3_BUCKET` | `guri` | server-side encryption ON |
| `S3_FORCE_PATH_STYLE` | `false` | R2 uses virtual-host style |
| `PG_DUMP_CMD` | `pg_dump` | container has the client on PATH |
| `SENTRY_DSN` | Sentry project DSN (server) | leave blank to disable |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` | |
| `LOG_LEVEL` | `info` | pino level |
| `SMS_*` | **pending** — see §6 | Hormuud gateway not yet wired |

### Web (Vercel project)
| Var | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.guri.so` | |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk **live** publishable | |
| `CLERK_SECRET_KEY` | Clerk **live** secret | server components |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-in` / `/sign-up` | |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry project DSN (client) | leave blank to disable |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | `0.1` | |

> Rotate every secret that ever touched the dev instance before go-live. The
> dev Clerk instance (`precise-troll-46`) must **not** be used in prod.

---

## 2. Deployment steps

**Postgres (Railway)**
1. Provision Postgres (EU). Copy the internal `DATABASE_URL`.
2. Apply schema: `pnpm --filter @guri/api db:deploy` (runs `prisma migrate deploy`).
3. Seed the launch data: create the pilot agencies + admins (platform admin does
   this in-app once the API is up; no SQL seed in prod).

**API + worker (Railway)**
1. Deploy the repo; build `pnpm --filter @guri/api build`, start `node dist/main.js`.
2. One instance runs the web API **and** the pg-boss worker + 15-min tick. Keep
   `JOBS_DISABLED` **unset** (only the demo scripts set it).
3. Confirm `GET /api.guri.so/health` → `{"status":"ok","db":"up","bucket":"up"}`.

**Web (Vercel)**
1. Import the repo, root `apps/web`, framework Next.js. Build `pnpm --filter
   @guri/web build`.
2. Set env vars (§1). Deploy.

**Files (Cloudflare R2 + CDN)**
1. Create the `guri` bucket with default (server-side) encryption.
2. Create a scoped API token; set `S3_*` on the API.
3. Put Cloudflare CDN in front for public listing photos; keep documents
   private (served only via presigned URLs — never through the CDN).

**Clerk (live instance)**
1. Create the production instance; enable Google + email/password (no phone/SMS).
2. Add the webhook endpoint `https://api.guri.so/webhooks/clerk` (events:
   `user.created`, `user.updated`, `user.deleted`); copy its signing secret to
   `CLERK_WEBHOOK_SECRET`.
3. **CRITICAL — add the email claim to the session token.** Dashboard →
   Sessions → *Customize session token* → add `"email": "{{user.primary_email_address}}"`.
   The API guard already reads `payload.email`, but Clerk's default session JWT
   omits it. Without this claim, guard-created `users` rows have a null email, so
   **platform-admin resolution (the `PLATFORM_ADMIN_EMAILS` allowlist) and the
   email-based linking of pre-provisioned agency admins / owner invites both fail
   silently.** On a fresh prod DB that means the first admin can't get in. Verify
   after: a real Google sign-in mirrors a row **with the email populated**, and
   an allowlisted email resolves to `platformAdmin: true` on `GET /me`.
4. Verify a real Google sign-in mirrors a row into the `users` table.

---

## 3. Domains

- Apex `guri.so` → Vercel (web). Add `www.guri.so` → redirect to apex.
- Subdomain `api.guri.so` → Railway API service (custom domain + TLS).
- Cloudflare proxied DNS; **HTTPS only** (HSTS on). Point the R2 CDN at e.g.
  `cdn.guri.so` for public photos.
- Update `WEB_ORIGIN`, `NEXT_PUBLIC_API_URL`, and the Clerk allowed origins /
  webhook URL to the real hostnames.

---

## 4. Go / no-go checklist

**Infrastructure**
- [ ] `db:deploy` applied cleanly; `_prisma_migrations` current.
- [ ] `/health` returns `200 {db:up, bucket:up}` from the public API URL.
- [ ] R2 bucket encryption ON; document objects are **not** publicly listable.
- [ ] **Backup restore verified** on prod data: run
      `scripts/backup-restore-test.mjs` against a staging copy → row counts +
      Liban-style known record match (SPEC §8). A dump you haven't restored
      doesn't count.
- [ ] Nightly backup cron confirmed writing `backups/guri-YYYY-MM-DD.sql.gz`.

**Auth & security**
- [ ] Clerk **live** keys in place; dev instance keys removed everywhere.
- [ ] Clerk webhook signature verified end-to-end (a real sign-in mirrors a user).
- [ ] All secrets rotated; none from dev remain.
- [ ] Route/guard audit green (`security-pass.spec.ts`): every route guarded or
      on the public allowlist; `audit_log` append-only; no session minted
      outside Clerk.
- [ ] Rate limits live (`429` confirmed on public browse over 120/min).
- [ ] Presigned document URLs expire in 5 min and every issue writes `audit_log`.

**Observability**
- [ ] Sentry receiving events from **both** apps (trigger one test error each).
- [ ] Uptime monitors (UptimeRobot or equiv) on:
      - `https://guri.so` (web, HTTP 200)
      - `https://api.guri.so/health` (API, expects 200; alert on 503/timeout)
      — 1-min interval, alert to the on-call email/WhatsApp.
- [ ] pino logs flowing to Railway; spot-check that no secret/PIN/token/presigned
      URL appears in them.

**Load & correctness**
- [ ] Photo-pipeline load test acceptable (`loadtest-photos.mjs`): peak
      throughput noted, malformed images rejected cleanly, worker survives.
- [ ] Full test suite green (`pnpm --filter @guri/api test`).
- [ ] One real end-to-end deal: request → viewing → docs → verify → close →
      lease shows `rented`; agreement PDF renders bilingually.

**Content**
- [ ] 2–3 agencies onboarded, ≥30 live listings in the target districts.
- [ ] Somali + English copy reviewed on every screen.

**Rollback plan**
- [ ] Previous Railway deploy pinned; DB restore procedure (README) rehearsed;
      Vercel instant rollback confirmed.

---

## 5. Pilot instrumentation (SPEC §13)

All metrics derive from `deal_events` — no extra tooling. Weekly review:
median days listed→rented; funnel (requested → viewing held → proceeding →
verified → closed); no-show rate; agency response time; % closed deals with a
complete doc set + signed scan (target 100%); disputes per closed deal; owner
dashboard weekly logins. `GET /admin/metrics` surfaces the per-agency funnel and
medians.

---

## 6. Known pending dependency — SMS gateway

The one external dependency not yet wired. Notifications go through the
`SmsPort` adapter interface; the pilot currently uses `ConsoleSmsAdapter`
(logs instead of sends). Before or during week 1:

1. Contract a Mogadishu SMS aggregator (e.g. **Hormuud** enterprise SMS).
2. Implement `HormuudSmsAdapter implements SmsPort` and bind it in
   `NotificationsModule` (swap the `SMS_PORT` provider — **no caller changes**).
3. Add the provider's credentials as `SMS_*` env vars.
4. Verify a real viewing-scheduled SMS arrives on a Somali handset.

Until then, WhatsApp / call deep links (`wa.me`, `tel:`) and the in-app bell
carry all notifications — email is **never** used for deal comms (rule 14). The
pilot can start with WhatsApp+in-app only if the gateway slips; SMS is an
enhancement, not a blocker for the first agencies.
