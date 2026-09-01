const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const attemptController = require("../../src/modules/attempt/attempt.controller");

describe("Assessment Attempt Controller Methods Suite", () => {
  it("exposes startAttempt HTTP handler method", () => {
    assert.equal(typeof attemptController.startAttempt, "function");
  });

  it("exposes createInvitation HTTP handler method", () => {
    assert.equal(typeof attemptController.createInvitation, "function");
  });

  it("exposes createBulkInvitations HTTP handler method", () => {
    assert.equal(typeof attemptController.createBulkInvitations, "function");
  });

  it("exposes startAttemptByToken HTTP handler method", () => {
    assert.equal(typeof attemptController.startAttemptByToken, "function");
  });

  it("exposes getCurrentAttempt HTTP handler method", () => {
    assert.equal(typeof attemptController.getCurrentAttempt, "function");
  });

  it("exposes saveAnswer HTTP handler method", () => {
    assert.equal(typeof attemptController.saveAnswer, "function");
  });
});
