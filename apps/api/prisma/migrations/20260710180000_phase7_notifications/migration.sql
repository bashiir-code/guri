-- Phase 7: idempotent notifications + read tracking for the in-app bell.
ALTER TABLE "notifications"
  ADD COLUMN "read_at" TIMESTAMP(3),
  ADD COLUMN "dedupe_key" TEXT;

CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");
DROP INDEX IF EXISTS "notifications_user_id_idx";
