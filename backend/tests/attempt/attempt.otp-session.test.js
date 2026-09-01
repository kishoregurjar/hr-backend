"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  generateVerificationSessionToken,
  hashVerificationSessionToken,
  createVerificationSessionExpiryDate,
  VERIFICATION_SESSION_CONFIG,
} = require("../../src/modules/attempt/attempt.constants");

describe("Candidate Verification Session Security Suite", () => {
  it("should generate a prefixed high entropy session token", () => {
    const token = generateVerificationSessionToken();
    assert.equal(typeof token, "string");
    assert.equal(token.startsWith("vs_"), true);
    assert.equal(token.length, 3 + 64);
  });

  it("should generate unique session tokens", () => {
    const token1 = generateVerificationSessionToken();
    const token2 = generateVerificationSessionToken();
    assert.notEqual(token1, token2);
  });

  it("should deterministically hash verification session token", () => {
    const token = generateVerificationSessionToken();
    const hash1 = hashVerificationSessionToken(token);
    const hash2 = hashVerificationSessionToken(token);
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64);
  });

  it("should reject hashing empty or invalid tokens", () => {
    assert.throws(
      () => hashVerificationSessionToken(""),
      TypeError
    );
  });

  it("should create 15-minute session expiry date", () => {
    const now = new Date("2026-08-25T10:00:00.000Z");
    const expiry = createVerificationSessionExpiryDate(now);
    assert.equal(expiry.toISOString(), "2026-08-25T10:15:00.000Z");
  });
});
