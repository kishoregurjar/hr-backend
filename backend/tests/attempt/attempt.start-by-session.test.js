"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const attemptService = require("../../src/modules/attempt/attempt.service");
const { startAttemptByTokenSchema } = require("../../src/modules/attempt/attempt.validator");

describe("Step 10 — Start Attempt via Verification Session Integration Suite", () => {
  it("should validate empty body schema in strict mode", () => {
    const result = startAttemptByTokenSchema.safeParse({});
    assert.equal(result.success, true);
  });

  it("should reject client-provided candidateId or assessmentId in body via strict mode", () => {
    const result = startAttemptByTokenSchema.safeParse({ candidateId: "cand_123" });
    assert.equal(result.success, false);
  });

  it("should expose startAttemptByToken service method", () => {
    assert.equal(typeof attemptService.startAttemptByToken, "function");
  });
});
