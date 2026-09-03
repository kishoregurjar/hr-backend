"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const failureService = require("../../../src/modules/attempt/attempt.failure.service");
const { failureInjection } = require("../../../src/utils/failure-injection");
const { FAILURE_INJECTION_POINTS } = require("../../../src/utils/failure-injection.constants");

describe("Attempt Failure Service", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    failureInjection.clear();
  });

  afterEach(() => {
    failureInjection.clear();
  });

  it("should inject start failure", () => {
    failureService.enableFailure(
      FAILURE_INJECTION_POINTS.ATTEMPT_START_BEFORE_COMMIT,
      new Error("start failure")
    );

    assert.throws(
      () => failureService.beforeStartCommit(),
      {
        message: "start failure",
      }
    );
  });

  it("should inject answer failure", () => {
    failureService.enableFailure(
      FAILURE_INJECTION_POINTS.ATTEMPT_ANSWER_BEFORE_COMMIT,
      new Error("answer failure")
    );

    assert.throws(
      () => failureService.beforeAnswerCommit(),
      {
        message: "answer failure",
      }
    );
  });

  it("should inject submit evaluation failure", () => {
    failureService.enableFailure(
      FAILURE_INJECTION_POINTS.ATTEMPT_SUBMIT_BEFORE_EVALUATION,
      new Error("evaluation failure")
    );

    assert.throws(
      () => failureService.beforeSubmitEvaluation(),
      {
        message: "evaluation failure",
      }
    );
  });

  it("should inject submit commit failure", () => {
    failureService.enableFailure(
      FAILURE_INJECTION_POINTS.ATTEMPT_SUBMIT_BEFORE_COMMIT,
      new Error("commit failure")
    );

    assert.throws(
      () => failureService.beforeSubmitCommit(),
      {
        message: "commit failure",
      }
    );
  });

  it("should inject expiry evaluation failure", () => {
    failureService.enableFailure(
      FAILURE_INJECTION_POINTS.ATTEMPT_EXPIRY_BEFORE_EVALUATION,
      new Error("expiry evaluation failure")
    );

    assert.throws(
      () => failureService.beforeExpiryEvaluation(),
      {
        message: "expiry evaluation failure",
      }
    );
  });

  it("should disable configured failure", () => {
    failureService.enableFailure(
      FAILURE_INJECTION_POINTS.ATTEMPT_SUBMIT_AFTER_EVALUATION
    );

    failureService.disableFailure(
      FAILURE_INJECTION_POINTS.ATTEMPT_SUBMIT_AFTER_EVALUATION
    );

    assert.doesNotThrow(() => failureService.afterSubmitEvaluation());
  });

  it("should clear all configured failures", () => {
    failureService.enableFailure(
      FAILURE_INJECTION_POINTS.ATTEMPT_SUBMIT_AFTER_EVALUATION
    );

    failureService.enableFailure(
      FAILURE_INJECTION_POINTS.ATTEMPT_EXPIRY_AFTER_EVALUATION
    );

    failureService.clearFailures();

    assert.doesNotThrow(() => failureService.afterSubmitEvaluation());
    assert.doesNotThrow(() => failureService.afterExpiryEvaluation());
  });
});
