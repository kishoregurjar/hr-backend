"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  currentAttemptQuerySchema,
} = require("../../src/modules/attempt/attempt.validator");

describe("Current Attempt Validation", () => {
  it("should accept a valid token", () => {
    const token = `inv_${"a".repeat(64)}`;

    const result = currentAttemptQuerySchema.safeParse({
      token,
    });

    assert.equal(result.success, true);
  });

  it("should reject malformed token", () => {
    const result = currentAttemptQuerySchema.safeParse({
      token: "invalid-token",
    });

    assert.equal(result.success, false);
  });

  it("should accept empty query params for session-authenticated requests", () => {
    const result = currentAttemptQuerySchema.safeParse({});

    assert.equal(result.success, true);
  });

  it("should reject unexpected candidateId", () => {
    const token = `inv_${"a".repeat(64)}`;

    const result = currentAttemptQuerySchema.safeParse({
      token,
      candidateId: "candidate-123",
    });

    assert.equal(result.success, false);
  });
});
