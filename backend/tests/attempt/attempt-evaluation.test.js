"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const attemptService = require("../../src/modules/attempt/attempt.service");
const { evaluateAttemptAnswerSchema } = require("../../src/modules/attempt/attempt.validator");

describe("Step 14 — Manual / Subjective Evaluation Suite", () => {
  it("should validate correct evaluation payload with positive marks", () => {
    const result = evaluateAttemptAnswerSchema.safeParse({
      attemptAnswerId: "ans_123",
      evaluationStatus: "CORRECT",
      marksAwarded: 10,
    });
    assert.equal(result.success, true);
  });

  it("should validate incorrect evaluation payload with 0 marks", () => {
    const result = evaluateAttemptAnswerSchema.safeParse({
      attemptAnswerId: "ans_123",
      evaluationStatus: "INCORRECT",
      marksAwarded: 0,
    });
    assert.equal(result.success, true);
  });

  it("should reject correct evaluation payload with 0 or negative marks", () => {
    const result = evaluateAttemptAnswerSchema.safeParse({
      attemptAnswerId: "ans_123",
      evaluationStatus: "CORRECT",
      marksAwarded: 0,
    });
    assert.equal(result.success, false);
  });

  it("should reject incorrect evaluation payload with positive marks", () => {
    const result = evaluateAttemptAnswerSchema.safeParse({
      attemptAnswerId: "ans_123",
      evaluationStatus: "INCORRECT",
      marksAwarded: 5,
    });
    assert.equal(result.success, false);
  });

  it("should reject candidate role from performing evaluation", async () => {
    try {
      await attemptService.evaluateCandidateAnswer({
        attemptAnswerId: "ans_123",
        evaluationStatus: "CORRECT",
        marksAwarded: 10,
        evaluator: { role: "CANDIDATE" },
      });
      assert.fail("Should have thrown ForbiddenError");
    } catch (err) {
      assert.equal(err.name, "ForbiddenError");
    }
  });

  it("should expose evaluateCandidateAnswer service method", () => {
    assert.equal(typeof attemptService.evaluateCandidateAnswer, "function");
  });
});
