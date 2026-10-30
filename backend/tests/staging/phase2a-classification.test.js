"use strict";

/**
 * =============================================================================
 * HireQuest Phase 2A — Historical Assessment Tenant Classification Test Suite
 * File: backend/tests/staging/phase2a-classification.test.js
 * =============================================================================
 * Validates classification rules, evidence evaluation tiers, and read-only
 * safety invariants of:
 * - backend/scripts/dry_run_tenant_classification.js
 * =============================================================================
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  CLASSIFICATION_TIERS,
  classifyAssessmentRecord,
} = require("../../scripts/dry_run_tenant_classification");

const SCRIPT_PATH = path.resolve(__dirname, "../../scripts/dry_run_tenant_classification.js");

test("Phase 2A Historical Classification Rules & Read-Only Invariants", async (suite) => {
  await suite.test("1. Exports all 4 classification tiers", () => {
    assert.strictEqual(CLASSIFICATION_TIERS.AUTHORITATIVE, "AUTHORITATIVE");
    assert.strictEqual(CLASSIFICATION_TIERS.HEURISTIC_MATCH, "HEURISTIC_MATCH");
    assert.strictEqual(CLASSIFICATION_TIERS.MULTI_TENANT_AMBIGUOUS, "MULTI_TENANT_AMBIGUOUS");
    assert.strictEqual(CLASSIFICATION_TIERS.UNASSIGNABLE, "UNASSIGNABLE");
  });

  await suite.test("2. Authoritative: Direct question entity binding matching verified creator membership", () => {
    const result = classifyAssessmentRecord({
      assessment: { id: "asm-1", title: "Backend Engineer", createdById: "user-1", status: "PUBLISHED" },
      creatorMemberships: [{ userId: "user-1", companyId: "comp-A" }],
      questionCompanyIds: ["comp-A"],
      candidateCompanyIds: [],
    });
    assert.strictEqual(result.tier, CLASSIFICATION_TIERS.AUTHORITATIVE);
    assert.strictEqual(result.recommendedCompanyId, "comp-A");
  });

  await suite.test("3. Heuristic Match: Single creator membership with zero entity bindings", () => {
    const result = classifyAssessmentRecord({
      assessment: { id: "asm-2", title: "Frontend Engineer", createdById: "user-2", status: "DRAFT" },
      creatorMemberships: [{ userId: "user-2", companyId: "comp-B" }],
      questionCompanyIds: [],
      candidateCompanyIds: [],
    });
    assert.strictEqual(result.tier, CLASSIFICATION_TIERS.HEURISTIC_MATCH);
    assert.strictEqual(result.recommendedCompanyId, "comp-B");
  });

  await suite.test("4. Multi-Tenant Ambiguous: Conflicting questions from multiple distinct companies", () => {
    const result = classifyAssessmentRecord({
      assessment: { id: "asm-3", title: "DevOps Engineer", createdById: "user-3", status: "DRAFT" },
      creatorMemberships: [{ userId: "user-3", companyId: "comp-A" }],
      questionCompanyIds: ["comp-A", "comp-B"],
      candidateCompanyIds: [],
    });
    assert.strictEqual(result.tier, CLASSIFICATION_TIERS.MULTI_TENANT_AMBIGUOUS);
    assert.strictEqual(result.recommendedCompanyId, null);
  });

  await suite.test("5. Multi-Tenant Ambiguous: Question company conflicts with candidate company", () => {
    const result = classifyAssessmentRecord({
      assessment: { id: "asm-4", title: "QA Engineer", createdById: "user-4", status: "PUBLISHED" },
      creatorMemberships: [{ userId: "user-4", companyId: "comp-A" }],
      questionCompanyIds: ["comp-A"],
      candidateCompanyIds: ["comp-B"],
    });
    assert.strictEqual(result.tier, CLASSIFICATION_TIERS.MULTI_TENANT_AMBIGUOUS);
    assert.strictEqual(result.recommendedCompanyId, null);
  });

  await suite.test("6. Multi-Tenant Ambiguous: Question company does not match creator's company", () => {
    const result = classifyAssessmentRecord({
      assessment: { id: "asm-5", title: "Security Specialist", createdById: "user-5", status: "PUBLISHED" },
      creatorMemberships: [{ userId: "user-5", companyId: "comp-B" }],
      questionCompanyIds: ["comp-A"],
      candidateCompanyIds: [],
    });
    assert.strictEqual(result.tier, CLASSIFICATION_TIERS.MULTI_TENANT_AMBIGUOUS);
    assert.strictEqual(result.recommendedCompanyId, null);
  });

  await suite.test("7. Multi-Tenant Ambiguous: Creator belongs to multiple companies with no entity binding", () => {
    const result = classifyAssessmentRecord({
      assessment: { id: "asm-6", title: "Product Manager", createdById: "user-6", status: "PUBLISHED" },
      creatorMemberships: [
        { userId: "user-6", companyId: "comp-A" },
        { userId: "user-6", companyId: "comp-B" },
      ],
      questionCompanyIds: [],
      candidateCompanyIds: [],
    });
    assert.strictEqual(result.tier, CLASSIFICATION_TIERS.MULTI_TENANT_AMBIGUOUS);
    assert.strictEqual(result.recommendedCompanyId, null);
  });

  await suite.test("8. Unassignable: Creator belongs to zero companies with no entity bindings", () => {
    const result = classifyAssessmentRecord({
      assessment: { id: "asm-7", title: "General Skill Test", createdById: "user-orphan", status: "DRAFT" },
      creatorMemberships: [],
      questionCompanyIds: [],
      candidateCompanyIds: [],
    });
    assert.strictEqual(result.tier, CLASSIFICATION_TIERS.UNASSIGNABLE);
    assert.strictEqual(result.recommendedCompanyId, null);
  });

  await suite.test("9. Read-only safety: Script source contains zero database write operations", () => {
    const scriptContent = fs.readFileSync(SCRIPT_PATH, "utf8");
    assert.doesNotMatch(scriptContent, /\.update\(/);
    assert.doesNotMatch(scriptContent, /\.updateMany\(/);
    assert.doesNotMatch(scriptContent, /\.delete\(/);
    assert.doesNotMatch(scriptContent, /\.deleteMany\(/);
    assert.doesNotMatch(scriptContent, /\.create\(/);
    assert.doesNotMatch(scriptContent, /\.upsert\(/);
    assert.doesNotMatch(scriptContent, /INSERT\s+INTO/i);
    assert.doesNotMatch(scriptContent, /UPDATE\s+"?[A-Za-z]+"?\s+SET/i);
    assert.doesNotMatch(scriptContent, /DELETE\s+FROM/i);
  });
});
