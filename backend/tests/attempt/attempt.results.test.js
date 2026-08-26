"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  assessmentResultsQuerySchema,
  assessmentIdParamSchema,
  attemptResultParamsSchema,
} = require("../../src/modules/attempt/attempt.validator");

describe("Assessment Results Validation", () => {
  it("should accept valid result query", () => {
    const result = assessmentResultsQuerySchema.safeParse({
      page: "1",
      limit: "20",
      search: "rahul",
      status: "SUBMITTED",
      passed: "true",
      sortBy: "percentage",
      sortOrder: "desc",
    });

    assert.equal(result.success, true);
    assert.equal(result.data.page, 1);
    assert.equal(result.data.limit, 20);
    assert.equal(result.data.passed, true);
  });

  it("should apply defaults", () => {
    const result = assessmentResultsQuerySchema.safeParse({});

    assert.equal(result.success, true);
    assert.equal(result.data.page, 1);
    assert.equal(result.data.limit, 10);
    assert.equal(result.data.sortBy, "createdAt");
    assert.equal(result.data.sortOrder, "desc");
  });

  it("should reject invalid status", () => {
    const result = assessmentResultsQuerySchema.safeParse({
      status: "INVALID",
    });

    assert.equal(result.success, false);
  });

  it("should reject invalid sort field", () => {
    const result = assessmentResultsQuerySchema.safeParse({
      sortBy: "password",
    });

    assert.equal(result.success, false);
  });

  it("should reject limit above 100", () => {
    const result = assessmentResultsQuerySchema.safeParse({
      limit: "101",
    });

    assert.equal(result.success, false);
  });

  it("should validate assessment params", () => {
    const result = assessmentIdParamSchema.safeParse({
      assessmentId: "cm_assessment_123",
    });

    assert.equal(result.success, true);
  });

  it("should validate attempt result params", () => {
    const result = attemptResultParamsSchema.safeParse({
      assessmentId: "cm_assessment_123",
      attemptId: "cm_attempt_123",
    });

    assert.equal(result.success, true);
  });

  it("should reject unexpected query fields", () => {
    const result = assessmentResultsQuerySchema.safeParse({
      page: "1",
      candidateId: "candidate-123",
    });

    assert.equal(result.success, false);
  });
});
