"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const attemptRepository = require("../../src/modules/attempt/attempt.repository");

describe("Candidate OTP Repository Suite", () => {
  it("should expose Candidate OTP repository contract methods", () => {
    assert.equal(typeof attemptRepository.createCandidateOtp, "function");
    assert.equal(typeof attemptRepository.findLatestCandidateOtp, "function");
    assert.equal(typeof attemptRepository.findLatestCandidateOtpRecord, "function");
    assert.equal(typeof attemptRepository.findRecentCandidateOtp, "function");
    assert.equal(typeof attemptRepository.countCandidateOtpRequests, "function");
    assert.equal(typeof attemptRepository.incrementOtpAttempts, "function");
    assert.equal(typeof attemptRepository.markCandidateOtpVerified, "function");
    assert.equal(typeof attemptRepository.invalidateCandidateOtp, "function");
  });
});
