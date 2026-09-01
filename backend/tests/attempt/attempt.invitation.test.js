"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  generateInvitationToken,
  hashInvitationToken,
} = require("../../src/modules/attempt/attempt.mapper");

describe("Invitation Token Security Suite", () => {
  it("should generate a high entropy token", () => {
    const token = generateInvitationToken();

    assert.equal(token.startsWith("inv_"), true);

    const rawPart = token.slice(4);

    assert.equal(rawPart.length, 64);
  });

  it("should generate unique tokens", () => {
    const tokenA = generateInvitationToken();
    const tokenB = generateInvitationToken();

    assert.notEqual(tokenA, tokenB);
  });

  it("should deterministically hash token", () => {
    const token = generateInvitationToken();
    const hashA = hashInvitationToken(token);
    const hashB = hashInvitationToken(token);

    assert.equal(hashA, hashB);
  });

  it("should produce a SHA-256 hash", () => {
    const hash = hashInvitationToken("inv_test_token");

    assert.equal(hash.length, 64);
    assert.match(hash, /^[a-f0-9]{64}$/);
  });

  it("should not return raw token as hash", () => {
    const token = generateInvitationToken();
    const hash = hashInvitationToken(token);

    assert.notEqual(hash, token);
  });
});
