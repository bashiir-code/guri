-- Phase 4 (SPEC v1.10): verification becomes a can_verify PERMISSION on
-- agency_members (no standalone verifier role), and customer_documents gains
-- id_type + captured_via for the strict-on-what ID capture.
-- Hand-written to migrate in place.

-- agency_members: add the permission, preserve existing verifier grants
ALTER TABLE "agency_members" ADD COLUMN "can_verify" BOOLEAN NOT NULL DEFAULT false;

-- admins previously implied verifier ability (§2 v1.6) — keep that behavior
UPDATE "agency_members" SET "can_verify" = true WHERE "role" = 'admin';
-- users who held an explicit verifier row keep the permission on their other rows
UPDATE "agency_members" m SET "can_verify" = true
WHERE EXISTS (
  SELECT 1 FROM "agency_members" v
  WHERE v."user_id" = m."user_id" AND v."agency_id" = m."agency_id"
    AND v."role" = 'verifier' AND v."active"
);
DELETE FROM "agency_members" WHERE "role" = 'verifier';

-- shrink the role enum to admin|agent
ALTER TYPE "AgencyRole" RENAME TO "AgencyRole_old";
CREATE TYPE "AgencyRole" AS ENUM ('admin', 'agent');
ALTER TABLE "agency_members"
  ALTER COLUMN "role" TYPE "AgencyRole" USING "role"::text::"AgencyRole";
DROP TYPE "AgencyRole_old";

-- customer_documents: type → id_type (national_id|passport only) + captured_via
ALTER TABLE "customer_documents" RENAME COLUMN "type" TO "id_type";

CREATE TYPE "CapturedVia" AS ENUM ('camera', 'gallery');
ALTER TABLE "customer_documents"
  ADD COLUMN "captured_via" "CapturedVia" NOT NULL DEFAULT 'camera';
ALTER TABLE "customer_documents" ALTER COLUMN "captured_via" DROP DEFAULT;

ALTER TYPE "CustomerDocumentType" RENAME TO "CustomerDocumentType_old";
CREATE TYPE "CustomerDocumentType" AS ENUM ('national_id', 'passport');
ALTER TABLE "customer_documents"
  ALTER COLUMN "id_type" TYPE "CustomerDocumentType"
  USING "id_type"::text::"CustomerDocumentType";
DROP TYPE "CustomerDocumentType_old";
