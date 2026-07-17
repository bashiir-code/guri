# Guri — operations runbook

Day-2 operations: deploy topology, backups and restore, and the scaling ledger.
Launch-time setup (env vars, domains, Clerk, go/no-go) lives in `LAUNCH.md`;
the security posture lives in `SECURITY.md`.

## 1. Deploy topology

Everything runs in **one Railway project (EU)**: the `web` service (Next.js),
the `api` service (NestJS + pg-boss worker + cron tick in one container), and
Postgres. Files live in Cloudflare R2. There is no separate CD pipeline:
pushing to `main` runs CI (`.github/workflows/ci.yml` — build + API tests),
and both Railway services have **"Wait for CI"** enabled, so a green run
auto-deploys and a red one never reaches prod.

- API pre-deploy runs `pnpm --filter @guri/api db:deploy` (Prisma migrations).
- Healthchecks: API `/health` (expects `{db:up, bucket:up}`), web `/api/health`.
  A failing healthcheck rolls the deploy back.
- Rollback: Railway one-click redeploy of the previous build on either service.

**Known build gotcha:** a flood of TS7006 (`implicitly has an 'any' type`)
errors in a prod build almost always means `prisma generate` didn't run —
the API build script (`shared build → prisma generate → nest build`) must run
from the repo root so the workspace is visible. Never build `apps/web` or
`apps/api` in isolation.

## 2. Backups & disaster recovery (SPEC §8/§9)

A nightly job (`BackupService`, 03:00) runs `pg_dump → gzip → encrypted bucket`,
writing `backups/guri-YYYY-MM-DD.sql.gz`. The dump binary is chosen by
`PG_DUMP_CMD` (prod: `pg_dump` on the API container's PATH; local dev:
`docker exec guri-postgres pg_dump`, so no host Postgres client is needed).

**A backup you have never restored is not a backup.** Verify restores end to end.

### Automated restore test

```bash
cd apps/api && pnpm build
JOBS_DISABLED=true node --env-file=../../.env scripts/backup-restore-test.mjs
```

This runs the real backup job, pulls the artifact back out of the bucket,
restores it into a throwaway `guri_restore_test` database, asserts every table's
row count matches the source and that a known record (Liban's lease) is intact,
then drops the scratch DB and deletes the test object. It exits non-zero on any
mismatch. As a suite test: `RESTORE_TEST=1 pnpm test` (needs Docker + a built
`dist`).

### Manual restore (production incident)

```bash
# 1. Fetch the chosen day's backup from R2 (aws-cli configured for R2 endpoint):
aws s3 cp s3://<bucket>/backups/guri-2026-07-11.sql.gz ./restore.sql.gz \
  --endpoint-url "$S3_ENDPOINT"

# 2. Decompress:
gunzip restore.sql.gz            # → restore.sql

# 3. Restore into a fresh database (NEVER over a live one — restore to a new DB,
#    verify, then repoint DATABASE_URL):
createdb guri_restore
psql -v ON_ERROR_STOP=1 -d guri_restore -f restore.sql

# 4. Sanity-check row counts and a known record, then cut over.
psql -d guri_restore -c "select count(*) from leases;"
```

Recovery objective for the pilot: **RPO ≤ 24h** (nightly) — tighten to a managed
provider's point-in-time recovery before scaling past the pilot.

## 3. Scaling ledger

The MVP deliberately runs **one API container** (SPEC §11): pg-boss, the Clerk
webhook, and PDF rendering need a live process, and the pilot's load doesn't
justify more. The trigger to scale out is **measured**, not calendar-based:
sustained API CPU above ~60–70 % or degrading p95 latency on Railway metrics.

Already multi-container-safe (verified 2026-07-17):

- **Cron cadence vs execution are split.** `@Cron` handlers only enqueue into
  pg-boss queues; workers execute under Postgres locking, so a job runs once
  no matter how many workers exist.
- **Concurrent enqueues dedupe.** `PgBossService.send` uses
  `singletonSeconds: 60`, so N containers' crons firing in the same minute
  collapse into one job per queue per window.
- **No local-disk state.** Uploads are processed by sharp on in-memory buffers
  and streamed to R2; nothing touches the container filesystem.
- **Auth is stateless** (Clerk JWT verified per request).

Remaining work on the day we scale out (both well-understood, ~a day each):

1. **Rate-limiter storage** — `ThrottlerModule` keeps counters in memory, so
   each container currently enforces its own limits. Move to a shared store.
2. **Connection pooling** — N containers × Prisma pool will exhaust Postgres.
   Add PgBouncer (transaction mode) for the API **and keep a direct
   connection for pg-boss** — its `LISTEN/NOTIFY` breaks through
   transaction-mode PgBouncer. (`directUrl` + `pgbouncer=true` in Prisma.)

## 4. Performance posture

What's already done, and what is deliberately *not* done — don't re-litigate
these without new measurements:

- **Done:** WebP upload pipeline (sharp ≤1280 q80), card thumbnails
  (`Listing.photoThumbs`, ≤800px), comprehensive Prisma indexes, narrow
  `select`s (no N+1), stable browse pagination (id tiebreaker), Serwist PWA
  configured so API responses are never service-worker cached, optimistic UI
  on the notification badge (snapshot + rollback).
- **Optimistic-UI boundary:** cosmetic state only (badge, toggles). Deal and
  lease transitions, verification, payments, and anything audit-logged render
  **only** server-confirmed state. This is a product rule, not a preference.
- **Deliberately skipped at pilot scale:** Redis/response caching (adds an
  invalidation surface and a fourth service for milliseconds nobody perceives),
  ISR on browse (it's a client component against the separate API — ISR would
  cache an empty shell), RSC retrofit of existing pages (the data layer is
  react-query + Clerk JWT; new public pages should copy the listing-detail
  pattern instead: server `page.tsx` wrapper + client component), and
  streaming/Suspense (client-rendered pages already show react-query
  skeletons).
