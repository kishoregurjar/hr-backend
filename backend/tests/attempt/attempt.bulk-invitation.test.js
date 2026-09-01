"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  createBulkInvitationSchema,
} = require("../../src/modules/attempt/attempt.validator");

describe("Bulk Invitation Validation Suite", () => {
  it("should accept valid candidate list", () => {
    const result = createBulkInvitationSchema.safeParse({
      candidateIds: ["candidate-1", "candidate-2"],
    });

    assert.equal(result.success, true);
  });

  it("should reject duplicate candidate IDs", () => {
    const result = createBulkInvitationSchema.safeParse({
      candidateIds: ["candidate-1", "candidate-1"],
    });

    assert.equal(result.success, false);
  });

  it("should reject empty candidate list", () => {
    const result = createBulkInvitationSchema.safeParse({
      candidateIds: [],
    });

    assert.equal(result.success, false);
  });

  it("should reject more than 500 candidates", () => {
    const candidateIds = Array.from(
      { length: 501 },
      (_, index) => `candidate-${index}`
    );

    const result = createBulkInvitationSchema.safeParse({
      candidateIds,
    });

    assert.equal(result.success, false);
  });

  it("should reject unknown properties", () => {
    const result = createBulkInvitationSchema.safeParse({
      candidateIds: ["candidate-1"],
      unknownField: "not-allowed",
    });

    assert.equal(result.success, false);
  });
});
