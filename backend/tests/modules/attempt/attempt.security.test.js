"use strict";

require("dotenv").config();
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  generateAttemptToken,
  hashAttemptToken,
  validateAttemptTokenFormat,
} = require("../../../src/modules/attempt/attempt.security");

describe("Attempt Security", () => {
  it("generates cryptographically secure token", () => {
    const token = generateAttemptToken();

    assert.equal(typeof token, "string");
    assert.equal(token.length, 64);
  });

  it("generates different tokens", () => {
    const first = generateAttemptToken();
    const second = generateAttemptToken();

    assert.notEqual(first, second);
  });

  it("produces deterministic token hash", () => {
    const token = generateAttemptToken();

    const firstHash = hashAttemptToken(token);
    const secondHash = hashAttemptToken(token);

    assert.equal(firstHash, secondHash);
  });

  it("does not expose raw token through hash", () => {
    const token = generateAttemptToken();
    const hash = hashAttemptToken(token);

    assert.notEqual(hash, token);
  });

  it("rejects short token", () => {
    assert.equal(validateAttemptTokenFormat("short"), false);
  });

  it("accepts valid token", () => {
    const token = generateAttemptToken();

    assert.equal(validateAttemptTokenFormat(token), true);
  });
});
