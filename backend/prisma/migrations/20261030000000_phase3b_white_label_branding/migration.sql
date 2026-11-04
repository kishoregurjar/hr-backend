-- =============================================================================
-- HireQuest Phase 3B — White-Label Branding Schema Migration
-- Migration: 20261030000000_phase3b_white_label_branding
-- =============================================================================
-- Operational Constraints:
-- 1. Strictly transactional DDL executed within BEGIN ... COMMIT.
-- 2. Sets lock_timeout = '3s' to fail fast and prevent blocking connection pools.
-- 3. All column additions are nullable (or have safe default true) with O(1) metadata changes.
-- 4. Reuses existing logoUrl and logoPath without duplicating fields.
-- 5. Prepared for future authorized staging execution; zero DB connections executed now.
-- =============================================================================

SET lock_timeout = '3s';

-- 1. Additive White-Label Branding Columns on Company
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "brandColor" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "accentColor" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "faviconUrl" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "faviconPath" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "brandTagline" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "showPoweredByHireQuest" BOOLEAN NOT NULL DEFAULT true;

