"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
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

const attemptController = require("../../src/modules/attempt/attempt.controller");
const attemptService = require("../../src/modules/attempt/attempt.service");
const { prisma } = require("../../src/config/prisma");
const logger = require("../../src/config/logger");

describe("Invitation Verification CandidateAttempt Query Suite", () => {
  let origFindInvitationByRawToken;
  let origEnrichAssessmentWithCompanyGameConfig;
  let origFindFirst;
  let origLoggerWarn;
  let loggedWarnCalls = [];

  beforeEach(() => {
    origFindInvitationByRawToken = attemptService.findInvitationByRawToken;
    origEnrichAssessmentWithCompanyGameConfig = attemptService.enrichAssessmentWithCompanyGameConfig;
    origFindFirst = prisma.candidateAttempt.findFirst;
    origLoggerWarn = logger.warn;
    loggedWarnCalls = [];
    logger.warn = (...args) => {
      loggedWarnCalls.push(args[0]);
    };
  });

  afterEach(() => {
    attemptService.findInvitationByRawToken = origFindInvitationByRawToken;
    attemptService.enrichAssessmentWithCompanyGameConfig = origEnrichAssessmentWithCompanyGameConfig;
    prisma.candidateAttempt.findFirst = origFindFirst;
    logger.warn = origLoggerWarn;
  });

  it("proves CandidateAttempt query orders by startedAt and excludes createdAt", async () => {
    let capturedQueryArgs = null;
    const mockAttempt = {
      id: "att_mock_123",
      status: "SUBMITTED",
      score: 85,
      maxScore: 100,
      percentage: 85,
      result: "PASS",
      startedAt: new Date("2026-10-12T04:00:00.000Z"),
      submittedAt: new Date("2026-10-12T05:00:00.000Z"),
    };

    attemptService.findInvitationByRawToken = async () => ({
      id: "inv_123",
      token: "inv_token_abc",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 3600000),
      assessmentId: "ass_123",
      candidateId: "cand_123",
      assessment: { id: "ass_123" },
      candidate: { id: "cand_123" },
    });

    attemptService.enrichAssessmentWithCompanyGameConfig = async () => {};

    prisma.candidateAttempt.findFirst = async (args) => {
      capturedQueryArgs = args;
      return mockAttempt;
    };

    let responseStatus = null;
    let responseBody = null;
    const req = {
      params: { token: "inv_token_abc" },
      body: {},
      query: {},
    };
    const res = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      },
    };

    await attemptController.verifyInvitation(req, res);

    assert.equal(responseStatus, 200);
    assert.ok(capturedQueryArgs, "prisma.candidateAttempt.findFirst must be called");

    // 1. Prove query orders by startedAt, not createdAt
    assert.deepEqual(capturedQueryArgs.orderBy, { startedAt: "desc" });
    assert.equal(capturedQueryArgs.orderBy.createdAt, undefined);

    // 2. Prove select includes startedAt and does NOT include createdAt
    assert.equal(capturedQueryArgs.select.startedAt, true);
    assert.equal(capturedQueryArgs.select.createdAt, undefined);

    // 3. Prove response preserves status and submittedAt correctly
    assert.equal(responseBody.success, true);
    assert.ok(responseBody.data.attempt);
    assert.equal(responseBody.data.attempt.id, "att_mock_123");
    assert.equal(responseBody.data.attempt.status, "SUBMITTED");
    assert.equal(responseBody.data.submittedAt.toISOString(), "2026-10-12T05:00:00.000Z");
  });

  it("gracefully returns attempt: null and logs sanitized diagnostics when CandidateAttempt query fails", async () => {
    attemptService.findInvitationByRawToken = async () => ({
      id: "inv_456",
      token: "inv_token_def",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 3600000),
      assessmentId: "ass_456",
      candidateId: "cand_456",
      assessment: { id: "ass_456" },
      candidate: { id: "cand_456" },
    });

    attemptService.enrichAssessmentWithCompanyGameConfig = async () => {};

    const simulatedErr = new Error("Simulated query failure\n  at PrismaClient.findFirst()\n  where: { token: 'secret' }");
    simulatedErr.code = "P2002";
    simulatedErr.name = "PrismaClientKnownRequestError";

    prisma.candidateAttempt.findFirst = async () => {
      throw simulatedErr;
    };

    let responseStatus = null;
    let responseBody = null;
    const req = {
      params: { token: "inv_token_def" },
      body: {},
      query: {},
    };
    const res = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      },
    };

    await attemptController.verifyInvitation(req, res);

    assert.equal(responseStatus, 200);
    assert.equal(responseBody.success, true);
    assert.equal(responseBody.data.attempt, null);
    assert.equal(responseBody.data.submittedAt, null);

    // Verify sanitized diagnostic logging
    assert.equal(loggedWarnCalls.length, 1);
    const warnPayload = loggedWarnCalls[0];
    assert.equal(warnPayload.event, "VERIFY_INVITATION_ATTEMPT_FETCH_FAILED");
    assert.equal(warnPayload.code, "P2002");
    assert.equal(warnPayload.errorName, "PrismaClientKnownRequestError");
    assert.equal(warnPayload.error, "Simulated query failure");
    assert.ok(warnPayload.error.length <= 300);
    assert.ok(!warnPayload.error.includes("\n"));
  });
});
