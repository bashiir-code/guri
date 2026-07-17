# Guri

A rental marketplace for Mogadishu where **every home is represented by a
verified agency**. Customers browse with a lightweight profile; identity is
verified only at deal-closing time; every document view and verification
decision lands in an immutable audit log. The MVP moves no money — agencies
record off-platform payments, which power the owner's income dashboard.

Live at [getguri.com](https://getguri.com) · API at `api.getguri.com` ·
Bilingual (Somali + English) · All amounts USD.

## Documentation map

| File | What it holds |
|---|---|
| [SPEC.md](SPEC.md) | **Source of truth**: roles, data model, deal state machine, API, phases |
| [CLAUDE.md](CLAUDE.md) | Working brief + the non-negotiable product rules |
| [LAUNCH.md](LAUNCH.md) | Production setup: env vars, domains, Clerk, go/no-go checklist |
| [OPERATIONS.md](OPERATIONS.md) | Day-2 ops: deploys, backups & restore, scaling ledger, perf posture |
| [SECURITY.md](SECURITY.md) | Security posture, enforced by `security-pass.spec.ts` |

## Stack

TypeScript everywhere, one pnpm monorepo:

- `apps/web` — Next.js (App Router) + Tailwind + shadcn/ui + next-intl (so/en) + Serwist PWA
- `apps/api` — NestJS (one long-running container: API + pg-boss worker + cron), Prisma + PostgreSQL
- `packages/shared` — zod schemas + the deal/lease/intake transition tables, imported by both apps

Auth is Clerk (Google primary, email + password fallback — **no phone/SMS
auth**), mirrored into the local `users` table via webhook. Files go to
S3-compatible storage (Cloudflare R2 in prod, MinIO locally) with sharp
re-encoding. PDFs via @react-pdf/renderer.

## Getting started

Prerequisites: Node 22+, pnpm 10, Docker (Postgres + MinIO).

```bash
cp .env.example .env         # fill in Clerk dev keys + local URLs
pnpm install
pnpm db:up                   # docker compose: Postgres + MinIO
pnpm db:migrate              # prisma migrate dev (also generates the client)
pnpm dev                     # builds shared, then runs web (:3000) + api (:4000)
```

Sign in with Google via Clerk's dev instance — the webhook/guard mirrors your
user row into Postgres on first request. To exercise every role from one
account, seed the dev test data:

```bash
pnpm --filter @guri/api db:seed-test    # grants the test account all roles + demo portfolio
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | shared build, then web + api in parallel watch |
| `pnpm build` | full monorepo build (same as CI) |
| `pnpm db:up` / `pnpm db:down` | local Postgres + MinIO via Docker Compose |
| `pnpm db:migrate` | create/apply a Prisma migration locally |
| `pnpm --filter @guri/api test` | API test suite (state machine, guards, security pass) |
| `pnpm --filter @guri/api db:deploy` | apply migrations in prod (Railway pre-deploy) |

## How changes ship

Push to `main` → GitHub Actions builds all packages and runs the API suite →
Railway (with **Wait for CI**) auto-deploys web + api. No green CI, no deploy.
Details and rollback procedure in [OPERATIONS.md](OPERATIONS.md).
