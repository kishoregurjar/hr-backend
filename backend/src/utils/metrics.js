"use strict";

const counters = new Map();
const gauges = new Map();
const histograms = new Map();

const assertMetricName = (name) => {
  if (typeof name !== "string" || !/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(name)) {
    throw new TypeError(`Invalid metric name: ${name}`);
  }
};

const incrementCounter = (name, value = 1, labels = {}) => {
  assertMetricName(name);

  const key = JSON.stringify([name, labels]);

  const current = counters.get(key) || {
    name,
    labels,
    value: 0,
  };

  current.value += value;

  counters.set(key, current);
};

const setGauge = (name, value, labels = {}) => {
  assertMetricName(name);

  if (!Number.isFinite(value)) {
    throw new TypeError(`Gauge value must be finite: ${name}`);
  }

  const key = JSON.stringify([name, labels]);

  gauges.set(key, {
    name,
    labels,
    value,
  });
};

const observeHistogram = (name, value, labels = {}) => {
  assertMetricName(name);

  if (!Number.isFinite(value)) {
    throw new TypeError(`Histogram value must be finite: ${name}`);
  }

  const key = JSON.stringify([name, labels]);

  const current = histograms.get(key) || {
    name,
    labels,
    count: 0,
    sum: 0,
  };

  current.count += 1;
  current.sum += value;

  histograms.set(key, current);
};

const getMetricsSnapshot = () => ({
  counters: Array.from(counters.values()),
  gauges: Array.from(gauges.values()),
  histograms: Array.from(histograms.values()),
});

const resetMetrics = () => {
  counters.clear();
  gauges.clear();
  histograms.clear();
};

module.exports = {
  incrementCounter,
  setGauge,
  observeHistogram,
  getMetricsSnapshot,
  resetMetrics,
};
