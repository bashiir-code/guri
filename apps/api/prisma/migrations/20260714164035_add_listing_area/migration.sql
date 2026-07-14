-- DropForeignKey
ALTER TABLE "leases" DROP CONSTRAINT "leases_deal_id_fkey";

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "area_sqm" INTEGER;

-- AddForeignKey
ALTER TABLE "leases" ADD CONSTRAINT "leases_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
