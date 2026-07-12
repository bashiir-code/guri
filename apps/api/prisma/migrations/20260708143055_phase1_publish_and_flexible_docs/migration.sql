/*
  Warnings:

  - Added the required column `label` to the `owner_documents` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "originals_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "published_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "owner_documents" ADD COLUMN     "label" TEXT NOT NULL,
ADD COLUMN     "note" TEXT,
ALTER COLUMN "type" SET DEFAULT 'other';
