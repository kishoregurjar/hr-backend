"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const attemptService = require("../../src/modules/attempt/attempt.service");
const { currentAttemptQuerySchema } = require("../../src/modules/attempt/attempt.validator");

describe("Step 11 — GET /current Active Attempt Suite", () => {
  it("should validate empty query params schema", () => {
    const result = currentAttemptQuerySchema.safeParse({});
    assert.equal(result.success, true);
  });

  it("should reject client-provided candidateId or attemptId in query via strict mode", () => {
    const result = currentAttemptQuerySchema.safeParse({ candidateId: "cand_123" });
    assert.equal(result.success, false);
  });

  it("should expose getCurrentCandidateAttempt service method", () => {
    assert.equal(typeof attemptService.getCurrentCandidateAttempt, "function");
  });

  it("should return null if candidate has no active attempt", async () => {
    const result = await attemptService.getCurrentCandidateAttempt({
      candidateAssessmentId: "nonexistent_ca",
    });
    assert.equal(result, null);
  });
});
