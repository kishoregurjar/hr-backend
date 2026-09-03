"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { processExpiredAttempts, getWorkerState } = require("../../src/workers/attempt-expiry.worker");

describe("Attempt Expiry Worker State Suite", () => {
  it("provides worker heartbeat state structure", () => {
    const state = getWorkerState();
    assert.strictEqual(typeof state, "object");
    assert.strictEqual(typeof state.running, "boolean");
  });

  it("executes expiry worker loop without throwing", async () => {
    const result = await processExpiredAttempts();
    assert.ok(result);
    assert.strictEqual(typeof result.processed, "number");
    assert.strictEqual(typeof result.skipped, "number");

    const state = getWorkerState();
    assert.strictEqual(state.running, false);
    assert.ok(state.lastStartedAt);
  });
});
