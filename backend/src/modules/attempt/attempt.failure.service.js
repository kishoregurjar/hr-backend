"use strict";

const { failureInjection } = require("../../utils/failure-injection");
const { FAILURE_INJECTION_POINTS } = require("../../utils/failure-injection.constants");
const { assertFailureInjectionAllowed } = require("../../utils/failure-injection.guard");

function enableFailure(point, error) {
  assertFailureInjectionAllowed();
  failureInjection.enable(point, error);
}

function disableFailure(point) {
  assertFailureInjectionAllowed();
  failureInjection.disable(point);
}

function clearFailures() {
  assertFailureInjectionAllowed();
  failureInjection.clear();
}

function beforeStartCommit() {
  failureInjection.throwIfEnabled(
    FAILURE_INJECTION_POINTS.ATTEMPT_START_BEFORE_COMMIT
  );
}

function beforeAnswerCommit() {
  failureInjection.throwIfEnabled(
    FAILURE_INJECTION_POINTS.ATTEMPT_ANSWER_BEFORE_COMMIT
  );
}

function beforeSubmitEvaluation() {
  failureInjection.throwIfEnabled(
    FAILURE_INJECTION_POINTS.ATTEMPT_SUBMIT_BEFORE_EVALUATION
  );
}

function afterSubmitEvaluation() {
  failureInjection.throwIfEnabled(
    FAILURE_INJECTION_POINTS.ATTEMPT_SUBMIT_AFTER_EVALUATION
  );
}

function beforeSubmitCommit() {
  failureInjection.throwIfEnabled(
    FAILURE_INJECTION_POINTS.ATTEMPT_SUBMIT_BEFORE_COMMIT
  );
}

function beforeExpiryEvaluation() {
  failureInjection.throwIfEnabled(
    FAILURE_INJECTION_POINTS.ATTEMPT_EXPIRY_BEFORE_EVALUATION
  );
}

function afterExpiryEvaluation() {
  failureInjection.throwIfEnabled(
    FAILURE_INJECTION_POINTS.ATTEMPT_EXPIRY_AFTER_EVALUATION
  );
}

function beforeExpiryCommit() {
  failureInjection.throwIfEnabled(
    FAILURE_INJECTION_POINTS.ATTEMPT_EXPIRY_BEFORE_COMMIT
  );
}

module.exports = {
  enableFailure,
  disableFailure,
  clearFailures,

  beforeStartCommit,
  beforeAnswerCommit,

  beforeSubmitEvaluation,
  afterSubmitEvaluation,
  beforeSubmitCommit,

  beforeExpiryEvaluation,
  afterExpiryEvaluation,
  beforeExpiryCommit,
};
