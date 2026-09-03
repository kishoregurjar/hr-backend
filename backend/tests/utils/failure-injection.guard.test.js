"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { assertFailureInjectionAllowed } = require("../../src/utils/failure-injection.guard");

describe("Failure Injection Production Guard", () => {
  it("should reject failure injection in production", () => {
    const previous = process.env.NODE_ENV;

    process.env.NODE_ENV = "production";

    try {
      assert.throws(
        () => assertFailureInjectionAllowed(),
        {
          code: "FAILURE_INJECTION_DISABLED",
          message: "Failure injection is disabled in production",
        }
      );
    } finally {
      if (previous === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previous;
      }
    }
  });

  it("should allow failure injection outside production", () => {
    const previous = process.env.NODE_ENV;

    process.env.NODE_ENV = "test";

    try {
      assert.doesNotThrow(() => assertFailureInjectionAllowed());
    } finally {
      if (previous === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previous;
      }
    }
  });
});
