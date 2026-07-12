-- Phase 8: renewals (a lease with no originating deal) + leave-platform.

-- A renewal is a NEW lease that links to the prior one via
-- renewed_from_lease_id and has no deal_id (§16). The unique index already
-- permits multiple NULLs in Postgres.
ALTER TABLE "leases" ALTER COLUMN "deal_id" DROP NOT NULL;

-- Records when a user left the platform (§16 / §9 retention).
ALTER TABLE "users" ADD COLUMN "deactivated_at" TIMESTAMP(3);
