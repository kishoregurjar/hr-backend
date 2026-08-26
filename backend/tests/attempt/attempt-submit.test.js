"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const attemptService = require("../../src/modules/attempt/attempt.service");
const { submitAttemptSchema } = require("../../src/modules/attempt/attempt.validator");

describe("Step 13 — Submit Attempt & Evaluation Engine Suite", () => {
  it("should validate empty request body in strict mode", () => {
    const result = submitAttemptSchema.safeParse({});
    assert.equal(result.success, true);
  });

  it("should reject client-provided attemptId or score in body via strict mode", () => {
    const result = submitAttemptSchema.safeParse({ attemptId: "att_123", score: 100 });
    assert.equal(result.success, false);
  });

  it("should expose submitCandidateAttempt service method", () => {
    assert.equal(typeof attemptService.submitCandidateAttempt, "function");
  });
});
