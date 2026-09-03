"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  incrementCounter,
  setGauge,
  observeHistogram,
  getMetricsSnapshot,
  resetMetrics,
} = require("../../src/utils/metrics");

describe("Metrics Utility Suite", () => {
  beforeEach(() => {
    resetMetrics();
  });

  it("increments counters correctly", () => {
    incrementCounter("test_counter_total");
    incrementCounter("test_counter_total", 2);

    const snapshot = getMetricsSnapshot();
    assert.strictEqual(snapshot.counters.length, 1);
    assert.strictEqual(snapshot.counters[0].name, "test_counter_total");
    assert.strictEqual(snapshot.counters[0].value, 3);
  });

  it("sets gauge values correctly", () => {
    setGauge("test_gauge_backlog", 42);

    const snapshot = getMetricsSnapshot();
    assert.strictEqual(snapshot.gauges.length, 1);
    assert.strictEqual(snapshot.gauges[0].name, "test_gauge_backlog");
    assert.strictEqual(snapshot.gauges[0].value, 42);
  });

  it("observes histogram values correctly", () => {
    observeHistogram("test_latency_ms", 100);
    observeHistogram("test_latency_ms", 200);

    const snapshot = getMetricsSnapshot();
    assert.strictEqual(snapshot.histograms.length, 1);
    assert.strictEqual(snapshot.histograms[0].count, 2);
    assert.strictEqual(snapshot.histograms[0].sum, 300);
  });

  it("resets metrics clean", () => {
    incrementCounter("test_c");
    setGauge("test_g", 1);
    observeHistogram("test_h", 10);
    resetMetrics();

    const snapshot = getMetricsSnapshot();
    assert.strictEqual(snapshot.counters.length, 0);
    assert.strictEqual(snapshot.gauges.length, 0);
    assert.strictEqual(snapshot.histograms.length, 0);
  });
});
