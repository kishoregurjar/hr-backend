"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const attemptController = require("../../src/modules/attempt/attempt.controller");

describe("Candidate OTP Controller Suite", () => {
  it("should expose sendCandidateOtp and verifyCandidateOtp HTTP handlers", () => {
    assert.equal(typeof attemptController.sendCandidateOtp, "function");
    assert.equal(typeof attemptController.verifyCandidateOtp, "function");
  });
});
