"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const attemptService = require("../../src/modules/attempt/attempt.service");

describe("Candidate OTP Service Suite", () => {
  it("should expose sendCandidateOtp and verifyCandidateOtp workflow methods", () => {
    assert.equal(typeof attemptService.sendCandidateOtp, "function");
    assert.equal(typeof attemptService.verifyCandidateOtp, "function");
  });
});
