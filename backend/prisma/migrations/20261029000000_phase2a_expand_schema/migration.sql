-- =============================================================================
-- HireQuest Phase 2A — Expand Schema & Tenant Isolation Scaffolding
-- Migration: 20261029000000_phase2a_expand_schema
-- =============================================================================
-- Operational Constraints:
-- 1. Strictly transactional DDL executed within BEGIN ... COMMIT.
-- 2. Sets lock_timeout = '3s' to fail fast and prevent blocking connection pools.
-- 3. All column additions are nullable (or have safe default false) with O(1) metadata changes.
-- 4. Foreign keys added with NOT VALID to eliminate full table scan locks during DDL.
-- 5. ZERO concurrent index operations in this file (PostgreSQL Error 25001 prevention).
--    Concurrent indexes on populated tables and constraint validation are handled by run_concurrent_indexes.js.
-- 6. Audit immutability triggers (UPDATE, DELETE, TRUNCATE) created for quarantine tables.
-- =============================================================================

SET lock_timeout = '3s';

-- 1. Additive Columns on Assessment
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "isQuarantined" BOOLEAN NOT NULL DEFAULT false;

-- 2. Additive Columns on Invitation
ALTER TABLE "Invitation" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

-- 3. Additive Columns on CandidateAttempt
ALTER TABLE "CandidateAttempt" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

-- 4. Additive Columns on UserMailbox
ALTER TABLE "UserMailbox" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

-- 5. Create AssessmentQuarantineLog Table
-- Decoupled from Assessment CASCADE delete to ensure audit immutability
CREATE TABLE IF NOT EXISTS "AssessmentQuarantineLog" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "originalAssessmentId" TEXT,
    "reason" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "quarantinedById" TEXT,
    "quarantinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentQuarantineLog_pkey" PRIMARY KEY ("id")
);

-- Indexes for AssessmentQuarantineLog (empty table, non-blocking)
CREATE INDEX IF NOT EXISTS "AssessmentQuarantineLog_assessmentId_idx" ON "AssessmentQuarantineLog"("assessmentId");
CREATE INDEX IF NOT EXISTS "AssessmentQuarantineLog_quarantinedAt_idx" ON "AssessmentQuarantineLog"("quarantinedAt");

-- 6. Create QuarantineResolutionEvent Table
CREATE TABLE IF NOT EXISTS "QuarantineResolutionEvent" (
    "id" TEXT NOT NULL,
    "quarantineLogId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetCompanyId" TEXT,
    "notes" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuarantineResolutionEvent_pkey" PRIMARY KEY ("id")
);

-- Indexes for QuarantineResolutionEvent (empty table, non-blocking)
CREATE INDEX IF NOT EXISTS "QuarantineResolutionEvent_quarantineLogId_idx" ON "QuarantineResolutionEvent"("quarantineLogId");
CREATE INDEX IF NOT EXISTS "QuarantineResolutionEvent_resolvedAt_idx" ON "QuarantineResolutionEvent"("resolvedAt");

-- 7. Immutability Triggers for Quarantine Audit Tables (Append-Only Enforcement: UPDATE, DELETE, TRUNCATE)
CREATE OR REPLACE FUNCTION prevent_quarantine_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% records are immutable and append-only. UPDATE, DELETE, and TRUNCATE operations are forbidden.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

-- AssessmentQuarantineLog Immutability
DROP TRIGGER IF EXISTS trg_prevent_quarantine_log_mutation ON "AssessmentQuarantineLog";
CREATE TRIGGER trg_prevent_quarantine_log_mutation
BEFORE UPDATE OR DELETE ON "AssessmentQuarantineLog"
FOR EACH ROW
EXECUTE FUNCTION prevent_quarantine_log_mutation();

DROP TRIGGER IF EXISTS trg_prevent_quarantine_log_truncate ON "AssessmentQuarantineLog";
CREATE TRIGGER trg_prevent_quarantine_log_truncate
BEFORE TRUNCATE ON "AssessmentQuarantineLog"
FOR EACH STATEMENT
EXECUTE FUNCTION prevent_quarantine_log_mutation();

-- QuarantineResolutionEvent Immutability
DROP TRIGGER IF EXISTS trg_prevent_quarantine_event_mutation ON "QuarantineResolutionEvent";
CREATE TRIGGER trg_prevent_quarantine_event_mutation
BEFORE UPDATE OR DELETE ON "QuarantineResolutionEvent"
FOR EACH ROW
EXECUTE FUNCTION prevent_quarantine_log_mutation();

DROP TRIGGER IF EXISTS trg_prevent_quarantine_event_truncate ON "QuarantineResolutionEvent";
CREATE TRIGGER trg_prevent_quarantine_event_truncate
BEFORE TRUNCATE ON "QuarantineResolutionEvent"
FOR EACH STATEMENT
EXECUTE FUNCTION prevent_quarantine_log_mutation();

-- 8. Add Foreign Keys with NOT VALID (Non-blocking, validated in Step 2 runner)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Assessment_companyId_fkey'
    ) THEN
        ALTER TABLE "Assessment"
        ADD CONSTRAINT "Assessment_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id")
        ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Invitation_companyId_fkey'
    ) THEN
        ALTER TABLE "Invitation"
        ADD CONSTRAINT "Invitation_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id")
        ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CandidateAttempt_companyId_fkey'
    ) THEN
        ALTER TABLE "CandidateAttempt"
        ADD CONSTRAINT "CandidateAttempt_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id")
        ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserMailbox_companyId_fkey'
    ) THEN
        ALTER TABLE "UserMailbox"
        ADD CONSTRAINT "UserMailbox_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id")
        ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'QuarantineResolutionEvent_quarantineLogId_fkey'
    ) THEN
        ALTER TABLE "QuarantineResolutionEvent"
        ADD CONSTRAINT "QuarantineResolutionEvent_quarantineLogId_fkey"
        FOREIGN KEY ("quarantineLogId") REFERENCES "AssessmentQuarantineLog"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
    END IF;
END $$;
