"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  validateResultQuery,
  validateAssessmentIdParams,
  validateCandidateAssessmentParams,
} = require("../../src/modules/assessment/assessment.result.validator");

test("Assessment Result Validator Suite", async (t) => {
  await t.test("Validates result query parameters with defaults", () => {
    const parsed = validateResultQuery({});
    assert.strictEqual(parsed.page, 1);
    assert.strictEqual(parsed.limit, 20);
    assert.strictEqual(parsed.sortBy, "createdAt");
    assert.strictEqual(parsed.sortOrder, "desc");
  });

  await t.test("Validates status, pagination, search and sort parameters", () => {
    const parsed = validateResultQuery({
      page: "2",
      limit: "50",
      status: "PASS",
      sortBy: "percentage",
      sortOrder: "asc",
      search: "john@example.com",
    });

    assert.strictEqual(parsed.page, 2);
    assert.strictEqual(parsed.limit, 50);
    assert.strictEqual(parsed.status, "PASS");
    assert.strictEqual(parsed.sortBy, "percentage");
    assert.strictEqual(parsed.sortOrder, "asc");
    assert.strictEqual(parsed.search, "john@example.com");
  });

  await t.test("Rejects invalid status", () => {
    assert.throws(() => {
      validateResultQuery({ status: "INVALID_STATUS" });
    });
  });

  await t.test("Rejects pagination limit > 100", () => {
    assert.throws(() => {
      validateResultQuery({ limit: 150 });
    });
  });

  await t.test("Validates assessmentId params", () => {
    const parsed = validateAssessmentIdParams({ assessmentId: "asmt_123" });
    assert.strictEqual(parsed.assessmentId, "asmt_123");
  });

  await t.test("Validates candidateAssessmentId params", () => {
    const parsed = validateCandidateAssessmentParams({
      candidateAssessmentId: "cand_asmt_123",
    });
    assert.strictEqual(parsed.candidateAssessmentId, "cand_asmt_123");
  });
});
