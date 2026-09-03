"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { failureInjection } = require("../../../src/utils/failure-injection");
const { FAILURE_INJECTION_POINTS } = require("../../../src/utils/failure-injection.constants");

describe("Attempt failure injection suite", () => {
  beforeEach(() => {
    failureInjection.clear();
  });

  afterEach(() => {
    failureInjection.clear();
  });

  it("should inject evaluation failure", () => {
    const error = new Error("Evaluation service failed");

    failureInjection.enable(
      FAILURE_INJECTION_POINTS.ATTEMPT_BEFORE_EVALUATION,
      error
    );

    assert.throws(
      () => {
        failureInjection.throwIfEnabled(
          FAILURE_INJECTION_POINTS.ATTEMPT_BEFORE_EVALUATION
        );
      },
      {
        message: "Evaluation service failed",
      }
    );
  });

  it("should inject submit failure", () => {
    const error = new Error("Submit transaction failed");

    failureInjection.enable(
      FAILURE_INJECTION_POINTS.ATTEMPT_AFTER_SUBMIT,
      error
    );

    assert.throws(
      () => {
        failureInjection.throwIfEnabled(
          FAILURE_INJECTION_POINTS.ATTEMPT_AFTER_SUBMIT
        );
      },
      {
        message: "Submit transaction failed",
      }
    );
  });

  it("should disable a configured failure", () => {
    failureInjection.enable(
      FAILURE_INJECTION_POINTS.ATTEMPT_BEFORE_EVALUATION
    );

    assert.equal(
      failureInjection.isEnabled(
        FAILURE_INJECTION_POINTS.ATTEMPT_BEFORE_EVALUATION
      ),
      true
    );

    failureInjection.disable(
      FAILURE_INJECTION_POINTS.ATTEMPT_BEFORE_EVALUATION
    );

    assert.equal(
      failureInjection.isEnabled(
        FAILURE_INJECTION_POINTS.ATTEMPT_BEFORE_EVALUATION
      ),
      false
    );
  });

  it("should clear all configured failures", () => {
    failureInjection.enable(
      FAILURE_INJECTION_POINTS.ATTEMPT_BEFORE_EVALUATION
    );

    failureInjection.enable(
      FAILURE_INJECTION_POINTS.ATTEMPT_AFTER_EVALUATION
    );

    failureInjection.clear();

    assert.equal(
      failureInjection.isEnabled(
        FAILURE_INJECTION_POINTS.ATTEMPT_BEFORE_EVALUATION
      ),
      false
    );

    assert.equal(
      failureInjection.isEnabled(
        FAILURE_INJECTION_POINTS.ATTEMPT_AFTER_EVALUATION
      ),
      false
    );
  });
});
