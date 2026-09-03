"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  sanitizeMetadata,
} = require("../../../src/modules/attempt/attempt.audit.service");

describe("Attempt Audit Security Suite", () => {
  it("removes sensitive token fields", () => {
    const result = sanitizeMetadata({
      attemptId: "attempt-1",
      token: "secret-token",
      tokenHash: "secret-hash",
      otp: "123456",
      password: "secret",
    });

    assert.deepEqual(result, {
      attemptId: "attempt-1",
    });
  });

  it("preserves safe metadata", () => {
    const result = sanitizeMetadata({
      version: 2,
      reason: "REPEATED_SUBMIT",
    });

    assert.deepEqual(result, {
      version: 2,
      reason: "REPEATED_SUBMIT",
    });
  });

  it("sanitizes nested objects", () => {
    const result = sanitizeMetadata({
      security: {
        token: "secret",
        version: 3,
      },
    });

    assert.deepEqual(result, {
      security: {
        version: 3,
      },
    });
  });

  it("sanitizes arrays", () => {
    const result = sanitizeMetadata([
      {
        token: "secret",
        version: 1,
      },
      {
        version: 2,
      },
    ]);

    assert.deepEqual(result, [
      {
        version: 1,
      },
      {
        version: 2,
      },
    ]);
  });

  it("handles null metadata", () => {
    assert.equal(
      sanitizeMetadata(null),
      null
    );
  });
});
