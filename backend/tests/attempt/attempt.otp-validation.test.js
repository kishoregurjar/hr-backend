"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  sendCandidateOtpSchema,
  verifyCandidateOtpSchema,
} = require("../../src/modules/attempt/attempt.validator");

describe("Candidate OTP Validation Suite", () => {
  it("should accept valid send OTP request", () => {
    const result = sendCandidateOtpSchema.safeParse({
      email: "Candidate@Example.COM",
      invitationToken: "inv_abc123",
    });

    assert.equal(result.success, true);
    assert.equal(result.data.email, "candidate@example.com");
  });

  it("should reject invalid email", () => {
    const result = sendCandidateOtpSchema.safeParse({
      email: "invalid-email",
      invitationToken: "inv_abc123",
    });

    assert.equal(result.success, false);
  });

  it("should reject missing invitation token", () => {
    const result = sendCandidateOtpSchema.safeParse({
      email: "candidate@example.com",
    });

    assert.equal(result.success, false);
  });

  it("should accept valid OTP", () => {
    const result = verifyCandidateOtpSchema.safeParse({
      email: "candidate@example.com",
      otp: "849201",
      invitationToken: "inv_abc123",
    });

    assert.equal(result.success, true);
  });

  it("should reject five digit OTP", () => {
    const result = verifyCandidateOtpSchema.safeParse({
      email: "candidate@example.com",
      otp: "84920",
      invitationToken: "inv_abc123",
    });

    assert.equal(result.success, false);
  });

  it("should reject alphabetic OTP", () => {
    const result = verifyCandidateOtpSchema.safeParse({
      email: "candidate@example.com",
      otp: "84A201",
      invitationToken: "inv_abc123",
    });

    assert.equal(result.success, false);
  });

  it("should reject unexpected fields", () => {
    const result = verifyCandidateOtpSchema.safeParse({
      email: "candidate@example.com",
      otp: "849201",
      invitationToken: "inv_abc123",
      candidateId: "candidate_123",
    });

    assert.equal(result.success, false);
  });

  it("should preserve OTP as string", () => {
    const result = verifyCandidateOtpSchema.safeParse({
      email: "candidate@example.com",
      otp: "012345",
      invitationToken: "inv_abc123",
    });

    assert.equal(result.success, true);
    assert.equal(result.data.otp, "012345");
  });
});
