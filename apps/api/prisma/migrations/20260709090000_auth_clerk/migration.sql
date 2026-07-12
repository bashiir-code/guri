-- Auth v1.9: Clerk owns authentication; the local users table mirrors it.
-- Hand-written to migrate in place (no data wipe).

-- users: drop every credential column, add the Clerk mirror key.
-- phone becomes plain contact data: nullable, NOT unique, never a credential.
ALTER TABLE "users"
  DROP COLUMN "pin_hash",
  DROP COLUMN "phone_verified",
  DROP COLUMN "pin_failed_attempts",
  DROP COLUMN "pin_locked_until",
  ADD COLUMN "clerk_user_id" TEXT,
  ALTER COLUMN "phone" DROP NOT NULL;

DROP INDEX "users_phone_key";
CREATE UNIQUE INDEX "users_clerk_user_id_key" ON "users"("clerk_user_id");
-- email is the linking key between agency-provisioned rows and Clerk sign-ins
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- the one-time-code path is gone entirely: no SMS on any auth path
DROP TABLE "phone_checks";
DROP TYPE "PhoneCheckPurpose";
