-- =============================================================================
-- HireQuest — Coupon System: First Purchase and Recurring Renewal Migration
-- Migration: 20261119000000_coupon_system_recurring_support
-- =============================================================================

SET lock_timeout = '3s';

-- 1. Create Enums if they do not exist
DO $$ BEGIN
    CREATE TYPE "CouponDiscountType" AS ENUM ('PERCENTAGE', 'FIXED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "CouponApplicability" AS ENUM ('FIRST_PURCHASE', 'EVERY_RENEWAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "CouponRedemptionType" AS ENUM ('FIRST_PURCHASE', 'RENEWAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Coupon Table
CREATE TABLE IF NOT EXISTS "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "discountType" "CouponDiscountType" NOT NULL DEFAULT 'PERCENTAGE',
    "discountValue" DECIMAL(10, 2) NOT NULL,
    "maxDiscountAmount" DECIMAL(10, 2),
    "applicability" "CouponApplicability" NOT NULL DEFAULT 'FIRST_PURCHASE',
    "applicablePlans" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "applicableCycles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "maxRedemptions" INTEGER,
    "perCompanyLimit" INTEGER DEFAULT 1,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- Unique index on Coupon code (case-insensitive via uppercase)
CREATE UNIQUE INDEX IF NOT EXISTS "Coupon_code_key" ON "Coupon"("code");
CREATE INDEX IF NOT EXISTS "Coupon_code_idx" ON "Coupon"("code");
CREATE INDEX IF NOT EXISTS "Coupon_isActive_idx" ON "Coupon"("isActive");
CREATE INDEX IF NOT EXISTS "Coupon_applicability_idx" ON "Coupon"("applicability");
CREATE INDEX IF NOT EXISTS "Coupon_validFrom_validUntil_idx" ON "Coupon"("validFrom", "validUntil");

-- 3. Additive columns on Subscription for Recurring Coupons
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "couponId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "couponCode" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "recurringDiscountType" "CouponDiscountType";
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "recurringDiscountValue" DECIMAL(10, 2);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "recurringMaxDiscount" DECIMAL(10, 2);
CREATE INDEX IF NOT EXISTS "Subscription_couponId_idx" ON "Subscription"("couponId");

-- 4. Additive columns on Payment for Coupon Audit
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "couponId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "couponCode" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "originalAmount" DECIMAL(10, 2);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(10, 2) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "Payment_couponId_idx" ON "Payment"("couponId");

-- 5. Create CouponRedemption Table
CREATE TABLE IF NOT EXISTS "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "paymentId" TEXT,
    "subscriptionId" TEXT,
    "redemptionType" "CouponRedemptionType" NOT NULL DEFAULT 'FIRST_PURCHASE',
    "originalAmount" DECIMAL(10, 2) NOT NULL,
    "discountAmount" DECIMAL(10, 2) NOT NULL,
    "finalAmount" DECIMAL(10, 2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CouponRedemption_paymentId_key" ON "CouponRedemption"("paymentId") WHERE "paymentId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "CouponRedemption_couponId_idx" ON "CouponRedemption"("couponId");
CREATE INDEX IF NOT EXISTS "CouponRedemption_companyId_idx" ON "CouponRedemption"("companyId");
CREATE INDEX IF NOT EXISTS "CouponRedemption_couponId_companyId_idx" ON "CouponRedemption"("couponId", "companyId");
CREATE INDEX IF NOT EXISTS "CouponRedemption_redemptionType_idx" ON "CouponRedemption"("redemptionType");
CREATE INDEX IF NOT EXISTS "CouponRedemption_createdAt_idx" ON "CouponRedemption"("createdAt");

-- 6. Add Foreign Key constraints safely
DO $$ BEGIN
    ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
