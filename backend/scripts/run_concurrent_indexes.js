"use strict";

/**
 * =============================================================================
 * HireQuest Phase 2A — Non-Transactional Concurrent Index & Constraint Runner
 * File: backend/scripts/run_concurrent_indexes.js
 * =============================================================================
 * Operational Requirements & Invariants:
 * 1. Must run outside explicit transaction blocks (PostgreSQL Error 25001 prevention).
 * 2. Checks pg_index.indisvalid to identify invalid indexes from prior aborted runs.
 *    Never relies on IF NOT EXISTS alone, as IF NOT EXISTS ignores broken indexes.
 * 3. Inspects pg_get_indexdef(), column order, uniqueness, and predicates.
 *    Halts safely on definition mismatches without dropping or mutating valid data.
 * 4. Runs duplicate key preflight checks before attempting UNIQUE index creation.
 *    If duplicates are detected, halts safely with diagnostics without touching data.
 * 5. Executes CREATE INDEX CONCURRENTLY discretely per index.
 * 6. Validates foreign keys with ALTER TABLE ... VALIDATE CONSTRAINT (ShareUpdateExclusiveLock).
 * =============================================================================
 */

const { prisma } = require("../src/config/prisma");
const { verifyTargetDatabase } = require("./verify_target_db");

class IndexDefinitionMismatchError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "IndexDefinitionMismatchError";
    this.details = details;
  }
}

const INDEX_CONFIGURATIONS = [
  {
    name: "idx_assessment_id_company",
    tableName: "Assessment",
    isUnique: true,
    createSql: `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "idx_assessment_id_company" ON "Assessment"("id", "companyId");`,
    dropSql: `DROP INDEX CONCURRENTLY IF EXISTS "idx_assessment_id_company";`,
    columns: ["id", "companyId"],
    predicate: null,
    preflightDuplicateCheckSql: `
      SELECT "id", "companyId", COUNT(*)::int AS count
      FROM "Assessment"
      WHERE "companyId" IS NOT NULL
      GROUP BY "id", "companyId"
      HAVING COUNT(*) > 1;
    `,
  },
  {
    name: "idx_assessment_company_status",
    tableName: "Assessment",
    isUnique: false,
    createSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_assessment_company_status" ON "Assessment"("companyId", "status");`,
    dropSql: `DROP INDEX CONCURRENTLY IF EXISTS "idx_assessment_company_status";`,
    columns: ["companyId", "status"],
    predicate: null,
  },
  {
    name: "idx_assessment_is_quarantined",
    tableName: "Assessment",
    isUnique: false,
    createSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_assessment_is_quarantined" ON "Assessment"("isQuarantined");`,
    dropSql: `DROP INDEX CONCURRENTLY IF EXISTS "idx_assessment_is_quarantined";`,
    columns: ["isQuarantined"],
    predicate: null,
  },
  {
    name: "idx_invitation_company",
    tableName: "Invitation",
    isUnique: false,
    createSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_invitation_company" ON "Invitation"("companyId");`,
    dropSql: `DROP INDEX CONCURRENTLY IF EXISTS "idx_invitation_company";`,
    columns: ["companyId"],
    predicate: null,
  },
  {
    name: "idx_candidate_attempt_company",
    tableName: "CandidateAttempt",
    isUnique: false,
    createSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_candidate_attempt_company" ON "CandidateAttempt"("companyId");`,
    dropSql: `DROP INDEX CONCURRENTLY IF EXISTS "idx_candidate_attempt_company";`,
    columns: ["companyId"],
    predicate: null,
  },
  {
    name: "idx_user_mailbox_company",
    tableName: "UserMailbox",
    isUnique: false,
    createSql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_user_mailbox_company" ON "UserMailbox"("companyId");`,
    dropSql: `DROP INDEX CONCURRENTLY IF EXISTS "idx_user_mailbox_company";`,
    columns: ["companyId"],
    predicate: null,
  },
];

const CONSTRAINTS_TO_VALIDATE = [
  {
    tableName: "Assessment",
    constraintName: "Assessment_companyId_fkey",
    validateSql: `ALTER TABLE "Assessment" VALIDATE CONSTRAINT "Assessment_companyId_fkey";`,
  },
  {
    tableName: "Invitation",
    constraintName: "Invitation_companyId_fkey",
    validateSql: `ALTER TABLE "Invitation" VALIDATE CONSTRAINT "Invitation_companyId_fkey";`,
  },
  {
    tableName: "CandidateAttempt",
    constraintName: "CandidateAttempt_companyId_fkey",
    validateSql: `ALTER TABLE "CandidateAttempt" VALIDATE CONSTRAINT "CandidateAttempt_companyId_fkey";`,
  },
  {
    tableName: "UserMailbox",
    constraintName: "UserMailbox_companyId_fkey",
    validateSql: `ALTER TABLE "UserMailbox" VALIDATE CONSTRAINT "UserMailbox_companyId_fkey";`,
  },
  {
    tableName: "QuarantineResolutionEvent",
    constraintName: "QuarantineResolutionEvent_quarantineLogId_fkey",
    validateSql: `ALTER TABLE "QuarantineResolutionEvent" VALIDATE CONSTRAINT "QuarantineResolutionEvent_quarantineLogId_fkey";`,
  },
];

function normalizeIdentifier(val) {
  if (!val) return "";
  return String(val)
    .replace(/^"|"$/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Validates catalog index definition against expected configuration.
 * Throws IndexDefinitionMismatchError on conflict.
 */
function verifyIndexDefinition(catalogIndex, expectedConfig) {
  // 1. Uniqueness check
  if (Boolean(catalogIndex.indisunique) !== Boolean(expectedConfig.isUnique)) {
    throw new IndexDefinitionMismatchError(
      `Index "${expectedConfig.name}" uniqueness mismatch: catalog indisunique=${catalogIndex.indisunique}, expected=${expectedConfig.isUnique}`,
      {
        indexName: expectedConfig.name,
        catalogUnique: catalogIndex.indisunique,
        expectedUnique: expectedConfig.isUnique,
      }
    );
  }

  // 2. Table name check
  if (
    catalogIndex.table_name &&
    normalizeIdentifier(catalogIndex.table_name) !== normalizeIdentifier(expectedConfig.tableName)
  ) {
    throw new IndexDefinitionMismatchError(
      `Index "${expectedConfig.name}" table mismatch: catalog table="${catalogIndex.table_name}", expected="${expectedConfig.tableName}"`,
      {
        indexName: expectedConfig.name,
        catalogTable: catalogIndex.table_name,
        expectedTable: expectedConfig.tableName,
      }
    );
  }

  // 3. Ordered column list check
  const catalogColumns = (
    Array.isArray(catalogIndex.column_expressions)
      ? catalogIndex.column_expressions
      : (catalogIndex.column_expressions || "")
          .toString()
          .replace(/^\{|\}$/g, "")
          .split(",")
  )
    .map(normalizeIdentifier)
    .filter(Boolean);

  const expectedColumns = expectedConfig.columns.map(normalizeIdentifier);

  if (catalogColumns.length !== expectedColumns.length) {
    throw new IndexDefinitionMismatchError(
      `Index "${expectedConfig.name}" column count mismatch: catalog has [${catalogColumns.join(", ")}], expected [${expectedColumns.join(", ")}]`,
      {
        indexName: expectedConfig.name,
        catalogColumns,
        expectedColumns,
      }
    );
  }

  for (let i = 0; i < expectedColumns.length; i++) {
    if (catalogColumns[i] !== expectedColumns[i]) {
      throw new IndexDefinitionMismatchError(
        `Index "${expectedConfig.name}" column mismatch at position ${i}: catalog has "${catalogColumns[i]}", expected "${expectedColumns[i]}"`,
        {
          indexName: expectedConfig.name,
          position: i,
          catalogColumn: catalogColumns[i],
          expectedColumn: expectedColumns[i],
        }
      );
    }
  }

  // 4. Predicate check
  const catalogPredicate = normalizeIdentifier(catalogIndex.index_predicate || "");
  const expectedPredicate = normalizeIdentifier(expectedConfig.predicate || "");
  if (catalogPredicate !== expectedPredicate) {
    throw new IndexDefinitionMismatchError(
      `Index "${expectedConfig.name}" predicate mismatch: catalog has "${catalogPredicate}", expected "${expectedPredicate}"`,
      {
        indexName: expectedConfig.name,
        catalogPredicate,
        expectedPredicate,
      }
    );
  }

  return true;
}

async function inspectIndexStatus(indexName) {
  const query = `
    SELECT 
      i.relname AS index_name,
      t.relname AS table_name,
      ix.indisvalid,
      ix.indisunique,
      pg_get_indexdef(ix.indexrelid) AS index_def,
      pg_get_expr(ix.indpred, ix.indrelid) AS index_predicate,
      ARRAY(
        SELECT pg_get_indexdef(ix.indexrelid, k + 1, true)
        FROM generate_series(0, ix.indnatts - 1) k
      ) AS column_expressions
    FROM pg_class t
    JOIN pg_index ix ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND i.relname = $1;
  `;
  const result = await prisma.$queryRawUnsafe(query, indexName);
  if (!result || result.length === 0) {
    return null;
  }
  return result[0];
}

async function runPreflightDuplicateCheck(config) {
  if (!config.isUnique || !config.preflightDuplicateCheckSql) {
    return;
  }
  console.log(`[PREFLIGHT] Checking for duplicates on unique index: ${config.name}...`);
  const duplicates = await prisma.$queryRawUnsafe(config.preflightDuplicateCheckSql);
  if (duplicates && duplicates.length > 0) {
    const errorMsg = `[FATAL] Unique constraint preflight check failed for ${config.name}. Found ${duplicates.length} duplicate key groups.`;
    console.error(errorMsg, JSON.stringify(duplicates, null, 2));
    throw new Error(`${errorMsg} Resolve duplicate records before creating unique index.`);
  }
  console.log(`[PREFLIGHT] Preflight check passed: No duplicates found for ${config.name}.`);
}

async function processIndex(config) {
  console.log(`\n==================================================`);
  console.log(`[INDEX] Processing: ${config.name} on "${config.tableName}"`);
  console.log(`==================================================`);

  // 1. Inspect existing catalog state
  const existingIndex = await inspectIndexStatus(config.name);

  if (existingIndex) {
    if (!existingIndex.indisvalid) {
      console.warn(`[WARN] Index "${config.name}" exists but is INVALID (indisvalid = false).`);
      console.warn(`[REPAIR] Dropping invalid index concurrently before re-creating...`);
      await prisma.$executeRawUnsafe(config.dropSql);
      console.log(`[REPAIR] Invalid index dropped successfully.`);
    } else {
      // 2. Definition mismatch check on valid existing index
      console.log(`[VERIFY] Index "${config.name}" exists and is valid. Verifying definition...`);
      verifyIndexDefinition(existingIndex, config);
      console.log(`[OK] Index "${config.name}" already exists, is VALID, and matches expected definition.`);
      console.log(`[DEF] ${existingIndex.index_def}`);
      return;
    }
  }

  // 3. Preflight duplicate check for unique indexes
  await runPreflightDuplicateCheck(config);

  // 4. Concurrently create index
  console.log(`[EXEC] Executing: ${config.createSql}`);
  await prisma.$executeRawUnsafe(config.createSql);

  // 5. Post-creation verification
  const verifiedIndex = await inspectIndexStatus(config.name);
  if (!verifiedIndex) {
    throw new Error(`[FATAL] Index creation command completed but "${config.name}" not found in catalog.`);
  }
  if (!verifiedIndex.indisvalid) {
    throw new Error(`[FATAL] Index "${config.name}" was created but pg_index.indisvalid is FALSE.`);
  }
  // Verify definition of newly created index
  verifyIndexDefinition(verifiedIndex, config);
  console.log(`[VERIFIED] Index "${config.name}" successfully created, validated, and verified.`);
}

async function validateConstraint(config) {
  console.log(`\n[CONSTRAINT] Validating: ${config.constraintName} on "${config.tableName}"...`);
  await prisma.$executeRawUnsafe(config.validateSql);
  console.log(`[OK] Constraint ${config.constraintName} validated successfully.`);
}

async function main() {
  // Step 0: Fail-closed target database preflight verification before any DDL
  const allowDev = process.argv.includes("--allow-dev") || process.env.ALLOW_DEV_EXECUTION === "true";
  const modeArg = process.argv.find((a) => a.startsWith("--mode="));
  const mode = modeArg ? modeArg.split("=")[1] : (process.env.TARGET_ENVIRONMENT || "staging");
  await verifyTargetDatabase({ mode, allowDev });

  console.log(`Starting Phase 2A Non-Transactional Concurrent Index Runner...`);
  console.log(`Target Indexes: ${INDEX_CONFIGURATIONS.length}`);
  console.log(`Target Constraints: ${CONSTRAINTS_TO_VALIDATE.length}`);

  // Process indexes sequentially to avoid server lock contention
  for (const indexConfig of INDEX_CONFIGURATIONS) {
    await processIndex(indexConfig);
  }

  // Validate constraints sequentially
  console.log(`\n==================================================`);
  console.log(`[CONSTRAINTS] Validating Deferred Foreign Keys...`);
  console.log(`==================================================`);
  for (const constraintConfig of CONSTRAINTS_TO_VALIDATE) {
    await validateConstraint(constraintConfig);
  }

  console.log(`\n==================================================`);
  console.log(`Phase 2A Concurrent Index & Constraint Runner completed successfully.`);
  console.log(`==================================================`);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error("\n[RUNNER FAILURE]", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = {
  IndexDefinitionMismatchError,
  INDEX_CONFIGURATIONS,
  CONSTRAINTS_TO_VALIDATE,
  normalizeIdentifier,
  verifyIndexDefinition,
  inspectIndexStatus,
  runPreflightDuplicateCheck,
  processIndex,
  validateConstraint,
  main,
};
