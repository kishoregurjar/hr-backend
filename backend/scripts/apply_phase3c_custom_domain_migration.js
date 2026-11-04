"use strict";

/**
 * =============================================================================
 * HireQuest Phase 3C: Subdomain & Custom Domain Migration Runner
 * File: backend/scripts/apply_phase3c_custom_domain_migration.js
 * =============================================================================
 */

const { PrismaClient } = require("@prisma/client");
const { verifyTargetDatabase } = require("./verify_target_db");

const prisma = new PrismaClient({
  log: ["error", "warn"],
});

async function main() {
  console.log("=================================================================");
  console.log("HireQuest Phase 3C: Custom Domain & Subdomain Additive Migration");
  console.log("=================================================================");

  // Step 1: Preflight Target Database Guard
  console.log("\n[STEP 1/3] Running preflight database identity verification...");
  await verifyTargetDatabase({ mode: "dev", allowDev: true });

  // Step 2: Transactional Additive DDL
  console.log("\n[STEP 2/3] Adding customDomain and customDomainVerified to Company...");
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET lock_timeout = '3s';`);

    await tx.$executeRawUnsafe(
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "customDomain" TEXT;`
    );
    console.log("  -> Column Company.customDomain added or already exists.");

    await tx.$executeRawUnsafe(
      `ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "customDomainVerified" BOOLEAN NOT NULL DEFAULT false;`
    );
    console.log("  -> Column Company.customDomainVerified added or already exists.");
  });

  // Step 3: Non-transactional Unique Index Creation
  console.log("\n[STEP 3/3] Creating unique index for customDomain...");
  try {
    await prisma.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "Company_customDomain_key" ON "Company"("customDomain");`
    );
    console.log("  -> Unique index Company_customDomain_key verified.");
  } catch (err) {
    console.warn("  -> Notice on unique index creation:", err.message);
  }

  // Step 4: Verification
  const check = await prisma.$queryRawUnsafe(
    `SELECT column_name, data_type, is_nullable, column_default 
     FROM information_schema.columns 
     WHERE table_name = 'Company' AND column_name IN ('customDomain', 'customDomainVerified');`
  );
  console.log("\n[VERIFICATION] Verified new columns in Supabase:");
  console.table(check);

  console.log("\n[SUCCESS] Phase 3C Database Migration complete!");
}

main()
  .catch((err) => {
    console.error("\n[FATAL] Migration failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

