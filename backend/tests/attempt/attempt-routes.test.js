const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const attemptRoutes = require("../../src/modules/attempt/attempt.routes");

describe("Assessment Attempt Routes Suite", () => {
  it("exports an Express router function", () => {
    assert.equal(typeof attemptRoutes, "function");
    assert.equal(typeof attemptRoutes.use, "function");
    assert.equal(typeof attemptRoutes.post, "function");
  });
});
