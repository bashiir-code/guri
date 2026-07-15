-- CreateEnum
CREATE TYPE "AgencyApplicationStatus" AS ENUM ('pending', 'approved', 'declined');

-- CreateTable
CREATE TABLE "agency_applications" (
    "id" UUID NOT NULL,
    "agency_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "districts" TEXT[],
    "contact_name" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "note" TEXT,
    "status" "AgencyApplicationStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_agency_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agency_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agency_applications_status_idx" ON "agency_applications"("status");
