"use strict";

/**
 * =============================================================================
 * HireQuest Phase 2A — Concurrent Index & Constraint Runner Contract Test Suite
 * File: backend/tests/staging/phase2a-concurrent-indexes.test.js
 * =============================================================================
 * Validates structural, configuration, and definition mismatch invariants of:
 * - backend/scripts/run_concurrent_indexes.js
 * =============================================================================
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  IndexDefinitionMismatchError,
  INDEX_CONFIGURATIONS,
  CONSTRAINTS_TO_VALIDATE,
  verifyIndexDefinition,
  inspectIndexStatus,
  runPreflightDuplicateCheck,
  processIndex,
  validateConstraint,
} = require("../../scripts/run_concurrent_indexes");

test("Phase 2A Concurrent Index Runner Invariants", async (suite) => {
  await suite.test("1. Exports all 6 reconciled index configurations", () => {
    assert.strictEqual(INDEX_CONFIGURATIONS.length, 6, "Must configure exactly 6 concurrent indexes");
    const indexNames = INDEX_CONFIGURATIONS.map((idx) => idx.name);
    assert.ok(indexNames.includes("idx_assessment_id_company"), "Missing idx_assessment_id_company");
    assert.ok(indexNames.includes("idx_assessment_company_status"), "Missing idx_assessment_company_status");
    assert.ok(indexNames.includes("idx_assessment_is_quarantined"), "Missing idx_assessment_is_quarantined");
    assert.ok(indexNames.includes("idx_invitation_company"), "Missing idx_invitation_company");
    assert.ok(indexNames.includes("idx_candidate_attempt_company"), "Missing idx_candidate_attempt_company");
    assert.ok(indexNames.includes("idx_user_mailbox_company"), "Missing idx_user_mailbox_company");
  });

  await suite.test("2. idx_assessment_id_company is marked unique and defines duplicate preflight check", () => {
    const uniqueIndex = INDEX_CONFIGURATIONS.find((idx) => idx.name === "idx_assessment_id_company");
    assert.ok(uniqueIndex, "idx_assessment_id_company must exist");
    assert.strictEqual(uniqueIndex.isUnique, true, "Must be flagged as isUnique: true");
    assert.deepStrictEqual(uniqueIndex.columns, ["id", "companyId"]);
    assert.ok(
      typeof uniqueIndex.preflightDuplicateCheckSql === "string" &&
        uniqueIndex.preflightDuplicateCheckSql.includes("HAVING COUNT(*) > 1"),
      "Must define preflight duplicate check query with HAVING COUNT(*) > 1"
    );
  });

  await suite.test("3. All index configurations specify CONCURRENTLY in create and drop statements", () => {
    for (const config of INDEX_CONFIGURATIONS) {
      assert.match(
        config.createSql,
        /CREATE(\s+UNIQUE)?\s+INDEX\s+CONCURRENTLY/i,
        `createSql for ${config.name} must use CREATE INDEX CONCURRENTLY`
      );
      assert.match(
        config.dropSql,
        /DROP\s+INDEX\s+CONCURRENTLY/i,
        `dropSql for ${config.name} must use DROP INDEX CONCURRENTLY`
      );
    }
  });

  await suite.test("4. Definition validation: Valid matching index succeeds", () => {
    const config = {
      name: "idx_assessment_company_status",
      tableName: "Assessment",
      isUnique: false,
      columns: ["companyId", "status"],
      predicate: null,
    };
    const catalogIndex = {
      table_name: "Assessment",
      indisunique: false,
      column_expressions: ['"companyId"', '"status"'],
      index_predicate: null,
    };
    assert.strictEqual(verifyIndexDefinition(catalogIndex, config), true);
  });

  await suite.test("5. Definition validation: Uniqueness mismatch throws IndexDefinitionMismatchError", () => {
    const config = {
      name: "idx_assessment_id_company",
      tableName: "Assessment",
      isUnique: true,
      columns: ["id", "companyId"],
    };
    const catalogIndex = {
      table_name: "Assessment",
      indisunique: false, // Catalog is non-unique, config expects unique!
      column_expressions: ['"id"', '"companyId"'],
    };
    assert.throws(
      () => verifyIndexDefinition(catalogIndex, config),
      (err) => {
        assert.ok(err instanceof IndexDefinitionMismatchError);
        assert.match(err.message, /uniqueness mismatch/i);
        return true;
      }
    );
  });

  await suite.test("6. Definition validation: Column count mismatch throws IndexDefinitionMismatchError", () => {
    const config = {
      name: "idx_assessment_company_status",
      tableName: "Assessment",
      isUnique: false,
      columns: ["companyId", "status"],
    };
    const catalogIndex = {
      table_name: "Assessment",
      indisunique: false,
      column_expressions: ['"companyId"'], // Only 1 column instead of 2!
    };
    assert.throws(
      () => verifyIndexDefinition(catalogIndex, config),
      (err) => {
        assert.ok(err instanceof IndexDefinitionMismatchError);
        assert.match(err.message, /column count mismatch/i);
        return true;
      }
    );
  });

  await suite.test("7. Definition validation: Column order mismatch throws IndexDefinitionMismatchError", () => {
    const config = {
      name: "idx_assessment_company_status",
      tableName: "Assessment",
      isUnique: false,
      columns: ["companyId", "status"],
    };
    const catalogIndex = {
      table_name: "Assessment",
      indisunique: false,
      column_expressions: ['"status"', '"companyId"'], // Reversed order!
    };
    assert.throws(
      () => verifyIndexDefinition(catalogIndex, config),
      (err) => {
        assert.ok(err instanceof IndexDefinitionMismatchError);
        assert.match(err.message, /column mismatch at position 0/i);
        return true;
      }
    );
  });

  await suite.test("8. Definition validation: Table name mismatch throws IndexDefinitionMismatchError", () => {
    const config = {
      name: "idx_invitation_company",
      tableName: "Invitation",
      isUnique: false,
      columns: ["companyId"],
    };
    const catalogIndex = {
      table_name: "CandidateAttempt", // Wrong table!
      indisunique: false,
      column_expressions: ['"companyId"'],
    };
    assert.throws(
      () => verifyIndexDefinition(catalogIndex, config),
      (err) => {
        assert.ok(err instanceof IndexDefinitionMismatchError);
        assert.match(err.message, /table mismatch/i);
        return true;
      }
    );
  });

  await suite.test("9. Exports all 5 foreign key constraints for validation", () => {
    assert.strictEqual(CONSTRAINTS_TO_VALIDATE.length, 5, "Must configure exactly 5 constraints for validation");
    const constraintNames = CONSTRAINTS_TO_VALIDATE.map((c) => c.constraintName);
    assert.ok(constraintNames.includes("Assessment_companyId_fkey"));
    assert.ok(constraintNames.includes("Invitation_companyId_fkey"));
    assert.ok(constraintNames.includes("CandidateAttempt_companyId_fkey"));
    assert.ok(constraintNames.includes("UserMailbox_companyId_fkey"));
    assert.ok(constraintNames.includes("QuarantineResolutionEvent_quarantineLogId_fkey"));

    for (const c of CONSTRAINTS_TO_VALIDATE) {
      assert.match(
        c.validateSql,
        /ALTER TABLE\s+"[^"]+"\s+VALIDATE CONSTRAINT\s+"[^"]+";/i,
        `validateSql for ${c.constraintName} must follow ALTER TABLE ... VALIDATE CONSTRAINT syntax`
      );
    }
  });

  await suite.test("10. Runner exposes core inspection and processing functions", () => {
    assert.strictEqual(typeof inspectIndexStatus, "function");
    assert.strictEqual(typeof runPreflightDuplicateCheck, "function");
    assert.strictEqual(typeof processIndex, "function");
    assert.strictEqual(typeof validateConstraint, "function");
  });
});
