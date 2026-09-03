"use strict";

const {
  incrementCounter,
  setGauge,
  observeHistogram,
} = require("../../utils/metrics");

const {
  ATTEMPT_METRICS,
} = require("./attempt.constants");

const increment = (metric, labels = {}) => {
  incrementCounter(metric, 1, labels);
};

const recordRequestLatency = (operation, durationMs) => {
  observeHistogram(
    ATTEMPT_METRICS.REQUEST_LATENCY,
    durationMs,
    {
      operation,
    }
  );
};

const recordEvaluationLatency = (durationMs) => {
  observeHistogram(
    ATTEMPT_METRICS.EVALUATION_LATENCY,
    durationMs
  );
};

const recordExpiryWorkerLatency = (durationMs) => {
  observeHistogram(
    ATTEMPT_METRICS.EXPIRY_WORKER_LATENCY,
    durationMs
  );
};

const setExpiryBacklog = (count) => {
  setGauge(
    ATTEMPT_METRICS.EXPIRY_BACKLOG,
    count
  );
};

const recordAttemptStarted = () => {
  increment(ATTEMPT_METRICS.STARTED_TOTAL);
};

const recordAttemptStartFailed = (reason) => {
  increment(ATTEMPT_METRICS.START_FAILED_TOTAL, { reason });
};

const recordAnswerCreated = () => {
  increment(ATTEMPT_METRICS.ANSWER_CREATED_TOTAL);
};

const recordAnswerUpdated = () => {
  increment(ATTEMPT_METRICS.ANSWER_UPDATED_TOTAL);
};

const recordAnswerVersionConflict = () => {
  increment(ATTEMPT_METRICS.ANSWER_VERSION_CONFLICT_TOTAL);
};

const recordAttemptSubmitted = () => {
  increment(ATTEMPT_METRICS.SUBMITTED_TOTAL);
};

const recordAlreadySubmitted = () => {
  increment(ATTEMPT_METRICS.ALREADY_SUBMITTED_TOTAL);
};

const recordAttemptExpired = () => {
  increment(ATTEMPT_METRICS.EXPIRED_TOTAL);
};

const recordEvaluationFailed = (reason) => {
  increment(ATTEMPT_METRICS.EVALUATION_FAILED_TOTAL, { reason });
};

const recordSecurityEvent = (event) => {
  increment(ATTEMPT_METRICS.SECURITY_EVENT_TOTAL, { event });
};

module.exports = {
  recordAttemptStarted,
  recordAttemptStartFailed,
  recordAnswerCreated,
  recordAnswerUpdated,
  recordAnswerVersionConflict,
  recordAttemptSubmitted,
  recordAlreadySubmitted,
  recordAttemptExpired,
  recordEvaluationFailed,
  recordSecurityEvent,
  recordRequestLatency,
  recordEvaluationLatency,
  recordExpiryWorkerLatency,
  setExpiryBacklog,
};
