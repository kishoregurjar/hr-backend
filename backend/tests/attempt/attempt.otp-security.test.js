"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

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

  it("should hash OTP using scrypt async format", async () => {
    const hash = await hashOtp("123456");
    assert.equal(typeof hash, "string");
    assert.ok(hash.startsWith("scrypt:"), "Hash must start with scrypt: prefix");
  });

  it("should verify correct OTP with new scrypt hash", async () => {
    const hash = await hashOtp("123456");
    const result = await verifyOtpHash("123456", hash);
    assert.equal(result, true);
  });

  it("should reject incorrect OTP with scrypt hash", async () => {
    const hash = await hashOtp("123456");
    const result = await verifyOtpHash("654321", hash);
    assert.equal(result, false);
  });

  it("should verify legacy HMAC-SHA256 stored hash for backward compatibility & rollback", async () => {
    const legacyHash = crypto
      .createHmac("sha256", process.env.OTP_SECRET)
      .update("123456", "utf8")
      .digest("hex");
    
    assert.equal(legacyHash.length, 64);
    assert.equal(legacyHash.startsWith("scrypt:"), false);

    const validResult = await verifyOtpHash("123456", legacyHash);
    assert.equal(validResult, true, "Must verify legacy HMAC hash successfully");

    const invalidResult = await verifyOtpHash("654321", legacyHash);
    assert.equal(invalidResult, false, "Must reject incorrect OTP for legacy HMAC hash");
  });

  it("should handle malformed stored hashes gracefully without throwing", async () => {
    assert.equal(await verifyOtpHash("123456", "malformed_hash_xyz"), false);
    assert.equal(await verifyOtpHash("123456", "scrypt:invalid"), false);
    assert.equal(await verifyOtpHash("123456", "scrypt:shortsalt:shortkey"), false);
    assert.equal(await verifyOtpHash("123456", ""), false);
    assert.equal(await verifyOtpHash("123456", null), false);
  });

  it("should handle concurrent verification requests using Promise.all", async () => {
    const hash = await hashOtp("123456");
    const promises = Array.from({ length: 10 }, () => verifyOtpHash("123456", hash));
    const results = await Promise.all(promises);
    assert.equal(results.length, 10);
    assert.ok(results.every((r) => r === true));
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
