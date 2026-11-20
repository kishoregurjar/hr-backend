-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN IF NOT EXISTS "showOnPricingPage" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Coupon" ADD COLUMN IF NOT EXISTS "publicDescription" TEXT;
ALTER TABLE "Coupon" ADD COLUMN IF NOT EXISTS "displayPriority" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Coupon_showOnPricingPage_isActive_idx" ON "Coupon"("showOnPricingPage", "isActive");
