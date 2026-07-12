-- Auth v1.8: phone + PIN login; otp_codes repurposed as phone_checks
-- (one-time codes for signup / PIN reset only — never the login path).
-- Hand-written to preserve existing data.

-- users: PIN + verification + lockout state
ALTER TABLE "users"
  ADD COLUMN "phone_verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pin_hash" TEXT,
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "pin_failed_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pin_locked_until" TIMESTAMP(3);

-- carry over verification state from the old timestamp column, then drop it
UPDATE "users" SET "phone_verified" = true WHERE "phone_verified_at" IS NOT NULL;
ALTER TABLE "users" DROP COLUMN "phone_verified_at";

-- otp_codes → phone_checks (rename, keep rows; old login codes become
-- consumed-or-expired signup checks, which is harmless)
CREATE TYPE "PhoneCheckPurpose" AS ENUM ('signup', 'pin_reset');

ALTER TABLE "otp_codes" RENAME TO "phone_checks";
ALTER TABLE "phone_checks"
  ADD COLUMN "purpose" "PhoneCheckPurpose" NOT NULL DEFAULT 'signup';

-- keep constraint/index names aligned with Prisma's expectations
ALTER TABLE "phone_checks" RENAME CONSTRAINT "otp_codes_pkey" TO "phone_checks_pkey";
ALTER INDEX "otp_codes_phone_created_at_idx" RENAME TO "phone_checks_phone_created_at_idx";
