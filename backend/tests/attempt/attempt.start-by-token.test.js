"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  startAttemptByTokenSchema,
} = require("../../src/modules/attempt/attempt.validator");
const attemptRepository = require("../../src/modules/attempt/attempt.repository");
const attemptService = require("../../src/modules/attempt/attempt.service");

describe("Start Attempt By Token & Regression Validation Suite", () => {
  // 1. Valid token
  it("1. should accept a valid invitation token", () => {
    const token = `inv_${"a".repeat(64)}`;
    const result = startAttemptByTokenSchema.safeParse({ token });
    assert.equal(result.success, true);
  });

  // 2. Missing token
  it("2. should reject missing token payload ({})", () => {
    const result = startAttemptByTokenSchema.safeParse({});
    assert.equal(result.success, false);
    assert.equal(result.error.issues[0].message, "Valid invitation token is required.");
  });

  // 3. undefined token
  it("3. should reject undefined token ({ token: undefined })", () => {
    const result = startAttemptByTokenSchema.safeParse({ token: undefined });
    assert.equal(result.success, false);
  });

  // 4. null token
  it("4. should reject null token ({ token: null })", () => {
    const result = startAttemptByTokenSchema.safeParse({ token: null });
    assert.equal(result.success, false);
  });

  // 5. Empty token
  it("5. should reject empty token ({ token: '' })", () => {
    const result = startAttemptByTokenSchema.safeParse({ token: "" });
    assert.equal(result.success, false);
  });

  // 6. Whitespace token
  it("6. should reject whitespace token ({ token: '   ' })", () => {
    const result = startAttemptByTokenSchema.safeParse({ token: "   " });
    assert.equal(result.success, false);
  });

  // 7. Invalid token
  it("7. should reject malformed token format", () => {
    const result = startAttemptByTokenSchema.safeParse({ token: "password123" });
    assert.equal(result.success, false);
  });

  // 8. Repository defensive guard against undefined tokenHash
  it("8. Repository findInvitationByTokenHash returns null for undefined/null tokenHash without throwing Prisma error", async () => {
    const res1 = await attemptRepository.findInvitationByTokenHash(undefined);
    assert.equal(res1, null);

    const res2 = await attemptRepository.findInvitationByTokenHash(null);
    assert.equal(res2, null);

    const res3 = await attemptRepository.findInvitationByTokenHash("");
    assert.equal(res3, null);
  });

  // 9. Repository defensive guard against undefined invitationId / attemptId
  it("9. Repository findInvitationById returns null for undefined/null id without throwing Prisma error", async () => {
    const res1 = await attemptRepository.findInvitationById(undefined);
    assert.equal(res1, null);

    const res2 = await attemptRepository.findInvitationById(null);
    assert.equal(res2, null);

    const res3 = await attemptRepository.findById(undefined);
    assert.equal(res3, null);
  });

  // 10. Service reject missing token cleanly
  it("10. attemptService.startAttemptByToken rejects missing token with INVITATION_ERROR_CODES.INVALID_TOKEN", async () => {
    await assert.rejects(
      async () => {
        await attemptService.startAttemptByToken({ token: null, candidateSession: null });
      },
      (err) => {
        return err.statusCode === 400 && err.code === "INVALID_TOKEN";
      }
    );
  });
});
