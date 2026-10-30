"use strict";

/**
 * =============================================================================
 * HireQuest Phase 2A & 3B Production-Grade Safe Migration & Backfill Runner
 * File: backend/scripts/apply_phase2a_phase3b_migration.js
 * =============================================================================
 */

const { PrismaClient } = require("@prisma/client");
const { verifyTargetDatabase } = require("./verify_target_db");
const { main: runConcurrentIndexes } = require("./run_concurrent_indexes");

const prisma = new PrismaClient({
  log: ["error", "warn"],
});

const TARGET_COMPANY_ID = "cmvte48080000rfagglcog7fn";

async function main() {
  console.log("=================================================================");
  console.log("HireQuest Phase 2A + 3B Production-Ready Additive Migration");
  console.log("=================================================================");

  // Step 1: Preflight Target Database Guard
  console.log("\n[STEP 1/5] Running preflight database identity verification...");
  await verifyTargetDatabase({ mode: "dev", allowDev: true });

  // Step 2: Transactional Additive DDL & Backfill
  console.log("\n[STEP 2/5] Executing Transactional Additive DDL (Phase 2A & Phase 3B)...");

  await prisma.$transaction(async (tx) => {
    // Set lock_timeout within transaction
    await tx.$executeRawUnsafe(`SET lock_timeout = '3s';`);

    // A. Phase 3B White-Label Branding Columns on Company
    console.log("  -> Adding Phase 3B branding columns on Company...");
    await tx.$executeRawUnsafe(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "brandColor" TEXT;`);
    await tx.$executeRawUnsafe(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "accentColor" TEXT;`);
    await tx.$executeRawUnsafe(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "faviconUrl" TEXT;`);
    await tx.$executeRawUnsafe(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "faviconPath" TEXT;`);
    await tx.$executeRawUnsafe(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "brandTagline" TEXT;`);
    await tx.$executeRawUnsafe(`ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "showPoweredByHireQuest" BOOLEAN NOT NULL DEFAULT true;`);

    // B. Phase 2A Tenant Columns
    console.log("  -> Adding Phase 2A tenant columns on Assessment, Invitation, CandidateAttempt, UserMailbox...");
    await tx.$executeRawUnsafe(`ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "companyId" TEXT;`);
    await tx.$executeRawUnsafe(`ALTER TABLE "Assessment" ADD COLUMN IF NOT EXISTS "isQuarantined" BOOLEAN NOT NULL DEFAULT false;`);
    await tx.$executeRawUnsafe(`ALTER TABLE "Invitation" ADD COLUMN IF NOT EXISTS "companyId" TEXT;`);
    await tx.$executeRawUnsafe(`ALTER TABLE "CandidateAttempt" ADD COLUMN IF NOT EXISTS "companyId" TEXT;`);
    await tx.$executeRawUnsafe(`ALTER TABLE "UserMailbox" ADD COLUMN IF NOT EXISTS "companyId" TEXT;`);

    // C. Quarantine Audit Log Tables
    console.log("  -> Creating AssessmentQuarantineLog & QuarantineResolutionEvent tables...");
    await tx.$executeRawUnsafe(`
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
    `);

    await tx.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "AssessmentQuarantineLog_assessmentId_idx" ON "AssessmentQuarantineLog"("assessmentId");
    `);
    await tx.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "AssessmentQuarantineLog_quarantinedAt_idx" ON "AssessmentQuarantineLog"("quarantinedAt");
    `);

    await tx.$executeRawUnsafe(`
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
    `);

    await tx.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "QuarantineResolutionEvent_quarantineLogId_idx" ON "QuarantineResolutionEvent"("quarantineLogId");
    `);
    await tx.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "QuarantineResolutionEvent_resolvedAt_idx" ON "QuarantineResolutionEvent"("resolvedAt");
    `);

    // D. Immutability Triggers
    console.log("  -> Setting up quarantine immutability triggers...");
    await tx.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION prevent_quarantine_log_mutation()
      RETURNS TRIGGER AS $$
      BEGIN
          RAISE EXCEPTION '% records are immutable and append-only. UPDATE, DELETE, and TRUNCATE operations are forbidden.', TG_TABLE_NAME;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await tx.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_prevent_quarantine_log_mutation ON "AssessmentQuarantineLog";`);
    await tx.$executeRawUnsafe(`
      CREATE TRIGGER trg_prevent_quarantine_log_mutation
      BEFORE UPDATE OR DELETE ON "AssessmentQuarantineLog"
      FOR EACH ROW
      EXECUTE FUNCTION prevent_quarantine_log_mutation();
    `);

    await tx.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_prevent_quarantine_log_truncate ON "AssessmentQuarantineLog";`);
    await tx.$executeRawUnsafe(`
      CREATE TRIGGER trg_prevent_quarantine_log_truncate
      BEFORE TRUNCATE ON "AssessmentQuarantineLog"
      FOR EACH STATEMENT
      EXECUTE FUNCTION prevent_quarantine_log_mutation();
    `);

    await tx.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_prevent_quarantine_event_mutation ON "QuarantineResolutionEvent";`);
    await tx.$executeRawUnsafe(`
      CREATE TRIGGER trg_prevent_quarantine_event_mutation
      BEFORE UPDATE OR DELETE ON "QuarantineResolutionEvent"
      FOR EACH ROW
      EXECUTE FUNCTION prevent_quarantine_log_mutation();
    `);

    await tx.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_prevent_quarantine_event_truncate ON "QuarantineResolutionEvent";`);
    await tx.$executeRawUnsafe(`
      CREATE TRIGGER trg_prevent_quarantine_event_truncate
      BEFORE TRUNCATE ON "QuarantineResolutionEvent"
      FOR EACH STATEMENT
      EXECUTE FUNCTION prevent_quarantine_log_mutation();
    `);

    // E. Foreign Keys with NOT VALID (Non-blocking)
    console.log("  -> Adding Foreign Key constraints with NOT VALID...");
    await tx.$executeRawUnsafe(`
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
    `);

    await tx.$executeRawUnsafe(`
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
    `);

    await tx.$executeRawUnsafe(`
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
    `);

    await tx.$executeRawUnsafe(`
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
    `);

    await tx.$executeRawUnsafe(`
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
    `);

    // F. Deterministic Historical Data Backfill
    console.log("  -> Executing deterministic historical backfill for single tenant...");
    const updatedAssessments = await tx.$executeRawUnsafe(`
      UPDATE "Assessment"
      SET "companyId" = '${TARGET_COMPANY_ID}'
      WHERE "companyId" IS NULL;
    `);
    console.log(`     Backfilled Assessments count: ${updatedAssessments}`);

    const updatedInvitations = await tx.$executeRawUnsafe(`
      UPDATE "Invitation"
      SET "companyId" = '${TARGET_COMPANY_ID}'
      WHERE "companyId" IS NULL;
    `);
    console.log(`     Backfilled Invitations count: ${updatedInvitations}`);

    const updatedAttempts = await tx.$executeRawUnsafe(`
      UPDATE "CandidateAttempt"
      SET "companyId" = '${TARGET_COMPANY_ID}'
      WHERE "companyId" IS NULL;
    `);
    console.log(`     Backfilled CandidateAttempts count: ${updatedAttempts}`);

    const updatedMailboxes = await tx.$executeRawUnsafe(`
      UPDATE "UserMailbox"
      SET "companyId" = '${TARGET_COMPANY_ID}'
      WHERE "companyId" IS NULL;
    `);
    console.log(`     Backfilled UserMailboxes count: ${updatedMailboxes}`);
  }, {
    timeout: 30000,
    maxWait: 10000,
  });

  console.log("[STEP 2/5] Transactional DDL & Backfill completed and committed successfully!");

  // Step 3: Run Concurrent Indexes & Validate Constraints
  console.log("\n[STEP 3/5] Running non-transactional concurrent index builder & FK validator...");
  process.argv.push("--allow-dev", "--mode=dev");
  await runConcurrentIndexes();

  // Step 4: Verification Queries
  console.log("\n[STEP 4/5] Verifying Prisma Client queries...");
  const company = await prisma.company.findFirst();
  console.log(`[VERIFIED] Company Query OK:`, {
    id: company.id,
    name: company.name,
    brandColor: company.brandColor,
    accentColor: company.accentColor,
    showPoweredByHireQuest: company.showPoweredByHireQuest,
  });

  const assessments = await prisma.assessment.findMany({
    select: {
      id: true,
      title: true,
      companyId: true,
      isQuarantined: true,
    },
  });
  console.log(`[VERIFIED] Assessment Query OK (${assessments.length} records):`);
  for (const a of assessments) {
    console.log(`  - [${a.id}] "${a.title}" -> companyId: ${a.companyId}, quarantined: ${a.isQuarantined}`);
  }

  console.log("\n[STEP 5/5] All operations completed with ZERO errors!");
  console.log("=================================================================");
  console.log("MIGRATION & VERIFICATION COMPLETE: SYSTEM DEMO-READY");
  console.log("=================================================================");
}

main()
  .catch((err) => {
    console.error("\n[MIGRATION FAILED]", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
