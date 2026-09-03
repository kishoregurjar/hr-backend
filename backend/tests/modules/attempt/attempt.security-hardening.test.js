"use strict";

require("dotenv").config();
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  validateAttemptTokenFormat,
  hashAttemptToken,
  generateAttemptToken,
  safeEqualStrings,
} = require("../../../src/modules/attempt/attempt.security");

describe("Step 18.9 — Attempt Security Hardening & Anti-Tampering Suite", () => {
  it("Test 1: Token format validation enforces string length boundaries (32 - 512)", () => {
    assert.strictEqual(validateAttemptTokenFormat("short"), false);
    assert.strictEqual(validateAttemptTokenFormat(123456789), false);
    assert.strictEqual(validateAttemptTokenFormat(null), false);

    const validToken = "a".repeat(32);
    assert.strictEqual(validateAttemptTokenFormat(validToken), true);

    const longToken = "b".repeat(512);
    assert.strictEqual(validateAttemptTokenFormat(longToken), true);

    const tooLongToken = "c".repeat(513);
    assert.strictEqual(validateAttemptTokenFormat(tooLongToken), false);
  });

  it("Test 2: Token hashing produces deterministic HMAC SHA-256 output using pepper", () => {
    const rawToken = generateAttemptToken();
    assert.strictEqual(rawToken.length, 64);

    const hash1 = hashAttemptToken(rawToken);
    const hash2 = hashAttemptToken(rawToken);

    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 64);
    assert.notStrictEqual(rawToken, hash1);
  });

  it("Test 3: Timing-safe string comparison prevents timing attacks", () => {
    const secret = "0123456789abcdef0123456789abcdef";
    const same = "0123456789abcdef0123456789abcdef";
    const different = "0123456789abcdef0123456789abcdeg";

    assert.strictEqual(safeEqualStrings(secret, same), true);
    assert.strictEqual(safeEqualStrings(secret, different), false);
    assert.strictEqual(safeEqualStrings(secret, "short"), false);
    assert.strictEqual(safeEqualStrings(null, secret), false);
  });
});
