"use strict";

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient({ log: ["error", "warn"] });

async function finalize() {
  console.log("[FINALIZE] Creating performance and tenant isolation indexes...");

  const indexes = [
    {
      name: "idx_assessment_id_company",
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS "idx_assessment_id_company" ON "Assessment"("id", "companyId");`,
    },
    {
      name: "idx_assessment_company_status",
      sql: `CREATE INDEX IF NOT EXISTS "idx_assessment_company_status" ON "Assessment"("companyId", "status");`,
    },
    {
      name: "idx_assessment_is_quarantined",
      sql: `CREATE INDEX IF NOT EXISTS "idx_assessment_is_quarantined" ON "Assessment"("isQuarantined");`,
    },
    {
      name: "idx_invitation_company",
      sql: `CREATE INDEX IF NOT EXISTS "idx_invitation_company" ON "Invitation"("companyId");`,
    },
    {
      name: "idx_candidate_attempt_company",
      sql: `CREATE INDEX IF NOT EXISTS "idx_candidate_attempt_company" ON "CandidateAttempt"("companyId");`,
    },
    {
      name: "idx_user_mailbox_company",
      sql: `CREATE INDEX IF NOT EXISTS "idx_user_mailbox_company" ON "UserMailbox"("companyId");`,
    },
  ];

  for (const idx of indexes) {
    console.log(`  -> Creating index: ${idx.name}...`);
    await prisma.$executeRawUnsafe(idx.sql);
    console.log(`  [OK] Index ${idx.name} ready.`);
  }

  console.log("\n[FINALIZE] Validating Foreign Key Constraints...");
  const constraints = [
    { table: "Assessment", name: "Assessment_companyId_fkey" },
    { table: "Invitation", name: "Invitation_companyId_fkey" },
    { table: "CandidateAttempt", name: "CandidateAttempt_companyId_fkey" },
    { table: "UserMailbox", name: "UserMailbox_companyId_fkey" },
    { table: "QuarantineResolutionEvent", name: "QuarantineResolutionEvent_quarantineLogId_fkey" },
  ];

  for (const c of constraints) {
    console.log(`  -> Validating FK constraint: ${c.name} on "${c.table}"...`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "${c.table}" VALIDATE CONSTRAINT "${c.name}";`);
    console.log(`  [OK] FK Constraint ${c.name} validated.`);
  }

  console.log("\n[FINALIZE] All indexes and foreign keys validated successfully!");
}

finalize()
  .catch((err) => {
    console.error("[FINALIZE FAILED]", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

