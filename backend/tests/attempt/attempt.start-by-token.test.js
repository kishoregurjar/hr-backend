"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  startAttemptByTokenSchema,
} = require("../../src/modules/attempt/attempt.validator");

describe("Start Attempt By Token Validation Suite", () => {
  it("should accept a valid invitation token", () => {
    const token = `inv_${"a".repeat(64)}`;

    const result = startAttemptByTokenSchema.safeParse({
      token,
    });

    assert.equal(result.success, true);
  });

  it("should reject malformed token", () => {
    const result = startAttemptByTokenSchema.safeParse({
      token: "password123",
    });

    assert.equal(result.success, false);
  });

  it("should reject empty token", () => {
    const result = startAttemptByTokenSchema.safeParse({
      token: "",
    });

    assert.equal(result.success, false);
  });

  it("should reject unexpected fields", () => {
    const token = `inv_${"a".repeat(64)}`;

    const result = startAttemptByTokenSchema.safeParse({
      token,
      candidateId: "candidate-123",
    });

    assert.equal(result.success, false);
  });
});
