"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

process.env.OTP_SECRET = "test-only-otp-secret";

const {
  generateNumericOtp,
  hashOtp,
  verifyOtpHash,
  createOtpExpiryDate,
  isOtpExpired,
  hasExceededOtpAttempts,
  isValidNumericOtp,
} = require("../../src/modules/attempt/attempt.constants");

describe("OTP Security Suite", () => {
  it("should generate exactly 6 numeric digits", () => {
    const otp = generateNumericOtp();
    assert.match(otp, /^\d{6}$/);
  });

  it("should generate different OTPs probabilistically", () => {
    const otp1 = generateNumericOtp();
    const otp2 = generateNumericOtp();
    assert.notEqual(otp1, otp2);
  });

  it("should hash OTP", () => {
    const hash = hashOtp("123456");
    assert.equal(typeof hash, "string");
    assert.equal(hash.length, 64);
  });

  it("should verify correct OTP", () => {
    const hash = hashOtp("123456");
    assert.equal(verifyOtpHash("123456", hash), true);
  });

  it("should reject incorrect OTP", () => {
    const hash = hashOtp("123456");
    assert.equal(verifyOtpHash("654321", hash), false);
  });

  it("should create 5 minute expiry", () => {
    const now = new Date("2026-08-25T10:00:00.000Z");
    const expiry = createOtpExpiryDate(now);
    assert.equal(expiry.toISOString(), "2026-08-25T10:05:00.000Z");
  });

  it("should detect expired OTP", () => {
    const expiry = new Date("2026-08-25T10:05:00.000Z");
    const now = new Date("2026-08-25T10:06:00.000Z");
    assert.equal(isOtpExpired(expiry, now), true);
  });

  it("should allow OTP before expiry", () => {
    const expiry = new Date("2026-08-25T10:05:00.000Z");
    const now = new Date("2026-08-25T10:04:59.000Z");
    assert.equal(isOtpExpired(expiry, now), false);
  });

  it("should reject OTP after max attempts", () => {
    assert.equal(hasExceededOtpAttempts(3, 3), true);
  });

  it("should allow OTP below max attempts", () => {
    assert.equal(hasExceededOtpAttempts(2, 3), false);
  });

  it("should validate numeric OTP", () => {
    assert.equal(isValidNumericOtp("123456"), true);
    assert.equal(isValidNumericOtp("12345"), false);
    assert.equal(isValidNumericOtp("12345a"), false);
  });
});
