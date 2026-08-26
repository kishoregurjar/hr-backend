"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  generateVerificationSessionToken,
  hashVerificationSessionToken,
} = require("../../src/modules/attempt/attempt.session");

const {
  VERIFICATION_SESSION_CONFIG,
  VERIFICATION_SESSION_ERROR_CODES,
  createVerificationSessionExpiryDate,
} = require("../../src/modules/attempt/attempt.constants");

const attemptRepository = require("../../src/modules/attempt/attempt.repository");

describe("Candidate Verification Session Extended Suite", () => {
  it("should generate token with vs_ prefix and 64 hex characters", () => {
    const token = generateVerificationSessionToken();
    assert.equal(typeof token, "string");
    assert.equal(token.startsWith(VERIFICATION_SESSION_CONFIG.TOKEN_PREFIX), true);
    assert.equal(token.length, VERIFICATION_SESSION_CONFIG.TOKEN_PREFIX.length + VERIFICATION_SESSION_CONFIG.TOKEN_BYTES * 2);
  });

  it("should hash token deterministically using SHA-256", () => {
    const token = generateVerificationSessionToken();
    const hash1 = hashVerificationSessionToken(token);
    const hash2 = hashVerificationSessionToken(token);

    assert.equal(typeof hash1, "string");
    assert.equal(hash1.length, 64);
    assert.equal(hash1, hash2);
  });

  it("should reject hashing empty or non-string tokens", () => {
    assert.throws(() => hashVerificationSessionToken(""), TypeError);
    assert.throws(() => hashVerificationSessionToken(null), TypeError);
  });

  it("should calculate 15-minute default session TTL", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    const expiry = createVerificationSessionExpiryDate(now);
    assert.equal(expiry.toISOString(), "2026-08-25T12:15:00.000Z");
  });

  it("should expose session repository contract methods", () => {
    assert.equal(typeof attemptRepository.createVerificationSession, "function");
    assert.equal(typeof attemptRepository.findVerificationSessionByTokenHash, "function");
    assert.equal(typeof attemptRepository.findActiveVerificationSession, "function");
    assert.equal(typeof attemptRepository.touchVerificationSession, "function");
    assert.equal(typeof attemptRepository.revokeVerificationSession, "function");
  });
});
