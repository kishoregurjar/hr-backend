"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const attemptMetrics = require("../../../src/modules/attempt/attempt.metrics");
const { getMetricsSnapshot, resetMetrics } = require("../../../src/utils/metrics");

describe("Attempt Metrics Suite", () => {
  beforeEach(() => {
    resetMetrics();
  });

  it("records attempt started metric", () => {
    attemptMetrics.recordAttemptStarted();
    const snapshot = getMetricsSnapshot();

    assert.ok(snapshot.counters.some((c) => c.name === "hirequest_attempt_started_total"));
  });

  it("records attempt submitted and already submitted metrics", () => {
    attemptMetrics.recordAttemptSubmitted();
    attemptMetrics.recordAlreadySubmitted();
    const snapshot = getMetricsSnapshot();

    assert.ok(snapshot.counters.some((c) => c.name === "hirequest_attempt_submitted_total"));
    assert.ok(snapshot.counters.some((c) => c.name === "hirequest_attempt_already_submitted_total"));
  });

  it("records answer version conflict and security events", () => {
    attemptMetrics.recordAnswerVersionConflict();
    attemptMetrics.recordSecurityEvent("QUESTION_TAMPERING");
    const snapshot = getMetricsSnapshot();

    assert.ok(snapshot.counters.some((c) => c.name === "hirequest_attempt_answer_version_conflict_total"));
    assert.ok(snapshot.counters.some((c) => c.name === "hirequest_attempt_security_event_total"));
  });

  it("records gauges and latency histograms", () => {
    attemptMetrics.setExpiryBacklog(5);
    attemptMetrics.recordRequestLatency("submit", 120);
    const snapshot = getMetricsSnapshot();

    assert.ok(snapshot.gauges.some((g) => g.name === "hirequest_attempt_expiry_backlog" && g.value === 5));
    assert.ok(snapshot.histograms.some((h) => h.name === "hirequest_attempt_request_latency_ms"));
  });
});
