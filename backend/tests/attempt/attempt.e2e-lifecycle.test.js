"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const attemptService = require("../../src/modules/attempt/attempt.service");
const attemptRepository = require("../../src/modules/attempt/attempt.repository");
const attemptController = require("../../src/modules/attempt/attempt.controller");
const { startAttemptByTokenSchema } = require("../../src/modules/attempt/attempt.validator");

describe("Complete Candidate Assessment Lifecycle & Security E2E Test Suite", () => {
  // 1. Token validation & canonical payload contract
  it("1. Payload validation accepts canonical token field and rejects empty/undefined payloads", () => {
    const valid = startAttemptByTokenSchema.safeParse({ token: `inv_${"f".repeat(64)}` });
    assert.equal(valid.success, true);

    const missing = startAttemptByTokenSchema.safeParse({});
    assert.equal(missing.success, false);

    const undefinedToken = startAttemptByTokenSchema.safeParse({ token: undefined });
    assert.equal(undefinedToken.success, false);

    const nullToken = startAttemptByTokenSchema.safeParse({ token: null });
    assert.equal(nullToken.success, false);

    const emptyToken = startAttemptByTokenSchema.safeParse({ token: "" });
    assert.equal(emptyToken.success, false);

    const whitespaceToken = startAttemptByTokenSchema.safeParse({ token: "   " });
    assert.equal(whitespaceToken.success, false);
  });

  // 2. Server-Authoritative Expiration Invariant
  it("2. calculateExpiresAt generates exact startedAt + durationMinutes server invariant", () => {
    const startedAt = new Date("2026-09-22T10:00:00.000Z");
    const expiresAt = attemptService.calculateExpiresAt({
      startedAt,
      durationMinutes: 60,
    });

    assert.equal(expiresAt.toISOString(), "2026-09-22T11:00:00.000Z");
  });

  // 3. Candidate Ownership Security Guard
  it("3. Candidate attempt controller prevents Candidate A from viewing Candidate B attempt", async () => {
    const req = {
      params: { attemptId: "att_candidate_b_123" },
      candidateSession: { candidateId: "cand_a_123" },
    };
    const res = {};

    // Mock repository to return attempt for Candidate B
    const origFind = attemptRepository.findAttemptById;
    attemptRepository.findAttemptById = async () => ({
      id: "att_candidate_b_123",
      candidateId: "cand_b_456",
      status: "IN_PROGRESS",
    });

    try {
      await attemptController.getCandidateAttempt(req, res, (err) => {
        assert.ok(err);
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, "FORBIDDEN");
      });
    } finally {
      attemptRepository.findAttemptById = origFind;
    }
  });

  // 4. Candidate Ownership Allowed Access
  it("4. Candidate attempt controller allows Candidate A to view Candidate A attempt", async () => {
    const req = {
      params: { attemptId: "att_candidate_a_123" },
      candidateSession: { candidateId: "cand_a_123" },
    };
    let sendResult = null;
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        sendResult = data;
        return this;
      },
    };

    const origFind = attemptRepository.findAttemptById;
    attemptRepository.findAttemptById = async () => ({
      id: "att_candidate_a_123",
      candidateId: "cand_a_123",
      assessmentId: "asm_123",
      status: "IN_PROGRESS",
    });

    try {
      await attemptController.getCandidateAttempt(req, res, () => {});
      assert.ok(sendResult);
      assert.equal(sendResult.success, true);
      assert.equal(sendResult.data.id, "att_candidate_a_123");
    } finally {
      attemptRepository.findAttemptById = origFind;
    }
  });

  // 5. Repository Defensive Guards against PrismaClientValidationError
  it("5. Repository methods handle undefined/null args defensively without Prisma error", async () => {
    assert.equal(await attemptRepository.findInvitationById(undefined), null);
    assert.equal(await attemptRepository.findInvitationById(null), null);
    assert.equal(await attemptRepository.findInvitationById(""), null);

    assert.equal(await attemptRepository.findInvitationByTokenHash(undefined), null);
    assert.equal(await attemptRepository.findInvitationByTokenHash(null), null);
    assert.equal(await attemptRepository.findInvitationByTokenHash(""), null);

    assert.equal(await attemptRepository.findById(undefined), null);
    assert.equal(await attemptRepository.findById(null), null);
    assert.equal(await attemptRepository.findById(""), null);
  });
});
