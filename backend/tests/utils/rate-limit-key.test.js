"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  hashValue,
  normalizeEmail,
  buildRateLimitKey,
} = require("../../src/utils/rate-limit-key");

describe("Rate Limit Key Sanitization Suite", () => {
  it("should generate deterministic SHA-256 hash", () => {
    const hash1 = hashValue("candidate@example.com");
    const hash2 = hashValue("candidate@example.com");
    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 64);
  });

  it("should normalize email address correctly", () => {
    assert.strictEqual(
      normalizeEmail("  Candidate@Example.COM  "),
      "candidate@example.com"
    );
    assert.strictEqual(normalizeEmail(null), "");
    assert.strictEqual(normalizeEmail(123), "");
  });

  it("should build sanitized rate limit key format without cleartext identifiers", () => {
    const key = buildRateLimitKey({
      namespace: "otp-send",
      identifier: "127.0.0.1:candidate@example.com",
    });

    assert.ok(key.startsWith("hirequest:rate-limit:otp-send:"));
    assert.ok(!key.includes("candidate@example.com"));
    assert.ok(!key.includes("127.0.0.1"));
  });
});
