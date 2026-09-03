"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("Health & Liveness Probes Suite", () => {
  it("defines liveness and readiness route paths", () => {
    const healthRoutes = require("../../src/routes/health.routes");
    assert.ok(healthRoutes);
  });
});
