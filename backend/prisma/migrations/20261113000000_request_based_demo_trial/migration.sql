-- =============================================================================
-- HireQuest â€” Request-Based Demo Trial System Migration
-- Migration: 20261113000000_request_based_demo_trial
-- =============================================================================

SET lock_timeout = '3s';

-- 1. Create Enums if they do not exist
DO $$ BEGIN
    CREATE TYPE "TrialApplicationStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "CompanyPlan" AS ENUM ('DEMO', 'STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "CompanyPlanStatus" AS ENUM ('ACTIVE', 'DEMO_EXPIRED', 'EXPIRED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'DEMO_EXPIRED', 'EXPIRED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Additive columns on Company (Safe, O(1) metadata changes)
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "plan" "CompanyPlan" NOT NULL DEFAULT 'STARTER';
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "planStatus" "CompanyPlanStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "planStartedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "planExpiresAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "customSeatLimit" INTEGER;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "customCandidateLimit" INTEGER;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "customInviteLimit" INTEGER;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "hasUsedDemo" BOOLEAN NOT NULL DEFAULT false;

-- 3. Create TrialApplication Table
CREATE TABLE IF NOT EXISTS "TrialApplication" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "businessEmail" TEXT NOT NULL,
    "phone" TEXT,
    "website" TEXT,
    "businessDescription" TEXT,
    "industry" TEXT,
    "passwordHash" TEXT NOT NULL,
    "isBusinessEmail" BOOLEAN NOT NULL DEFAULT false,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifiedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "status" "TrialApplicationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "reviewNotes" TEXT,
    "approvedCompanyId" TEXT,
    "approvedCompanySlug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialApplication_pkey" PRIMARY KEY ("id")
);

-- 4. Create TrialApplicationOtp Table
CREATE TABLE IF NOT EXISTS "TrialApplicationOtp" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialApplicationOtp_pkey" PRIMARY KEY ("id")
);

-- 5. Create Indexes
CREATE INDEX IF NOT EXISTS "TrialApplication_businessEmail_idx" ON "TrialApplication"("businessEmail");
CREATE INDEX IF NOT EXISTS "TrialApplication_status_createdAt_idx" ON "TrialApplication"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "TrialApplication_createdAt_idx" ON "TrialApplication"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "TrialApplicationOtp_email_key" ON "TrialApplicationOtp"("email");

