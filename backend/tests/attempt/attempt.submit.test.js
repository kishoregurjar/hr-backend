"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  submitAttemptSchema,
} = require("../../src/modules/attempt/attempt.validator");
const attemptService = require("../../src/modules/attempt/attempt.service");

const validToken = `inv_${"a".repeat(64)}`;

describe("Submit Attempt Validation", () => {
  it("should accept valid token", () => {
    const result = submitAttemptSchema.safeParse({
      token: validToken,
    });

    assert.equal(result.success, true);
  });

  it("should accept empty body for session-authenticated requests", () => {
    const result = submitAttemptSchema.safeParse({});

    assert.equal(result.success, true);
  });

  it("should reject malformed token", () => {
    const result = submitAttemptSchema.safeParse({
      token: "invalid-token",
    });

    assert.equal(result.success, false);
  });

  it("should reject attemptId", () => {
    const result = submitAttemptSchema.safeParse({
      token: validToken,
      attemptId: "cm_attempt_123",
    });

    assert.equal(result.success, false);
  });

  it("should reject client score", () => {
    const result = submitAttemptSchema.safeParse({
      token: validToken,
      finalScore: 100,
    });

    assert.equal(result.success, false);
  });

  it("should reject client result", () => {
    const result = submitAttemptSchema.safeParse({
      token: validToken,
      result: "PASSED",
    });

    assert.equal(result.success, false);
  });
});

describe("Attempt Evaluation Engine Helpers", () => {
  it("should mark exact option set correct", () => {
    const result = attemptService.areOptionSetsEqual(["A", "C"], ["C", "A"]);

    assert.equal(result, true);
  });

  it("should reject partial multiple-choice answer", () => {
    const result = attemptService.areOptionSetsEqual(["A"], ["A", "C"]);

    assert.equal(result, false);
  });

  it("should reject extra option", () => {
    const result = attemptService.areOptionSetsEqual(["A", "C", "D"], ["A", "C"]);

    assert.equal(result, false);
  });

  it("should correctly score positive and negative marks and floor raw negative score at 0", () => {
    const scoreResult = attemptService.calculateAttemptScore([
      { status: "CORRECT", positiveMarks: 5, negativeMarks: 0 },
      { status: "INCORRECT", positiveMarks: 0, negativeMarks: 10 },
    ]);

    assert.equal(scoreResult.positiveMarks, 5);
    assert.equal(scoreResult.negativeMarks, 10);
    assert.equal(scoreResult.finalScore, 0);
  });

  it("should preserve unanswered question with 0 marks and 0 penalty", () => {
    const scoreResult = attemptService.calculateAttemptScore([
      { status: "UNANSWERED", positiveMarks: 0, negativeMarks: 0 },
    ]);

    assert.equal(scoreResult.unansweredCount, 1);
    assert.equal(scoreResult.finalScore, 0);
  });
});
